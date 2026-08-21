import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { SessionProvider, useSession } from './SessionProvider';

const CONFIG = {
  apiBaseUrl: 'http://localhost:4000',
  authAppOrigin: 'http://localhost:5180',
  clientId: 'kpnsolute-accounts',
  redirectUri: 'http://localhost:5174/auth/callback',
};

function StatusProbe() {
  const { status } = useSession();
  return <span data-testid="status">{status}</span>;
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function seedOAuthSession() {
  window.localStorage.setItem(
    'kpnsolute.oauth.session',
    JSON.stringify({
      accessToken: 'token',
      refreshToken: 'refresh',
      expiresAt: Date.now() + 60_000,
      tokenType: 'Bearer',
    }),
  );
}

describe('SessionProvider', () => {
  beforeEach(() => window.localStorage.clear());

  it('resolves to setup-required when the API reports missing configuration', async () => {
    seedOAuthSession();
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse(503, {
          error: { code: 'setup_required', message: 'DB missing', setupState: 'missing' },
        }),
      ),
    );

    render(
      <SessionProvider config={CONFIG}>
        <StatusProbe />
      </SessionProvider>,
    );

    await waitFor(() => expect(screen.getByTestId('status').textContent).toBe('setup-required'));
    vi.unstubAllGlobals();
  });

  it('resolves to signed-out on a 401 from /auth/session', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          jsonResponse(401, { error: { code: 'unauthenticated', message: 'No session.' } }),
        ),
    );

    render(
      <SessionProvider config={CONFIG}>
        <StatusProbe />
      </SessionProvider>,
    );

    await waitFor(() => expect(screen.getByTestId('status').textContent).toBe('signed-out'));
    vi.unstubAllGlobals();
  });

  it('resolves to signed-in with the returned user on success', async () => {
    seedOAuthSession();
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse(200, {
          data: { user: { id: '1', primaryEmail: 'a@example.com', displayName: 'Ada' } },
        }),
      ),
    );

    render(
      <SessionProvider config={CONFIG}>
        <StatusProbe />
      </SessionProvider>,
    );

    await waitFor(() => expect(screen.getByTestId('status').textContent).toBe('signed-in'));
    vi.unstubAllGlobals();
  });
});
