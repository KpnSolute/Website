# Changelog

## Unreleased - gateway prefix contract, auth namespace, account destinations (local only)

- Split the gateway's service-prefix handling into two explicit modes. The five
  services sharing `PLATFORM_API_ORIGIN` (`accounts`, `auth`, `platform`,
  `create`, `billing`) now **preserve** their `/{service}` segment upstream;
  `compute`, `scena`, `lunchvoice`, `tradora`, `link`, and `flow` still strip
  exactly one. One shared origin cannot distinguish `/accounts/me` from
  `/platform/me` once the segment is stripped, so every shared-platform route
  was previously unreachable through the gateway.
- Made the `Location` rewrite the exact inverse of the request transform, so a
  preserved segment is not doubled and a cross-origin redirect is not laundered
  through `api.kpnsolute.com`.
- Namespaced every API auth internal under `/auth`: `/auth/oauth/...`,
  `/auth/workforce/...`, and `/auth/.well-known/jwks.json`. Public URLs are
  unchanged — `https://api.kpnsolute.com/auth/...` — and now equal the upstream
  path byte for byte. Updated the workforce sign-in client, tests, and docs.
- Made `https://accounts.kpnsolute.com/me` the safe default completion
  destination for the direct KpnAuth account flows, added
  `resolveCompletionTarget` so a completed flow only ever lands on an approved
  KpnSolute app origin, and closed the `/verify` loop: a `return_to` naming the
  sign-in host is dropped however it is spelled.
- Fixed the audit truth of `assign-corporate-resource`: the actor is now the
  operator who ran the command, supplied explicitly, and never the account being
  granted ownership. An operator without a KpnSolute account records a truthful
  null actor plus operator metadata. The capability stays non-HTTP, fail-closed,
  atomic, and idempotent.
- Set the MJCC corporation display name to `Miami Job Corps Center`; its slug
  and subdomain stay `mjcc`, so no addressing changed.
- This work is uncommitted, unpublished, and undeployed. No user was created and
  no assignment was executed against any database.

## Unreleased - tenant workforce-auth foundation (local only)

- Added an additive tenant-scoped staff directory, explicit tenant auth policy,
  product-installation assignments, and legacy workforce identity mappings.
- Added private, browser-denied credential, short-session, and authentication
  audit tables; plaintext staff credentials are never stored.
- Added Node scrypt credential hashing, weak/default PIN rotation flags,
  lockout handling, ES256 workforce token issuance, DB-backed revocation, and
  method-discovery/PIN/session/logout API contracts.
- Added the explicit `token_use=workforce` and
  `kpnsolute:<service>:workforce` audience contract plus a fail-closed public
  ES256 JWKS endpoint with bounded key-rotation-aware caching.
- Added upstream workforce routes and a public workforce JWKS endpoint. (Both
  were later renamespaced under `/auth` — see the entry above.)
- Added tenant-isolation, duplicate-username scope, lockout, signing-config,
  migration-security, rotation, revocation, and secret-leakage tests.
- This work is uncommitted, unpublished, undeployed, and unapplied to the live
  KpnAuth database. Compute, Lunchvoice, Scena, and Tradora remain on their
  legacy authentication paths until product-specific dual-auth acceptance.

## v0.1.0 - 2026-08-17 (local release candidate)

- Added the KpnSolute hub plus Accounts, Auth, Platform, Create, Billing, Link,
  and Flow applications and their shared design/runtime packages.
- Added the fixed-registry Cloudflare gateway for
  `api.kpnsolute.com/{service}` and a Render deployment blueprint.
- Replaced the draft custom password and token authority with Supabase Auth
  OAuth 2.1, PKCE, consent, discovery, JWKS verification, bearer API sessions,
  and refresh handling.
- Applied the tenant-safe KpnAuth foundation, product registry, optimized RLS
  policies, and foreign-key indexes to the dedicated Supabase project.
- Added the unified service control plane: per-installation user assignments,
  legacy identity links, service-resource references, and a private RLS-hardened
  KpnLink event outbox. Product payloads remain in service-owned databases.
- Made tenant and installation provisioning transactional, including owner
  assignment, audit, and outbox creation.
- Local format, lint, TypeScript, 44 automated tests, all application builds,
  a pinned Wrangler dry-run bundle, and npm audit pass. Publication, OAuth provider/client
  configuration, deployment, and live acceptance remain separate gates.
