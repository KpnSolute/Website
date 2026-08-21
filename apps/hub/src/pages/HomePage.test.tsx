import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { HomePage } from './HomePage';

// The landing page's authenticated call to action must send organization
// owners to Platform, the organization resource manager — not to a generic
// "Sign in", and never to a tenant workforce login.
// See docs/ROUTE_REGISTRY.md sections 1 and 2.

vi.mock('@kpn/app-runtime', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    useSession: () => ({ status: 'signed-out', user: null, signIn: vi.fn(), signOut: vi.fn() }),
  };
});

function renderHome() {
  return render(
    <MemoryRouter>
      <HomePage />
    </MemoryRouter>,
  );
}

describe('kpnsolute.com landing', () => {
  it('offers "Log into Platform" as the authenticated call to action', () => {
    renderHome();
    expect(screen.getAllByText('Log into Platform').length).toBeGreaterThan(0);
  });

  it('does not present a bare "Sign in" call to action', () => {
    renderHome();
    expect(screen.queryByText('Sign in')).toBeNull();
  });

  it('routes the primary call to action to a distinct Platform destination', () => {
    renderHome();
    // crossAppUrl resolves to a localhost port in dev and the platform host in
    // production, so assert the wiring rather than a literal hostname: the
    // Platform CTA is a real link, and it does not point at Accounts.
    // The header and the hero both carry the CTA; both must be real links.
    const platformLinks = screen.getAllByText('Log into Platform').map((node) => node.closest('a'));
    expect(platformLinks.length).toBeGreaterThan(0);
    expect(platformLinks.every((link) => link !== null)).toBe(true);
    const platformLink = platformLinks[0];
    const accountsLink = screen.getByText('Manage your account').closest('a');
    expect(platformLink).not.toBeNull();
    expect(platformLink?.getAttribute('href')).toBeTruthy();
    expect(platformLink?.getAttribute('href')).not.toBe(accountsLink?.getAttribute('href'));
  });

  it('keeps personal account management distinct from organization management', () => {
    renderHome();
    expect(screen.getByText('Manage your account')).toBeTruthy();
  });

  it('never exposes a tenant staff credential prompt', () => {
    renderHome();
    expect(screen.queryByLabelText(/PIN/i)).toBeNull();
    expect(screen.queryByText(/Staff sign-in/i)).toBeNull();
  });
});
