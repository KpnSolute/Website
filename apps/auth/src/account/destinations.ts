import {
  ACCOUNT_COMPLETION_URL,
  resolveCompletionTarget,
  resolveReturnTarget,
} from '@kpn/contracts';

/**
 * Where the direct KpnAuth account flows send people.
 *
 * Kept separate from ./config.ts, which owns the Supabase and API clients: this
 * is pure policy over strings, and it stays testable without instantiating an
 * identity client.
 *
 * `/login`, `/create`, and `/verify` are steps in one flow. A step may hand off
 * to another step on this host; the flow ends somewhere else. Those are two
 * different questions, so there are two resolvers.
 */

/**
 * Where a finished account flow lands when the caller named nowhere safe:
 * `https://accounts.kpnsolute.com/me`, the person's own account home.
 */
export const DEFAULT_COMPLETION_DESTINATION = ACCOUNT_COMPLETION_URL;

/**
 * The **next hop** for `/login` and `/create`.
 *
 * These pages may legitimately be sent back to a step on this same host — the
 * signed-out `/verify` page links to `/login` and expects to be returned to —
 * so a same-origin relative path is honored here. An arbitrary URL in
 * `return_to` is dropped, not obeyed, and with no hint at all the flow ends at
 * the default completion destination rather than looping through another
 * KpnAuth page.
 */
export function returnTarget(search: string, currentOrigin = window.location.origin): string {
  return resolveReturnTarget(new URLSearchParams(search).get('return_to'), {
    currentOrigin,
    fallback: DEFAULT_COMPLETION_DESTINATION,
  });
}

/**
 * The **final destination** for `/verify`, the page that ends the flow.
 *
 * Stricter than `returnTarget`: nothing on this host is accepted, so a hint
 * pointing back at `/verify` — however it is spelled — cannot make the
 * "Continue" button return to the page it is on.
 */
export function completionTarget(search: string, currentOrigin = window.location.origin): string {
  return resolveCompletionTarget(new URLSearchParams(search).get('return_to'), {
    currentOrigin,
    fallback: DEFAULT_COMPLETION_DESTINATION,
  });
}

/**
 * A KpnAuth path carrying an already-validated destination in `return_to`.
 * One encoder for every hop, so a destination survives the round trip
 * unchanged — including one containing a literal `+`.
 */
export function withReturn(path: string, destination: string): string {
  return `${path}?${new URLSearchParams({ return_to: destination }).toString()}`;
}

/**
 * This host's verify page carrying an already-validated destination forward, as
 * a relative path. Used to send someone through verification and have them come
 * out at the destination they started with.
 */
export function verifyPath(returnTo: string): string {
  return withReturn('/verify', returnTo);
}

/**
 * The absolute URL a provider redirect must come back to. Built from this
 * origin so it always satisfies the provider's exact-match allowlist, and it
 * carries the (already validated) return target forward.
 */
export function callbackUrl(returnTo: string): string {
  return new URL(verifyPath(returnTo), window.location.origin).toString();
}
