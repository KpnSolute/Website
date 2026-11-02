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

The **final brand icon** is the owner's artwork: a compass star at the centre of woven black orbits (recolored to the brand blue at the owner's request), with an
"eye" in the middle. `brand/kpnsolute/source-icon.webp` is that artwork, and the SVGs are traced from it
(`trace.py` -> `layers.json` -> `icon.py`, `assets.py`), not redrawn, so they match it exactly. It is two layers:
**ink** (orbits, diamond frame, dot) and **star** (the compass, brand blue `#2F5FE0`; `#6D8DFF` on dark). The gaps between strokes are real gaps, not white paint,
so the icon works on any background and recolors for dark mode (`kpnsolute-icon-on-dark.svg`).

The wordmark is the owner's supplied lettering (Josefin Sans, SIL OFL, licence included), outlined so no font is needed.
Files: icon (colour, on-dark, mono, white), animated icon (continuous slow spin, for loaders), lockups (light and
dark), wordmark, favicon (the full icon on a white tile, which stays recognizable at 16 px), PNGs and `favicon.ico`.

On the site the `Logo` component turns the icon slowly (24 s a turn) while the logo is hovered or focused, rests where it
stopped, and does not move under `prefers-reduced-motion`.

Regenerate: `python3 -m venv /tmp/v && /tmp/v/bin/pip install fonttools potracer pillow numpy` then, in `brand/kpnsolute`,
`python trace.py && python icon.py && python assets.py && python make_logo_tsx.py ../../apps/hub/src/components/Logo.tsx`,
then copy the SVGs and PNGs to `apps/hub/public/` (brand files in `brand/`). The star's blue lives in `icon.py` (`STAR`) for the files and in the
design-system accent token for the site logo.
