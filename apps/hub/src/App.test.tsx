import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { App } from './App';

describe('App', () => {
  it('renders the hub landing page with a Platform call to action', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({ error: { code: 'unauthenticated', message: 'No session.' } }),
          {
            status: 401,
            headers: { 'content-type': 'application/json' },
          },
        ),
      ),
    );

    render(<App />);

    expect(screen.getByText(/one account for every kpnsolute product/i)).toBeInTheDocument();
    // Organization owners are sent to Platform, not to a generic sign-in.
    await waitFor(() =>
      expect(screen.getAllByRole('button', { name: /log into platform/i }).length).toBeGreaterThan(
        0,
      ),
    );
    vi.unstubAllGlobals();
  });
});
