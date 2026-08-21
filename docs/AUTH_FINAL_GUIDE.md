# KpnAuth Final Authentication Guide

**Status:** Authoritative protocol. This document supersedes every earlier
KpnAuth sign-in sketch, including the fragment-token staff SSO contract that
was drafted for LunchVoice.

**Governing decisions:** Loom ADR-0007 (KpnAuth as the shared identity
authority), ADR-0005 (product and workspace routing), ADR-0006 (unified API
gateway). This guide implements those decisions; it does not redefine any
product Pure Goal.

**Scope note:** This guide defines protocol and contracts. Release state
(committed, pushed, deployed, live-verified) is tracked separately and is not
implied by anything written here.

---

## 1. Identity classes

KpnAuth issues four distinct kinds of principal. They never share a token
audience, a credential store, or an authorization path.

| Class     | Principal                             | Credential authority                                          | Token lifetime                    | Audience                        |
| --------- | ------------------------------------- | ------------------------------------------------------------- | --------------------------------- | ------------------------------- |
| Consumer  | A person's KpnSolute account          | Supabase Auth (KpnAuth project)                               | Supabase session                  | `kpnsolute:accounts`            |
| Workforce | Tenant staff member                   | Central `workforce_staff_accounts` + private credential table | ≤ 15 min access, rotating refresh | `kpnsolute:<service>:workforce` |
| Device    | A display, kiosk, or signage endpoint | Central `device_identities`, paired out-of-band               | ≤ 60 min access, rotating refresh | `kpnsolute:<service>:device`    |
| Service   | A backend service or automation       | Central `service_accounts`                                    | ≤ 10 min, no refresh              | `kpnsolute:<service>:service`   |

### 1.1 Consumer identity

A consumer account is a person's own KpnSolute identity. It is owned by
Supabase Auth in the KpnAuth project and is never duplicated into a product
database. Products receive a subject reference (`sub`) and nothing else.

Entry methods: password, Google. Both terminate in the same authorization-code
exchange described in section 2. When a valid KpnSolute session cookie already
exists on `auth.kpnsolute.com`, the authorization request is satisfied without
re-prompting — this is the seamless SSO path.

### 1.2 Workforce identity

A workforce principal is a tenant's staff member — a cook, a cashier, a venue
operator. It is **not** a KpnSolute consumer account and must never be
conflated with one. A workforce principal is authorized by four immutable
facts, all carried as token claims and all re-verified against current database
state on every introspection:

- `tenant_id` — the owning organization or corporation
- `installation_id` — the specific product installation
- `sub` — the staff account id
- `service_role` — the role within that installation

Tenant **slugs are routing and lookup context only**. A slug never appears in
an authorization decision.

A workforce staff account may optionally carry `linked_user_id`, pointing at a
consumer account. That link is a convenience for people who are both customers
and staff. It grants nothing on its own.

### 1.3 Device identity

Scena displays and similar endpoints authenticate as devices, not as people.
A device is paired through an operator-initiated pairing code in the product's
control surface, then holds a rotating device credential scoped to one
installation. A device token can render assigned content; it can never
administer, enumerate staff, or act across installations.

### 1.4 Service identity

Backend-to-backend calls use `client_credentials` against a per-installation
service account. Service tokens are short-lived, never refreshable, and are
scoped by explicit grant rather than by role.

---

## 2. The one callback protocol

Every product, every identity class, one flow: **OAuth 2.1 authorization code
with PKCE S256**. There are no exceptions and no second path.

### 2.1 Non-negotiable rules

1. **No access token, refresh token, or ID token ever appears in a URL** —
   not in a query string, and not in a fragment. Only a single-use
   authorization code travels through the browser.
2. **PKCE S256 is mandatory.** `plain` is rejected. Missing challenge is
   rejected.
3. **`state` is mandatory** and is compared on return. Mismatch aborts.
4. **`nonce` is mandatory** for any flow producing an ID token, and is bound
   into the code.
5. **Redirect URIs are strict-matched** against a per-client allowlist —
   exact scheme, host, port, and path. No wildcards, no prefix matching, no
   open redirect.
6. **Authorization codes are stored as SHA-256 hashes only**, are single-use,
   and expire in 60 seconds.
7. **The code-for-token exchange happens server-side**, from the product's
   backend or Edge Function, never from browser JavaScript holding a client
   secret.
8. **Refresh tokens rotate on every use** and are tracked in families. Reuse
   of a consumed refresh token revokes the entire family.

### 2.2 Sequence

```
Product                     Browser                  auth.kpnsolute.com        api.kpnsolute.com
  |                            |                            |                          |
  |-- 1. build authz URL ----->|                            |                          |
  |    (state, PKCE verifier   |                            |                          |
  |     kept server-side)      |                            |                          |
  |                            |-- 2. GET /workforce/sign-in ->                         |
  |                            |    ?client_id&redirect_uri  |                          |
  |                            |    &code_challenge(S256)    |                          |
  |                            |    &state&nonce&service     |                          |
  |                            |    &tenant_hint             |                          |
  |                            |                            |-- 3. POST /auth/oauth/authorize ->
  |                            |                            |<-- authorization_request_id -|
  |                            |<-- 4. render sign-in -------|                          |
  |                            |-- 5. submit credentials --->|                          |
  |                            |                            |-- 6. POST /auth/oauth/
  |                            |                            |   authorize/:id/workforce-pin ->
  |                            |                            |<-- { redirect_to } -------|
  |                            |<-- 7. 302 redirect_uri -----|                          |
  |                            |    ?code=<opaque>&state     |                          |
  |<-- 8. browser hits product |                            |                          |
  |    callback with code      |                            |                          |
  |                                                                                    |
  |-- 9. POST /auth/oauth/token (code + code_verifier + client_id + redirect_uri) ----->|
  |<-- 10. { access_token, refresh_token, expires_in, token_type } ---------------------|
  |                                                                                    |
  |-- 11. establish product session (cookie / local RLS projection) ------------------->|
```

Step 9 is the only place tokens exist, and it is a server-side POST body.

### 2.3 Authorization request parameters

| Parameter               | Required | Rule                                     |
| ----------------------- | -------- | ---------------------------------------- |
| `client_id`             | yes      | Must exist and be enabled                |
| `redirect_uri`          | yes      | Exact match against client allowlist     |
| `response_type`         | yes      | `code` only                              |
| `code_challenge`        | yes      | 43–128 chars, base64url                  |
| `code_challenge_method` | yes      | `S256` only                              |
| `state`                 | yes      | 16–512 chars, opaque to KpnAuth          |
| `nonce`                 | yes      | 16–512 chars, bound into the code        |
| `scope`                 | no       | Space-delimited; unknown scopes rejected |
| `service`               | yes      | A registered workforce service key       |
| `tenant_hint`           | no       | Slug used only to preselect the tenant   |

Any validation failure that occurs **before** the redirect URI is proven
returns an error page. Failures **after** the redirect URI is proven return
`?error=&error_description=&state=` to that verified URI — never a token.

### 2.4 Token exchange

`POST /auth/oauth/token`

```
grant_type=authorization_code
code=<opaque>
code_verifier=<original PKCE verifier>
client_id=<client>
redirect_uri=<same value as the authorization request>
```

Server verifies, in order: client enabled → code hash found → code unexpired →
code unconsumed → `redirect_uri` identical to the stored one → SHA-256 of
`code_verifier` equals stored challenge. The code is marked consumed inside the
same transaction that issues tokens. Any failure marks the code consumed as
well, so a failed attempt cannot be retried.

Refresh:

```
grant_type=refresh_token
refresh_token=<opaque>
client_id=<client>
```

The presented refresh token is looked up by hash. If it is already consumed,
the whole family is revoked immediately and the request fails — this is the
stolen-token signal.

### 2.5 Explicitly removed contracts

| Removed                                                                          | Replacement                                                                          |
| -------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| LunchVoice `StaffSsoCallback` reading `access_token` from `window.location.hash` | Code in query string, exchanged server-side in the `kpnauth-staff-sso` Edge Function |
| `staffLoginUrl()` emitting a bare `redirect_uri` with no PKCE or state           | Full authorization request with S256 challenge, state, and nonce                     |
| Any direct browser call that receives a workforce bearer token                   | Product-side session cookie established after server-side exchange                   |

The legacy MJCC staff SSO path (`MJCC_STAFF_SSO_URL`) is **retained unchanged**
while `KPN_AUTH_MODE=off` or `dual`. It is not part of this protocol and is not
deleted by it.

---

## 3. Token format

Workforce, device, and service tokens are ES256 JWTs signed by KpnAuth and
verified by products through the published JWKS.

```json
{
  "iss": "https://auth.kpnsolute.com",
  "aud": "kpnsolute:lunchvoice:workforce",
  "sub": "<staff_account_id>",
  "token_use": "workforce",
  "tenant_id": "<uuid>",
  "installation_id": "<uuid>",
  "session_id": "<uuid>",
  "service_key": "lunchvoice",
  "service_role": "manager",
  "must_rotate_credential": false,
  "jti": "<uuid>",
  "iat": 0,
  "exp": 0
}
```

Products must verify **all** of: signature against JWKS `kid`, `iss`, `aud`
matching their own service exactly, `token_use`, `exp`, and that
`service_key` equals their own key. Claim verification alone is not
sufficient for a privileged action — see section 4.

### 3.1 Key management

Private keys live only in the API runtime environment as
`WORKFORCE_JWT_PRIVATE_KEY`. They are never committed, never logged, and never
returned by any endpoint. `WORKFORCE_JWT_KEY_ID` is published in JWKS so that
rotation is a two-key overlap: publish the new public key, switch signing, then
retire the old key after the maximum token lifetime has elapsed.

If signing configuration is absent the API **fails closed** with
`setup_required`. It never falls back to an unsigned or symmetric token.

---

## 4. Authorization is database state, not claims

A token claim proves what was true when the token was minted. It does not prove
what is true now. Every product adapter must call central introspection
(`GET /auth/workforce/:serviceKey/session`) before establishing or renewing a
product session, and must treat these as denials:

- session revoked
- session expired
- staff account suspended or deactivated
- installation assignment removed or suspended
- tenant claim not matching the resolved product tenant

Compatibility sessions projected into a product's own database (for example a
Supabase RLS session) **must not outlive** central authorization. Adapters
bound the local session to the remaining central session lifetime and
re-introspect on refresh.

Cross-tenant denial is absolute. A token minted for tenant A and installation X
grants nothing in tenant B or installation Y, regardless of role.

---

## 5. Sessions, revocation, and audit

- Every workforce session has a database row; the JWT `jti` must equal the
  stored `token_jti`.
- Logout revokes the central session and the refresh family, then clears the
  product session.
- Revocation is immediate at the central store. Products observe it at the next
  introspection, which is bounded by the access-token lifetime.
- Every authorization decision writes an audit row: event type, outcome
  (`succeeded` / `failed` / `blocked`), tenant, installation, staff account,
  request id, and non-sensitive metadata. Credentials, codes, verifiers, and
  tokens are never written to audit rows or logs.

Failed credential attempts increment a counter and lock the credential for a
tenant-configured window. Login responses are uniform regardless of whether the
username exists, and a dummy hash comparison runs on the miss path so timing
does not leak account existence.

---

## 6. Credential storage rules

| Material              | Storage                                             |
| --------------------- | --------------------------------------------------- |
| Staff PIN / password  | scrypt hash, per-record random salt, private schema |
| Authorization code    | SHA-256 hash only                                   |
| Refresh token         | SHA-256 hash only, family-tracked                   |
| PKCE `code_challenge` | stored as received (it is already a hash)           |
| PKCE `code_verifier`  | never stored, never logged                          |
| Provider secrets      | environment only                                    |
| Device credential     | SHA-256 hash, rotating                              |

Nothing in this table is ever stored in plaintext, returned by an API, or
written to a log line.

Weak or default legacy credentials (for example a `2222` PIN carried over from
a product's own staff table) are imported with `must_rotate = true`. The token
carries `must_rotate_credential`, and the product adapter must route the user
to rotation before granting privileged actions.

---

## 7. Dual-auth migration mode

Every adapter implements a three-position flag, default `off`:

| Mode       | Central auth | Legacy auth | Use                      |
| ---------- | ------------ | ----------- | ------------------------ |
| `off`      | rejected     | unchanged   | current production       |
| `dual`     | accepted     | accepted    | migration and acceptance |
| `required` | accepted     | rejected    | after proven acceptance  |

Legacy records are **not deleted** in any mode. Deletion is a separate, later,
separately approved decision. Rollback from `dual` to `off` must always be a
configuration change with no data loss.

---

## 8. Public route surface

`auth` shares one origin with `accounts`, `platform`, `create`, and `billing`,
so the gateway **preserves** the `/auth` service segment (see
`docs/ROUTING.md`). Every auth internal is namespaced under `/auth` in the API
itself, which makes the public path and the upstream path the same string.

| Public and upstream                                   | Purpose                                   |
| ----------------------------------------------------- | ----------------------------------------- |
| `GET /auth/.well-known/jwks.json`                     | Public verification keys                  |
| `GET /auth/.well-known/openid-configuration`          | Discovery (not implemented yet)           |
| `POST /auth/oauth/authorize`                          | Create authorization request              |
| `GET /auth/oauth/authorize/:id`                       | Read request context for the sign-in host |
| `POST /auth/oauth/authorize/:id/workforce-pin`        | Authenticate and mint a code              |
| `POST /auth/oauth/token`                              | Exchange code                             |
| `POST /auth/oauth/refresh`                            | Rotate a refresh token                    |
| `POST /auth/oauth/revoke`                             | Revoke token or family                    |
| `GET /auth/config-state`                              | Fail-closed KpnAuth configuration state   |
| `GET /auth/discovery`                                 | KpnAuth authority endpoints               |
| `GET /auth/session`                                   | Current bearer session                    |
| `POST /auth/logout`                                   | Client-action-required sign-out           |
| `GET /auth/workforce/:tenantSlug/:serviceKey/methods` | Method discovery                          |
| `POST /auth/workforce/:tenantSlug/:serviceKey/pin`    | PIN login                                 |
| `GET /auth/workforce/:serviceKey/session`             | Introspection                             |
| `POST /auth/workforce/:serviceKey/logout`             | Logout and revoke                         |

Browser hosts:

| Host                 | Route                       | Purpose                                     |
| -------------------- | --------------------------- | ------------------------------------------- |
| `auth.kpnsolute.com` | `/workforce/sign-in`        | Workforce sign-in host                      |
| `auth.kpnsolute.com` | `/workforce/callback-error` | Post-redirect failure surface               |
| `auth.kpnsolute.com` | `/workforce/recover`        | Locked or rotation-required recovery        |
| `auth.kpnsolute.com` | `/`                         | Existing consumer OAuth consent (unchanged) |

---

## 9. Adapter obligations

Every product adapter must implement all of the following before its mode may
advance past `off`:

1. Login initiation that generates `state`, `nonce`, and a PKCE verifier, and
   stores them server-side bound to the browser.
2. A callback route that validates `state`, exchanges the code server-side, and
   never reads tokens from the URL.
3. Central introspection before establishing a product session.
4. Tenant and role claim checks against the product's own resolved tenant.
5. Session refresh, logout, and revocation propagation.
6. Distinct, user-legible states for unauthorized, expired, and misconfigured.
7. Audit events for every decision.
8. Compatibility mapping from central identity to the product's existing
   authorization model, additive only.
9. The `off` / `dual` / `required` flag with `off` as the shipped default.
10. A documented rollback that is configuration-only.

---

## 10. What this guide does not authorize

Writing this document authorizes no commit, push, database migration against a
hosted project, deployment, DNS change, secret provisioning, or legacy
deletion. Those remain separate gates requiring owner-supplied,
repository-specific release identifiers.
