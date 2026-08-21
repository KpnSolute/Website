import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

/**
 * Pure protocol primitives for the KpnAuth authorization-code + PKCE flow.
 *
 * Everything here is deterministic and database-free so the security-critical
 * comparisons can be exhaustively tested. Orchestration lives in ./oauth.ts.
 *
 * See docs/AUTH_FINAL_GUIDE.md section 2.
 */

/** Authorization codes live only long enough to be redeemed by a server. */
export const AUTHORIZATION_CODE_TTL_SECONDS = 60;
/** A pending sign-in the user is actively completing. */
export const AUTHORIZATION_REQUEST_TTL_SECONDS = 600;
export const MIN_STATE_LENGTH = 16;
export const MAX_STATE_LENGTH = 512;
export const MIN_CODE_CHALLENGE_LENGTH = 43;
export const MAX_CODE_CHALLENGE_LENGTH = 128;
/** RFC 7636 bounds for the verifier itself. */
export const MIN_CODE_VERIFIER_LENGTH = 43;
export const MAX_CODE_VERIFIER_LENGTH = 128;

export type TokenUse = 'consumer' | 'workforce' | 'device' | 'service';
export const TOKEN_USES: readonly TokenUse[] = ['consumer', 'workforce', 'device', 'service'];

const BASE64URL_PATTERN = /^[A-Za-z0-9\-._~]+$/;

/** Opaque, high-entropy, URL-safe. Returned to the caller exactly once. */
export function generateOpaqueSecret(byteLength = 32): string {
  return randomBytes(byteLength).toString('base64url');
}

/**
 * Authorization codes and refresh tokens are persisted only as this digest.
 * A database reader therefore cannot replay a credential it did not observe in
 * transit.
 */
export function hashOpaqueSecret(secret: string): string {
  return createHash('sha256').update(secret, 'utf8').digest('hex');
}

/** Constant-time comparison for two hex digests of equal, known length. */
export function secretHashesMatch(left: string, right: string): boolean {
  if (left.length !== right.length) return false;
  const leftBuffer = Buffer.from(left, 'utf8');
  const rightBuffer = Buffer.from(right, 'utf8');
  if (leftBuffer.length !== rightBuffer.length) return false;
  return timingSafeEqual(leftBuffer, rightBuffer);
}

export function isValidCodeChallenge(challenge: string): boolean {
  return (
    challenge.length >= MIN_CODE_CHALLENGE_LENGTH &&
    challenge.length <= MAX_CODE_CHALLENGE_LENGTH &&
    BASE64URL_PATTERN.test(challenge)
  );
}

export function isValidCodeVerifier(verifier: string): boolean {
  return (
    verifier.length >= MIN_CODE_VERIFIER_LENGTH &&
    verifier.length <= MAX_CODE_VERIFIER_LENGTH &&
    BASE64URL_PATTERN.test(verifier)
  );
}

/**
 * PKCE S256 only. `plain` is not accepted at any layer: a downgrade to `plain`
 * would make the challenge equal to the verifier and defeat the interception
 * protection the flow exists to provide.
 */
export function deriveCodeChallengeS256(verifier: string): string {
  return createHash('sha256').update(verifier, 'ascii').digest('base64url');
}

export function verifyPkceS256(verifier: string, storedChallenge: string): boolean {
  if (!isValidCodeVerifier(verifier) || !isValidCodeChallenge(storedChallenge)) return false;
  const derived = deriveCodeChallengeS256(verifier);
  if (derived.length !== storedChallenge.length) return false;
  return timingSafeEqual(Buffer.from(derived, 'utf8'), Buffer.from(storedChallenge, 'utf8'));
}

export function isValidState(state: string): boolean {
  return state.length >= MIN_STATE_LENGTH && state.length <= MAX_STATE_LENGTH;
}

export function isValidNonce(nonce: string): boolean {
  return isValidState(nonce);
}

/**
 * Exact-match redirect URI comparison.
 *
 * Deliberately not a prefix, wildcard, or origin comparison. Normalisation is
 * limited to trimming, because any further "helpful" normalisation (case
 * folding a path, dropping a trailing slash, resolving `..`) creates a gap
 * between what was registered and what a browser will actually navigate to.
 */
export function isRegisteredRedirectUri(candidate: string, registered: readonly string[]): boolean {
  const value = candidate.trim();
  if (!value) return false;
  return registered.some((entry) => entry.trim() === value);
}

export interface RedirectUriRejection {
  reason:
    'empty' | 'not_absolute' | 'insecure_scheme' | 'contains_fragment' | 'contains_credentials';
}

/**
 * Structural validation applied before a URI is even compared to the
 * allowlist, so that a malformed registration can never be stored and a
 * malformed request is rejected with a precise reason.
 */
export function inspectRedirectUri(candidate: string): RedirectUriRejection | null {
  const value = candidate.trim();
  if (!value) return { reason: 'empty' };
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return { reason: 'not_absolute' };
  }
  if (parsed.hash || value.includes('#')) return { reason: 'contains_fragment' };
  if (parsed.username || parsed.password) return { reason: 'contains_credentials' };
  const isLocalhost = parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1';
  if (parsed.protocol !== 'https:' && !(parsed.protocol === 'http:' && isLocalhost)) {
    return { reason: 'insecure_scheme' };
  }
  return null;
}

/**
 * Builds the browser-facing success redirect. Only the code and the caller's
 * own state travel here — never a token of any kind.
 */
export function buildSuccessRedirect(redirectUri: string, code: string, state: string): string {
  const url = new URL(redirectUri);
  url.searchParams.set('code', code);
  url.searchParams.set('state', state);
  return url.toString();
}

/**
 * Error redirects are only ever emitted to an already-verified redirect URI.
 * If the URI itself could not be proven, the caller must render an error page
 * instead of redirecting.
 */
export function buildErrorRedirect(
  redirectUri: string,
  error: string,
  description: string,
  state?: string,
): string {
  const url = new URL(redirectUri);
  url.searchParams.set('error', error);
  url.searchParams.set('error_description', description);
  if (state) url.searchParams.set('state', state);
  return url.toString();
}

export function isExpired(expiresAt: string, now = Date.now()): boolean {
  const timestamp = Date.parse(expiresAt);
  // An unparseable expiry is treated as already expired rather than as valid.
  return !Number.isFinite(timestamp) || timestamp <= now;
}

export function expiryFromNow(seconds: number, now = Date.now()): string {
  return new Date(now + seconds * 1000).toISOString();
}

/** Space-delimited scope parsing with unknown-scope rejection handled by the caller. */
export function parseScope(scope: string | undefined): string[] {
  if (!scope) return [];
  return Array.from(new Set(scope.trim().split(/\s+/).filter(Boolean)));
}

export function isTokenUse(value: string): value is TokenUse {
  return (TOKEN_USES as readonly string[]).includes(value);
}
