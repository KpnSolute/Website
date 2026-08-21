import { describe, expect, it } from 'vitest';
import {
  ACCOUNT_COMPLETION_URL,
  isAllowedReturnOrigin,
  resolveCompletionTarget,
  resolveReturnTarget,
} from './return-targets';

const AUTH = 'https://auth.kpnsolute.com';

describe('resolveReturnTarget', () => {
  it('keeps a same-origin relative path', () => {
    expect(resolveReturnTarget('/verify?x=1', { currentOrigin: AUTH })).toBe('/verify?x=1');
  });

  it('falls back when there is no hint', () => {
    expect(resolveReturnTarget(null, { currentOrigin: AUTH })).toBe('/');
    expect(resolveReturnTarget(undefined, { currentOrigin: AUTH })).toBe('/');
    expect(resolveReturnTarget('   ', { currentOrigin: AUTH, fallback: '/verify' })).toBe(
      '/verify',
    );
  });

  it('allows another KpnSolute app origin', () => {
    expect(
      resolveReturnTarget('https://platform.kpnsolute.com/compute/mjcc', { currentOrigin: AUTH }),
    ).toBe('https://platform.kpnsolute.com/compute/mjcc');
    expect(resolveReturnTarget('https://kpnsolute.com/', { currentOrigin: AUTH })).toBe(
      'https://kpnsolute.com/',
    );
  });

  it('refuses an arbitrary external URL', () => {
    for (const hostile of [
      'https://evil.example/steal',
      'https://platform.kpnsolute.com.evil.example/',
      'https://kpnsolute.com.attacker.test',
      'http://platform.kpnsolute.com/',
    ]) {
      expect(resolveReturnTarget(hostile, { currentOrigin: AUTH }), hostile).toBe('/');
    }
  });

  it('refuses a protocol-relative or backslash-disguised absolute URL', () => {
    expect(resolveReturnTarget('//evil.example/x', { currentOrigin: AUTH })).toBe('/');
    expect(resolveReturnTarget('/\\evil.example/x', { currentOrigin: AUTH })).toBe('/');
  });

  it('refuses non-http schemes', () => {
    for (const hostile of [
      'javascript:alert(1)',
      'data:text/html,<script>1</script>',
      'file:///etc/passwd',
    ]) {
      expect(resolveReturnTarget(hostile, { currentOrigin: AUTH }), hostile).toBe('/');
    }
  });

  it('refuses a URL that hides its real host behind credentials', () => {
    expect(
      resolveReturnTarget('https://platform.kpnsolute.com@evil.example/', { currentOrigin: AUTH }),
    ).toBe('/');
  });

  it('refuses whitespace and control characters used to smuggle a second URL', () => {
    expect(resolveReturnTarget('/ok\nhttps://evil.example', { currentOrigin: AUTH })).toBe('/');
    expect(resolveReturnTarget('/ok\thttps://evil.example', { currentOrigin: AUTH })).toBe('/');
  });

  it('trusts a loopback origin only from a loopback page', () => {
    expect(
      resolveReturnTarget('http://localhost:5175/', { currentOrigin: 'http://localhost:5180' }),
    ).toBe('http://localhost:5175/');
    expect(resolveReturnTarget('http://localhost:5175/', { currentOrigin: AUTH })).toBe('/');
  });

  it('always allows the caller’s own origin', () => {
    expect(resolveReturnTarget(`${AUTH}/verify`, { currentOrigin: AUTH })).toBe(`${AUTH}/verify`);
    expect(isAllowedReturnOrigin('https://auth.kpnsolute.com/', AUTH)).toBe(true);
  });
});

describe('resolveCompletionTarget', () => {
  function completion(raw: string | null | undefined, currentOrigin = AUTH): string {
    return resolveCompletionTarget(raw, { currentOrigin });
  }

  it('defaults to the account home when no hint is supplied', () => {
    expect(ACCOUNT_COMPLETION_URL).toBe('https://accounts.kpnsolute.com/me');
    expect(completion(null)).toBe(ACCOUNT_COMPLETION_URL);
    expect(completion(undefined)).toBe(ACCOUNT_COMPLETION_URL);
    expect(completion('  ')).toBe(ACCOUNT_COMPLETION_URL);
  });

  it('follows an approved KpnSolute app destination', () => {
    for (const approved of [
      'https://platform.kpnsolute.com/compute/mjcc',
      'https://billing.kpnsolute.com/invoices?page=2',
      'https://accounts.kpnsolute.com/security',
      'https://kpnsolute.com/',
    ]) {
      expect(completion(approved), approved).toBe(approved);
    }
  });

  it('refuses every destination the return-target rule already refuses', () => {
    for (const hostile of [
      'https://evil.example/steal',
      'https://accounts.kpnsolute.com.evil.example/me',
      'https://platform.kpnsolute.com@evil.example/',
      'javascript:alert(1)',
      '//evil.example/x',
      '/\\evil.example/x',
      '/ok\nhttps://evil.example',
    ]) {
      expect(completion(hostile), hostile).toBe(ACCOUNT_COMPLETION_URL);
    }
  });

  // A flow cannot end where it is still running. Both spellings of "back to the
  // sign-in host" are dropped, so /verify can never navigate to /verify.
  it('never ends a flow on the host running it', () => {
    for (const loop of [
      '/verify',
      '/verify?return_to=%2Fverify',
      '/login',
      '/create',
      '/',
      `${AUTH}/verify`,
      `${AUTH}/verify?return_to=${encodeURIComponent(`${AUTH}/verify`)}`,
      `${AUTH}/login`,
      `${AUTH}/create`,
    ]) {
      expect(completion(loop), loop).toBe(ACCOUNT_COMPLETION_URL);
    }
  });

  it('treats a differently-cased or trailing-slash self origin as the same host', () => {
    expect(completion('https://Auth.KpnSolute.com/verify')).toBe(ACCOUNT_COMPLETION_URL);
    expect(completion(`${AUTH}/verify`, `${AUTH}/`)).toBe(ACCOUNT_COMPLETION_URL);
  });

  it('keeps local development inside the developer’s own machine', () => {
    const devAuth = 'http://localhost:5180';
    expect(completion('http://localhost:5174/me', devAuth)).toBe('http://localhost:5174/me');
    // The dev sign-in host is still the host running the flow.
    expect(completion('http://localhost:5180/verify', devAuth)).toBe(ACCOUNT_COMPLETION_URL);
    // And a production page is never talked into a listener on the visitor's machine.
    expect(completion('http://localhost:5174/me')).toBe(ACCOUNT_COMPLETION_URL);
  });

  it('honors an explicit fallback', () => {
    const fallback = 'https://platform.kpnsolute.com/';
    expect(resolveCompletionTarget(null, { currentOrigin: AUTH, fallback })).toBe(fallback);
    expect(resolveCompletionTarget('/verify', { currentOrigin: AUTH, fallback })).toBe(fallback);
  });
});
