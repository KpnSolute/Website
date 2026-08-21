# KpnAuth architecture and activation

KpnAuth is the shared KpnSolute identity authority. The Supabase project is
`vwbrxcltetelvvkbnbru` (`https://vwbrxcltetelvvkbnbru.supabase.co`). This
identifier and the publishable browser key are public configuration; database
passwords and service-role keys remain server-only.

## Ownership boundary

Supabase Auth owns credentials, email confirmation, Google identity, passkeys,
sessions, OAuth 2.1 clients, consent grants, authorization codes, access and
refresh tokens, discovery, and JWKS. Public application tables own account
profiles, organizations, memberships, roles, product installations,
entitlements, billing references, integrations, notifications, and audits.

The shared API accepts a bearer access token, verifies its asymmetric signature
against the KpnAuth JWKS, checks issuer, audience, and expiry, then resolves
current tenant authorization from the database. `user_metadata` is presentation
data only and never grants a role, membership, entitlement, or resource.

Tenant-owned staff identities are a separate KpnAuth boundary. They do not
create a Supabase Auth user unless the staff member is intentionally linked to a
personal KpnSolute account. Tenant staff usernames, PIN hashes, installation
assignments, lockouts, short-lived revocable sessions, and migration mappings
follow `docs/WORKFORCE_AUTH.md`. Product-specific legacy login remains enabled
during the additive dual-auth rollout; this local foundation does not authorize
cutover or deletion.

Workforce tokens use `token_use=workforce` and the exact audience
`kpnsolute:<service>:workforce`. Their ES256 public key is exposed at
`https://api.kpnsolute.com/auth/.well-known/jwks.json`. Every auth internal is
namespaced under `/auth` — `/auth/oauth/...`, `/auth/workforce/...`, and
`/auth/.well-known/jwks.json` — and the gateway preserves the `/auth` segment
for services sharing the platform origin, so each public path is byte-for-byte
the API's own upstream path. A product must validate the signature,
issuer, expiry, token use, and its own audience, then confirm the central
workforce session and installation assignment are still active before creating
or refreshing a local compatibility session. Local sessions may not outlive
central authorization and cannot renew after central revocation without fresh
validation.

## Dashboard activation gate

Before any live sign-in test:

1. Set the Auth Site URL to `https://auth.kpnsolute.com` and allow required local
   and production callback URLs.
2. Enable OAuth 2.1 Server and set the authorization path to `/oauth/consent`.
3. Migrate JWT signing to RS256 or ES256 so relying products can validate JWKS
   and request OpenID Connect ID tokens.
4. Configure Google in Authentication > Providers. Its secret stays in
   Supabase, never Render, Cloudflare, or a browser build.
5. Register one OAuth client per product surface with exact redirect URI
   allowlists. Dynamic client registration remains disabled.
6. Apply the tracked application migration and run both Supabase security and
   performance advisors.
7. Configure Render with `DATABASE_URL`, `SUPABASE_URL`, and the publishable key;
   configure browser apps with only the public URL and publishable key.
8. Provision the workforce ES256 key pair in the server secret store and apply
   the workforce migration in a non-production environment before importing any
   tenant staff records.

These steps are configuration requirements, not evidence that SSO is live.
Acceptance requires email/password, Google, consent, silent repeat sign-in,
refresh, logout/revocation, denied consent, bad state, bad PKCE, wrong audience,
expired token, cross-tenant denial, and rollback tests.
