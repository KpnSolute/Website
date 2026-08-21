-- Authorization-code + PKCE protocol foundation for KpnAuth.
--
-- This migration is additive. It introduces no destructive change to existing
-- identity, tenancy, or workforce records, and every object it creates can be
-- dropped independently. See docs/AUTH_FINAL_GUIDE.md for the protocol these
-- tables implement and docs/MIGRATION_RUNBOOK.md for the rollback statements.
--
-- Secret material rule: authorization codes, refresh tokens, client secrets,
-- and device credentials are stored ONLY as SHA-256 hashes, in the private
-- schema, with browser roles explicitly denied. PKCE code verifiers are never
-- stored at all.

-- Corporations are tenants with dedicated routing (ADR-0005). The distinction
-- is a routing and presentation fact, not a separate authorization model, so it
-- is expressed as a tenant type rather than a parallel table.
alter table tenants drop constraint if exists tenants_type_check;
alter table tenants add constraint tenants_type_check
  check (type in ('personal', 'organization', 'school', 'team', 'corporation'));

-- ---------------------------------------------------------------------------
-- OAuth clients and strict redirect allowlists
-- ---------------------------------------------------------------------------

create table oauth_clients (
  id uuid primary key default gen_random_uuid(),
  client_id text not null unique
    check (char_length(btrim(client_id)) between 3 and 128),
  name text not null check (char_length(btrim(name)) between 1 and 120),
  -- Null service_key means a first-party console client that is not bound to a
  -- single product installation (for example the accounts portal).
  service_key text
    check (service_key is null or service_key in ('compute', 'scena', 'lunchvoice', 'tradora')),
  client_type text not null default 'confidential'
    check (client_type in ('confidential', 'public')),
  -- Which identity classes this client may request. A client that may only
  -- sign in staff can never obtain a device or service token.
  allowed_token_uses text[] not null default array['workforce']::text[]
    check (
      array_length(allowed_token_uses, 1) between 1 and 4
      and allowed_token_uses <@ array['consumer', 'workforce', 'device', 'service']::text[]
    ),
  status text not null default 'active'
    check (status in ('active', 'suspended', 'retired')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index oauth_clients_service_key_idx on oauth_clients(service_key)
  where service_key is not null;

-- Exact-match allowlist. No wildcard column exists by design: an open redirect
-- is the single highest-value attack against this protocol.
create table oauth_client_redirect_uris (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references oauth_clients(id) on delete cascade,
  redirect_uri text not null
    check (
      char_length(redirect_uri) between 8 and 2048
      -- Absolute https only, with the single localhost exception for local
      -- development. No fragments: a fragment in a registered URI would let a
      -- caller smuggle a token position into the response.
      and (redirect_uri like 'https://%' or redirect_uri like 'http://localhost:%')
      and position('#' in redirect_uri) = 0
    ),
  created_at timestamptz not null default now(),
  unique (client_id, redirect_uri)
);

create table private.oauth_client_secrets (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.oauth_clients(id) on delete cascade,
  secret_hash text not null,
  status text not null default 'active' check (status in ('active', 'retired')),
  created_at timestamptz not null default now(),
  retired_at timestamptz
);
create index oauth_client_secrets_active_idx
  on private.oauth_client_secrets(client_id) where status = 'active';

-- ---------------------------------------------------------------------------
-- Pending authorization requests
-- ---------------------------------------------------------------------------

-- Held in the private schema because the row binds state, nonce, and the PKCE
-- challenge for an in-flight sign-in. None of it should ever reach a browser
-- role through the Data API.
create table private.oauth_authorization_requests (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.oauth_clients(id) on delete cascade,
  redirect_uri text not null,
  response_type text not null default 'code' check (response_type = 'code'),
  code_challenge text not null
    check (char_length(code_challenge) between 43 and 128),
  code_challenge_method text not null default 'S256'
    check (code_challenge_method = 'S256'),
  state text not null check (char_length(state) between 16 and 512),
  nonce text not null check (char_length(nonce) between 16 and 512),
  scope text not null default '',
  requested_token_use text not null default 'workforce'
    check (requested_token_use in ('consumer', 'workforce', 'device', 'service')),
  service_key text
    check (service_key is null or service_key in ('compute', 'scena', 'lunchvoice', 'tradora')),
  tenant_hint text,
  status text not null default 'pending'
    check (status in ('pending', 'authorized', 'failed', 'expired')),
  failure_reason text,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  check (expires_at > created_at)
);
create index oauth_authorization_requests_pending_idx
  on private.oauth_authorization_requests(expires_at) where status = 'pending';

-- ---------------------------------------------------------------------------
-- Authorization codes (hashed, single-use, short lived)
-- ---------------------------------------------------------------------------

create table private.oauth_authorization_codes (
  id uuid primary key default gen_random_uuid(),
  -- SHA-256 hex of the opaque code. The code itself is returned once and never
  -- persisted in any form that could be replayed from the database.
  code_hash text not null unique check (char_length(code_hash) = 64),
  request_id uuid not null
    references private.oauth_authorization_requests(id) on delete cascade,
  client_id uuid not null references public.oauth_clients(id) on delete cascade,
  redirect_uri text not null,
  code_challenge text not null,
  nonce text not null,
  token_use text not null
    check (token_use in ('consumer', 'workforce', 'device', 'service')),
  -- Subject binding. Exactly one of these paths is populated per code.
  consumer_user_id uuid references public.account_profiles(id) on delete cascade,
  workforce_session_id uuid
    references private.workforce_sessions(id) on delete cascade,
  tenant_id uuid references public.tenants(id) on delete cascade,
  installation_id uuid references public.product_installations(id) on delete cascade,
  issued_at timestamptz not null default now(),
  expires_at timestamptz not null,
  -- Single use is enforced by this column inside the exchange transaction. A
  -- failed exchange consumes the code too, so a code can never be retried.
  consumed_at timestamptz,
  consumed_outcome text check (consumed_outcome in ('exchanged', 'rejected')),
  check (expires_at > issued_at),
  check (
    (token_use = 'consumer' and consumer_user_id is not null)
    or (token_use <> 'consumer' and workforce_session_id is not null
        and tenant_id is not null and installation_id is not null)
  )
);
create index oauth_authorization_codes_unconsumed_idx
  on private.oauth_authorization_codes(expires_at) where consumed_at is null;

-- ---------------------------------------------------------------------------
-- Refresh token families with rotation and reuse detection
-- ---------------------------------------------------------------------------

create table private.oauth_refresh_families (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.oauth_clients(id) on delete cascade,
  token_use text not null
    check (token_use in ('consumer', 'workforce', 'device')),
  consumer_user_id uuid references public.account_profiles(id) on delete cascade,
  workforce_session_id uuid
    references private.workforce_sessions(id) on delete cascade,
  tenant_id uuid references public.tenants(id) on delete cascade,
  installation_id uuid references public.product_installations(id) on delete cascade,
  status text not null default 'active'
    check (status in ('active', 'revoked')),
  revoked_at timestamptz,
  revoke_reason text,
  created_at timestamptz not null default now()
);
create index oauth_refresh_families_active_idx
  on private.oauth_refresh_families(workforce_session_id)
  where status = 'active' and workforce_session_id is not null;

create table private.oauth_refresh_tokens (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null
    references private.oauth_refresh_families(id) on delete cascade,
  token_hash text not null unique check (char_length(token_hash) = 64),
  -- Rotation chain. Presenting an already-consumed token is the stolen-token
  -- signal and revokes the whole family.
  generation integer not null default 1 check (generation >= 1),
  replaced_by_id uuid references private.oauth_refresh_tokens(id) on delete set null,
  issued_at timestamptz not null default now(),
  expires_at timestamptz not null,
  consumed_at timestamptz,
  check (expires_at > issued_at)
);
create index oauth_refresh_tokens_family_idx
  on private.oauth_refresh_tokens(family_id, generation desc);

-- ---------------------------------------------------------------------------
-- Device identities
-- ---------------------------------------------------------------------------

create table device_identities (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  installation_id uuid not null,
  display_name text not null check (char_length(btrim(display_name)) between 1 and 120),
  device_kind text not null default 'display'
    check (device_kind in ('display', 'kiosk', 'controller')),
  status text not null default 'pending'
    check (status in ('pending', 'active', 'suspended', 'retired')),
  paired_at timestamptz,
  last_seen_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (installation_id, tenant_id)
    references product_installations(id, tenant_id) on delete cascade,
  unique (id, tenant_id)
);
create index device_identities_installation_idx
  on device_identities(installation_id, status);

create table private.device_credentials (
  id uuid primary key default gen_random_uuid(),
  device_id uuid not null references public.device_identities(id) on delete cascade,
  -- Short-lived pairing code, then a rotating long-lived credential. Both are
  -- stored as hashes only.
  pairing_code_hash text,
  pairing_expires_at timestamptz,
  credential_hash text,
  generation integer not null default 1 check (generation >= 1),
  rotated_at timestamptz,
  created_at timestamptz not null default now(),
  unique (device_id)
);

-- ---------------------------------------------------------------------------
-- Service accounts (service-to-service)
-- ---------------------------------------------------------------------------

create table service_accounts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  installation_id uuid not null,
  name text not null check (char_length(btrim(name)) between 1 and 120),
  -- Explicit grants, never role inheritance. A service account's authority is
  -- exactly this list.
  granted_scopes text[] not null default array[]::text[],
  status text not null default 'active'
    check (status in ('active', 'suspended', 'retired')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (installation_id, tenant_id)
    references product_installations(id, tenant_id) on delete cascade,
  unique (id, tenant_id)
);
create index service_accounts_installation_idx
  on service_accounts(installation_id, status);

create table private.service_account_credentials (
  id uuid primary key default gen_random_uuid(),
  service_account_id uuid not null
    references public.service_accounts(id) on delete cascade,
  secret_hash text not null,
  status text not null default 'active' check (status in ('active', 'retired')),
  created_at timestamptz not null default now(),
  retired_at timestamptz
);
create index service_account_credentials_active_idx
  on private.service_account_credentials(service_account_id) where status = 'active';

-- ---------------------------------------------------------------------------
-- Workforce import provenance
-- ---------------------------------------------------------------------------

-- Written by the migration tooling so that every centrally created staff
-- identity can be traced back to the exact product row it came from, and so a
-- re-run is idempotent rather than duplicating people.
create table workforce_identity_import_mappings (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  installation_id uuid not null,
  staff_account_id uuid,
  source_service text not null
    check (source_service in ('compute', 'scena', 'lunchvoice', 'tradora')),
  source_table text not null,
  source_row_id text not null,
  source_fingerprint text not null,
  outcome text not null default 'pending'
    check (outcome in ('pending', 'created', 'matched', 'skipped', 'conflict')),
  conflict_reason text,
  requires_credential_rotation boolean not null default false,
  imported_at timestamptz not null default now(),
  foreign key (installation_id, tenant_id)
    references product_installations(id, tenant_id) on delete cascade,
  foreign key (staff_account_id, tenant_id)
    references workforce_staff_accounts(id, tenant_id) on delete set null,
  unique (source_service, source_table, source_row_id, installation_id)
);
create index workforce_identity_import_mappings_outcome_idx
  on workforce_identity_import_mappings(installation_id, outcome);

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------

-- Public-schema protocol tables are server-managed. RLS is enabled with no
-- browser policies: a future admin UI must add explicit permission-scoped
-- policies rather than inheriting blanket tenant-member access.
alter table oauth_clients enable row level security;
alter table oauth_client_redirect_uris enable row level security;
alter table device_identities enable row level security;
alter table service_accounts enable row level security;
alter table workforce_identity_import_mappings enable row level security;

revoke all on oauth_clients from anon, authenticated;
revoke all on oauth_client_redirect_uris from anon, authenticated;
revoke all on device_identities from anon, authenticated;
revoke all on service_accounts from anon, authenticated;
revoke all on workforce_identity_import_mappings from anon, authenticated;

alter table private.oauth_client_secrets enable row level security;
alter table private.oauth_authorization_requests enable row level security;
alter table private.oauth_authorization_codes enable row level security;
alter table private.oauth_refresh_families enable row level security;
alter table private.oauth_refresh_tokens enable row level security;
alter table private.device_credentials enable row level security;
alter table private.service_account_credentials enable row level security;

revoke all on private.oauth_client_secrets from public, anon, authenticated;
revoke all on private.oauth_authorization_requests from public, anon, authenticated;
revoke all on private.oauth_authorization_codes from public, anon, authenticated;
revoke all on private.oauth_refresh_families from public, anon, authenticated;
revoke all on private.oauth_refresh_tokens from public, anon, authenticated;
revoke all on private.device_credentials from public, anon, authenticated;
revoke all on private.service_account_credentials from public, anon, authenticated;

-- Defense in depth: even if the private schema were ever exposed, these
-- restrictive policies deny every browser role unconditionally.
create policy oauth_client_secrets_browser_deny
  on private.oauth_client_secrets as restrictive for all to anon, authenticated
  using (false) with check (false);
create policy oauth_authorization_requests_browser_deny
  on private.oauth_authorization_requests as restrictive for all to anon, authenticated
  using (false) with check (false);
create policy oauth_authorization_codes_browser_deny
  on private.oauth_authorization_codes as restrictive for all to anon, authenticated
  using (false) with check (false);
create policy oauth_refresh_families_browser_deny
  on private.oauth_refresh_families as restrictive for all to anon, authenticated
  using (false) with check (false);
create policy oauth_refresh_tokens_browser_deny
  on private.oauth_refresh_tokens as restrictive for all to anon, authenticated
  using (false) with check (false);
create policy device_credentials_browser_deny
  on private.device_credentials as restrictive for all to anon, authenticated
  using (false) with check (false);
create policy service_account_credentials_browser_deny
  on private.service_account_credentials as restrictive for all to anon, authenticated
  using (false) with check (false);
