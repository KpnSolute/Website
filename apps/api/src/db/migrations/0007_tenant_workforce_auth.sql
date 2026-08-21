-- Tenant-scoped workforce authentication foundation.
--
-- Human customer accounts and OAuth sessions remain owned by Supabase Auth.
-- These records support tenant-owned staff identities (for example a kitchen
-- employee using an employee code + PIN) without duplicating product data.
-- Credential material, login sessions, and auth audit records are private and
-- are never exposed through the Supabase Data API.

-- Composite keys let foreign keys prove that a staff account, product
-- installation, and assignment all belong to the same immutable tenant.
alter table product_installations
  add constraint product_installations_id_tenant_unique unique (id, tenant_id);

create table workforce_staff_accounts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  linked_user_id uuid references account_profiles(id) on delete set null,
  username text not null check (char_length(btrim(username)) between 1 and 80),
  normalized_username text generated always as (lower(btrim(username))) stored,
  display_name text not null check (char_length(btrim(display_name)) between 1 and 120),
  employee_code text,
  status text not null default 'active'
    check (status in ('active', 'suspended', 'deactivated')),
  last_authenticated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, normalized_username),
  unique (id, tenant_id)
);
create index workforce_staff_accounts_linked_user_id_idx
  on workforce_staff_accounts(linked_user_id)
  where linked_user_id is not null;
create unique index workforce_staff_accounts_employee_code_unique
  on workforce_staff_accounts(tenant_id, lower(btrim(employee_code)))
  where employee_code is not null;

create table tenant_workforce_auth_policies (
  tenant_id uuid primary key references tenants(id) on delete cascade,
  pin_enabled boolean not null default false,
  minimum_pin_length integer not null default 6
    check (minimum_pin_length between 4 and 12),
  maximum_failed_attempts integer not null default 5
    check (maximum_failed_attempts between 3 and 10),
  lockout_seconds integer not null default 900
    check (lockout_seconds between 60 and 86400),
  session_ttl_seconds integer not null default 900
    check (session_ttl_seconds between 300 and 900),
  require_pin_rotation_for_weak_credentials boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table workforce_installation_assignments (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  staff_account_id uuid not null,
  installation_id uuid not null,
  service_role text not null default 'staff'
    check (char_length(btrim(service_role)) between 1 and 80),
  status text not null default 'active'
    check (status in ('active', 'suspended', 'removed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (staff_account_id, tenant_id)
    references workforce_staff_accounts(id, tenant_id) on delete cascade,
  foreign key (installation_id, tenant_id)
    references product_installations(id, tenant_id) on delete cascade,
  unique (installation_id, staff_account_id)
);
create index workforce_installation_assignments_staff_idx
  on workforce_installation_assignments(staff_account_id, status);
create index workforce_installation_assignments_tenant_idx
  on workforce_installation_assignments(tenant_id, status);

create table workforce_legacy_identity_links (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  staff_account_id uuid not null,
  installation_id uuid not null,
  provider text not null check (char_length(btrim(provider)) between 1 and 80),
  legacy_subject text not null check (char_length(btrim(legacy_subject)) between 1 and 255),
  status text not null default 'active'
    check (status in ('active', 'superseded', 'revoked')),
  linked_at timestamptz not null default now(),
  last_verified_at timestamptz,
  foreign key (staff_account_id, tenant_id)
    references workforce_staff_accounts(id, tenant_id) on delete cascade,
  foreign key (installation_id, tenant_id)
    references product_installations(id, tenant_id) on delete cascade,
  unique (installation_id, provider, legacy_subject)
);
create index workforce_legacy_identity_links_staff_idx
  on workforce_legacy_identity_links(staff_account_id, status);

create table private.workforce_credentials (
  id uuid primary key default gen_random_uuid(),
  staff_account_id uuid not null references public.workforce_staff_accounts(id) on delete cascade,
  method text not null default 'pin' check (method in ('pin')),
  credential_hash text not null,
  must_rotate boolean not null default false,
  failed_attempts integer not null default 0 check (failed_attempts >= 0),
  locked_until timestamptz,
  last_failed_at timestamptz,
  last_succeeded_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (staff_account_id, method)
);

create table private.workforce_sessions (
  id uuid primary key default gen_random_uuid(),
  token_jti uuid not null unique default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  staff_account_id uuid not null,
  installation_id uuid not null,
  issued_at timestamptz not null default now(),
  expires_at timestamptz not null,
  last_seen_at timestamptz not null default now(),
  revoked_at timestamptz,
  revoke_reason text,
  foreign key (staff_account_id, tenant_id)
    references public.workforce_staff_accounts(id, tenant_id) on delete cascade,
  foreign key (installation_id, tenant_id)
    references public.product_installations(id, tenant_id) on delete cascade,
  check (expires_at > issued_at)
);
create index workforce_sessions_active_idx
  on private.workforce_sessions(staff_account_id, expires_at)
  where revoked_at is null;

create table private.workforce_auth_audit (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references public.tenants(id) on delete set null,
  staff_account_id uuid references public.workforce_staff_accounts(id) on delete set null,
  installation_id uuid references public.product_installations(id) on delete set null,
  session_id uuid references private.workforce_sessions(id) on delete set null,
  event_type text not null,
  method text,
  outcome text not null check (outcome in ('succeeded', 'failed', 'blocked')),
  request_id text,
  metadata jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now()
);
create index workforce_auth_audit_tenant_time_idx
  on private.workforce_auth_audit(tenant_id, occurred_at desc);
create index workforce_auth_audit_staff_time_idx
  on private.workforce_auth_audit(staff_account_id, occurred_at desc)
  where staff_account_id is not null;

-- Public-schema workforce tables are deliberately server-managed. RLS is
-- enabled, but no browser policies are created in this foundation migration.
-- A future admin UI must add explicit permission-scoped policies rather than
-- granting every tenant member access to the staff directory.
alter table workforce_staff_accounts enable row level security;
alter table tenant_workforce_auth_policies enable row level security;
alter table workforce_installation_assignments enable row level security;
alter table workforce_legacy_identity_links enable row level security;

revoke all on workforce_staff_accounts from anon, authenticated;
revoke all on tenant_workforce_auth_policies from anon, authenticated;
revoke all on workforce_installation_assignments from anon, authenticated;
revoke all on workforce_legacy_identity_links from anon, authenticated;

-- Private auth material is defense-in-depth protected even though the private
-- schema is not exposed by default.
alter table private.workforce_credentials enable row level security;
alter table private.workforce_sessions enable row level security;
alter table private.workforce_auth_audit enable row level security;

revoke all on private.workforce_credentials from public, anon, authenticated;
revoke all on private.workforce_sessions from public, anon, authenticated;
revoke all on private.workforce_auth_audit from public, anon, authenticated;

create policy workforce_credentials_browser_deny
  on private.workforce_credentials as restrictive for all to anon, authenticated
  using (false) with check (false);
create policy workforce_sessions_browser_deny
  on private.workforce_sessions as restrictive for all to anon, authenticated
  using (false) with check (false);
create policy workforce_auth_audit_browser_deny
  on private.workforce_auth_audit as restrictive for all to anon, authenticated
  using (false) with check (false);
