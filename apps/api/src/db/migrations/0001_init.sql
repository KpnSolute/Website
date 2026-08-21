-- KpnSolute shared platform — initial schema.
-- Source of truth: packages/contracts/src/entities.ts and
-- architecture/kpnsolute-unified-platform.md (loom-compute-routing).

create extension if not exists pgcrypto;
create schema if not exists private;

create table account_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  primary_email text not null unique,
  display_name text not null,
  status text not null default 'active' check (status in ('active', 'suspended', 'deleted')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Compatibility read view for the API entity name. Authentication records,
-- identities and sessions remain exclusively in Supabase's auth schema.
create view users with (security_invoker = true) as select * from account_profiles;

create table tenants (
  id uuid primary key default gen_random_uuid(),
  type text not null check (type in ('personal', 'organization', 'school', 'team')),
  name text not null,
  slug text not null unique,
  status text not null default 'active' check (status in ('active', 'suspended', 'deleted')),
  created_by_user_id uuid not null references account_profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table roles (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references tenants(id) on delete cascade,
  key text not null,
  name text not null,
  is_built_in boolean not null default false,
  unique (tenant_id, key)
);

create table permissions (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,
  description text not null
);

create table role_permissions (
  role_id uuid not null references roles(id) on delete cascade,
  permission_id uuid not null references permissions(id) on delete cascade,
  primary key (role_id, permission_id)
);

create table tenant_memberships (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  user_id uuid not null references account_profiles(id) on delete cascade,
  role_id uuid not null references roles(id),
  status text not null default 'active' check (status in ('active', 'invited', 'suspended', 'removed')),
  joined_at timestamptz not null default now()
);
create unique index tenant_memberships_active_unique
  on tenant_memberships(tenant_id, user_id)
  where status in ('active', 'invited', 'suspended');
create index tenant_memberships_user_id_idx on tenant_memberships(user_id);

create table tenant_invitations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  email text not null,
  role_id uuid not null references roles(id),
  status text not null default 'pending' check (status in ('pending', 'accepted', 'revoked', 'expired')),
  invited_by_user_id uuid not null references account_profiles(id),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);
create index tenant_invitations_email_idx on tenant_invitations(email);

create table products (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,
  name text not null
);

create table product_plans (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references products(id) on delete cascade,
  key text not null,
  name text not null,
  unique (product_id, key)
);

create table product_installations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  product_id uuid not null references products(id),
  plan_id uuid not null references product_plans(id),
  status text not null default 'trial' check (status in ('active', 'trial', 'suspended', 'canceled')),
  settings jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index product_installations_tenant_id_idx on product_installations(tenant_id);

create table installation_entitlements (
  id uuid primary key default gen_random_uuid(),
  installation_id uuid not null references product_installations(id) on delete cascade,
  key text not null,
  limit_value integer,
  boolean_value boolean,
  unique (installation_id, key)
);

create table subscriptions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  installation_id uuid not null references product_installations(id) on delete cascade,
  plan_id uuid not null references product_plans(id),
  status text not null check (status in ('trialing', 'active', 'past_due', 'canceled', 'incomplete')),
  current_period_start timestamptz not null default now(),
  current_period_end timestamptz not null default now(),
  cancel_at_period_end boolean not null default false,
  provider_customer_id text,
  provider_subscription_id text
);
create index subscriptions_tenant_id_idx on subscriptions(tenant_id);

create table invoices (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  subscription_id uuid references subscriptions(id) on delete set null,
  status text not null default 'draft' check (status in ('draft', 'open', 'paid', 'void', 'uncollectible')),
  amount_due_cents integer not null default 0,
  currency text not null default 'usd',
  issued_at timestamptz,
  due_at timestamptz,
  paid_at timestamptz,
  hosted_invoice_url text
);
create index invoices_tenant_id_idx on invoices(tenant_id);

create table payment_methods (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  type text not null check (type in ('card', 'bank_account')),
  brand text,
  last4 text,
  exp_month integer,
  exp_year integer,
  is_default boolean not null default false
);
create index payment_methods_tenant_id_idx on payment_methods(tenant_id);

create table usage_records (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  installation_id uuid not null references product_installations(id) on delete cascade,
  metric_key text not null,
  quantity numeric not null,
  recorded_at timestamptz not null default now()
);
create index usage_records_tenant_id_idx on usage_records(tenant_id);

create table api_keys (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  name text not null,
  prefix text not null,
  secret_hash text not null,
  created_at timestamptz not null default now(),
  last_used_at timestamptz,
  revoked_at timestamptz
);
create index api_keys_tenant_id_idx on api_keys(tenant_id);

create table webhook_subscriptions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  url text not null,
  event_types text[] not null default '{}',
  status text not null default 'active' check (status in ('active', 'disabled')),
  created_at timestamptz not null default now()
);
create index webhook_subscriptions_tenant_id_idx on webhook_subscriptions(tenant_id);

create table webhook_deliveries (
  id uuid primary key default gen_random_uuid(),
  webhook_id uuid not null references webhook_subscriptions(id) on delete cascade,
  event_type text not null,
  status text not null default 'pending' check (status in ('pending', 'succeeded', 'failed')),
  attempt integer not null default 1,
  response_status integer,
  created_at timestamptz not null default now()
);
create index webhook_deliveries_webhook_id_idx on webhook_deliveries(webhook_id);

create table notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references account_profiles(id) on delete cascade,
  title text not null,
  body text not null,
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index notifications_user_id_idx on notifications(user_id);

create table audit_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references tenants(id) on delete set null,
  actor_user_id uuid references account_profiles(id) on delete set null,
  action text not null,
  target_type text,
  target_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index audit_events_tenant_id_idx on audit_events(tenant_id);

create table custom_domains (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  installation_id uuid not null references product_installations(id) on delete cascade,
  hostname text not null unique,
  verification_status text not null default 'pending' check (verification_status in ('pending', 'verified', 'failed')),
  verification_token text not null,
  certificate_status text not null default 'pending' check (certificate_status in ('pending', 'issued', 'failed')),
  created_at timestamptz not null default now()
);

-- OAuth clients, authorization codes, access tokens and refresh tokens are
-- native Supabase Auth records and are never duplicated in public tables.

create view organizations with (security_invoker = true) as select * from tenants where type <> 'personal';

create or replace function private.is_tenant_member(target_tenant_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.tenant_memberships membership
    where membership.tenant_id = target_tenant_id
      and membership.user_id = auth.uid()
      and membership.status = 'active'
  );
$$;

revoke all on function private.is_tenant_member(uuid) from public;
grant usage on schema private to authenticated;
grant execute on function private.is_tenant_member(uuid) to authenticated;

alter table account_profiles enable row level security;
alter table tenants enable row level security;
alter table roles enable row level security;
alter table permissions enable row level security;
alter table role_permissions enable row level security;
alter table tenant_memberships enable row level security;
alter table tenant_invitations enable row level security;
alter table products enable row level security;
alter table product_plans enable row level security;
alter table product_installations enable row level security;
alter table installation_entitlements enable row level security;
alter table subscriptions enable row level security;
alter table invoices enable row level security;
alter table payment_methods enable row level security;
alter table usage_records enable row level security;
alter table api_keys enable row level security;
alter table webhook_subscriptions enable row level security;
alter table webhook_deliveries enable row level security;
alter table notifications enable row level security;
alter table audit_events enable row level security;
alter table custom_domains enable row level security;

create policy profiles_self_select on account_profiles for select to authenticated using (id = auth.uid());
create policy profiles_self_update on account_profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid());
create policy tenants_member_select on tenants for select to authenticated using (private.is_tenant_member(id) or created_by_user_id = auth.uid());
create policy memberships_member_select on tenant_memberships for select to authenticated using (private.is_tenant_member(tenant_id));
create policy invitations_recipient_select on tenant_invitations for select to authenticated using (lower(email) = lower(coalesce(auth.jwt() ->> 'email', '')));
create policy notifications_self_select on notifications for select to authenticated using (user_id = auth.uid());

-- Catalog data is intentionally readable to signed-in users. Mutations stay
-- server-only until dedicated administrative policies are approved.
create policy products_authenticated_select on products for select to authenticated using (true);
create policy plans_authenticated_select on product_plans for select to authenticated using (true);

create policy roles_member_select on roles for select to authenticated using (tenant_id is null or private.is_tenant_member(tenant_id));
create policy permissions_authenticated_select on permissions for select to authenticated using (true);
create policy role_permissions_authenticated_select on role_permissions for select to authenticated using (true);
create policy installations_member_select on product_installations for select to authenticated using (private.is_tenant_member(tenant_id));
create policy subscriptions_member_select on subscriptions for select to authenticated using (private.is_tenant_member(tenant_id));
create policy invoices_member_select on invoices for select to authenticated using (private.is_tenant_member(tenant_id));
create policy payment_methods_member_select on payment_methods for select to authenticated using (private.is_tenant_member(tenant_id));
create policy usage_member_select on usage_records for select to authenticated using (private.is_tenant_member(tenant_id));
create policy api_keys_member_select on api_keys for select to authenticated using (private.is_tenant_member(tenant_id));
create policy webhooks_member_select on webhook_subscriptions for select to authenticated using (private.is_tenant_member(tenant_id));
create policy audit_member_select on audit_events for select to authenticated using (tenant_id is not null and private.is_tenant_member(tenant_id));
create policy domains_member_select on custom_domains for select to authenticated using (private.is_tenant_member(tenant_id));
create policy entitlements_member_select on installation_entitlements for select to authenticated using (
  exists (select 1 from public.product_installations installation where installation.id = installation_id and private.is_tenant_member(installation.tenant_id))
);
create policy webhook_deliveries_member_select on webhook_deliveries for select to authenticated using (
  exists (select 1 from public.webhook_subscriptions webhook where webhook.id = webhook_id and private.is_tenant_member(webhook.tenant_id))
);
