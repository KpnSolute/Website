import { apiServicePath, type ServiceKey } from '@kpn/contracts';

export interface ApiErrorPayload {
  code: string;
  message: string;
  setupState?: 'missing';
}

export class ApiRequestError extends Error {
  readonly status: number;
  readonly code: string;
  readonly setupState?: 'missing';

  constructor(status: number, payload: ApiErrorPayload) {
    super(payload.message);
    this.name = 'ApiRequestError';
    this.status = status;
    this.code = payload.code;
    this.setupState = payload.setupState;
  }

  get isSetupRequired(): boolean {
    return this.setupState === 'missing' || this.status === 503;
  }
}

export interface ApiClientConfig {
  /** e.g. "https://api.kpnsolute.com" in production or "http://localhost:4000" in local dev. */
  baseUrl: string;
  fetchImpl?: typeof fetch;
  credentials?: RequestCredentials;
  /** Supplies the current KpnAuth access token without coupling this package to storage. */
  accessToken?: () => string | null | Promise<string | null>;
}

export interface ApiClient {
  get<T>(service: ServiceKey, path: string): Promise<T>;
  post<T>(service: ServiceKey, path: string, body?: unknown): Promise<T>;
  patch<T>(service: ServiceKey, path: string, body?: unknown): Promise<T>;
  delete<T>(service: ServiceKey, path: string): Promise<T>;
  buildUrl(service: ServiceKey, path: string): string;
}

export function createApiClient(config: ApiClientConfig): ApiClient {
  const fetchImpl = config.fetchImpl ?? fetch;
  const baseUrl = config.baseUrl.replace(/\/+$/, '');

  function buildUrl(service: ServiceKey, path: string): string {
    return `${baseUrl}${apiServicePath(service, path)}`;
  }

  async function request<T>(service: ServiceKey, path: string, init?: RequestInit): Promise<T> {
    const url = buildUrl(service, path);
    const accessToken = await config.accessToken?.();
    const response = await fetchImpl(url, {
      credentials: config.credentials ?? 'include',
      ...init,
      headers: {
        'content-type': 'application/json',
        ...(accessToken ? { authorization: `Bearer ${accessToken}` } : {}),
        ...(init?.headers ?? {}),
      },
    });

    const contentType = response.headers.get('content-type') ?? '';
    const body = contentType.includes('application/json') ? await response.json() : undefined;

    if (!response.ok) {
      const payload: ApiErrorPayload = body?.error ?? {
        code: 'unknown_error',
        message: `Request to ${url} failed with status ${response.status}.`,
      };
      throw new ApiRequestError(response.status, payload);
    }

    return (body?.data ?? body) as T;
  }

  return {
    get: (service, path) => request(service, path, { method: 'GET' }),
    post: (service, path, body) =>
      request(service, path, {
        method: 'POST',
        body: body !== undefined ? JSON.stringify(body) : undefined,
      }),
    patch: (service, path, body) =>
      request(service, path, {
        method: 'PATCH',
        body: body !== undefined ? JSON.stringify(body) : undefined,
      }),
    delete: (service, path) => request(service, path, { method: 'DELETE' }),
    buildUrl,
  };
}
