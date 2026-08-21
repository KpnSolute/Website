import { describe, expect, it } from 'vitest';
import { ACCOUNT_COMPLETION_URL } from '@kpn/contracts';
import {
  DEFAULT_COMPLETION_DESTINATION,
  completionTarget,
  returnTarget,
  verifyPath,
  withReturn,
} from './destinations';

/**
 * The return-target rules as KpnAuth applies them.
 *
 * The rule itself is contract-level and tested in
 * packages/contracts/src/return-targets.test.ts; this pins the KpnAuth-specific
 * usage — which resolver each direct account page uses, the origin they resolve
 * against, and the destination a flow with no hint ends on — so a change to
 * either is caught here rather than in a browser.
 *
 * Two resolvers, deliberately different:
 *
 *   returnTarget      /login and /create. May be sent back to a step on this
 *                     same host, so a relative path is honored.
 *   completionTarget  /verify. Ends the flow, so nothing on this host is
 *                     honored and a loop back to /verify is impossible.
 */

const AUTH_ORIGIN = 'https://auth.kpnsolute.com';
const ME = 'https://accounts.kpnsolute.com/me';

function search(returnTo: string | null): string {
  return returnTo === null ? '' : `?return_to=${encodeURIComponent(returnTo)}`;
}

function nextHop(returnTo: string | null): string {
  return returnTarget(search(returnTo), AUTH_ORIGIN);
}

function completion(returnTo: string | null): string {
  return completionTarget(search(returnTo), AUTH_ORIGIN);
}

describe('the default completion destination', () => {
  it('is the account home on the governed Accounts host', () => {
    expect(DEFAULT_COMPLETION_DESTINATION).toBe(ME);
    expect(DEFAULT_COMPLETION_DESTINATION).toBe(ACCOUNT_COMPLETION_URL);
  });

  it('is where /login, /create, and /verify go with no hint', () => {
    expect(nextHop(null)).toBe(ME);
    expect(completion(null)).toBe(ME);
    expect(returnTarget('', AUTH_ORIGIN)).toBe(ME);
    expect(completionTarget('', AUTH_ORIGIN)).toBe(ME);
    expect(nextHop('   ')).toBe(ME);
  });
});

describe('approved destinations', () => {
  it('sends a person back to the KpnSolute app that started the flow', () => {
    for (const approved of [
      'https://platform.kpnsolute.com/',
      'https://billing.kpnsolute.com/invoices',
      'https://accounts.kpnsolute.com/security',
      'https://kpnsolute.com/',
    ]) {
      expect(nextHop(approved), approved).toBe(approved);
      expect(completion(approved), approved).toBe(approved);
    }
  });

  it('never follows an attacker-supplied destination', () => {
    for (const hostile of [
      'https://kpnsolute-login.example/',
      'https://platform.kpnsolute.com.evil.test/',
      'https://accounts.kpnsolute.com@evil.test/me',
      '//evil.test/',
      '/\\evil.test/',
      'javascript:alert(document.cookie)',
      'http://platform.kpnsolute.com/',
    ]) {
      expect(nextHop(hostile), hostile).toBe(ME);
      expect(completion(hostile), hostile).toBe(ME);
    }
  });
});

describe('verify cannot loop', () => {
  it('drops a hint that points back at this host, however it is spelled', () => {
    for (const loop of [
      '/verify',
      '/verify?return_to=%2Fverify',
      '/login',
      '/create',
      '/',
      `${AUTH_ORIGIN}/verify`,
      `${AUTH_ORIGIN}/verify?return_to=${encodeURIComponent(`${AUTH_ORIGIN}/verify`)}`,
    ]) {
      expect(completion(loop), loop).toBe(ME);
    }
  });

  it('keeps the relative hop /login needs to return someone to /verify', () => {
    // The signed-out verify page links here; /login honors it and comes back.
    expect(nextHop(verifyPath(ME))).toBe(verifyPath(ME));
    expect(verifyPath(ME)).toBe('/verify?return_to=https%3A%2F%2Faccounts.kpnsolute.com%2Fme');
  });

  it('unwraps that hop to the original destination once verification runs', () => {
    // /login navigated to verifyPath(ME); /verify now resolves its own search.
    const hop = new URL(verifyPath(ME), AUTH_ORIGIN);
    expect(completionTarget(hop.search, AUTH_ORIGIN)).toBe(ME);
  });

  it('round-trips a destination through a hop without corrupting it', () => {
    // `+` is the character a hand-rolled encoder gets wrong: read back through
    // URLSearchParams it would silently become a space.
    const awkward = 'https://platform.kpnsolute.com/search?q=a+b&tag=x%20y#top';
    const hop = new URL(withReturn('/login', awkward), AUTH_ORIGIN);
    expect(new URLSearchParams(hop.search).get('return_to')).toBe(awkward);
    expect(returnTarget(hop.search, AUTH_ORIGIN)).toBe(awkward);
    expect(completionTarget(hop.search, AUTH_ORIGIN)).toBe(awkward);
  });

  it('cannot be re-entered through a provider callback URL', () => {
    // callbackUrl(destination) is verifyPath(destination) on this origin, and
    // destination is never a KpnAuth page — so the callback lands on /verify
    // exactly once and leaves for the destination.
    const destination = completion(null);
    expect(destination).toBe(ME);
    const callback = new URL(verifyPath(destination), AUTH_ORIGIN);
    expect(completionTarget(callback.search, AUTH_ORIGIN)).toBe(ME);
  });
});
