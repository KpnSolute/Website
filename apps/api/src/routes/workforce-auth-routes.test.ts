import { generateKeyPairSync } from 'node:crypto';
import { afterEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import type { Repositories, WorkforceAuthRepository } from '../repositories/types';
import { buildServer } from '../server';
import { hashWorkforceCredential } from '../services/workforce-credentials';

const { privateKey, publicKey } = generateKeyPairSync('ec', {
  namedCurve: 'P-256',
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  publicKeyEncoding: { type: 'spki', format: 'pem' },
});

let app: FastifyInstance | undefined;

afterEach(async () => {
  await app?.close();
  app = undefined;
});

async function routeRepository(): Promise<WorkforceAuthRepository> {
  const hash = await hashWorkforceCredential('839251');
  return {
    async resolveContext() {
      return {
        tenantId: 'tenant-a',
        tenantSlug: 'alpha',
        installationId: 'installation-a',
        serviceKey: 'compute',
        policy: {
          tenantId: 'tenant-a',
          pinEnabled: true,
          minimumPinLength: 6,
          maximumFailedAttempts: 3,
          lockoutSeconds: 900,
          sessionTtlSeconds: 600,
          requirePinRotationForWeakCredentials: true,
          createdAt: '2026-08-17T00:00:00.000Z',
          updatedAt: '2026-08-17T00:00:00.000Z',
        },
      };
    },
    async resolvePinCredential() {
      return {
        staff: {
          id: 'staff-a',
          tenantId: 'tenant-a',
          linkedUserId: null,
          username: 'manager',
          displayName: 'Manager',
          employeeCode: null,
          status: 'active',
          lastAuthenticatedAt: null,
          createdAt: '2026-08-17T00:00:00.000Z',
          updatedAt: '2026-08-17T00:00:00.000Z',
        },
        assignment: {
          id: 'assignment-a',
          tenantId: 'tenant-a',
          staffAccountId: 'staff-a',
          installationId: 'installation-a',
          serviceRole: 'staff',
          status: 'active',
          createdAt: '2026-08-17T00:00:00.000Z',
          updatedAt: '2026-08-17T00:00:00.000Z',
        },
        credentialHash: hash,
        mustRotate: false,
        failedAttempts: 0,
        lockedUntil: null,
      };
    },
    async recordFailedPinAttempt() {
      return { failedAttempts: 1, lockedUntil: null };
    },
    async completeSuccessfulPinLogin() {
      throw new Error('not used');
    },
    async recordRejectedAttempt() {},
    async findActiveSession() {
      return null;
    },
    async revokeSession() {},
    async upsertPolicy() {
      throw new Error('not used');
    },
    async upsertStaffAccount() {
      throw new Error('not used');
    },
    async upsertPinCredential() {
      throw new Error('not used');
    },
    async assignStaffToInstallation() {
      throw new Error('not used');
    },
    async mapLegacyIdentity() {
      throw new Error('not used');
    },
  };
}

describe('workforce auth HTTP boundary', () => {
  it('publishes only the configured ES256 public key at the public JWKS route', async () => {
    app = await buildServer({
      NODE_ENV: 'test',
      WORKFORCE_JWT_PRIVATE_KEY: privateKey,
      WORKFORCE_JWT_PUBLIC_KEY: publicKey,
      WORKFORCE_JWT_KEY_ID: 'test-key',
    });
    const response = await app.inject({ method: 'GET', url: '/auth/.well-known/jwks.json' });
    expect(response.statusCode).toBe(200);
    expect(response.headers['cache-control']).toBe('public, max-age=300, must-revalidate');
    const body = response.json();
    expect(body.keys).toHaveLength(1);
    expect(body.keys[0]).toMatchObject({
      kty: 'EC',
      crv: 'P-256',
      alg: 'ES256',
      use: 'sig',
      kid: 'test-key',
    });
    expect(body.keys[0].x).toEqual(expect.any(String));
    expect(body.keys[0].y).toEqual(expect.any(String));
    expect(body.keys[0]).not.toHaveProperty('d');
    expect(response.body).not.toContain('PRIVATE KEY');
    expect(response.body).not.toContain(privateKey);
  });

  it('fails closed when the workforce JWKS public key configuration is absent', async () => {
    app = await buildServer({ NODE_ENV: 'test' });
    const response = await app.inject({ method: 'GET', url: '/auth/.well-known/jwks.json' });
    expect(response.statusCode).toBe(503);
    expect(response.json().error.code).toBe('setup_required');
  });

  it('fails closed without token-signing configuration before repository access', async () => {
    let contextLookups = 0;
    const repository = await routeRepository();
    const original = repository.resolveContext;
    repository.resolveContext = async (...args) => {
      contextLookups += 1;
      return original(...args);
    };
    app = await buildServer(
      { NODE_ENV: 'test' },
      { repositories: { workforceAuth: repository } as Repositories },
    );
    const response = await app.inject({
      method: 'POST',
      url: '/auth/workforce/alpha/compute/pin',
      payload: { username: 'manager', pin: '839251' },
    });
    expect(response.statusCode).toBe(503);
    expect(response.json().error.code).toBe('setup_required');
    expect(contextLookups).toBe(0);
  });

  it('does not echo a submitted PIN or stored hash on failed login', async () => {
    const repository = await routeRepository();
    const stored = (await repository.resolvePinCredential('tenant-a', 'installation-a', 'manager'))!
      .credentialHash;
    app = await buildServer(
      {
        NODE_ENV: 'test',
        WORKFORCE_JWT_PRIVATE_KEY: privateKey,
        WORKFORCE_JWT_PUBLIC_KEY: publicKey,
        WORKFORCE_JWT_KEY_ID: 'test-key',
      },
      { repositories: { workforceAuth: repository } as Repositories },
    );
    const submittedPin = '000000';
    const response = await app.inject({
      method: 'POST',
      url: '/auth/workforce/alpha/compute/pin',
      payload: { username: 'manager', pin: submittedPin },
    });
    expect(response.statusCode).toBe(401);
    expect(response.body).not.toContain(submittedPin);
    expect(response.body).not.toContain(stored);
    expect(response.headers['cache-control']).toBe('no-store');
  });
});
