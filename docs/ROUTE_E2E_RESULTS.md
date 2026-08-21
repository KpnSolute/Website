# Route boundary — browser verification

Run: 2026-08-19, local dev servers, Chromium via the in-app browser.
These are the assertions from the route registry, checked against a running app
rather than asserted in a unit test.

## KpnCompute (`frontend`, dev server on 5173)

| Route                           | Expected                                                 | Observed                                       | Result |
| ------------------------------- | -------------------------------------------------------- | ---------------------------------------------- | ------ |
| `/`                             | Product landing, "Log into Platform", no credential form | landing, CTA present, no PIN form              | pass   |
| `/login`                        | Landing, **not** a tenant credential form                | landing, CTA present, no PIN form              | pass   |
| `/workspaces/mjcc` (signed out) | No automatic credential prompt                           | "Sign in to continue" prompt, no PIN form      | pass   |
| `/workspaces/mjcc/login`        | Tenant-branded password/PIN form                         | PIN + Password tabs rendered                   | pass   |
| `/mjcc`                         | Redirect to `/workspaces/mjcc`                           | redirected, no PIN form                        | pass   |
| `/nonsense-path`                | No tenant credential form                                | redirected, "Sign in to continue", no PIN form | pass   |

## KpnSolute hub (`apps/hub`, dev server on 5173)

| Assertion                                  | Observed                                 | Result |
| ------------------------------------------ | ---------------------------------------- | ------ |
| Primary CTA reads "Log into Platform"      | present twice (header + hero)            | pass   |
| CTA links to the Platform app              | `http://localhost:5175/` (platform port) | pass   |
| No bare "Sign in" CTA remains              | absent                                   | pass   |
| Accounts kept distinct from Platform       | "Manage your account" → `:5174`          | pass   |
| No tenant credential prompt on the landing | absent                                   | pass   |

## Defect found and fixed during this run

The first pass **failed** the `/nonsense-path` assertion. Any unmatched
single-segment path was treated as a legacy tenant slug, redirected to
`/workspaces/{that-path}`, and then — because the visitor was signed out and a
"tenant" had resolved — rendered the branded password/PIN form. Every mistyped
URL became a convincing sign-in page for a workspace that does not exist.

Fix: a signed-out visitor to a workspace root no longer receives an automatic
credential prompt. The client cannot distinguish a real slug from a typo, so
sign-in became an explicit action at `/workspaces/{slug}/login`, reached from a
neutral prompt. Re-verified above.

## Not covered here

Authenticated journeys, cross-tenant denial, and device/service authentication
were not exercised: they need seeded data and configured signing keys, neither
of which exists locally. Those remain for a deployed acceptance pass.
