import { createHash, randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  buildErrorRedirect,
  buildSuccessRedirect,
  deriveCodeChallengeS256,
  expiryFromNow,
  generateOpaqueSecret,
  hashOpaqueSecret,
  inspectRedirectUri,
  isExpired,
  isRegisteredRedirectUri,
  isTokenUse,
  isValidCodeChallenge,
  isValidCodeVerifier,
  isValidState,
  parseScope,
  secretHashesMatch,
  verifyPkceS256,
} from './oauth-protocol';

function verifier(): string {
  // 32 random bytes base64url-encodes to 43 chars, the RFC 7636 minimum.
  return randomBytes(32).toString('base64url');
}

describe('opaque secret handling', () => {
  it('never returns the same secret twice', () => {
    const secrets = new Set(Array.from({ length: 200 }, () => generateOpaqueSecret()));
    expect(secrets.size).toBe(200);
  });

  it('produces a 64-character hex digest that does not contain the secret', () => {
    const secret = generateOpaqueSecret();
    const hash = hashOpaqueSecret(secret);
    expect(hash).toHaveLength(64);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(hash).not.toContain(secret);
  });

  it('matches only identical digests', () => {
    const hash = hashOpaqueSecret('code-alpha');
    expect(secretHashesMatch(hash, hashOpaqueSecret('code-alpha'))).toBe(true);
    expect(secretHashesMatch(hash, hashOpaqueSecret('code-beta'))).toBe(false);
  });

  it('rejects a length mismatch without throwing', () => {
    expect(secretHashesMatch(hashOpaqueSecret('a'), 'short')).toBe(false);
  });
});

describe('PKCE S256', () => {
  it('derives the challenge exactly as RFC 7636 specifies', () => {
    const value = verifier();
    const expected = createHash('sha256').update(value, 'ascii').digest('base64url');
    expect(deriveCodeChallengeS256(value)).toBe(expected);
  });

  it('matches the RFC 7636 appendix B test vector', () => {
    expect(deriveCodeChallengeS256('dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk')).toBe(
      'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM',
    );
  });

  it('accepts the matching verifier and rejects every other one', () => {
    const value = verifier();
    const challenge = deriveCodeChallengeS256(value);
    expect(verifyPkceS256(value, challenge)).toBe(true);
    expect(verifyPkceS256(verifier(), challenge)).toBe(false);
  });

  it('rejects a verifier that is merely a prefix of the real one', () => {
    const value = verifier();
    const challenge = deriveCodeChallengeS256(value);
    expect(verifyPkceS256(value.slice(0, -1), challenge)).toBe(false);
  });

  it('refuses a plain-method downgrade where the challenge equals the verifier', () => {
    const value = verifier();
    // A `plain` implementation would store the verifier itself as the challenge.
    // S256 verification must not accept that.
    expect(verifyPkceS256(value, value)).toBe(false);
  });

  it('rejects malformed verifiers and challenges', () => {
    const value = verifier();
    const challenge = deriveCodeChallengeS256(value);
    expect(verifyPkceS256('', challenge)).toBe(false);
    expect(verifyPkceS256('too-short', challenge)).toBe(false);
    expect(verifyPkceS256('a'.repeat(129), challenge)).toBe(false);
    expect(verifyPkceS256(value, 'not-a-valid-challenge')).toBe(false);
    expect(verifyPkceS256(`${value}!`, challenge)).toBe(false);
  });

  it('bounds verifier and challenge length per the spec', () => {
    expect(isValidCodeVerifier('a'.repeat(42))).toBe(false);
    expect(isValidCodeVerifier('a'.repeat(43))).toBe(true);
    expect(isValidCodeVerifier('a'.repeat(128))).toBe(true);
    expect(isValidCodeVerifier('a'.repeat(129))).toBe(false);
    expect(isValidCodeChallenge('a'.repeat(42))).toBe(false);
    expect(isValidCodeChallenge('a'.repeat(43))).toBe(true);
  });
});

describe('state and nonce', () => {
  it('requires enough entropy to be meaningful', () => {
    expect(isValidState('a'.repeat(15))).toBe(false);
    expect(isValidState('a'.repeat(16))).toBe(true);
    expect(isValidState('a'.repeat(512))).toBe(true);
    expect(isValidState('a'.repeat(513))).toBe(false);
  });
});

describe('redirect URI allowlisting', () => {
  const registered = [
    'https://lunchvoice.kpnsolute.com/mjcc/sso',
    'https://scena.kpnsolute.com/auth/callback',
  ];

  it('accepts only an exact registered match', () => {
    expect(isRegisteredRedirectUri('https://lunchvoice.kpnsolute.com/mjcc/sso', registered)).toBe(
      true,
    );
  });

  it('rejects prefix, suffix, and path-traversal variants', () => {
    for (const hostile of [
      'https://lunchvoice.kpnsolute.com/mjcc/sso/../../evil',
      'https://lunchvoice.kpnsolute.com/mjcc/sso2',
      'https://lunchvoice.kpnsolute.com/mjcc',
      'https://lunchvoice.kpnsolute.com/mjcc/sso?next=https://evil.test',
      'https://evil.test/mjcc/sso',
      'https://lunchvoice.kpnsolute.com.evil.test/mjcc/sso',
      'https://lunchvoice.kpnsolute.com:8443/mjcc/sso',
      'http://lunchvoice.kpnsolute.com/mjcc/sso',
    ]) {
      expect(isRegisteredRedirectUri(hostile, registered)).toBe(false);
    }
  });

  it('rejects an empty candidate', () => {
    expect(isRegisteredRedirectUri('', registered)).toBe(false);
    expect(isRegisteredRedirectUri('   ', registered)).toBe(false);
  });

  it('structurally rejects unsafe URIs before any allowlist comparison', () => {
    expect(inspectRedirectUri('')?.reason).toBe('empty');
    expect(inspectRedirectUri('not-a-url')?.reason).toBe('not_absolute');
    expect(inspectRedirectUri('http://evil.test/cb')?.reason).toBe('insecure_scheme');
    expect(inspectRedirectUri('https://app.test/cb#token')?.reason).toBe('contains_fragment');
    expect(inspectRedirectUri('https://user:pw@app.test/cb')?.reason).toBe('contains_credentials');
    expect(inspectRedirectUri('javascript:alert(1)')?.reason).toBe('insecure_scheme');
  });

  it('permits https and the localhost development exception only', () => {
    expect(inspectRedirectUri('https://app.kpnsolute.com/cb')).toBeNull();
    expect(inspectRedirectUri('http://localhost:5173/cb')).toBeNull();
    expect(inspectRedirectUri('http://127.0.0.1:5173/cb')).toBeNull();
  });
});

describe('redirect construction', () => {
  it('puts the code and state in the query string and never in a fragment', () => {
    const target = buildSuccessRedirect(
      'https://lunchvoice.kpnsolute.com/mjcc/sso',
      'the-code',
      'the-state',
    );
    const url = new URL(target);
    expect(url.searchParams.get('code')).toBe('the-code');
    expect(url.searchParams.get('state')).toBe('the-state');
    expect(url.hash).toBe('');
    expect(target).not.toContain('#');
    expect(target).not.toContain('access_token');
  });

  it('preserves an existing registered query string', () => {
    const target = buildSuccessRedirect('https://app.test/cb?tenant=mjcc', 'c', 's');
    const url = new URL(target);
    expect(url.searchParams.get('tenant')).toBe('mjcc');
    expect(url.searchParams.get('code')).toBe('c');
  });

  it('encodes error redirects without leaking a token position', () => {
    const target = buildErrorRedirect(
      'https://app.test/cb',
      'access_denied',
      'Staff account is suspended.',
      'the-state',
    );
    const url = new URL(target);
    expect(url.searchParams.get('error')).toBe('access_denied');
    expect(url.searchParams.get('error_description')).toBe('Staff account is suspended.');
    expect(url.searchParams.get('state')).toBe('the-state');
    expect(url.hash).toBe('');
  });
});

describe('expiry', () => {
  it('treats a past timestamp as expired', () => {
    expect(isExpired('2020-01-01T00:00:00.000Z')).toBe(true);
  });

  it('treats a future timestamp as live', () => {
    expect(isExpired(expiryFromNow(60))).toBe(false);
  });

  it('treats an unparseable timestamp as expired rather than valid', () => {
    expect(isExpired('not-a-date')).toBe(true);
    expect(isExpired('')).toBe(true);
  });

  it('treats the exact expiry instant as expired', () => {
    const now = Date.now();
    expect(isExpired(new Date(now).toISOString(), now)).toBe(true);
  });
});

describe('scope and token use', () => {
  it('deduplicates and trims scopes', () => {
    expect(parseScope('  read   write read ')).toEqual(['read', 'write']);
    expect(parseScope(undefined)).toEqual([]);
    expect(parseScope('')).toEqual([]);
  });

  it('recognises only the four defined identity classes', () => {
    expect(isTokenUse('workforce')).toBe(true);
    expect(isTokenUse('consumer')).toBe(true);
    expect(isTokenUse('device')).toBe(true);
    expect(isTokenUse('service')).toBe(true);
    expect(isTokenUse('admin')).toBe(false);
    expect(isTokenUse('')).toBe(false);
  });
});
