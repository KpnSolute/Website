import {
  exportJWK,
  importPKCS8,
  importSPKI,
  jwtVerify,
  SignJWT,
  type JWK,
  type JWTPayload,
} from 'jose';
import type { EnvRecord } from '@kpn/config';
import { readEnv } from '@kpn/config';
import type {
  WorkforceAuthMethodDiscovery,
  WorkforceServiceKey,
  WorkforceStaffSession,
} from '@kpn/contracts';
import type { WorkforceAuthRepository } from '../repositories/types.js';
import { ApiError } from '../lib/errors.js';
import { hashWorkforceCredential, verifyWorkforceCredential } from './workforce-credentials.js';

const TOKEN_ALGORITHM = 'ES256';
const DEFAULT_ISSUER = 'https://auth.kpnsolute.com';
const MAX_SESSION_TTL_SECONDS = 900;

interface WorkforceSigningConfig {
  privateKeyPem: string;
  publicKeyPem: string;
  keyId: string;
  issuer: string;
}

interface WorkforcePublicKeyConfig {
  publicKeyPem: string;
  keyId: string;
}

export interface WorkforceJwks {
  keys: Array<JWK & { alg: 'ES256'; use: 'sig'; kid: string }>;
}

export interface WorkforcePinLoginInput {
  tenantSlug: string;
  serviceKey: WorkforceServiceKey;
  username: string;
  pin: string;
  requestId: string;
}

export interface WorkforcePinLoginResult {
  accessToken: string;
  tokenType: 'Bearer';
  expiresIn: number;
  mustRotateCredential: boolean;
  staff: { id: string; displayName: string };
  tenantId: string;
  installationId: string;
  serviceRole: string;
}

export interface VerifiedWorkforceSession {
  session: WorkforceStaffSession;
  mustRotateCredential: boolean;
}

function publicKeyConfig(env: EnvRecord): WorkforcePublicKeyConfig {
  const publicKeyPem = readEnv(env, 'WORKFORCE_JWT_PUBLIC_KEY');
  const keyId = readEnv(env, 'WORKFORCE_JWT_KEY_ID');
  if (!publicKeyPem || !keyId) {
    throw ApiError.setupRequired('KpnAuth workforce public signing key');
  }
  return { publicKeyPem, keyId };
}

function signingConfig(env: EnvRecord): WorkforceSigningConfig {
  const publicConfig = publicKeyConfig(env);
  const privateKeyPem = readEnv(env, 'WORKFORCE_JWT_PRIVATE_KEY');
  if (!privateKeyPem) throw ApiError.setupRequired('KpnAuth workforce token signing');
  return {
    privateKeyPem,
    ...publicConfig,
    issuer: readEnv(env, 'WORKFORCE_JWT_ISSUER') ?? DEFAULT_ISSUER,
  };
}

export function requireWorkforceSigningConfig(env: EnvRecord): void {
  signingConfig(env);
}

export function normalizeWorkforceUsername(username: string): string {
  return username.trim().toLowerCase();
}

function audienceFor(serviceKey: WorkforceServiceKey): string {
  return `kpnsolute:${serviceKey}:workforce`;
}

let jwksCache: { publicKeyPem: string; keyId: string; value: Readonly<WorkforceJwks> } | undefined;

/** Public verification keys only. The bounded cache is replaced on PEM or kid rotation. */
export async function workforcePublicJwks(env: EnvRecord): Promise<Readonly<WorkforceJwks>> {
  const config = publicKeyConfig(env);
  if (jwksCache?.publicKeyPem === config.publicKeyPem && jwksCache.keyId === config.keyId) {
    return jwksCache.value;
  }

  try {
    const key = await importSPKI(config.publicKeyPem, TOKEN_ALGORITHM);
    const exported = await exportJWK(key);
    if (
      exported.kty !== 'EC' ||
      exported.crv !== 'P-256' ||
      typeof exported.x !== 'string' ||
      typeof exported.y !== 'string' ||
      'd' in exported
    ) {
      throw new Error('Configured workforce key is not a public P-256 key.');
    }
    const publicJwk = Object.freeze({
      ...exported,
      alg: TOKEN_ALGORITHM,
      use: 'sig' as const,
      kid: config.keyId,
    });
    const value = Object.freeze({ keys: Object.freeze([publicJwk]) }) as Readonly<WorkforceJwks>;
    jwksCache = { ...config, value };
    return value;
  } catch {
    throw ApiError.setupRequired('A valid KpnAuth workforce ES256 public key');
  }
}

let dummyHashPromise: Promise<string> | undefined;

function dummyCredentialHash(): Promise<string> {
  dummyHashPromise ??= hashWorkforceCredential('not-a-valid-workforce-pin');
  return dummyHashPromise;
}

function isCurrentlyLocked(lockedUntil: string | null, now = Date.now()): boolean {
  if (!lockedUntil) return false;
  const timestamp = Date.parse(lockedUntil);
  return !Number.isFinite(timestamp) || timestamp > now;
}

export async function discoverWorkforceMethods(
  repository: WorkforceAuthRepository,
  tenantSlug: string,
  serviceKey: WorkforceServiceKey,
): Promise<WorkforceAuthMethodDiscovery> {
  const context = await repository.resolveContext(tenantSlug, serviceKey);
  if (!context) throw ApiError.notFound('No active workforce sign-in context was found.');
  return {
    tenantSlug: context.tenantSlug,
    serviceKey: context.serviceKey,
    methods: context.policy?.pinEnabled ? ['pin'] : [],
  };
}

async function signSessionToken(
  env: EnvRecord,
  session: WorkforceStaffSession,
  mustRotateCredential: boolean,
): Promise<string> {
  const config = signingConfig(env);
  const key = await importPKCS8(config.privateKeyPem, TOKEN_ALGORITHM);
  return new SignJWT({
    token_use: 'workforce',
    tenant_id: session.tenantId,
    installation_id: session.installationId,
    session_id: session.id,
    service_key: session.serviceKey,
    service_role: session.serviceRole,
    must_rotate_credential: mustRotateCredential,
  })
    .setProtectedHeader({ alg: TOKEN_ALGORITHM, kid: config.keyId, typ: 'JWT' })
    .setIssuer(config.issuer)
    .setAudience(audienceFor(session.serviceKey))
    .setSubject(session.staffAccountId)
    .setJti(session.tokenJti)
    .setIssuedAt(Math.floor(Date.parse(session.issuedAt) / 1000))
    .setExpirationTime(Math.floor(Date.parse(session.expiresAt) / 1000))
    .sign(key);
}

/** A verified staff principal with a live central session but no token minted yet. */
export interface AuthenticatedWorkforcePrincipal {
  session: WorkforceStaffSession;
  mustRotateCredential: boolean;
  staff: { id: string; displayName: string };
  tenantId: string;
  installationId: string;
  serviceRole: string;
  sessionTtlSeconds: number;
}

/**
 * Verify staff credentials and open a central session.
 *
 * Split out from {@link loginWithWorkforcePin} so the authorization-code flow
 * can authenticate a person and then hand back a single-use code instead of a
 * bearer token. The token is minted later, at the server-side exchange.
 */
export async function authenticateWorkforcePin(
  env: EnvRecord,
  repository: WorkforceAuthRepository,
  input: WorkforcePinLoginInput,
): Promise<AuthenticatedWorkforcePrincipal> {
  requireWorkforceSigningConfig(env);
  const context = await repository.resolveContext(input.tenantSlug, input.serviceKey);
  if (!context || !context.policy?.pinEnabled) {
    throw ApiError.unauthenticated('Unable to sign in with the supplied staff credentials.');
  }

  const credential = await repository.resolvePinCredential(
    context.tenantId,
    context.installationId,
    normalizeWorkforceUsername(input.username),
  );

  if (!credential) {
    await verifyWorkforceCredential(input.pin, await dummyCredentialHash());
    await repository.recordRejectedAttempt({
      tenantId: context.tenantId,
      installationId: context.installationId,
      outcome: 'failed',
      reason: 'invalid_credential',
      requestId: input.requestId,
    });
    throw ApiError.unauthenticated('Unable to sign in with the supplied staff credentials.');
  }

  if (isCurrentlyLocked(credential.lockedUntil)) {
    await repository.recordRejectedAttempt({
      tenantId: context.tenantId,
      installationId: context.installationId,
      staffAccountId: credential.staff.id,
      outcome: 'blocked',
      reason: 'credential_locked',
      requestId: input.requestId,
    });
    throw ApiError.rateLimited('Staff sign-in is temporarily locked. Try again later.');
  }

  const valid = await verifyWorkforceCredential(input.pin, credential.credentialHash);
  if (!valid) {
    const failure = await repository.recordFailedPinAttempt({
      credential,
      context,
      maximumFailedAttempts: context.policy.maximumFailedAttempts,
      lockoutSeconds: context.policy.lockoutSeconds,
      requestId: input.requestId,
    });
    if (failure.lockedUntil) {
      throw ApiError.rateLimited('Staff sign-in is temporarily locked. Try again later.');
    }
    throw ApiError.unauthenticated('Unable to sign in with the supplied staff credentials.');
  }

  const ttlSeconds = Math.min(context.policy.sessionTtlSeconds, MAX_SESSION_TTL_SECONDS);
  const expiresAt = new Date(Date.now() + ttlSeconds * 1000).toISOString();
  const session = await repository.completeSuccessfulPinLogin({
    credential,
    context,
    expiresAt,
    requestId: input.requestId,
  });

  return {
    session,
    mustRotateCredential: credential.mustRotate,
    staff: { id: credential.staff.id, displayName: credential.staff.displayName },
    tenantId: context.tenantId,
    installationId: context.installationId,
    serviceRole: credential.assignment.serviceRole,
    sessionTtlSeconds: ttlSeconds,
  };
}

/**
 * Mint the ES256 access token for an already-authenticated session.
 *
 * Used by the authorization-code exchange. Kept separate from authentication so
 * that a token is only ever produced at a server-side endpoint.
 */
export async function issueWorkforceAccessToken(
  env: EnvRecord,
  session: WorkforceStaffSession,
  mustRotateCredential: boolean,
): Promise<string> {
  return signSessionToken(env, session, mustRotateCredential);
}

/**
 * Direct PIN-to-token sign-in.
 *
 * Retained for non-browser clients that cannot run a redirect flow. Browser
 * sign-in must use the authorization-code flow in ./oauth.ts instead — see
 * docs/AUTH_FINAL_GUIDE.md section 2.
 */
export async function loginWithWorkforcePin(
  env: EnvRecord,
  repository: WorkforceAuthRepository,
  input: WorkforcePinLoginInput,
): Promise<WorkforcePinLoginResult> {
  const principal = await authenticateWorkforcePin(env, repository, input);
  try {
    return {
      accessToken: await issueWorkforceAccessToken(
        env,
        principal.session,
        principal.mustRotateCredential,
      ),
      tokenType: 'Bearer',
      expiresIn: principal.sessionTtlSeconds,
      mustRotateCredential: principal.mustRotateCredential,
      staff: principal.staff,
      tenantId: principal.tenantId,
      installationId: principal.installationId,
      serviceRole: principal.serviceRole,
    };
  } catch (error) {
    await repository.revokeSession(principal.session.id, 'token_signing_failed');
    throw error;
  }
}

function readStringClaim(payload: JWTPayload, key: string): string | null {
  const value = payload[key];
  return typeof value === 'string' && value ? value : null;
}

export async function resolveWorkforceAccessToken(
  env: EnvRecord,
  repository: WorkforceAuthRepository,
  authorizationHeader: string | undefined,
  serviceKey: WorkforceServiceKey,
): Promise<VerifiedWorkforceSession | null> {
  const match = authorizationHeader ? /^Bearer\s+(.+)$/i.exec(authorizationHeader.trim()) : null;
  if (!match?.[1]) return null;
  const config = signingConfig(env);
  try {
    const key = await importSPKI(config.publicKeyPem, TOKEN_ALGORITHM);
    const { payload } = await jwtVerify(match[1], key, {
      algorithms: [TOKEN_ALGORITHM],
      issuer: config.issuer,
      audience: audienceFor(serviceKey),
    });
    const staffAccountId = payload.sub;
    const sessionId = readStringClaim(payload, 'session_id');
    const tenantId = readStringClaim(payload, 'tenant_id');
    const installationId = readStringClaim(payload, 'installation_id');
    const tokenServiceKey = readStringClaim(payload, 'service_key');
    const tokenUse = readStringClaim(payload, 'token_use');
    if (
      !staffAccountId ||
      !sessionId ||
      !tenantId ||
      !installationId ||
      tokenServiceKey !== serviceKey ||
      tokenUse !== 'workforce'
    ) {
      return null;
    }
    const session = await repository.findActiveSession({
      sessionId,
      tenantId,
      installationId,
      staffAccountId,
      serviceKey,
    });
    if (!session || payload.jti !== session.tokenJti) return null;
    return {
      session,
      mustRotateCredential: payload.must_rotate_credential === true,
    };
  } catch {
    return null;
  }
}
