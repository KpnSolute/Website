/**
 * Canonical KpnSolute service and host registry.
 *
 * Source of truth: ADR-0007 (kpnsolute-identity-routing-and-tenant-classes),
 * ADR-0005, ADR-0006, and architecture/kpnsolute-unified-platform.md in the
 * Loom governance repository. Do not add a service or host here without a
 * corresponding accepted ADR entry — this file is a contract, not a
 * convenience list.
 */

/** Fixed, lowercase API service registry keys (api.kpnsolute.com/{service}). */
export const SERVICE_KEYS = [
  'accounts',
  'auth',
  'platform',
  'create',
  'billing',
  'compute',
  'scena',
  'lunchvoice',
  'tradora',
  'link',
  'flow',
] as const;

export type ServiceKey = (typeof SERVICE_KEYS)[number];

/** Product installations that may currently host tenant-owned staff identities. */
export const WORKFORCE_SERVICE_KEYS = ['compute', 'scena', 'lunchvoice', 'tradora'] as const;
export type WorkforceServiceKey = (typeof WORKFORCE_SERVICE_KEYS)[number];

export function isWorkforceServiceKey(value: string): value is WorkforceServiceKey {
  return (WORKFORCE_SERVICE_KEYS as readonly string[]).includes(value);
}

/** Services whose management UI/API this repository implements directly. */
export const SHARED_PLATFORM_SERVICES = [
  'accounts',
  'auth',
  'platform',
  'create',
  'billing',
] as const;

export type SharedPlatformService = (typeof SHARED_PLATFORM_SERVICES)[number];

/**
 * Services with UI ownership under this repository whose backend API is
 * owned elsewhere (KpnLink/Events). Web clients target
 * api.kpnsolute.com/{service} directly and must not duplicate Events
 * transport ownership.
 */
export const EXTERNAL_API_SERVICES = ['link', 'flow'] as const;
export type ExternalApiService = (typeof EXTERNAL_API_SERVICES)[number];

export function isServiceKey(value: string): value is ServiceKey {
  return (SERVICE_KEYS as readonly string[]).includes(value);
}

/** Reserved first-level *.kpnsolute.com subdomains (audited registry, ADR-0007). */
export const RESERVED_SUBDOMAINS = [
  'accounts',
  'api',
  'auth',
  'billing',
  'compute',
  'create',
  'docs',
  'events',
  'flow',
  'link',
  'lunchvoice',
  'platform',
  'scena',
  'status',
  'support',
  'tradora',
  'workforce',
  'www',
] as const;

export function isReservedSubdomain(value: string): boolean {
  return (RESERVED_SUBDOMAINS as readonly string[]).includes(value.toLowerCase());
}

/** Reserved product-workspace path slugs (ADR-0005) — never assignable as a tenant slug. */
export const RESERVED_WORKSPACE_SLUGS = [
  'api',
  'app',
  'auth',
  'login',
  'signup',
  'account',
  'admin',
  'docs',
  'pricing',
  'templates',
  'health',
  'status',
  'workspaces',
  'new',
] as const;

export function isReservedWorkspaceSlug(value: string): boolean {
  return (RESERVED_WORKSPACE_SLUGS as readonly string[]).includes(value.toLowerCase());
}

export const ROOT_DOMAIN = 'kpnsolute.com';

/** App identifiers for this repository's frontends, used by host-aware routing. */
export const APP_KEYS = [
  'hub',
  'accounts',
  'auth',
  'platform',
  'create',
  'billing',
  'link',
  'flow',
] as const;

export type AppKey = (typeof APP_KEYS)[number];

export const APP_HOSTS: Record<AppKey, string> = {
  hub: 'kpnsolute.com',
  accounts: 'accounts.kpnsolute.com',
  auth: 'auth.kpnsolute.com',
  platform: 'platform.kpnsolute.com',
  create: 'create.kpnsolute.com',
  billing: 'billing.kpnsolute.com',
  link: 'link.kpnsolute.com',
  flow: 'flow.kpnsolute.com',
};

const HOST_TO_APP: Record<string, AppKey> = Object.fromEntries(
  (Object.entries(APP_HOSTS) as [AppKey, string][]).map(([app, host]) => [host, app]),
) as Record<string, AppKey>;

export interface HostContext {
  app: AppKey | null;
  hostname: string;
  /** true when resolution used a local-development override rather than the real hostname. */
  isLocalOverride: boolean;
}

/**
 * Resolve which KpnSolute app should render for a given hostname.
 *
 * Local development note: `*.kpnsolute.com` is not resolvable without local
 * DNS/hosts-file entries or wildcard tooling. Two override paths are
 * supported, checked in order:
 *
 * 1. `overrideAppKey` — an explicit app key passed by the caller (for
 *    example, from a `VITE_LOCAL_APP` build-time env var set per dev
 *    server instance).
 * 2. `localPathOverride` — reads a leading `/__app/{appKey}` path segment
 *    (for a single shared dev server proxying all apps). Documented in
 *    docs/local-development.md.
 */
export function resolveHostContext(
  hostname: string,
  options?: { overrideAppKey?: string | null; pathname?: string },
): HostContext {
  const normalizedHost = hostname.toLowerCase();

  if (options?.overrideAppKey && isAppKey(options.overrideAppKey)) {
    return { app: options.overrideAppKey, hostname: normalizedHost, isLocalOverride: true };
  }

  const direct = HOST_TO_APP[normalizedHost];
  if (direct) {
    return { app: direct, hostname: normalizedHost, isLocalOverride: false };
  }

  if (options?.pathname) {
    const match = options.pathname.match(/^\/__app\/([a-z]+)(\/|$)/i);
    const candidate = match?.[1];
    if (candidate && isAppKey(candidate)) {
      return { app: candidate, hostname: normalizedHost, isLocalOverride: true };
    }
  }

  if (normalizedHost === 'localhost' || normalizedHost === '127.0.0.1') {
    return { app: null, hostname: normalizedHost, isLocalOverride: false };
  }

  return { app: null, hostname: normalizedHost, isLocalOverride: false };
}

export function isAppKey(value: string): value is AppKey {
  return (APP_KEYS as readonly string[]).includes(value);
}

/** Build the canonical shared-management path for a service+tenant scoped app. */
export function managementPath(service: ServiceKey, tenantSlug: string): string {
  return `/${service}/${tenantSlug}`;
}

/** Build the canonical provisioning entry path for a not-yet-existing tenant. */
export function newTenantPath(service: ServiceKey): string {
  return `/${service}/new`;
}

export function apiServicePath(service: ServiceKey, servicePath = ''): string {
  const trimmed = servicePath.replace(/^\/+/, '');
  return trimmed ? `/${service}/${trimmed}` : `/${service}`;
}
