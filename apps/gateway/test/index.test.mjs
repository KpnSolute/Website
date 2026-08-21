import assert from 'node:assert/strict';
import test from 'node:test';
import { proxyRequest, resolveRoute, corporateTenantLabel } from '../src/index.mjs';
const env = {
  COMPUTE_APP_ORIGIN: 'https://compute-app.example/',
  COMPUTE_COMPAT_API_ORIGIN: 'https://compute.example/api/',
  PLATFORM_API_ORIGIN: 'https://platform-api.example/api/',
  COMPUTE_API_ORIGIN: 'https://compute.example/api/',
  SCENA_API_ORIGIN: 'https://scena.example/functions/v1/',
  LUNCHVOICE_API_ORIGIN: 'https://lunchvoice.example/functions/v1/',
  TRADORA_API_ORIGIN: 'https://tradora.example/api/',
  KPNLINK_API_ORIGIN: 'https://link.example/api/',
};
test('preserves the live Compute product and compatibility hosts', () => {
  const product = resolveRoute('https://compute.kpnsolute.com/mjcc/console?tab=users', env);
  assert.equal(product.kind, 'product');
  assert.equal(
    product.upstreamUrl.toString(),
    'https://compute-app.example/mjcc/console?tab=users',
  );
  const compatibility = resolveRoute('https://api.compute.kpnsolute.com/health', env);
  assert.equal(compatibility.kind, 'api-compatibility');
  assert.equal(compatibility.upstreamUrl.toString(), 'https://compute.example/api/health');
});
test('maps every governed service to a fixed upstream', () => {
  for (const service of [
    'accounts',
    'auth',
    'platform',
    'create',
    'billing',
    'compute',
    'scena',
    'lunchvoice',
    'tradora',
    'link',
    'flow',
  ])
    assert.equal(resolveRoute(`https://api.kpnsolute.com/${service}/health`, env).service, service);
});
test('strips exactly one service prefix for a service with its own origin', () => {
  assert.equal(
    resolveRoute(
      'https://api.kpnsolute.com/compute/public/menu/today?day=2',
      env,
    ).upstreamUrl.toString(),
    'https://compute.example/api/public/menu/today?day=2',
  );
  for (const [service, expected] of [
    ['scena', 'https://scena.example/functions/v1/events/42?x=1'],
    ['lunchvoice', 'https://lunchvoice.example/functions/v1/events/42?x=1'],
    ['tradora', 'https://tradora.example/api/events/42?x=1'],
    ['link', 'https://link.example/api/events/42?x=1'],
    ['flow', 'https://link.example/api/events/42?x=1'],
  ]) {
    const route = resolveRoute(`https://api.kpnsolute.com/${service}/events/42?x=1`, env);
    assert.equal(route.upstreamUrl.toString(), expected, service);
    assert.equal(route.publicPathPrefix, `/${service}`, service);
  }
});

// One origin serves accounts, auth, platform, create, and billing, so the
// service segment is the only thing that separates those namespaces upstream.
// Stripping it would send /accounts/me and /platform/me to the same route.
test('preserves the service prefix for every shared PLATFORM_API_ORIGIN service', () => {
  for (const [service, expected] of [
    ['accounts', 'https://platform-api.example/api/accounts/me'],
    ['auth', 'https://platform-api.example/api/auth/me'],
    ['platform', 'https://platform-api.example/api/platform/me'],
    ['create', 'https://platform-api.example/api/create/me'],
    ['billing', 'https://platform-api.example/api/billing/me'],
  ]) {
    const route = resolveRoute(`https://api.kpnsolute.com/${service}/me`, env);
    assert.equal(route.upstreamUrl.toString(), expected, service);
    assert.equal(route.publicPathPrefix, '', service);
  }
});

test('keeps the auth service prefix on the namespaced auth internals', () => {
  for (const [publicPath, expected] of [
    ['/auth/.well-known/jwks.json', 'https://platform-api.example/api/auth/.well-known/jwks.json'],
    ['/auth/oauth/token', 'https://platform-api.example/api/auth/oauth/token'],
    [
      '/auth/workforce/mjcc/compute/methods',
      'https://platform-api.example/api/auth/workforce/mjcc/compute/methods',
    ],
  ]) {
    assert.equal(
      resolveRoute(`https://api.kpnsolute.com${publicPath}`, env).upstreamUrl.toString(),
      expected,
      publicPath,
    );
  }
});

test('proxies a bare service root without inventing a path segment', () => {
  assert.equal(
    resolveRoute('https://api.kpnsolute.com/accounts', env).upstreamUrl.toString(),
    'https://platform-api.example/api/accounts',
  );
  assert.equal(
    resolveRoute('https://api.kpnsolute.com/compute', env).upstreamUrl.toString(),
    'https://compute.example/api/',
  );
});
test('fails closed for unknown and unconfigured services', async () => {
  assert.equal(
    (await proxyRequest(new Request('https://api.kpnsolute.com/unknown/x'), env)).status,
    404,
  );
  assert.equal(
    (await proxyRequest(new Request('https://api.kpnsolute.com/scena/x'), {})).status,
    503,
  );
});

// An inherited Object.prototype member is not a registered service.
test('never resolves a prototype member as a service or a host', async () => {
  for (const name of ['constructor', '__proto__', 'toString', 'hasOwnProperty', 'valueOf']) {
    assert.equal(resolveRoute(`https://api.kpnsolute.com/${name}/x`, env), null, name);
    assert.equal(
      (await proxyRequest(new Request(`https://api.kpnsolute.com/${name}/x`), env)).status,
      404,
      name,
    );
    assert.equal(resolveRoute(`https://${name}/x`, env), null, name);
  }
});
test('preserves methods and rewrites same-origin locations', async () => {
  let seen;
  const response = await proxyRequest(
    new Request('https://api.kpnsolute.com/compute/jobs', { method: 'POST', body: 'x' }),
    env,
    async (req) => {
      seen = req;
      return new Response('', {
        status: 201,
        headers: { location: 'https://compute.example/api/jobs/42' },
      });
    },
  );
  assert.equal(seen.method, 'POST');
  assert.equal(await seen.text(), 'x');
  assert.equal(response.headers.get('location'), 'https://api.kpnsolute.com/compute/jobs/42');
});

// The origin already echoes the preserved segment back in its own Location, so
// the rewrite must not add a second one.
test('rewrites a preserved-prefix location without doubling the service segment', async () => {
  const response = await proxyRequest(
    new Request('https://api.kpnsolute.com/accounts/username', { method: 'POST', body: '{}' }),
    env,
    async () =>
      new Response('', {
        status: 201,
        headers: { location: 'https://platform-api.example/api/accounts/me' },
      }),
  );
  assert.equal(response.headers.get('location'), 'https://api.kpnsolute.com/accounts/me');
});

test('rewrites a relative preserved-prefix location', async () => {
  const response = await proxyRequest(
    new Request('https://api.kpnsolute.com/auth/oauth/authorize', { method: 'POST', body: '{}' }),
    env,
    async () =>
      new Response('', { status: 302, headers: { location: '/api/auth/oauth/authorize/req-1' } }),
  );
  assert.equal(
    response.headers.get('location'),
    'https://api.kpnsolute.com/auth/oauth/authorize/req-1',
  );
});

test('leaves a cross-origin location alone rather than laundering it', async () => {
  const response = await proxyRequest(
    new Request('https://api.kpnsolute.com/accounts/me'),
    env,
    async () => new Response('', { status: 302, headers: { location: 'https://evil.example/x' } }),
  );
  assert.equal(response.headers.get('location'), 'https://evil.example/x');
});

// --- Corporate tenant subdomains (docs/ROUTE_REGISTRY.md section 3.0) --------
// Corporations are addressed by their own subdomain; organizations by a slug
// path on the product host. A reserved label must never resolve to a tenant.

test('resolves a corporate tenant subdomain to the product app origin', () => {
  const route = resolveRoute(new URL('https://mjcc.kpnsolute.com/console'), env);
  assert.equal(route.kind, 'corporate-tenant');
  assert.equal(route.service, 'compute');
  assert.equal(route.tenant, 'mjcc');
});

test('never resolves a reserved platform host as a corporate tenant', () => {
  for (const label of [
    'api',
    'auth',
    'accounts',
    'billing',
    'compute',
    'create',
    'platform',
    'scena',
    'lunchvoice',
    'tradora',
    'link',
    'flow',
    'workforce',
    'www',
  ]) {
    assert.equal(corporateTenantLabel(`${label}.kpnsolute.com`), null, label);
  }
});

test('rejects malformed and nested labels', () => {
  assert.equal(corporateTenantLabel('kpnsolute.com'), null);
  assert.equal(corporateTenantLabel('a.b.kpnsolute.com'), null);
  assert.equal(corporateTenantLabel('-bad.kpnsolute.com'), null);
  assert.equal(corporateTenantLabel('bad-.kpnsolute.com'), null);
  assert.equal(corporateTenantLabel('evil.example.com'), null);
});

test('forwards the edge-resolved tenant and ignores a client-supplied one', async () => {
  let seen;
  await proxyRequest(
    new Request('https://mjcc.kpnsolute.com/', { headers: { 'x-kpn-tenant': 'acme' } }),
    env,
    async (req) => {
      seen = req;
      return new Response('ok');
    },
  );
  // The spoofed header must be replaced by what the edge resolved.
  assert.equal(seen.headers.get('x-kpn-tenant'), 'mjcc');
});

test('does not set a tenant header for non-tenant routes', async () => {
  let seen;
  await proxyRequest(
    new Request('https://api.kpnsolute.com/compute/health', {
      headers: { 'x-kpn-tenant': 'acme' },
    }),
    env,
    async (req) => {
      seen = req;
      return new Response('ok');
    },
  );
  assert.equal(seen.headers.get('x-kpn-tenant'), null);
});

test('reports setup required when the corporate origin is unbound', () => {
  const route = resolveRoute(new URL('https://mjcc.kpnsolute.com/'), {});
  assert.equal(route.setupRequired, 'COMPUTE_APP_ORIGIN');
});
