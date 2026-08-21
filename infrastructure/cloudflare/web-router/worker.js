const ORIGINS = {
  'kpnsolute.com': 'kpnsolute-hub.onrender.com',
  'www.kpnsolute.com': 'kpnsolute-hub.onrender.com',
  'accounts.kpnsolute.com': 'kpnsolute-accounts.onrender.com',
  'auth.kpnsolute.com': 'kpnsolute-auth.onrender.com',
  'platform.kpnsolute.com': 'kpnsolute-platform.onrender.com',
  'create.kpnsolute.com': 'kpnsolute-create.onrender.com',
  'billing.kpnsolute.com': 'kpnsolute-billing.onrender.com',
  'link.kpnsolute.com': 'kpnsolute-link.onrender.com',
  'flow.kpnsolute.com': 'kpnsolute-flow.onrender.com',
};

export default {
  async fetch(request) {
    const incoming = new URL(request.url);
    const originHost = ORIGINS[incoming.hostname.toLowerCase()];
    if (!originHost) return new Response('Unknown KpnSolute host', { status: 404 });

    const upstream = new URL(request.url);
    upstream.protocol = 'https:';
    upstream.hostname = originHost;
    upstream.port = '';
    const headers = new Headers(request.headers);
    headers.delete('host');
    const upstreamRequest = new Request(upstream.toString(), {
      method: request.method,
      headers,
      body: ['GET', 'HEAD'].includes(request.method) ? undefined : request.body,
      redirect: 'manual',
    });
    const response = await fetch(upstreamRequest);
    const outputHeaders = new Headers(response.headers);
    const location = outputHeaders.get('location');
    if (location) {
      try {
        const target = new URL(location, upstream);
        if (target.hostname === originHost) {
          target.protocol = incoming.protocol;
          target.hostname = incoming.hostname;
          outputHeaders.set('location', target.toString());
        }
      } catch {
        // Preserve malformed upstream Location values unchanged.
      }
    }
    outputHeaders.set('x-kpn-route', 'web-router-v1');
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: outputHeaders,
    });
  },
};
