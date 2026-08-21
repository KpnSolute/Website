import { afterEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildServer } from '../server.js';
import { createInMemoryPlatform, makeUser } from '../testing/in-memory-platform.js';

/**
 * Route-level contract for the account-and-tenancy slice.
 *
 * Nothing here can mint a KpnAuth token — access tokens are issued by Supabase
 * Auth and verified against its JWKS — so these assert the boundary the routes
 * are responsible for: they fail closed without configuration, they reject an
 * unauthenticated caller before touching data, and they validate their bodies.
 */

let app: FastifyInstance | undefined;

afterEach(async () => {
  await app?.close();
  app = undefined;
});

/**
 * A server whose repositories are in memory. `SUPABASE_URL` points at the
 * reserved `.invalid` TLD, which never resolves, so token verification fails
 * without this test reaching the network.
 */
async function serverWithRepositories(env: Record<string, string> = {}): Promise<FastifyInstance> {
  const platform = createInMemoryPlatform({ users: [makeUser({ id: 'account-1' })] });
  return buildServer(
    { NODE_ENV: 'test', ...env },
    { repositories: platform.repositories(platform.db) },
  );
}

const ACCOUNT_AND_TENANCY_ROUTES = [
  { method: 'GET' as const, url: '/accounts/me' },
  { method: 'GET' as const, url: '/accounts/username-availability?username=mjcc_owner' },
  { method: 'POST' as const, url: '/accounts/username', payload: { username: 'mjcc_owner' } },
  { method: 'GET' as const, url: '/platform/overview' },
  { method: 'GET' as const, url: '/platform/tenants' },
];

describe('fail-closed configuration', () => {
  it('returns 503 setup_required for every account and tenancy route without a database', async () => {
    app = await buildServer({ NODE_ENV: 'test' });
    for (const route of ACCOUNT_AND_TENANCY_ROUTES) {
      const response = await app.inject(route);
      expect([route.url, response.statusCode]).toEqual([route.url, 503]);
      expect(response.json().error.code).toBe('setup_required');
    }
  });
});

describe('authentication', () => {
  it('rejects an unauthenticated caller on every account and tenancy route', async () => {
    app = await serverWithRepositories();
    for (const route of ACCOUNT_AND_TENANCY_ROUTES) {
      const response = await app.inject(route);
      expect([route.url, response.statusCode]).toEqual([route.url, 401]);
    }
  });

  it('rejects a forged bearer token rather than trusting its claims', async () => {
    app = await serverWithRepositories({ SUPABASE_URL: 'https://kpnauth.invalid' });
    // A syntactically valid, unsigned JWT naming an existing account. If any
    // route ever read `sub` without verifying the signature, this would return
    // that account.
    const forged = [
      Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url'),
      Buffer.from(JSON.stringify({ sub: 'account-1', email: 'a@example.test' })).toString(
        'base64url',
      ),
      '',
    ].join('.');
    const response = await app.inject({
      method: 'GET',
      url: '/accounts/me',
      headers: { authorization: `Bearer ${forged}` },
    });
    expect(response.statusCode).toBe(401);
    expect(response.payload).not.toContain('account-1');
  });

  it('fails closed with setup_required when a token arrives but KpnAuth is unconfigured', async () => {
    app = await serverWithRepositories();
    const response = await app.inject({
      method: 'GET',
      url: '/accounts/me',
      headers: { authorization: 'Bearer some.token.value' },
    });
    expect(response.statusCode).toBe(503);
    expect(response.json().error.code).toBe('setup_required');
  });
});

describe('provisioning routes', () => {
  it('checks the session before parsing a provisioning body', async () => {
    // Validation feedback is not an anonymous oracle: an unauthenticated caller
    // is rejected before the request shape is examined.
    app = await serverWithRepositories();
    const response = await app.inject({
      method: 'POST',
      url: '/create/tenants',
      payload: { nonsense: true },
    });
    expect(response.statusCode).toBe(401);
  });
});
