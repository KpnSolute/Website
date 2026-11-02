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

## Privacy Policy and Terms of Service

`/privacy` and `/terms` (content in `apps/hub/src/content/legal.ts`, tests in `legal.test.ts`). Plain-language drafts
written from what the system actually does: shared account on Supabase Auth (US), Render hosting, Cloudflare DNS,
Google sign-in with the basic scopes only (`openid email profile`), no advertising or analytics trackers. They are
**not legal advice** and need counsel's review before they are relied on. Points for counsel:

- the liability cap (12 months of fees, or 100 US dollars) and the "no warranty" wording;
- children: accounts are 13 and over; school products (LunchVoice) may need their own, stricter terms;
- retention: security records may outlive account deletion; the 30-day reply promise;
- governing law and dispute resolution are deliberately absent until the legal entity exists;
- paid plans are described as not yet available; update both documents before billing goes live.
  The contact address comes from `VITE_CONTACT_EMAIL` (set on the `kpnsolute-hub` Render site); the pages must not go
  live without it.

Google consent screen values: home page `https://kpnsolute.com/`, privacy `https://kpnsolute.com/privacy`, terms
`https://kpnsolute.com/terms`, authorized domains `kpnsolute.com` and `supabase.co` (Supabase hosts the callback).

## Brand

`brand/kpnsolute/` holds the source (`build.py`, Josefin Sans under the SIL OFL, licence included). The wordmark
is the owner's supplied lettering (Josefin Sans), outlined so no font is needed. The mark is a **K made of two
solid shapes**: a stem and a bold chevron split by an even gap. Navy stem and blue chevron on light, white stem and
light-blue chevron on dark or on the app tile. Variants: flat lockup (site), app tile, uppercase wide-spaced
alternative, dark, mono marks, and a bolder favicon that holds at 16 px.

Regenerate: `python3 -m venv /tmp/v && /tmp/v/bin/pip install fonttools && cd brand/kpnsolute && /tmp/v/bin/python build.py`,
then copy the SVGs to `apps/hub/public/brand/` and refresh `apps/hub/src/components/Logo.tsx` (its wordmark path is generated).
