import { generateKeyPairSync } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { importSPKI, jwtVerify } from 'jose';
import type { EnvRecord } from '@kpn/config';
import type {
  TenantWorkforceAuthPolicy,
  WorkforceInstallationAssignment,
  WorkforceServiceKey,
  WorkforceStaffAccount,
  WorkforceStaffSession,
} from '@kpn/contracts';
import type {
  WorkforceAuthContext,
  WorkforceAuthRepository,
  WorkforcePinCredentialRecord,
} from '../repositories/types';
import { ApiError } from '../lib/errors';
import { hashWorkforceCredential } from './workforce-credentials';
import {
  discoverWorkforceMethods,
  loginWithWorkforcePin,
  resolveWorkforceAccessToken,
  workforcePublicJwks,
} from './workforce-auth';

const { privateKey, publicKey } = generateKeyPairSync('ec', {
  namedCurve: 'P-256',
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  publicKeyEncoding: { type: 'spki', format: 'pem' },
});

const signingEnv: EnvRecord = {
  NODE_ENV: 'test',
  WORKFORCE_JWT_PRIVATE_KEY: privateKey,
  WORKFORCE_JWT_PUBLIC_KEY: publicKey,
  WORKFORCE_JWT_KEY_ID: 'test-key',
  WORKFORCE_JWT_ISSUER: 'https://auth.test.kpnsolute.com',
};

function policy(tenantId: string, maximumFailedAttempts = 3): TenantWorkforceAuthPolicy {
  return {
    tenantId,
    pinEnabled: true,
    minimumPinLength: 6,
    maximumFailedAttempts,
    lockoutSeconds: 900,
    sessionTtlSeconds: 600,
    requirePinRotationForWeakCredentials: true,
    createdAt: '2026-08-17T00:00:00.000Z',
    updatedAt: '2026-08-17T00:00:00.000Z',
  };
}

function context(
  tenantId: string,
  tenantSlug: string,
  installationId: string,
  serviceKey: WorkforceServiceKey = 'compute',
  maximumFailedAttempts = 3,
): WorkforceAuthContext {
  return {
    tenantId,
    tenantSlug,
    installationId,
    serviceKey,
    policy: policy(tenantId, maximumFailedAttempts),
  };
}

function staff(tenantId: string, id: string, username: string): WorkforceStaffAccount {
  return {
    id,
    tenantId,
    linkedUserId: null,
    username,
    displayName: `${tenantId} Staff`,
    employeeCode: null,
    status: 'active',
    lastAuthenticatedAt: null,
    createdAt: '2026-08-17T00:00:00.000Z',
    updatedAt: '2026-08-17T00:00:00.000Z',
  };
}

function assignment(
  tenantId: string,
  staffAccountId: string,
  installationId: string,
): WorkforceInstallationAssignment {
  return {
    id: `assignment-${staffAccountId}`,
    tenantId,
    staffAccountId,
    installationId,
    serviceRole: 'staff',
    status: 'active',
    createdAt: '2026-08-17T00:00:00.000Z',
    updatedAt: '2026-08-17T00:00:00.000Z',
  };
}

interface FakeOptions {
  contexts: WorkforceAuthContext[];
  credentials?: WorkforcePinCredentialRecord[];
}

function fakeRepository(options: FakeOptions): {
  repository: WorkforceAuthRepository;
  rejected: { reason: string; outcome: string }[];
  contextLookups: string[];
} {
  const credentials = options.credentials ?? [];
  const rejected: { reason: string; outcome: string }[] = [];
  const contextLookups: string[] = [];
  const sessions = new Map<string, WorkforceStaffSession>();
  let sessionSequence = 0;

  const repository: WorkforceAuthRepository = {
    async resolveContext(tenantSlug, serviceKey) {
      contextLookups.push(`${tenantSlug}:${serviceKey}`);
      return (
        options.contexts.find(
          (candidate) => candidate.tenantSlug === tenantSlug && candidate.serviceKey === serviceKey,
        ) ?? null
      );
    },
    async resolvePinCredential(tenantId, installationId, normalizedUsername) {
      return (
        credentials.find(
          (candidate) =>
            candidate.staff.tenantId === tenantId &&
            candidate.assignment.installationId === installationId &&
            candidate.staff.username.toLowerCase() === normalizedUsername,
        ) ?? null
      );
    },
    async recordFailedPinAttempt(input) {
      input.credential.failedAttempts += 1;
      if (input.credential.failedAttempts >= input.maximumFailedAttempts) {
        input.credential.lockedUntil = new Date(
          Date.now() + input.lockoutSeconds * 1000,
        ).toISOString();
      }
      return {
        failedAttempts: input.credential.failedAttempts,
        lockedUntil: input.credential.lockedUntil,
      };
    },
    async completeSuccessfulPinLogin(input) {
      input.credential.failedAttempts = 0;
      input.credential.lockedUntil = null;
      const id = `00000000-0000-4000-8000-${String(++sessionSequence).padStart(12, '0')}`;
      const session: WorkforceStaffSession = {
        id,
        tokenJti: `10000000-0000-4000-8000-${String(sessionSequence).padStart(12, '0')}`,
        tenantId: input.context.tenantId,
        staffAccountId: input.credential.staff.id,
        installationId: input.context.installationId,
        serviceKey: input.context.serviceKey,
        serviceRole: input.credential.assignment.serviceRole,
        issuedAt: new Date().toISOString(),
        expiresAt: input.expiresAt,
        revokedAt: null,
      };
      sessions.set(id, session);
      return session;
    },
    async recordRejectedAttempt(input) {
      rejected.push({ reason: input.reason, outcome: input.outcome });
    },
    async findActiveSession(input) {
      const session = sessions.get(input.sessionId);
      if (
        !session ||
        session.tenantId !== input.tenantId ||
        session.installationId !== input.installationId ||
        session.staffAccountId !== input.staffAccountId ||
        session.serviceKey !== input.serviceKey ||
        session.revokedAt
      ) {
        return null;
      }
      return session;
    },
    async revokeSession(sessionId) {
      const session = sessions.get(sessionId);
      if (session) session.revokedAt = new Date().toISOString();
    },
    async upsertPolicy() {
      throw new Error('not used in this test');
    },
    async upsertStaffAccount() {
      throw new Error('not used in this test');
    },
    async upsertPinCredential() {
      throw new Error('not used in this test');
    },
    async assignStaffToInstallation() {
      throw new Error('not used in this test');
    },
    async mapLegacyIdentity() {
      throw new Error('not used in this test');
    },
  };

  return { repository, rejected, contextLookups };
}

async function credential(
  tenantId: string,
  staffId: string,
  installationId: string,
  username: string,
  pin: string,
): Promise<WorkforcePinCredentialRecord> {
  return {
    staff: staff(tenantId, staffId, username),
    assignment: assignment(tenantId, staffId, installationId),
    credentialHash: await hashWorkforceCredential(pin),
    mustRotate: false,
    failedAttempts: 0,
    lockedUntil: null,
  };
}

describe('tenant-scoped workforce authentication', () => {
  it('allows the same username in separate tenants and resolves immutable tenant/install IDs', async () => {
    const firstContext = context('tenant-a', 'alpha', 'installation-a');
    const secondContext = context('tenant-b', 'bravo', 'installation-b');
    const firstCredential = await credential(
      'tenant-a',
      'staff-a',
      'installation-a',
      'manager',
      '839251',
    );
    const secondCredential = await credential(
      'tenant-b',
      'staff-b',
      'installation-b',
      'manager',
      '629438',
    );
    const { repository } = fakeRepository({
      contexts: [firstContext, secondContext],
      credentials: [firstCredential, secondCredential],
    });

    const first = await loginWithWorkforcePin(signingEnv, repository, {
      tenantSlug: 'alpha',
      serviceKey: 'compute',
      username: 'MANAGER',
      pin: '839251',
      requestId: 'request-a',
    });
    const second = await loginWithWorkforcePin(signingEnv, repository, {
      tenantSlug: 'bravo',
      serviceKey: 'compute',
      username: 'manager',
      pin: '629438',
      requestId: 'request-b',
    });

    expect(first).toMatchObject({ tenantId: 'tenant-a', installationId: 'installation-a' });
    expect(second).toMatchObject({ tenantId: 'tenant-b', installationId: 'installation-b' });
  });

  it('denies a staff credential when the route resolves to another tenant', async () => {
    const alpha = context('tenant-a', 'alpha', 'installation-a');
    const bravoCredential = await credential(
      'tenant-b',
      'staff-b',
      'installation-b',
      'manager',
      '629438',
    );
    const { repository, rejected } = fakeRepository({
      contexts: [alpha],
      credentials: [bravoCredential],
    });

    await expect(
      loginWithWorkforcePin(signingEnv, repository, {
        tenantSlug: 'alpha',
        serviceKey: 'compute',
        username: 'manager',
        pin: '629438',
        requestId: 'wrong-tenant',
      }),
    ).rejects.toMatchObject({ status: 401, code: 'unauthenticated' });
    expect(rejected).toEqual([{ reason: 'invalid_credential', outcome: 'failed' }]);
  });

  it('locks a credential at the tenant policy threshold', async () => {
    const alpha = context('tenant-a', 'alpha', 'installation-a', 'compute', 2);
    const alphaCredential = await credential(
      'tenant-a',
      'staff-a',
      'installation-a',
      'manager',
      '839251',
    );
    const { repository } = fakeRepository({ contexts: [alpha], credentials: [alphaCredential] });
    const attempt = () =>
      loginWithWorkforcePin(signingEnv, repository, {
        tenantSlug: 'alpha',
        serviceKey: 'compute',
        username: 'manager',
        pin: '000000',
        requestId: 'lockout',
      });

    await expect(attempt()).rejects.toMatchObject({ status: 401 });
    await expect(attempt()).rejects.toMatchObject({ status: 429, code: 'rate_limited' });
    await expect(attempt()).rejects.toMatchObject({ status: 429, code: 'rate_limited' });
  });

  it('issues a token that is valid only while its DB session remains active', async () => {
    const alpha = context('tenant-a', 'alpha', 'installation-a');
    const alphaCredential = await credential(
      'tenant-a',
      'staff-a',
      'installation-a',
      'manager',
      '839251',
    );
    const { repository } = fakeRepository({ contexts: [alpha], credentials: [alphaCredential] });
    const result = await loginWithWorkforcePin(signingEnv, repository, {
      tenantSlug: 'alpha',
      serviceKey: 'compute',
      username: 'manager',
      pin: '839251',
      requestId: 'valid-session',
    });
    const verified = await resolveWorkforceAccessToken(
      signingEnv,
      repository,
      `Bearer ${result.accessToken}`,
      'compute',
    );
    expect(verified?.session).toMatchObject({ tenantId: 'tenant-a', staffAccountId: 'staff-a' });
    await repository.revokeSession(verified!.session.id, 'test');
    await expect(
      resolveWorkforceAccessToken(
        signingEnv,
        repository,
        `Bearer ${result.accessToken}`,
        'compute',
      ),
    ).resolves.toBeNull();
  });

  it('issues the canonical workforce claims and audience', async () => {
    const alpha = context('tenant-a', 'alpha', 'installation-a');
    const alphaCredential = await credential(
      'tenant-a',
      'staff-a',
      'installation-a',
      'manager',
      '839251',
    );
    const { repository } = fakeRepository({ contexts: [alpha], credentials: [alphaCredential] });
    const result = await loginWithWorkforcePin(signingEnv, repository, {
      tenantSlug: 'alpha',
      serviceKey: 'compute',
      username: 'manager',
      pin: '839251',
      requestId: 'canonical-claims',
    });
    const verificationKey = await importSPKI(publicKey, 'ES256');
    const { payload, protectedHeader } = await jwtVerify(result.accessToken, verificationKey, {
      algorithms: ['ES256'],
      issuer: 'https://auth.test.kpnsolute.com',
      audience: 'kpnsolute:compute:workforce',
    });

    expect(protectedHeader).toMatchObject({ alg: 'ES256', kid: 'test-key', typ: 'JWT' });
    expect(payload).toMatchObject({
      token_use: 'workforce',
      sub: 'staff-a',
      tenant_id: 'tenant-a',
      installation_id: 'installation-a',
      service_key: 'compute',
      service_role: 'staff',
      aud: 'kpnsolute:compute:workforce',
    });
  });

  it('rejects a valid workforce token when a product supplies the wrong audience', async () => {
    const alpha = context('tenant-a', 'alpha', 'installation-a');
    const alphaCredential = await credential(
      'tenant-a',
      'staff-a',
      'installation-a',
      'manager',
      '839251',
    );
    const { repository } = fakeRepository({ contexts: [alpha], credentials: [alphaCredential] });
    const result = await loginWithWorkforcePin(signingEnv, repository, {
      tenantSlug: 'alpha',
      serviceKey: 'compute',
      username: 'manager',
      pin: '839251',
      requestId: 'wrong-audience',
    });

    await expect(
      resolveWorkforceAccessToken(
        signingEnv,
        repository,
        `Bearer ${result.accessToken}`,
        'lunchvoice',
      ),
    ).resolves.toBeNull();
  });

  it('replaces the bounded JWKS cache when the configured key or kid rotates', async () => {
    const first = await workforcePublicJwks(signingEnv);
    const cached = await workforcePublicJwks(signingEnv);
    const rotatedPair = generateKeyPairSync('ec', {
      namedCurve: 'P-256',
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
      publicKeyEncoding: { type: 'spki', format: 'pem' },
    });
    const rotated = await workforcePublicJwks({
      WORKFORCE_JWT_PUBLIC_KEY: rotatedPair.publicKey,
      WORKFORCE_JWT_KEY_ID: 'rotated-key',
    });

    expect(cached).toBe(first);
    expect(rotated).not.toBe(first);
    expect(rotated.keys[0]).toMatchObject({ kid: 'rotated-key', alg: 'ES256', use: 'sig' });
    expect(rotated.keys[0]?.x).not.toBe(first.keys[0]?.x);
  });

  it('discovers only methods explicitly enabled by the tenant policy', async () => {
    const enabled = context('tenant-a', 'alpha', 'installation-a');
    const disabled = { ...context('tenant-b', 'bravo', 'installation-b'), policy: null };
    const { repository } = fakeRepository({ contexts: [enabled, disabled] });
    await expect(discoverWorkforceMethods(repository, 'alpha', 'compute')).resolves.toMatchObject({
      methods: ['pin'],
    });
    await expect(discoverWorkforceMethods(repository, 'bravo', 'compute')).resolves.toMatchObject({
      methods: [],
    });
  });
});

describe('fail-closed signing configuration', () => {
  it('checks signing configuration before looking up a username or tenant', async () => {
    const { repository, contextLookups } = fakeRepository({
      contexts: [context('tenant-a', 'alpha', 'installation-a')],
    });
    await expect(
      loginWithWorkforcePin({}, repository, {
        tenantSlug: 'alpha',
        serviceKey: 'compute',
        username: 'manager',
        pin: '839251',
        requestId: 'missing-config',
      }),
    ).rejects.toBeInstanceOf(ApiError);
    expect(contextLookups).toHaveLength(0);
  });
});
