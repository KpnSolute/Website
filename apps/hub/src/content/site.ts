/**
 * Everything the public KpnSolute site says, in one place so it can be
 * audited and edited without touching layout. Sources: Loom ADR-0001, ADR-0002,
 * governance/PRODUCT_CHARTERS.md and governance/LEGAL_STATUS_AND_IP.md.
 *
 * Rules this file must keep (enforced by site.test.ts):
 *  - no company-entity claims (KpnLLC is not a formed legal entity);
 *  - no customer names (customers are independent and their materials private);
 *  - no partner is listed unless it is added to PARTNERS with the owner's say-so;
 *  - products are described by what they are FOR, never by unverified capability.
 */

export const MISSION = 'Keeping People Navigated.';

export const MISSION_DETAIL =
  'We remove complexity for everyday users, developers, and organizations through understandable software and durable infrastructure.';

export const WHAT_WE_ARE = [
  'KpnSolute is a commercial software and managed-technology organization. We build products, tailored workspaces, integrations, and the infrastructure underneath them, and we support the people who use them.',
  'Our customers are independent. They keep ownership of their own materials, and we are given only the access needed to do the work they ask for.',
];

export interface Goal {
  title: string;
  body: string;
}

export const GOALS: Goal[] = [
  {
    title: 'One account for every product',
    body: 'Give every KpnSolute product one secure foundation for identity, workspaces, access, billing, and integration, without erasing what makes each product itself.',
  },
  {
    title: 'Software that serves many, safely',
    body: 'Turn repeatable operations into tenant-safe software and managed systems that can serve many organizations, each in its own space, without being bound to any one of them.',
  },
  {
    title: 'Feedback and operations you can act on',
    body: 'Make what people tell us and what organizations do every day understandable, so improvement can be measured instead of guessed.',
  },
  {
    title: 'Connections that are secure and clear',
    body: 'Connect our products, and our customers’ own services, through one understandable, signed, tenant-scoped protocol.',
  },
];

export const VISION = {
  headline: 'Software that always shows you where you are, and where to go next.',
  body: [
    'We picture an ecosystem where one account opens every door you are allowed through, where each organization works in a space of its own, and where the infrastructure underneath is durable enough to rely on.',
    'Products stay distinct. The foundation is shared. And nothing is announced before it works.',
  ],
};

export interface Principle {
  title: string;
  body: string;
}

export const PRINCIPLES: Principle[] = [
  {
    title: 'Customer knowledge stays private',
    body: 'We reuse our own code and our own general solution patterns. We never reuse a customer’s procedures, records, or data for anyone else.',
  },
  {
    title: 'We say what exists',
    body: 'A capability is described once it works. Products are at different stages, and we would rather under-promise than blur the line.',
  },
  {
    title: 'Products do not reach into each other',
    body: 'Products connect through signed, tenant-scoped interfaces, never by sharing databases.',
  },
  {
    title: 'Plain language',
    body: 'You will see Workspace, Team, and Organization, not our internal architecture terms.',
  },
];

export interface Product {
  key: 'compute' | 'scena' | 'tradora' | 'lunchvoice';
  name: string;
  /** What it is for: the product charter's purpose, in plain language. */
  purpose: string;
  /** Who it is for. */
  audience: string;
  /** A short honesty note, shown where a reader could otherwise over-read the purpose. */
  note?: string;
  /** Public address, only where one is live. */
  href?: string;
}

export const PRODUCTS: Product[] = [
  {
    key: 'compute',
    name: 'KpnCompute',
    purpose:
      'Turns repeatable business operations into tenant-safe software and managed digital systems that can serve many organizations.',
    audience:
      'Organizations that need operational portals, workflows, automation, dashboards, and custom systems.',
  },
  {
    key: 'scena',
    name: 'Scena',
    purpose:
      'Lets people and organizations create, organize, control, and reliably display live visual boards across one or many screens.',
    audience:
      'Individuals, teams, venues, cafés, schools, and organizations running digital signs, menu boards, and live displays.',
  },
  {
    key: 'tradora',
    name: 'Tradora',
    purpose:
      'Provides auditable market intelligence, research, strategy, risk, and paper-trading workflows that help people make better-informed decisions.',
    audience: 'Researchers, traders, and developers who want transparent financial tooling.',
    note: 'Research tooling. It is not financial advice.',
  },
  {
    key: 'lunchvoice',
    name: 'LunchVoice',
    purpose:
      'Turns audience feedback into understandable, actionable survey intelligence and measurable improvement.',
    audience:
      'Schools, workplaces, businesses, organizations, and communities. School dining is the first setting, not the limit.',
    href: 'https://lunchvoice.com',
  },
];

export interface PartnerPath {
  title: string;
  body: string;
}

export const PARTNER_PATHS: PartnerPath[] = [
  {
    title: 'Organizations with a workflow',
    body: 'Bring the way your team actually works. We turn it into a managed workspace, and your procedures and data remain yours.',
  },
  {
    title: 'Services that want to connect',
    body: 'We are building KpnLink as one secure, tenant-scoped way for our products and your services to talk to each other.',
  },
  {
    title: 'Schools and community groups',
    body: 'LunchVoice starts in school dining and is built for any group that wants to hear from its people and act on it.',
  },
];

export interface Partner {
  name: string;
  /** One honest sentence about the relationship. */
  relationship: string;
  href?: string;
}

/**
 * Current partners. Empty on purpose: a partner is added here only with the
 * owner's explicit approval and a real relationship. Customers are not partners
 * and are never listed.
 */
export const PARTNERS: Partner[] = [];

export const SHARED_SERVICES: {
  key: 'accounts' | 'platform' | 'create' | 'billing' | 'link' | 'flow';
  name: string;
  description: string;
}[] = [
  {
    key: 'accounts',
    name: 'Accounts',
    description: 'Personal identity, security, and organizations.',
  },
  {
    key: 'platform',
    name: 'Platform',
    description: 'Organization control plane for every KpnSolute product.',
  },
  { key: 'create', name: 'Create', description: 'Provision a new service and workspace.' },
  {
    key: 'billing',
    name: 'Billing',
    description: 'Subscriptions, invoices, payment methods, and usage.',
  },
  {
    key: 'link',
    name: 'Link',
    description: 'Connections, credentials, and webhook delivery health.',
  },
  {
    key: 'flow',
    name: 'Flow',
    description: 'Cross-product workflow authoring and run monitoring.',
  },
];
