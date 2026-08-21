# Production routing contract

All API service keys are lowercase. Public clients call
`https://api.kpnsolute.com/{service}/...`; they never call a Render hostname or
the former MJCC management hostname.

The upstream is configuration, not user input, which prevents the gateway from
becoming an open proxy.

## What happens to the `/{service}` segment

Two modes, fixed per service in `apps/gateway/src/index.mjs` (`SERVICE_ROUTE`).

| Mode         | Services                                                    | Binding               |
| ------------ | ----------------------------------------------------------- | --------------------- |
| **preserve** | `accounts`, `auth`, `platform`, `create`, `billing`         | `PLATFORM_API_ORIGIN` |
| **strip**    | `compute`, `scena`, `lunchvoice`, `tradora`, `link`, `flow` | one origin each       |

**Preserve.** One origin serves all five shared platform services, so the
service segment is the only thing separating those namespaces. It travels
upstream unchanged: `/accounts/me` reaches the shared API's own `/accounts/me`
route, and `/auth/oauth/token` reaches `/auth/oauth/token`. Stripping it would
collapse `/accounts/me` and `/platform/me` onto one upstream path.

**Strip.** Exactly one leading segment is removed, because each of these
services has an origin of its own whose routes are already rooted at that
origin's base path. Example: when `COMPUTE_API_ORIGIN` ends in `/api/`,
`/compute/public/menu/today` reaches the Compute-owned `/api/public/menu/today`.

A same-origin `Location` header is rewritten with the exact inverse of the
request transform — the upstream's base path comes off, and `/{service}` goes
back on only for a stripped service. A cross-origin `Location` is passed through
untouched rather than laundered through the public hostname.

Organization UI routes are distinct from product runtime routes:

- `platform.kpnsolute.com/{service}/{tenant}` manages a tenant.
- `create.kpnsolute.com/{service}/new` provisions a tenant.
- `compute.kpnsolute.com/{tenant}` is the standard Compute runtime.
- `{corporation}.kpnsolute.com` or a verified custom domain is a corporate
  Compute runtime; MJCC therefore targets `mjcc.kpnsolute.com`.

Legacy addresses remain compatibility redirects only after the new destination
has passed live acceptance. Redirects must preserve safe methods and must never
silently move an authenticated mutation between origins.

## Migration gate

Configuring an upstream proves only transport. Authenticated product migration
requires a product-owned adapter that verifies KpnAuth issuer, audience, expiry,
tenant membership, role, and replay protection. Until then, only explicitly
public product endpoints may be advertised as ready through the unified API.
