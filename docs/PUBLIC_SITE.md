# Public site (kpnsolute.com) and brand

The Hub app (`apps/hub`) is the public face of KpnSolute: Home, About, Products, Partners. It is also the
entry point to Platform and Accounts (`Log into Platform`, `Manage your account`; see ROUTE_REGISTRY.md).

## Where the words come from

All public copy lives in `apps/hub/src/content/site.ts`, drawn from Loom: `governance/PRODUCT_CHARTERS.md`
(mission, platform goal, product purposes), ADR-0001 and ADR-0002 (what KpnSolute is, customer language,
privacy of customer materials) and `governance/LEGAL_STATUS_AND_IP.md`. Change the words there, not in pages.

## Rules (enforced by `content/site.test.ts`)

- **No company-entity claim.** KpnLLC is not a formed legal entity: never "LLC", "Inc", "Corporation", or a
  named copyright holder. The footer says "KpnSolute. All rights reserved."
- **No customer is named.** Customers are independent and their materials private (no MJCC, Miami, LionCafe).
- **No partner is listed until the owner approves one.** `PARTNERS` is empty on purpose; customers are not partners.
- **Products are described by what they are for**, not by unverified capability. Tradora carries "not financial advice".
- Customer-facing words: Workspace, Team, Organization, not "tenant".

## Owner decisions still open

- Partner list (`PARTNERS`), and a contact address: set `VITE_CONTACT_EMAIL` on the `kpnsolute-hub` Render site
  to show one on the Partners page. Unset, the page shows no address rather than an invented one.
- Approval of the wording in `site.ts` before this is published.

## Brand

`brand/kpnsolute/` holds the source (`build.py`, Josefin Sans under the SIL OFL, licence included). The wordmark
is the owner's supplied lettering (Josefin Sans), outlined so no font is needed. The icon is a **K built as a
route**: a stem that branches into two paths ending in nodes, the same idea as the home page route map.

Regenerate: `python3 -m venv /tmp/v && /tmp/v/bin/pip install fonttools && cd brand/kpnsolute && /tmp/v/bin/python build.py`,
then copy the SVGs to `apps/hub/public/brand/` and refresh `apps/hub/src/components/Logo.tsx` (its path is generated).
Colors: navy `#0B1226`, paper `#F7F8FA`, accent `#6D8DFF` on dark tile (the site's blue `#2F5FE0` on light).
`kpnsolute-favicon.svg` is a bolder, simpler K for 16 to 48 px.
