import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { PRODUCTS } from '../content/site';
import { AboutPage } from './AboutPage';
import { PartnersPage } from './PartnersPage';
import { PrivacyPage, TermsPage } from './LegalPage';
import { ProductsPage } from './ProductsPage';

vi.mock('@kpn/app-runtime', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    useSession: () => ({ status: 'signed-out', user: null, signIn: vi.fn(), signOut: vi.fn() }),
    SessionProvider: ({ children }: { children: unknown }) => children,
  };
});

const at = (ui: React.ReactElement) => render(<MemoryRouter>{ui}</MemoryRouter>);

describe('legal pages', () => {
  it('Privacy Policy has a title, a contents list and every section reachable by anchor', () => {
    at(<PrivacyPage />);
    expect(screen.getByRole('heading', { level: 1, name: 'Privacy Policy' })).toBeTruthy();
    const toc = screen.getByRole('navigation', { name: 'On this page' });
    const anchors = within(toc)
      .getAllByRole('link')
      .map((l) => l.getAttribute('href')!.slice(1));
    expect(anchors.length).toBeGreaterThan(8);
    for (const id of anchors) expect(document.getElementById(id)).not.toBeNull();
    expect(screen.getByText(/Google API Services User Data Policy/)).toBeTruthy();
  });

  it('Terms of Service renders its sections and the footer links to both documents', () => {
    at(<TermsPage />);
    expect(screen.getByRole('heading', { level: 1, name: 'Terms of Service' })).toBeTruthy();
    expect(screen.getByRole('heading', { level: 2, name: 'Your account' })).toBeTruthy();
    const footer = within(screen.getByRole('navigation', { name: 'Footer' }));
    expect(footer.getByRole('link', { name: 'Privacy' }).getAttribute('href')).toBe('/privacy');
    expect(footer.getByRole('link', { name: 'Terms' }).getAttribute('href')).toBe('/terms');
  });
});

describe('public pages', () => {
  it('About covers what it is, goals, vision and how we work', () => {
    at(<AboutPage />);
    expect(screen.getByRole('heading', { level: 1, name: 'About KpnSolute' })).toBeTruthy();
    for (const name of ['What KpnSolute is', 'Our goals', 'Our vision', 'How we work']) {
      expect(screen.getByRole('heading', { level: 2, name })).toBeTruthy();
    }
    expect(screen.getAllByText('Keeping People Navigated.').length).toBeGreaterThan(0);
  });

  it('Products lists all four products and the honest stage note', () => {
    at(<ProductsPage />);
    for (const product of PRODUCTS) {
      expect(screen.getByRole('heading', { level: 2, name: product.name })).toBeTruthy();
    }
    expect(screen.getByText(/different stages/i)).toBeTruthy();
    expect(screen.getByText(/not financial advice/i)).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Visit LunchVoice' }).getAttribute('href')).toBe(
      'https://lunchvoice.com',
    );
  });

  it('Partners shows ways to work together, no invented partner, and no made-up address', () => {
    at(<PartnersPage />);
    expect(screen.getByRole('heading', { level: 2, name: 'Ways to work together' })).toBeTruthy();
    expect(screen.getByText(/once each relationship is in place/i)).toBeTruthy();
    expect(screen.queryByRole('link', { name: /@/ })).toBeNull();
  });

  it('has one main landmark, a skip link and a labelled main navigation on every page', () => {
    for (const page of [
      <AboutPage key="a" />,
      <ProductsPage key="p" />,
      <PartnersPage key="r" />,
    ]) {
      const { unmount } = at(page);
      expect(screen.getAllByRole('main')).toHaveLength(1);
      expect(screen.getByRole('link', { name: 'Skip to content' }).getAttribute('href')).toBe(
        '#main',
      );
      const nav = screen.getByRole('navigation', { name: 'Main' });
      expect(
        within(nav)
          .getAllByRole('link')
          .map((l) => l.textContent),
      ).toEqual(['About', 'Products', 'Partners']);
      unmount();
    }
  });
});

describe('logo', () => {
  it('shows the icon and wordmark as one decorative graphic, with a spin layer for hover', () => {
    const { container } = render(
      <MemoryRouter>
        <ProductsPage />
      </MemoryRouter>,
    );
    const logos = container.querySelectorAll('svg.kpn-logo');
    expect(logos.length).toBe(2); // header and footer
    for (const logo of logos) {
      expect(logo.getAttribute('aria-hidden')).toBe('true');
      expect(logo.querySelector('.kpn-logo-spin')).not.toBeNull();
      expect(logo.querySelectorAll('path').length).toBe(3); // ink, star, wordmark
      // The star is the design system's accent (brand blue), never a hard-coded or retired color.
      const fills = Array.from(logo.querySelectorAll('path')).map((path) =>
        path.getAttribute('fill'),
      );
      expect(fills[1]).toBe('var(--kpn-color-accent, #2f5fe0)');
      expect(fills.join(' ')).not.toMatch(/01848e|teal/i);
    }
    // The home link still has an accessible name.
    expect(screen.getAllByRole('link', { name: 'KpnSolute home' }).length).toBeGreaterThan(0);
  });
});
