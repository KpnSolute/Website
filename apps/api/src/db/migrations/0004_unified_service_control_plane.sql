-- Unified KpnSolute control-plane records.
--
-- These tables contain authorization, migration, discovery, and event-delivery
-- metadata only. Product payloads (boards, sessions, menus, surveys, projects,
-- portfolios, and similar operational records) remain in the owning service DB.

create table installation_assignments (
  id uuid primary key default gen_random_uuid(),
  installation_id uuid not null references product_installations(id) on delete cascade,
  membership_id uuid not null references tenant_memberships(id) on delete cascade,
  service_role text not null default 'member',
  status text not null default 'active' check (status in ('active', 'suspended', 'removed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (installation_id, membership_id)
);
create index installation_assignments_membership_id_idx
  on installation_assignments(membership_id);

create table service_identity_links (
  id uuid primary key default gen_random_uuid(),
  installation_id uuid not null references product_installations(id) on delete cascade,
  user_id uuid not null references account_profiles(id) on delete cascade,
  provider text not null,
  service_subject text not null,
  status text not null default 'active' check (status in ('active', 'superseded', 'revoked')),
  linked_at timestamptz not null default now(),
  last_verified_at timestamptz,
  unique (installation_id, provider, service_subject),
  unique (installation_id, user_id, provider)
);
create index service_identity_links_user_id_idx on service_identity_links(user_id);

create table service_resource_references (
  id uuid primary key default gen_random_uuid(),
  installation_id uuid not null references product_installations(id) on delete cascade,
  resource_type text not null,
  service_resource_id text not null,
  display_name text,
  status text not null default 'active' check (status in ('active', 'archived', 'deleted')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (installation_id, resource_type, service_resource_id)
);
create index service_resource_references_installation_id_idx
  on service_resource_references(installation_id);

create table control_plane_outbox (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references tenants(id) on delete cascade,
  installation_id uuid references product_installations(id) on delete cascade,
  event_type text not null,
  source text not null default 'https://api.kpnsolute.com/platform',
  subject text not null,
  data jsonb not null default '{}'::jsonb,
  status text not null default 'pending' check (status in ('pending', 'publishing', 'published', 'failed')),
  attempt_count integer not null default 0 check (attempt_count >= 0),
  available_at timestamptz not null default now(),
  occurred_at timestamptz not null default now(),
  published_at timestamptz,
  last_error text
);
create index control_plane_outbox_delivery_idx
  on control_plane_outbox(status, available_at, occurred_at);
create index control_plane_outbox_tenant_id_idx on control_plane_outbox(tenant_id);
create index control_plane_outbox_installation_id_idx on control_plane_outbox(installation_id);

alter table installation_assignments enable row level security;
alter table service_identity_links enable row level security;
alter table service_resource_references enable row level security;
alter table control_plane_outbox enable row level security;

create policy assignments_member_select on installation_assignments
  for select to authenticated
  using (
    exists (
      select 1
      from public.product_installations installation
      where installation.id = installation_id
        and private.is_tenant_member(installation.tenant_id)
    )
  );

create policy identity_links_self_select on service_identity_links
  for select to authenticated
  using (user_id = (select auth.uid()));

create policy resource_references_member_select on service_resource_references
  for select to authenticated
  using (
    exists (
      select 1
      from public.product_installations installation
      where installation.id = installation_id
        and private.is_tenant_member(installation.tenant_id)
    )
  );

-- The outbox is an internal delivery queue. It intentionally has no anon or
-- authenticated policy; only the trusted platform runtime may publish it.
