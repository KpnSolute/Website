import { randomBytes, scrypt as nodeScrypt, timingSafeEqual } from 'node:crypto';

const FORMAT = 'kpn-scrypt';
const VERSION = 1;
const KEY_LENGTH = 32;
const DEFAULT_PARAMETERS = { N: 16_384, r: 8, p: 1 } as const;
const MAX_N = 1_048_576;

interface ParsedHash {
  N: number;
  r: number;
  p: number;
  salt: Buffer;
  digest: Buffer;
}

function deriveKey(
  credential: string,
  salt: Buffer,
  parameters: { N: number; r: number; p: number },
  keyLength: number,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const maxmem = Math.max(64 * 1024 * 1024, 256 * parameters.N * parameters.r);
    nodeScrypt(
      credential,
      salt,
      keyLength,
      { N: parameters.N, r: parameters.r, p: parameters.p, maxmem },
      (error, derivedKey) => {
        if (error) reject(error);
        else resolve(derivedKey);
      },
    );
  });
}

function encodeBase64Url(value: Buffer): string {
  return value.toString('base64url');
}

function decodeBase64Url(value: string): Buffer {
  return Buffer.from(value, 'base64url');
}

function parseCredentialHash(encoded: string): ParsedHash | null {
  const [format, version, n, r, p, salt, digest, extra] = encoded.split('$');
  if (extra !== undefined || format !== FORMAT || version !== String(VERSION)) return null;
  const parameters = { N: Number(n), r: Number(r), p: Number(p) };
  if (
    !Number.isSafeInteger(parameters.N) ||
    parameters.N < DEFAULT_PARAMETERS.N ||
    parameters.N > MAX_N ||
    (parameters.N & (parameters.N - 1)) !== 0 ||
    !Number.isSafeInteger(parameters.r) ||
    parameters.r < 1 ||
    parameters.r > 32 ||
    !Number.isSafeInteger(parameters.p) ||
    parameters.p < 1 ||
    parameters.p > 16 ||
    !salt ||
    !digest
  ) {
    return null;
  }
  try {
    const decodedSalt = decodeBase64Url(salt);
    const decodedDigest = decodeBase64Url(digest);
    if (decodedSalt.length < 16 || decodedDigest.length < 16 || decodedDigest.length > 64)
      return null;
    return { ...parameters, salt: decodedSalt, digest: decodedDigest };
  } catch {
    return null;
  }
}

/** Hash a PIN/password-like workforce credential. Raw credentials must never be persisted or logged. */
export async function hashWorkforceCredential(
  credential: string,
  salt: Buffer = randomBytes(16),
): Promise<string> {
  if (!credential) throw new Error('A workforce credential is required.');
  if (salt.length < 16)
    throw new Error('Workforce credential salts must contain at least 16 bytes.');
  const digest = await deriveKey(credential, salt, DEFAULT_PARAMETERS, KEY_LENGTH);
  return [
    FORMAT,
    VERSION,
    DEFAULT_PARAMETERS.N,
    DEFAULT_PARAMETERS.r,
    DEFAULT_PARAMETERS.p,
    encodeBase64Url(salt),
    encodeBase64Url(digest),
  ].join('$');
}

export async function verifyWorkforceCredential(
  credential: string,
  encodedHash: string,
): Promise<boolean> {
  const parsed = parseCredentialHash(encodedHash);
  if (!parsed) return false;
  try {
    const candidate = await deriveKey(credential, parsed.salt, parsed, parsed.digest.length);
    return candidate.length === parsed.digest.length && timingSafeEqual(candidate, parsed.digest);
  } catch {
    return false;
  }
}

const COMMON_PINS = new Set([
  '0000',
  '1111',
  '1234',
  '2222',
  '4321',
  '9999',
  '000000',
  '111111',
  '123456',
  '654321',
]);

/** Marks imported default/simple PINs for mandatory rotation without exposing the PIN later. */
export function workforcePinRequiresRotation(pin: string, minimumLength = 6): boolean {
  if (pin.length < minimumLength || COMMON_PINS.has(pin)) return true;
  if (/^(\d)\1+$/.test(pin)) return true;
  const ascending = '01234567890123456789';
  const descending = '98765432109876543210';
  return ascending.includes(pin) || descending.includes(pin);
}

/** Safe migration helper: callers receive only the hash and rotation decision. */
export async function prepareWorkforcePinCredential(
  pin: string,
  minimumLength = 6,
): Promise<{ credentialHash: string; mustRotate: boolean }> {
  return {
    credentialHash: await hashWorkforceCredential(pin),
    mustRotate: workforcePinRequiresRotation(pin, minimumLength),
  };
}
