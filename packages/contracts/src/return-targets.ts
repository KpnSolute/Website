import { APP_HOSTS, ROOT_DOMAIN } from './registry';

/**
 * Safe post-authentication return targets.
 *
 * KpnAuth and every KpnSolute app accept a `return_to` hint so a person lands
 * back where they started. An attacker-supplied absolute URL is the classic
 * open-redirect and phishing vector, so a hint is only ever honored when it is
 * a same-origin relative path or an allowlisted KpnSolute origin. Everything
 * else silently falls back — the caller never follows an arbitrary URL and
 * never echoes one back to the browser.
 */

/** Every KpnSolute origin a return hint may name. Nothing else is ever followed. */
export const ALLOWED_RETURN_ORIGINS: readonly string[] = Array.from(
  new Set([`https://${ROOT_DOMAIN}`, ...Object.values(APP_HOSTS).map((host) => `https://${host}`)]),
);

/**
 * Where a completed KpnSolute account flow lands when the caller named no
 * approved destination of its own: the person's own account home.
 *
 * It is deliberately not the sign-in host. A completion destination that stays
 * on `auth.kpnsolute.com` sends someone who just finished signing in back to a
 * sign-in page, which is the shape every verify loop has.
 */
export const ACCOUNT_COMPLETION_URL = `https://${APP_HOSTS.accounts}/me`;

const LOOPBACK_ORIGIN = /^http:\/\/(?:localhost|127\.0\.0\.1|\[::1\])(?::\d{1,5})?$/;

function normalizeOrigin(value: string): string {
  return value.trim().toLowerCase().replace(/\/+$/, '');
}

/** True for characters that only ever appear in a redirect hint to smuggle a second URL. */
function hasUnsafeCharacters(value: string): boolean {
  if (/\s/.test(value)) return true;
  for (const character of value) {
    const code = character.charCodeAt(0);
    if (code < 0x20 || code === 0x7f) return true;
  }
  return false;
}

/**
 * Loopback origins are trusted only from a loopback page. That keeps local
 * development working without letting a production page be talked into
 * redirecting at a listener on the visitor's own machine.
 */
export function isAllowedReturnOrigin(origin: string, currentOrigin: string): boolean {
  const candidate = normalizeOrigin(origin);
  if (!candidate) return false;
  const current = normalizeOrigin(currentOrigin);
  if (current && candidate === current) return true;
  if (ALLOWED_RETURN_ORIGINS.includes(candidate)) return true;
  return LOOPBACK_ORIGIN.test(candidate) && LOOPBACK_ORIGIN.test(current);
}

export interface ReturnTargetOptions {
  /** The origin of the page resolving the hint, e.g. `https://auth.kpnsolute.com`. */
  currentOrigin: string;
  /** Used whenever the hint is absent or not allowlisted. Must itself be safe. */
  fallback?: string;
}

/**
 * Resolve a caller-supplied return hint to a URL that is safe to navigate to.
 * Returns `fallback` (default `/`) for anything that is not provably safe.
 */
export function resolveReturnTarget(
  raw: string | null | undefined,
  options: ReturnTargetOptions,
): string {
  const fallback = options.fallback ?? '/';
  if (typeof raw !== 'string') return fallback;
  const candidate = raw.trim();
  if (!candidate) return fallback;
  if (hasUnsafeCharacters(candidate)) return fallback;

  if (candidate.startsWith('/')) {
    // `//host` is an absolute URL wearing a relative-looking prefix, and
    // browsers normalize `/\host` to the same thing.
    if (candidate.startsWith('//') || candidate.startsWith('/\\')) return fallback;
    return candidate;
  }

  let url: URL;
  try {
    url = new URL(candidate);
  } catch {
    return fallback;
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return fallback;
  // Credentials in a redirect URL are only ever used to disguise the real host.
  if (url.username || url.password) return fallback;
  if (!isAllowedReturnOrigin(url.origin, options.currentOrigin)) return fallback;

  return `${url.origin}${url.pathname}${url.search}${url.hash}`;
}

/**
 * Resolve the destination a *completed* flow navigates to.
 *
 * Stricter than `resolveReturnTarget` in one way that matters: the result must
 * leave the host doing the resolving. A sign-in host resolves hints for its own
 * `/login`, `/create`, and `/verify` pages, and each of those is a step in the
 * flow rather than a place to end it — so a hint naming one, whether written as
 * a relative path or as an absolute URL on the same origin, is dropped in favor
 * of `fallback`. That removes the whole class of loops where finishing
 * verification navigates back to verification.
 *
 * `fallback` must itself be an approved absolute KpnSolute destination; it
 * defaults to the person's account home.
 */
export function resolveCompletionTarget(
  raw: string | null | undefined,
  options: { currentOrigin: string; fallback?: string },
): string {
  const fallback = options.fallback ?? ACCOUNT_COMPLETION_URL;
  const resolved = resolveReturnTarget(raw, { currentOrigin: options.currentOrigin, fallback });
  if (resolved === fallback) return fallback;
  // Relative means "this host", and this host is the one running the flow.
  if (resolved.startsWith('/')) return fallback;
  try {
    const origin = normalizeOrigin(new URL(resolved).origin);
    return origin === normalizeOrigin(options.currentOrigin) ? fallback : resolved;
  } catch {
    return fallback;
  }
}
