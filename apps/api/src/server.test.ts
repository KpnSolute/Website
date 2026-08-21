import { afterEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildServer } from './server';

let app: FastifyInstance | undefined;

afterEach(async () => {
  await app?.close();
  app = undefined;
});

describe('health and status', () => {
  it('reports missing config state when no environment variables are set', async () => {
    app = await buildServer({ NODE_ENV: 'test' });
    const response = await app.inject({ method: 'GET', url: '/health' });
    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.data.configState).toEqual({
      database: 'missing',
      kpnAuth: 'missing',
      stripe: 'missing',
    });
  });

  it('reports configured when the relevant variables are present', async () => {
    app = await buildServer({
      NODE_ENV: 'test',
      DATABASE_URL: 'postgres://user:pass@localhost:5432/kpn',
      SUPABASE_URL: 'https://project.supabase.co',
      SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test',
      STRIPE_SECRET_KEY: 'sk_test',
    });
    const response = await app.inject({ method: 'GET', url: '/health' });
    expect(response.json().data.configState).toEqual({
      database: 'configured',
      kpnAuth: 'configured',
      stripe: 'configured',
    });
  });
});

describe('fail-closed behavior without DATABASE_URL', () => {
  it('returns 503 setup_required for a DB-backed route instead of fake data', async () => {
    app = await buildServer({ NODE_ENV: 'test' });
    const response = await app.inject({ method: 'GET', url: '/auth/session' });
    expect(response.statusCode).toBe(503);
    expect(response.json().error.code).toBe('setup_required');
  });

  it('returns 503 setup_required for auth discovery when KpnAuth is absent', async () => {
    app = await buildServer({ NODE_ENV: 'test' });
    const response = await app.inject({
      method: 'GET',
      url: '/auth/discovery',
    });
    expect(response.statusCode).toBe(503);
  });

  it('returns 503 setup_required rather than a fake session for an unauthenticated write', async () => {
    app = await buildServer({ NODE_ENV: 'test' });
    const response = await app.inject({
      method: 'POST',
      url: '/create/tenants',
      payload: { name: 'Acme', slug: 'acme', serviceKey: 'compute', planKey: 'starter' },
    });
    expect(response.statusCode).toBe(503);
  });
});

describe('fail-closed behavior for KpnAuth configuration', () => {
  it('returns 503 setup_required from /auth/discovery without Supabase config', async () => {
    app = await buildServer({
      NODE_ENV: 'test',
      DATABASE_URL: 'postgres://user:pass@localhost/kpn',
    });
    const response = await app.inject({
      method: 'GET',
      url: '/auth/discovery',
    });
    expect(response.statusCode).toBe(503);
    expect(response.json().error.code).toBe('setup_required');
  });
});

describe('CORS policy', () => {
  it('allows localhost dev origins', async () => {
    app = await buildServer({ NODE_ENV: 'test' });
    const response = await app.inject({
      method: 'GET',
      url: '/health',
      headers: { origin: 'http://localhost:5173' },
    });
    expect(response.headers['access-control-allow-origin']).toBe('http://localhost:5173');
  });
});
