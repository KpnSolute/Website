-- KpnSolute username profile foundation.
--
-- ADR-0007 "Account enrollment and ownership contract": enrollment collects a
-- verified email address, the person's name, and one globally unique KpnSolute
-- username. The username is the stable, user-facing identifier and is
-- presentation/discovery only. Ownership, membership, service-principal,
-- billing, audit, and authorization records continue to reference the
-- immutable account id (`account_profiles.id` = `auth.users.id`).
--
-- Additive and reversible. The column is nullable so every existing row
-- migrates without failure; those accounts simply report the
-- `awaiting_username` setup state until the person finishes enrollment. An
-- account in that state is a real, fully authenticated account — the state
-- drives a "finish account setup" screen, never an access decision.
--
-- Rollback:
--   create or replace view users with (security_invoker = true) as
--     select id, primary_email, display_name, status, created_at, updated_at
--     from account_profiles;
--   drop index if exists account_profiles_username_unique;
--   alter table account_profiles drop constraint if exists account_profiles_username_format;
--   alter table account_profiles drop constraint if exists account_profiles_username_not_reserved;
--   alter table account_profiles drop column if exists account_setup_state;
--   alter table account_profiles drop column if exists username;
--   alter table account_profiles drop column if exists username_claimed_at;

alter table account_profiles
  add column if not exists username text,
  add column if not exists username_claimed_at timestamptz;

-- Usernames are compared case-insensitively, so `MJCCOwner` and `mjccowner` are
-- one name and only one of them can exist. Doubles as the lookup index for
-- resolving an operator-supplied username to an account id.
create unique index if not exists account_profiles_username_unique
  on account_profiles (lower(username)) where username is not null;

-- Kept in lockstep with USERNAME_PATTERN in packages/contracts/src/accounts.ts.
alter table account_profiles drop constraint if exists account_profiles_username_format;
alter table account_profiles add constraint account_profiles_username_format check (
  username is null
  or username ~ '^[a-z0-9](?:[a-z0-9_-]{1,28}[a-z0-9])$'
);

-- Reserved platform hostnames and reserved workspace slugs can never be claimed
-- as a username, so a username can never be mistaken for a KpnSolute-operated
-- identity. Kept in sync with RESERVED_USERNAMES in
-- packages/contracts/src/accounts.ts.
alter table account_profiles drop constraint if exists account_profiles_username_not_reserved;
alter table account_profiles add constraint account_profiles_username_not_reserved check (
  username is null
  or lower(username) not in (
    'abuse', 'account', 'accounts', 'admin', 'administrator', 'api', 'app',
    'auth', 'billing', 'billing-support', 'compute', 'create', 'docs',
    'events', 'flow', 'health', 'help', 'hostmaster', 'kpn', 'kpnauth',
    'kpndream', 'kpnsolute', 'link', 'login', 'lunchvoice', 'mail',
    'moderator', 'new', 'no-reply', 'noreply', 'official', 'operator',
    'owner', 'platform', 'postmaster', 'pricing', 'root', 'scena',
    'security', 'signup', 'staff', 'status', 'superuser', 'support',
    'system', 'templates', 'tradora', 'webmaster', 'workforce',
    'workspaces', 'www'
  )
);

-- Derived, never written. A generated column cannot drift from the username the
-- way an application-maintained status column would.
alter table account_profiles
  add column if not exists account_setup_state text
  generated always as (
    case when username is null then 'awaiting_username' else 'complete' end
  ) stored;

-- The username is claimed through the validated KpnAuth/Accounts route, which
-- normalises the value and records the claim. Browser roles may still update
-- their own display name under the existing self-update policy, but cannot set
-- a username directly through the Data API.
revoke update (username, username_claimed_at) on account_profiles from anon, authenticated;

comment on column account_profiles.username is
  'Globally unique, case-insensitive KpnSolute username (ADR-0007). '
  'Presentation and discovery only; authorization always resolves from the '
  'immutable account id.';
comment on column account_profiles.account_setup_state is
  'Derived enrollment state: awaiting_username until a username is claimed. '
  'Drives the "finish account setup" screen and is never an access decision.';

-- Keep the compatibility read view faithful to the table. CREATE OR REPLACE
-- VIEW may append columns, so the original column order is preserved exactly.
create or replace view users with (security_invoker = true) as
  select
    id,
    primary_email,
    display_name,
    status,
    created_at,
    updated_at,
    username,
    username_claimed_at,
    account_setup_state
  from account_profiles;
