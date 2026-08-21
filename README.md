# KpnSolute shared platform

This monorepo owns the shared KpnSolute commercial and identity plane. Product
runtimes remain in their product repositories.

| App      | Production host                             | Purpose                                            |
| -------- | ------------------------------------------- | -------------------------------------------------- |
| Hub      | `kpnsolute.com`                             | Product discovery and account entry                |
| Accounts | `accounts.kpnsolute.com`                    | Personal identity, security, sessions, memberships |
| Auth     | `auth.kpnsolute.com`                        | KpnAuth sign-in and OAuth 2.1 consent UI           |
| Platform | `platform.kpnsolute.com/{service}/{tenant}` | Organization control plane                         |
| Create   | `create.kpnsolute.com/{service}/new`        | Tenant and product provisioning                    |
| Billing  | `billing.kpnsolute.com/{service}/{tenant}`  | Subscriptions, invoices, payment methods, usage    |
| Link     | `link.kpnsolute.com/{service}/{tenant}`     | Connections and CloudEvents delivery operations    |
| Flow     | `flow.kpnsolute.com/{service}/{tenant}`     | Workflow authoring and run operations              |
| API      | `api.kpnsolute.com/{service}`               | Unified, lowercase service API boundary            |

## Local verification

Use Node 20 or later, then run `npm ci`, `npm run check`, and `npm audit`.
Copy `.env.example` to an untracked local environment file and supply real
configuration outside Git. Missing database, KpnAuth, billing, or product
upstream configuration fails closed; the UI and API do not fabricate records.

## API ownership

The shared API directly owns `accounts`, `auth`, `platform`, `create`, and
`billing`. Those five share one origin, so the gateway preserves the
`/{service}` segment when it proxies them and each API route carries its own
prefix. The Cloudflare gateway sends `compute`, `scena`, `lunchvoice`,
`tradora`, `link`, and `flow` directly to fixed product-owned upstreams,
stripping exactly one prefix. See `docs/ROUTING.md`. Each
product still owns its schemas and runtime. Product adapters must validate
KpnAuth issuer, audience, signature, expiry, and current database-backed tenant
membership before authenticated migration is considered complete.

KpnAuth uses the dedicated Supabase project `vwbrxcltetelvvkbnbru`. Supabase
Auth owns credentials, social identities, sessions, OAuth clients, grants,
authorization codes, access tokens, refresh tokens, discovery, and JWKS. The
application database owns profiles, organizations, memberships, product
installations, billing references, and audit history. See `docs/KPNAUTH.md` and
`docs/DATA_OWNERSHIP.md`.

Tenant staff authentication is an additive, local-only foundation documented in
`docs/WORKFORCE_AUTH.md`. It stores only salted credential hashes in a private
schema, requires immutable tenant plus installation assignments, and issues
short-lived revocable workforce tokens. No product has been cut over to it.

Deployment uses `render.yaml`. Custom-domain DNS and secrets are operator steps;
they are never embedded in source or inferred from a successful build.

The Cloudflare Worker in `apps/gateway` is the sole target owner for
`api.kpnsolute.com`. Its environment bindings point each lowercase service key
to a fixed HTTPS origin. Compatibility Workers may retain old product API hosts,
but they must not also claim the unified API hostname after cutover.
