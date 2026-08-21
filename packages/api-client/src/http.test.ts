import { describe, expect, it, vi } from 'vitest';
import { ApiRequestError, createApiClient } from './http';

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('createApiClient', () => {
  it('builds URLs using the fixed service registry contract', () => {
    const client = createApiClient({ baseUrl: 'http://localhost:4000' });
    expect(client.buildUrl('accounts', 'me')).toBe('http://localhost:4000/accounts/me');
    expect(client.buildUrl('platform', 'tenants/mjcc')).toBe(
      'http://localhost:4000/platform/tenants/mjcc',
    );
  });

  it('unwraps the { data } envelope on success', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse(200, { data: { id: '1' } }));
    const client = createApiClient({ baseUrl: 'http://localhost:4000', fetchImpl });
    const result = await client.get('accounts', 'me');
    expect(result).toEqual({ id: '1' });
  });

  it('attaches the current KpnAuth bearer token', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse(200, { data: true }));
    const client = createApiClient({
      baseUrl: 'https://api.kpnsolute.com',
      fetchImpl,
      accessToken: () => 'access-token',
    });
    await client.get('platform', 'tenants');
    expect(fetchImpl).toHaveBeenCalledWith(
      'https://api.kpnsolute.com/platform/tenants',
      expect.objectContaining({
        headers: expect.objectContaining({ authorization: 'Bearer access-token' }),
      }),
    );
  });

  it('throws ApiRequestError with the setup_required code on a 503', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      jsonResponse(503, {
        error: { code: 'setup_required', message: 'DB missing', setupState: 'missing' },
      }),
    );
    const client = createApiClient({ baseUrl: 'http://localhost:4000', fetchImpl });
    await expect(client.get('auth', 'session')).rejects.toMatchObject({
      status: 503,
      code: 'setup_required',
    });
  });

  it('exposes isSetupRequired for setup-state errors', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      jsonResponse(503, {
        error: { code: 'setup_required', message: 'DB missing', setupState: 'missing' },
      }),
    );
    const client = createApiClient({ baseUrl: 'http://localhost:4000', fetchImpl });
    try {
      await client.get('auth', 'session');
      throw new Error('expected request to throw');
    } catch (error) {
      expect(error).toBeInstanceOf(ApiRequestError);
      expect((error as ApiRequestError).isSetupRequired).toBe(true);
    }
  });
});
