/**
 * The fixed service registry: which origin binding serves a service, and what
 * the gateway does with the public `/{service}` segment before proxying.
 *
 *   'preserve'  the segment stays in the upstream path. Used by every service
 *               sharing PLATFORM_API_ORIGIN — one origin serves accounts, auth,
 *               platform, create, and billing, so the segment is the only thing
 *               that tells those namespaces apart. Stripping it would collapse
 *               `/accounts/me` and `/platform/me` onto the same upstream path.
 *   'strip'     exactly one leading segment is removed. Used by every service
 *               with an origin of its own, whose routes are already rooted at
 *               that origin's own base path.
 *
 * The mode is part of the contract, not derived from the binding name: adding a
 * service to a shared origin must be a deliberate edit here.
 */
const SERVICE_ROUTE = Object.freeze({
  accounts: { binding: 'PLATFORM_API_ORIGIN', prefix: 'preserve' },
  auth: { binding: 'PLATFORM_API_ORIGIN', prefix: 'preserve' },
  platform: { binding: 'PLATFORM_API_ORIGIN', prefix: 'preserve' },
  create: { binding: 'PLATFORM_API_ORIGIN', prefix: 'preserve' },
  billing: { binding: 'PLATFORM_API_ORIGIN', prefix: 'preserve' },
  compute: { binding: 'COMPUTE_API_ORIGIN', prefix: 'strip' },
  scena: { binding: 'SCENA_API_ORIGIN', prefix: 'strip' },
  lunchvoice: { binding: 'LUNCHVOICE_API_ORIGIN', prefix: 'strip' },
  tradora: { binding: 'TRADORA_API_ORIGIN', prefix: 'strip' },
  link: { binding: 'KPNLINK_API_ORIGIN', prefix: 'strip' },
  flow: { binding: 'KPNLINK_API_ORIGIN', prefix: 'strip' },
});

// These compatibility hosts are attached to the same production Worker today.
// Keep them explicit until Compute's authenticated cutover and rollback gates
// are complete; a unified API deployment must not break the product runtime.
const HOST_BINDING = Object.freeze({
  'compute.kpnsolute.com': {
    binding: 'COMPUTE_APP_ORIGIN',
    kind: 'product',
    service: 'compute',
  },
  'api.compute.kpnsolute.com': {
    binding: 'COMPUTE_COMPAT_API_ORIGIN',
    kind: 'api-compatibility',
    service: 'compute',
  },
});

const ROOT_DOMAIN = 'kpnsolute.com';

// Reserved first-level labels are platform or product hosts and can never be
// claimed by a corporate tenant. Kept in sync with
// packages/contracts/src/registry.ts RESERVED_SUBDOMAINS.
const RESERVED_SUBDOMAINS = Object.freeze([
  'accounts',
  'api',
  'auth',
  'billing',
  'compute',
  'create',
  'docs',
  'events',
  'flow',
  'link',
  'lunchvoice',
  'platform',
  'scena',
  'status',
  'support',
  'tradora',
  'workforce',
  'www',
]);

const TENANT_LABEL_PATTERN = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

/**
 * Corporation tenants are addressed by their own subdomain
 * ({corporation}.kpnsolute.com); organizations are addressed by a slug path on
 * the product host. See docs/ROUTE_REGISTRY.md section 3.0.
 *
 * Returns the tenant label for a corporate runtime host, or null. A reserved
 * label always returns null so a tenant can never shadow a platform host.
 */
export function corporateTenantLabel(hostname) {
  const host = hostname.toLowerCase().replace(/\.$/, '');
  const suffix = `.${ROOT_DOMAIN}`;
  if (!host.endsWith(suffix)) return null;
  const label = host.slice(0, -suffix.length);
  if (!label || label.includes('.')) return null;
  if (!TENANT_LABEL_PATTERN.test(label)) return null;
  if (RESERVED_SUBDOMAINS.includes(label)) return null;
  return label;
}

export function resolveRoute(requestUrl, env) {
  const url = new URL(requestUrl);
  const hostname = url.hostname.toLowerCase();
  const hostRoute = Object.hasOwn(HOST_BINDING, hostname) ? HOST_BINDING[hostname] : undefined;
  if (hostRoute) {
    const origin = env[hostRoute.binding];
    if (!origin) return { setupRequired: hostRoute.binding, service: hostRoute.service };
    const base = new URL(origin.endsWith('/') ? origin : `${origin}/`);
    if (base.protocol !== 'https:')
      return { setupRequired: `${hostRoute.binding}_HTTPS`, service: hostRoute.service };
    return {
      kind: hostRoute.kind,
      service: hostRoute.service,
      upstreamUrl: new URL(url.pathname.replace(/^\/+/, '') + url.search, base),
      upstreamBasePath: base.pathname.replace(/\/$/, ''),
      publicPathPrefix: '',
    };
  }
  // Corporate tenant runtime: {corporation}.kpnsolute.com serves the product
  // app. The tenant label travels as a header so the origin never has to infer
  // tenancy from a client-supplied value.
  const corporateLabel = corporateTenantLabel(hostname);
  if (corporateLabel) {
    const binding = 'COMPUTE_APP_ORIGIN';
    const origin = env[binding];
    if (!origin) return { setupRequired: binding, service: 'compute' };
    const base = new URL(origin.endsWith('/') ? origin : `${origin}/`);
    if (base.protocol !== 'https:')
      return { setupRequired: `${binding}_HTTPS`, service: 'compute' };
    return {
      kind: 'corporate-tenant',
      service: 'compute',
      tenant: corporateLabel,
      upstreamUrl: new URL(url.pathname.replace(/^\/+/, '') + url.search, base),
      upstreamBasePath: base.pathname.replace(/\/$/, ''),
      publicPathPrefix: '',
    };
  }

  if (hostname !== 'api.kpnsolute.com') return null;
  const [, service, ...segments] = url.pathname.split('/');
  // hasOwn, not a plain lookup: `/constructor/x` would otherwise resolve to an
  // inherited Object.prototype member and proxy nowhere.
  if (!Object.hasOwn(SERVICE_ROUTE, service)) return null;
  const { binding, prefix } = SERVICE_ROUTE[service];
  const origin = env[binding];
  if (!origin) return { setupRequired: binding, service };
  const base = new URL(origin.endsWith('/') ? origin : `${origin}/`);
  if (base.protocol !== 'https:') return { setupRequired: `${binding}_HTTPS`, service };
  const preserved = prefix === 'preserve';
  const upstreamPath = (preserved ? [service, ...segments] : segments).join('/');
  return {
    kind: 'api-gateway',
    service,
    upstreamUrl: new URL(upstreamPath + url.search, base),
    upstreamBasePath: base.pathname.replace(/\/$/, ''),
    // A preserved segment is already part of the upstream path, so putting it
    // back on a rewritten Location would double it.
    publicPathPrefix: preserved ? '' : `/${service}`,
  };
}

/**
 * Rewrite a same-origin upstream `Location` back into a public gateway URL.
 *
 * The upstream's own base path is removed and `prefix` is re-applied, which is
 * the exact inverse of how the request path was built: `/{service}` for a
 * stripped service, and the empty string for a preserved one, whose service
 * segment the origin already echoed back. A cross-origin Location is left
 * untouched — the gateway reports where the origin actually pointed rather than
 * laundering an off-platform redirect through the public hostname.
 */
function rewriteLocation(headers, upstreamUrl, upstreamBasePath, publicOrigin, prefix) {
  const location = headers.get('location');
  if (!location) return;
  try {
    const resolved = new URL(location, upstreamUrl);
    if (resolved.origin !== upstreamUrl.origin) return;
    const path =
      upstreamBasePath && resolved.pathname.startsWith(`${upstreamBasePath}/`)
        ? resolved.pathname.slice(upstreamBasePath.length)
        : resolved.pathname;
    headers.set(
      'location',
      new URL(prefix + path + resolved.search + resolved.hash, publicOrigin).toString(),
    );
  } catch {
    /* Preserve an invalid upstream value rather than inventing a destination. */
  }
}

export async function proxyRequest(request, env, fetchImpl = fetch) {
  const publicUrl = new URL(request.url);
  const route = resolveRoute(publicUrl, env);
  if (!route) return Response.json({ error: 'route_not_found' }, { status: 404 });
  if (route.setupRequired)
    return Response.json(
      { error: 'service_unavailable', service: route.service },
      { status: 503, headers: { 'cache-control': 'no-store' } },
    );
  const requestId = request.headers.get('cf-ray') ?? crypto.randomUUID();
  const upstreamRequest = new Request(route.upstreamUrl, request);
  upstreamRequest.headers.set('x-forwarded-host', publicUrl.host);
  upstreamRequest.headers.set('x-forwarded-proto', 'https');
  upstreamRequest.headers.set('x-kpn-request-id', requestId);
  // Strip any client-supplied tenant header, then set it only from what the
  // edge itself resolved. A caller must never be able to assert its own tenant.
  upstreamRequest.headers.delete('x-kpn-tenant');
  if (route.tenant) upstreamRequest.headers.set('x-kpn-tenant', route.tenant);
  const startedAt = Date.now();
  try {
    const upstream = await fetchImpl(upstreamRequest, { redirect: 'manual' });
    const headers = new Headers(upstream.headers);
    rewriteLocation(
      headers,
      route.upstreamUrl,
      route.upstreamBasePath,
      publicUrl.origin,
      route.publicPathPrefix,
    );
    headers.set('x-kpn-edge-route', 'kpnsolute-api-gateway');
    headers.set('x-kpn-request-id', requestId);
    console.log(
      JSON.stringify({
        event: 'proxy.complete',
        service: route.service,
        route_kind: route.kind,
        path: publicUrl.pathname,
        status: upstream.status,
        duration_ms: Date.now() - startedAt,
        request_id: requestId,
      }),
    );
    return new Response(upstream.body, {
      status: upstream.status,
      statusText: upstream.statusText,
      headers,
    });
  } catch (error) {
    console.error(
      JSON.stringify({
        event: 'proxy.error',
        service: route.service,
        route_kind: route.kind,
        path: publicUrl.pathname,
        duration_ms: Date.now() - startedAt,
        request_id: requestId,
        error: error instanceof Error ? error.message : 'unknown_error',
      }),
    );
    return Response.json(
      { error: 'origin_unavailable', request_id: requestId },
      {
        status: 502,
        headers: {
          'cache-control': 'no-store',
          'x-kpn-edge-route': 'kpnsolute-api-gateway',
          'x-kpn-request-id': requestId,
        },
      },
    );
  }
}

export default {
  fetch(request, env) {
    return proxyRequest(request, env);
  },
};
