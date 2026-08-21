/**
 * Browser client for the workforce authorization-code flow.
 *
 * This module deliberately holds no client secret and never receives a token.
 * It creates an authorization request, submits credentials, and receives a
 * redirect URL carrying a single-use code. The token exchange happens on the
 * product's own server. See docs/AUTH_FINAL_GUIDE.md section 2.
 *
 * `VITE_KPN_API_URL` is the gateway origin (`https://api.kpnsolute.com`), not a
 * service base. Every path below therefore names the `/auth` service segment
 * itself, which is also the API's upstream path — the gateway preserves that
 * segment for services sharing the platform origin.
 */

const API_BASE = (
  (import.meta.env.VITE_KPN_API_URL as string | undefined) ??
  (import.meta.env.VITE_API_BASE_URL as string | undefined)
)?.replace(/\/+$/, '');

export interface AuthorizeParams {
  clientId: string;
  redirectUri: string;
  codeChallenge: string;
  codeChallengeMethod: string;
  state: string;
  nonce: string;
  service: string;
  scope: string;
  tenantHint: string | null;
}

export interface AuthorizeResult {
  requestId: string;
  clientName: string;
  serviceKey: string;
  tenantHint: string | null;
  expiresAt: string;
}

export interface MethodDiscovery {
  tenantSlug: string;
  serviceKey: string;
  methods: string[];
}

export interface PinResult {
  redirectTo: string;
  mustRotateCredential: boolean;
}

/** Thrown for any non-2xx response so callers can show the server's message. */
export class WorkforceApiError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'WorkforceApiError';
  }
}

function requireBase(): string {
  if (!API_BASE) {
    throw new WorkforceApiError(
      'Sign-in is not configured in this environment.',
      'setup_required',
      0,
    );
  }
  return API_BASE;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${requireBase()}${path}`, {
      ...init,
      headers: { 'content-type': 'application/json', ...(init?.headers ?? {}) },
    });
  } catch {
    throw new WorkforceApiError('Could not reach the sign-in service.', 'network_error', 0);
  }

  const payload = (await response.json().catch(() => ({}))) as {
    data?: T;
    error?: { code?: string; message?: string };
  };

  if (!response.ok) {
    throw new WorkforceApiError(
      payload.error?.message ?? 'Sign-in could not be completed.',
      payload.error?.code ?? 'unknown_error',
      response.status,
    );
  }
  return payload.data as T;
}

export function createAuthorizationRequest(params: AuthorizeParams): Promise<AuthorizeResult> {
  return request<AuthorizeResult>('/auth/oauth/authorize', {
    method: 'POST',
    body: JSON.stringify({
      clientId: params.clientId,
      redirectUri: params.redirectUri,
      codeChallenge: params.codeChallenge,
      codeChallengeMethod: params.codeChallengeMethod,
      state: params.state,
      nonce: params.nonce,
      scope: params.scope,
      service: params.service,
      tenantHint: params.tenantHint ?? undefined,
    }),
  });
}

export function discoverMethods(tenantSlug: string, serviceKey: string): Promise<MethodDiscovery> {
  return request<MethodDiscovery>(
    `/auth/workforce/${encodeURIComponent(tenantSlug)}/${encodeURIComponent(serviceKey)}/methods`,
  );
}

export function submitPin(
  requestId: string,
  input: { tenantSlug: string; username: string; pin: string },
): Promise<PinResult> {
  return request<PinResult>(
    `/auth/oauth/authorize/${encodeURIComponent(requestId)}/workforce-pin`,
    {
      method: 'POST',
      body: JSON.stringify(input),
    },
  );
}
