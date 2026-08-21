# KpnSolute Route Registry and Responsibility Matrix

**Status:** Authoritative route contract. Implementation targets this document.

**Governing decisions:** ADR-0001 (shared platform, canonical workspace path),
ADR-0004 (workspace generation), owner direction 2026-08-17 on the
authentication split and 2026-08-18 on KpnCompute tenant classes.

**Tenant classes: organizations are slug-addressed, corporations are
subdomain-addressed, both managed in Platform — see section 3.0.**

---

## 1. The authentication split

Three independent identity systems. They never substitute for one another, and
a principal in one is never silently promoted into another.

| Class                         | Who                                                                       | Authority                         | Where they sign in                        |
| ----------------------------- | ------------------------------------------------------------------------- | --------------------------------- | ----------------------------------------- |
| **Control-plane identity**    | KpnSolute account holders, organization owners, administrators            | KpnAuth (`auth.kpnsolute.com`)    | Central SSO                               |
| **Tenant workforce identity** | A tenant's own staff — a cook, cashier, venue operator                    | The tenant's product installation | **Inside the tenant's own branded route** |
| **Non-human identity**        | Displays, kiosks, API clients, service accounts, webhook signers, workers | Per-product scoped credentials    | Never a browser login flow                |

### 1.1 The rule that was previously violated

**Tenant staff doing daily tenant work never pass through an
organization-management portal, and are never forced through
`auth.kpnsolute.com`.**

MJCC's password/PIN form is a legitimate, intended tenant capability. It stays.
It moves to the canonical MJCC tenant route and issues a tenant/product-scoped
session. A tenant _may_ later federate its workforce with KpnAuth, but that is
opt-in per tenant, not the default and not a migration target.

### 1.2 What KpnAuth is for

KpnAuth owns KpnSolute account authentication and control-plane SSO: signing an
owner or administrator into Platform, Accounts, Billing, Create, Link, and Flow,
and into products where the person is acting as an _account holder_ rather than
as tenant staff. Scena manager and consumer identity is in scope. Scena displays
are not.

The authorization-code + PKCE implementation in
[`AUTH_FINAL_GUIDE.md`](./AUTH_FINAL_GUIDE.md) is correct and retained; its
**scope** is control-plane SSO plus tenants that explicitly enable federation.

---

## 2. Site responsibility matrix

| Host                                            | Owns                                                                                                                                                                                                  | Explicitly does not own                            |
| ----------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------- |
| `kpnsolute.com`                                 | Public ecosystem landing. Primary authenticated CTA: **"Log into Platform"**                                                                                                                          | Account management, org management                 |
| `platform.kpnsolute.com`                        | **The organization resource manager.** Create, select, manage, edit, launch organizations and their installed services; members, roles, invitations, resources, tenant settings, service entry points | Personal profile/security; tenant daily work       |
| `accounts.kpnsolute.com`                        | The **person**: profile, security, sessions/devices, recovery, sign-in methods, privacy, linked applications                                                                                          | Organization management                            |
| `auth.kpnsolute.com`                            | KpnAuth login/authorization for KpnSolute account and control-plane SSO                                                                                                                               | Universal replacement for tenant-local staff login |
| `create.kpnsolute.com/{service}/{organization}` | Organization/service provisioning journey                                                                                                                                                             | Ongoing management (that is Platform)              |
| `billing.kpnsolute.com`                         | Centralized subscription and checkout                                                                                                                                                                 | Product entitlement enforcement                    |
| `link.kpnsolute.com`                            | Tenant-scoped external service and API connections                                                                                                                                                    | Product business logic                             |
| `api.kpnsolute.com/{service}`                   | Unified API gateway namespaces                                                                                                                                                                        | Client-controlled upstreams                        |
| `workforce.kpnsolute.com`                       | **Internal KpnSolute corporate operator site only**                                                                                                                                                   | Any customer or tenant surface                     |

---

## 3. KpnCompute routes

### 3.0 Two tenant classes

KpnCompute has two commercial tenant classes over one tenant model. The class
decides how a tenant is **addressed**, never what it may do. Authorization
always resolves from the immutable tenant id, never from the host or slug used
to arrive.

| Class            | Addressed by      | Canonical runtime                         |
| ---------------- | ----------------- | ----------------------------------------- |
| **organization** | slug path         | `compute.kpnsolute.com/workspaces/{slug}` |
| **corporation**  | its own subdomain | `{subdomain}.kpnsolute.com`               |

A corporation may additionally hold a verified customer-owned domain, which
takes precedence over its subdomain. An organization may hold neither: giving a
path-addressed tenant a subdomain would make it reachable two ways with
different trust properties.

Corporate subdomains are allocated from a registry that excludes every reserved
platform and product hostname (`api`, `auth`, `billing`, `compute`, `platform`,
`workforce`, `www`, and the rest of `RESERVED_SUBDOMAINS`).

**Both classes are created and managed in the Platform dashboard**, at
`platform.kpnsolute.com/{service}/{tenant}`. Class, slug, subdomain, and custom
domain are Platform-owned settings. A product runtime never assigns them.

MJCC is a **corporation**: its canonical runtime is `mjcc.kpnsolute.com`, its
management is `platform.kpnsolute.com/compute/mjcc`, and
`compute.kpnsolute.com/workspaces/mjcc` plus `compute.kpnsolute.com/mjcc`
remain compatibility routes.

The shared model lives in `packages/contracts/src/tenancy.ts`
(`tenantRuntimeUrl`, `tenantManagementUrl`, `inspectTenantRouting`,
`resolveTenantFromRequest`) so Platform, the gateway, and each product agree on
one answer.

### 3.1 Canonical

| Route                                                    | Renders                                                                   | Audience                       |
| -------------------------------------------------------- | ------------------------------------------------------------------------- | ------------------------------ |
| `compute.kpnsolute.com/`                                 | KpnCompute product landing. Explains Compute; CTA **"Log into Platform"** | Prospects, organization owners |
| `compute.kpnsolute.com/workspaces/{tenant_slug}`         | Tenant workspace root/console                                             | Tenant members                 |
| `compute.kpnsolute.com/workspaces/{tenant_slug}/login`   | **Tenant-branded password/PIN login**                                     | Tenant staff                   |
| `compute.kpnsolute.com/workspaces/{tenant_slug}/console` | Workspace operations console                                              | Tenant managers                |
| `platform.kpnsolute.com/compute/{tenant}`                | Organization management for that Compute installation                     | Organization owners            |

MJCC therefore signs staff in at
`compute.kpnsolute.com/workspaces/mjcc/login`, and its workspace lives beneath
`compute.kpnsolute.com/workspaces/mjcc`.

### 3.2 Prohibited

- The generic root `/` must **not** render the MJCC password/PIN form.
- The generic `/login` must **not** render the MJCC password/PIN form.
- No unmatched path may fall back to a tenant login form. A signed-out visitor
  to an unknown path gets the product landing or a not-found page, never
  another tenant's branded credential prompt.

### 3.3 Compatibility redirects

| From                                          | To                                        | Kind                           |
| --------------------------------------------- | ----------------------------------------- | ------------------------------ |
| `compute.kpnsolute.com/{tenant_slug}`         | `/workspaces/{tenant_slug}`               | 301-equivalent client redirect |
| `compute.kpnsolute.com/{tenant_slug}/console` | `/workspaces/{tenant_slug}/console`       | redirect                       |
| `compute.kpnsolute.com/login`                 | `/` (product landing)                     | redirect                       |
| `mjcc.kpnsolute.com/*`                        | `compute.kpnsolute.com/workspaces/mjcc/*` | host redirect                  |
| `kpncompute.onrender.com/*`                   | `compute.kpnsolute.com/*`                 | origin redirect                |

`kpncompute.onrender.com` and `mjcc-managements.onrender.com` are **origin
infrastructure, not customer-facing URLs.** Direct customer traffic to a
provider host is redirected to the public hostname.

Redirects preserve a safe return path: only same-origin relative paths are
carried through. An absolute URL supplied in a query string is never followed.

---

## 4. Other products

| Product        | Public/product landing                   | Owner management                             | Tenant workforce                                      | Non-human                                                |
| -------------- | ---------------------------------------- | -------------------------------------------- | ----------------------------------------------------- | -------------------------------------------------------- |
| **Scena**      | `scena.kpnsolute.com/` → CTA to Platform | `platform.kpnsolute.com/scena/{tenant}`      | Manager/consumer identity may use KpnAuth at `/login` | `/display` kiosk keeps device-token auth, fully isolated |
| **LunchVoice** | `lunchvoice.com/` marketing              | `platform.kpnsolute.com/lunchvoice/{tenant}` | `/{orgSlug}/login` — tenant-local student + staff     | —                                                        |
| **Tradora**    | `/` landing                              | Platform (when charter authorizes)           | `/login` local                                        | Held adapter stays inactive                              |

Scena's `/display` isolation is a model to preserve, not to replace: the kiosk
imports only `src/lib/display.ts` and never `src/auth/*`, authenticating with a
hashed device token through `display-gateway`.

---

## 5. API gateway

`api.kpnsolute.com/{service}/{path}` with a fixed registry:
`accounts, auth, platform, create, billing, compute, scena, lunchvoice,
tradora, link, flow`.

No client-controlled upstream. Unknown service → 404 `route_not_found`. Unset
binding → 503.

The `/{service}` segment is **preserved** upstream for the five services that
share `PLATFORM_API_ORIGIN` (`accounts`, `auth`, `platform`, `create`,
`billing`) and **stripped** for the six with an origin of their own (`compute`,
`scena`, `lunchvoice`, `tradora`, `link`, `flow`). One shared origin cannot tell
`/accounts/me` from `/platform/me` once the segment is gone, so preserving it is
what makes the shared platform API addressable at all. Full rule and the
`Location` rewrite in [`ROUTING.md`](./ROUTING.md).

### 5.1 Edge ownership conflict (must be resolved before any deploy)

Two files declare Cloudflare Worker `kpnsolute-api-gateway` on the same three
custom domains:

- `Website/apps/gateway/wrangler.jsonc` — has the `vars` origin block
- `Scena/.worktrees/workforce-auth-compute/infra/cloudflare/compute-router/wrangler.jsonc` — no `vars`

Whichever deploys last wins, and the Compute copy would deploy a Worker with no
origin variables. **`Website/apps/gateway` is the single owner.** The Compute
copy must be retired before any Cloudflare deployment.

### 5.2 Unbound host

`mjcc.kpnsolute.com` is treated as live by `compute/frontend/src/App.tsx:296`
and by `CORS_ORIGINS` in `compute/render.yaml:11`, but **no wrangler route and
no `HOST_BINDING` entry exists for it.** It is not currently routable.

---

## 6. Current-state gaps this registry corrects

Observed in the audit, all in local code:

| Gap                                                                                       | Location                                                   |
| ----------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| Landing CTA says "Sign in", not "Log into Platform"                                       | `Website/apps/hub/src/pages/HomePage.tsx:61`               |
| Compute landing CTA says "Enter KpnCompute"                                               | `compute/frontend/src/components/ComputeHome.tsx:66`       |
| MJCC PIN form renders at generic `/login`                                                 | `compute/frontend/src/App.tsx:314`                         |
| MJCC PIN form renders at **every unmatched signed-out path**                              | `compute/frontend/src/App.tsx:335`                         |
| `/workspaces/*` is rewritten away instead of being canonical                              | `compute/frontend/src/App.tsx:96-104`                      |
| Platform is not a real org manager — one routed page, sections fall back to `sections[0]` | `Website/packages/app-runtime/src/ManagedPortal.tsx:83-95` |
| Duplicate gateway Worker declaration                                                      | section 5.1                                                |
| `mjcc.kpnsolute.com` unbound                                                              | section 5.2                                                |

---

## 7. Open governance conflict

**Resolved 2026-08-18 by owner direction:** KpnCompute has two tenant classes —
organizations addressed by slug, corporations addressed by subdomain — both
managed in the Platform dashboard. This adopts ADR-0007's tenant-class model
while keeping ADR-0001's `/workspaces/{slug}` form as the canonical slug path
for organizations. Both shapes remain reachable, so this is now a routing
decision rather than a contradiction.

What still needs closing: **ADR-0005, ADR-0006, and ADR-0007 are not on Loom
`main`** — they exist only on branch `codex/loom-compute-routing`, and ADR-0007
is untracked even there. Merge or withdraw them so the accepted tenant-class
model has a canonical record.

**ADR-0001** (accepted, on Loom `main`) specifies
`{product}.kpnsolute.com/workspaces/{tenant_slug}`. This registry follows it,
per owner direction on 2026-08-17.

**ADR-0007** (`Accepted with conditions`, dated 2026-08-17) says it _partially
supersedes_ ADR-0005, makes `compute.kpnsolute.com/{tenant}` canonical, names
MJCC the first **corporate** tenant targeting `mjcc.kpnsolute.com`, and demotes
`/workspaces/{tenant}` to a compatibility route.

**ADR-0005, ADR-0006, and ADR-0007 are not present on Loom `main`.** They exist
only on branch `codex/loom-compute-routing`; ADR-0007 is untracked even there.

The existing Compute implementation matches ADR-0007, not ADR-0001. This
registry therefore reverses working code. That is a deliberate owner decision,
recorded here so it is not mistaken for a defect fix. **Merge or withdraw
ADR-0005/0006/0007 on Loom `main` to close this.**

Until then: `/workspaces/{tenant_slug}` is canonical, and
`compute.kpnsolute.com/{tenant}` plus `mjcc.kpnsolute.com` are retained as
compatibility routes — which keeps both shapes reachable and makes a later
reversal a redirect change rather than a rewrite.
