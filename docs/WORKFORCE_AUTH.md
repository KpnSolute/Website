# Tenant workforce authentication

Status: **local and unreleased**. Migration `0007_tenant_workforce_auth.sql`
has not been applied to production, and no product has cut over to these
endpoints.

## Purpose

Workforce authentication is for a tenant's staff members who need access to an
installed product but may not own a personal KpnSolute account. It is separate
from consumer KpnAuth sign-in:

- Supabase Auth remains the authority for KpnSolute account passwords, Google,
  passkeys, OAuth grants, and consumer sessions.
- The workforce foundation owns tenant-scoped staff usernames, PIN credential
  hashes, product-installation assignments, lockouts, short sessions, and
  migration links to legacy product identities.
- Product databases continue to own schedules, surveys, menus, boards,
  workflows, and other operational data.

The same normalized username may exist in two tenants. A username never resolves
without an immutable tenant ID and product-installation ID.

## Storage boundary

Public metadata tables:

- `workforce_staff_accounts`
- `tenant_workforce_auth_policies`
- `workforce_installation_assignments`
- `workforce_legacy_identity_links`

These tables have RLS enabled and no browser policy. `anon` and `authenticated`
privileges are explicitly revoked until a permission-scoped administration UI
is approved.

Private tables:

- `private.workforce_credentials`
- `private.workforce_sessions`
- `private.workforce_auth_audit`

Browser roles are denied. PINs are hashed with Node's built-in scrypt using a
random salt. Plaintext PINs, passwords, badge values, JWTs, and signing keys must
never be stored in a migration, audit record, application log, or public table.

## HTTP contract

The API service exposes these paths:

```text
GET  /auth/workforce/{tenantSlug}/{serviceKey}/methods
POST /auth/workforce/{tenantSlug}/{serviceKey}/pin
GET  /auth/workforce/{serviceKey}/session
POST /auth/workforce/{serviceKey}/logout
GET  /auth/.well-known/jwks.json
```

`auth` shares one origin with `accounts`, `platform`, `create`, and `billing`,
so the gateway **preserves** the `/auth` service segment rather than stripping
it (see `docs/ROUTING.md`). Each path above is therefore both the upstream path
and the public path: `https://api.kpnsolute.com/auth/workforce/...` and
`https://api.kpnsolute.com/auth/.well-known/jwks.json`. Every auth internal —
OAuth, workforce, and JWKS — is namespaced under `/auth`; none of them is
registered at a bare `/workforce` or `/.well-known` path.

Supported workforce services are currently `compute`, `lunchvoice`, `scena`,
and `tradora`. A tenant policy must explicitly enable PIN login. Missing policy
rows fail closed and method discovery returns no enabled methods.

The PIN response contains a short-lived ES256 token and non-secret staff/session
context. Tokens are capped at 15 minutes, include immutable tenant,
installation, staff, and session identifiers, and are accepted only while the
private database session and product assignment remain active. A route slug is
lookup context and never an authorization claim.

The token contract is explicit:

```text
alg        ES256
kid        WORKFORCE_JWT_KEY_ID
token_use  workforce
aud        kpnsolute:<service>:workforce
iss        WORKFORCE_JWT_ISSUER (default https://auth.kpnsolute.com)
```

`/auth/.well-known/jwks.json` publishes only the configured ES256 public key, with
its `kid`, `alg`, and `use=sig` metadata. The private key is never returned.
The response uses a bounded five-minute HTTP cache, and the server's bounded
in-memory cache is replaced when either the public PEM or `kid` changes. Missing
or malformed key configuration fails closed.

## Product exchange and compatibility-session rule

A valid signature is necessary but is not sufficient for product access. Before
creating or refreshing a product-local compatibility session, the product must:

1. verify ES256, `kid`, issuer, expiry, `token_use=workforce`, and the exact
   audience `kpnsolute:<that-service>:workforce`;
2. call the central workforce session exchange or equivalent trusted
   introspection and confirm the central session, staff account, tenant,
   installation, and assignment are still active; and
3. bind local authorization to the immutable identifiers returned by that
   active central session rather than to a slug or unverified JWT field.

A local compatibility session must never outlive the central token/session that
authorized it. Its expiry must be no later than central expiry, every refresh
must revalidate central state, and central revocation, suspension, assignment
removal, or credential rotation must prevent local renewal. Products requiring
immediate revocation guarantees must revalidate central state on sensitive
operations instead of relying only on cached signature verification.

## Activation gate

Before enabling a tenant:

1. Apply migration `0007` to a non-production database and run Supabase security
   and performance advisors.
2. Provision an ES256 key pair. Keep `WORKFORCE_JWT_PRIVATE_KEY` only in the
   KpnAuth server secret store; distribute the public key to approved product
   verifiers. Configure `WORKFORCE_JWT_KEY_ID` and issuer.
3. Create an explicit tenant policy. PIN login remains disabled by default.
4. Import one tenant at a time. Hash each source PIN immediately using
   `prepareWorkforcePinCredential`; never persist or log the plaintext value.
5. Mark default or weak PINs—including legacy `2222`—for mandatory rotation.
6. Map legacy product subjects and installation assignments before routing any
   login to KpnAuth.
7. Verify valid login, wrong-tenant denial, wrong-product denial, lockout,
   rotation, exact audience and token-use validation, JWKS rotation,
   logout/revocation, expiry, active-session exchange, audit, and rollback
   against the actual product adapter.
8. Keep the legacy login path available behind the approved dual-auth flag until
   production acceptance passes. Removal requires a later migration and release
   authorization.

Unknown signing configuration fails with `setup_required`; the API does not
generate a replacement key or fall back to unsigned tokens.
