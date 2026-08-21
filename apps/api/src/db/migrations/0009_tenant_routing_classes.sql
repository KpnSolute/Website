-- Corporate subdomain and custom-domain addressing for tenants.
--
-- Additive and reversible. KpnCompute (and every product) has two commercial
-- tenant classes over one tenant model; the class decides how a tenant is
-- addressed, never what it may do. Authorization continues to resolve from the
-- immutable tenant id. See docs/ROUTE_REGISTRY.md section 3.0.
--
--   organization  -> {product}.kpnsolute.com/workspaces/{slug}
--   corporation   -> {subdomain}.kpnsolute.com
--
-- Rollback:
--   drop index if exists tenants_subdomain_unique;
--   drop index if exists tenants_custom_domain_unique;
--   alter table tenants drop constraint if exists tenants_corporate_addressing_check;
--   alter table tenants drop column if exists subdomain;
--   alter table tenants drop column if exists custom_domain;

alter table tenants
  add column if not exists subdomain text,
  add column if not exists custom_domain text;

-- Hostname labels are case-insensitive; store them normalised so uniqueness and
-- lookups cannot be bypassed by casing.
create unique index if not exists tenants_subdomain_unique
  on tenants (lower(subdomain)) where subdomain is not null;

create unique index if not exists tenants_custom_domain_unique
  on tenants (lower(custom_domain)) where custom_domain is not null;

-- Only a corporation may hold a dedicated hostname. Giving a path-addressed
-- organization a subdomain would make it reachable two ways with different
-- trust properties.
alter table tenants drop constraint if exists tenants_corporate_addressing_check;
alter table tenants add constraint tenants_corporate_addressing_check check (
  (type = 'corporation')
  or (subdomain is null and custom_domain is null)
);

-- Reserved platform and product hostnames can never be claimed by a tenant.
-- Kept in sync with packages/contracts/src/registry.ts RESERVED_SUBDOMAINS.
alter table tenants drop constraint if exists tenants_subdomain_not_reserved_check;
alter table tenants add constraint tenants_subdomain_not_reserved_check check (
  subdomain is null
  or lower(subdomain) not in (
    'accounts', 'api', 'auth', 'billing', 'compute', 'create', 'docs',
    'events', 'flow', 'link', 'lunchvoice', 'platform', 'scena', 'status',
    'support', 'tradora', 'workforce', 'www'
  )
);

-- A subdomain must be a valid single hostname label.
alter table tenants drop constraint if exists tenants_subdomain_format_check;
alter table tenants add constraint tenants_subdomain_format_check check (
  subdomain is null or subdomain ~ '^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$'
);

comment on column tenants.subdomain is
  'Corporate tenants only: the first-level KpnSolute subdomain label serving as '
  'this tenant''s canonical runtime host. Navigation context only; never an '
  'authorization claim.';
comment on column tenants.custom_domain is
  'Corporate tenants only: a verified customer-owned domain that takes '
  'precedence over the subdomain.';
