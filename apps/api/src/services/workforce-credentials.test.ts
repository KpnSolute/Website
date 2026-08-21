import { describe, expect, it } from 'vitest';
import {
  hashWorkforceCredential,
  prepareWorkforcePinCredential,
  verifyWorkforceCredential,
  workforcePinRequiresRotation,
} from './workforce-credentials';

describe('workforce credential KDF', () => {
  it('stores a salted scrypt representation and verifies without retaining the credential', async () => {
    const credential = '583921';
    const encoded = await hashWorkforceCredential(credential);

    expect(encoded).toMatch(/^kpn-scrypt\$1\$16384\$8\$1\$/);
    expect(encoded).not.toContain(credential);
    await expect(verifyWorkforceCredential(credential, encoded)).resolves.toBe(true);
    await expect(verifyWorkforceCredential('583922', encoded)).resolves.toBe(false);
  });

  it('uses a unique random salt for the same credential', async () => {
    const first = await hashWorkforceCredential('583921');
    const second = await hashWorkforceCredential('583921');
    expect(first).not.toBe(second);
  });

  it('fails closed for malformed or unreasonable stored hashes', async () => {
    await expect(verifyWorkforceCredential('583921', 'not-a-hash')).resolves.toBe(false);
    await expect(
      verifyWorkforceCredential('583921', 'kpn-scrypt$1$999999999$8$1$c2FsdA$aGFzaA'),
    ).resolves.toBe(false);
  });
});

describe('weak/default PIN rotation flags', () => {
  it('requires rotation for the MJCC default, repeated digits, and short sequences', () => {
    expect(workforcePinRequiresRotation('2222')).toBe(true);
    expect(workforcePinRequiresRotation('777777')).toBe(true);
    expect(workforcePinRequiresRotation('123456')).toBe(true);
    expect(workforcePinRequiresRotation('839251')).toBe(false);
  });

  it('prepares imported PINs without returning the plaintext value', async () => {
    const prepared = await prepareWorkforcePinCredential('2222');
    expect(prepared.mustRotate).toBe(true);
    expect(prepared.credentialHash).not.toContain('2222');
    expect(Object.keys(prepared)).toEqual(['credentialHash', 'mustRotate']);
  });
});
