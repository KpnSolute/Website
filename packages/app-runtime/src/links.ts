import { APP_HOSTS, type AppKey } from '@kpn/contracts';

/**
 * Local-development dev-server ports, one per app. `*.kpnsolute.com` is not
 * resolvable without local DNS/hosts-file entries, so cross-app navigation in
 * dev uses these fixed localhost ports instead of the production hostnames.
 * Documented in docs/local-development.md — keep in sync with each app's
 * vite.config.ts `server.port` and with the OAuth redirect allowlist seeded
 * in apps/api/src/db/migrations/0002_seed_registry.sql.
 */
export const LOCAL_DEV_PORTS: Record<AppKey, number> = {
  hub: 5173,
  accounts: 5174,
  platform: 5175,
  create: 5176,
  billing: 5177,
  link: 5178,
  flow: 5179,
  auth: 5180,
};

/** Builds an absolute URL to another KpnSolute app, honoring local dev vs. production hosting. */
export function crossAppUrl(appKey: AppKey, path = '/', isDev = false): string {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  if (isDev) {
    return `http://localhost:${LOCAL_DEV_PORTS[appKey]}${normalizedPath}`;
  }
  return `https://${APP_HOSTS[appKey]}${normalizedPath}`;
}
