import { afterEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildServer } from '../server';

/**
 * The upstream path contract.
 *
 * `accounts`, `auth`, `platform`, `create`, and `billing` share one origin, so
 * the gateway preserves the public `/{service}` segment instead of stripping
 * it (apps/gateway/src/index.mjs `SERVICE_ROUTE`). Every route this server
 * registers must therefore already carry its own service segment: the upstream
 * path and the public `https://api.kpnsolute.com` path are the same string.
 *
 * These assertions only ask whether a route is *registered*. Nothing here is
 * configured, so a registered route answers 4xx/503; a missing one answers 404.
 * That is exactly the difference being pinned.
 */

let app: FastifyInstance | undefined;

afterEach(async () => {
  await app?.close();
  app = undefined;
});

type Route = ['GET' | 'POST', string];

async function status(method: Route[0], url: string): Promise<number> {
  app ??= await buildServer({ NODE_ENV: 'test' });
  return (await app.inject({ method, url })).statusCode;
}

/** Public paths from docs/AUTH_FINAL_GUIDE.md section 8, verbatim. */
const AUTH_SURFACE: Route[] = [
  ['GET', '/auth/.well-known/jwks.json'],
  ['GET', '/auth/config-state'],
  ['GET', '/auth/discovery'],
  ['GET', '/auth/session'],
  ['POST', '/auth/logout'],
  ['POST', '/auth/oauth/authorize'],
  ['GET', '/auth/oauth/authorize/req-1'],
  ['POST', '/auth/oauth/authorize/req-1/workforce-pin'],
  ['POST', '/auth/oauth/token'],
  ['POST', '/auth/oauth/refresh'],
  ['POST', '/auth/oauth/revoke'],
  ['GET', '/auth/workforce/mjcc/compute/methods'],
  ['POST', '/auth/workforce/mjcc/compute/pin'],
  ['GET', '/auth/workforce/compute/session'],
  ['POST', '/auth/workforce/compute/logout'],
];

describe('auth internals are namespaced under /auth', () => {
  it('registers every documented auth path at its public shape', async () => {
    for (const [method, url] of AUTH_SURFACE) {
      expect([method, url, await status(method, url)]).not.toEqual([method, url, 404]);
    }
  });

  it('no longer answers the un-namespaced upstream paths', async () => {
    // These were reachable only because the gateway used to strip `/auth`. With
    // the segment preserved they would be dead upstream routes, and leaving
    // them registered would mean two paths for one capability.
    for (const [method, url] of [
      ['GET', '/.well-known/jwks.json'],
      ['POST', '/oauth/authorize'],
      ['POST', '/oauth/token'],
      ['POST', '/oauth/refresh'],
      ['POST', '/oauth/revoke'],
      ['GET', '/workforce/mjcc/compute/methods'],
      ['POST', '/workforce/mjcc/compute/pin'],
      ['GET', '/workforce/compute/session'],
      ['POST', '/workforce/compute/logout'],
    ] as Route[]) {
      expect([method, url, await status(method, url)]).toEqual([method, url, 404]);
    }
  });
});

describe('every shared-origin service keeps its own segment upstream', () => {
  it('registers each service under its own prefix', async () => {
    for (const [method, url] of [
      ['GET', '/accounts/me'],
      ['GET', '/accounts/organizations'],
      ['POST', '/accounts/username'],
      ['GET', '/platform/tenants'],
      ['GET', '/platform/overview'],
      ['GET', '/create/services'],
      ['POST', '/create/tenants'],
      ['GET', '/billing/tenants/mjcc/invoices'],
      ['GET', '/billing/checkout/confirmation'],
    ] as Route[]) {
      expect([method, url, await status(method, url)]).not.toEqual([method, url, 404]);
    }
  });

  it('does not answer a doubled service segment', async () => {
    // The shape a stripping gateway would have produced from `/accounts/me`.
    for (const url of [
      '/accounts/accounts/me',
      '/platform/platform/tenants',
      '/create/create/services',
      '/auth/auth/session',
    ]) {
      expect([url, await status('GET', url)]).toEqual([url, 404]);
    }
  });

  it('keeps the platform health checks outside every service namespace', async () => {
    // Render probes these directly on the origin, not through the gateway.
    expect(await status('GET', '/health')).toBe(200);
    expect(await status('GET', '/status')).toBe(200);
  });
});
