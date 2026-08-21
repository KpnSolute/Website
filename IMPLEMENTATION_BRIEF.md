# KpnSolute Shared Platform Local Implementation Brief

Act as the implementation agent for the KpnSolute shared platform in this empty
repository.

## Governing sources

Before writing, read these files completely from
`C:\Projects\Scena\.worktrees\loom-compute-routing`:

- `decisions\ADR-0007-kpnsolute-identity-routing-and-tenant-classes.md`
- `decisions\ADR-0001-kpndream-kpnsolute-unified-platform.md`
- `decisions\ADR-0005-kpnsolute-product-workspace-routing.md`
- `decisions\ADR-0006-unified-kpnsolute-api-gateway.md`
- `governance\PRODUCT_CHARTERS.md`
- `governance\PRODUCT_CHANGE_CONTROL.md`

Treat ADR-0007 as owner-approved direction. Do not modify Loom.

## Milestone one scope

Build a production-oriented TypeScript monorepo for:

- `kpnsolute.com`: public ecosystem hub
- `accounts.kpnsolute.com`: personal account dashboard
- `auth.kpnsolute.com`: KpnAuth SSO screens and authorization-code contract
- `platform.kpnsolute.com/{service}/{tenant}`: organization control plane
- `create.kpnsolute.com/{service}/{tenant}` and `/{service}/new`: provisioning
- `billing.kpnsolute.com/{service}/{tenant}`: commerce management
- `link.kpnsolute.com/{service}/{tenant}`: integration management UI
- `flow.kpnsolute.com/{service}/{tenant}`: workflow management UI
- a shared backend for Accounts, Auth, Platform, Create, and Billing suitable
  for `api.kpnsolute.com/{service}` routing

## Required pages

- Accounts: overview, personal information, security and sign-in, sessions and
  devices, privacy, linked apps, organizations, invitations, subscriptions.
- Platform: overview, organization switcher, members and roles, locations,
  products, resources, SOPs, integrations, flows, billing links, editor entry.
- Create: resumable multi-step service-and-tenant provisioning flow.
- Billing: subscriptions, invoices, payment methods, usage, checkout
  confirmation, checkout failure.
- Link: connections, credentials, webhook subscriptions, deliveries, failures.
- Flow: workflow list, builder shell, runs, failures, activity.
- Auth: sign in, sign up, Continue with Google, consent, callback, and error.

Use a coherent, responsive, accessible KpnSolute design system inspired by the
clarity of mature Microsoft and Google account portals without copying assets
or exact UI.

## Architecture and security

- Implement host-aware routing and a documented local-development path
  override.
- Use lowercase registered service keys. Paths and hostnames are context, never
  authorization.
- Implement a PostgreSQL persistence boundary, migrations, and repositories.
- Use Supabase Auth's native OAuth 2.1 server for callback allowlists, PKCE,
  consent, authorization codes, grants, sessions, tokens, discovery, and JWKS.
  Do not duplicate passwords, identities, authorization codes, or refresh
  sessions in public application tables.
- Google sign-in is configured once in KpnAuth. Do not create product-specific
  identity silos or authorize from user-controlled metadata.
- Never invent secrets. If database, identity provider, or Stripe configuration
  is absent, fail closed with explicit setup states instead of fake production
  behavior.
- Expose explicit API namespaces for Accounts, Auth, Platform, Create, and
  Billing. Link and Flow clients target the central API but do not duplicate
  Events transport ownership.
- Add a Render blueprint for web and shared API origins, health checks,
  environment variable names only, SPA rewrites, and security headers.

## Quality and governance

- Add tests, lint, typecheck, build scripts, architecture and API docs, threat
  notes, `AGENTS.md`, `CLAUDE.md`, `README.md`, `.env.example` without values,
  and `CHANGELOG.md`.
- Do not commit, push, deploy, create cloud resources, alter DNS, or access
  production secrets.
- Preserve truthful capability labels: local implementation is not deployed or
  live.
- Run checks and fix failures before finishing.
- Finish with a concise summary of files, architecture, checks, and external
  dependencies.
