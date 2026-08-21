import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { Tenant } from '@kpn/contracts';
import {
  ProvisionOrganizationPage,
  suggestSlug,
  type ServiceCatalogEntry,
} from './ProvisionOrganizationPage';

const AT = '2026-08-01T00:00:00.000Z';

const CATALOG: ServiceCatalogEntry[] = [
  {
    product: { id: 'product-compute', key: 'compute', name: 'KpnCompute' },
    plans: [
      { id: 'plan-starter', productId: 'product-compute', key: 'starter', name: 'Starter' },
      { id: 'plan-business', productId: 'product-compute', key: 'business', name: 'Business' },
    ],
  },
];

function tenant(overrides: Partial<Tenant> = {}): Tenant {
  return {
    id: 't1',
    type: 'organization',
    name: 'Acme Co',
    slug: 'acme',
    status: 'active',
    tenantClass: 'organization',
    subdomain: null,
    customDomain: null,
    createdByUserId: 'account-1',
    createdAt: AT,
    updatedAt: AT,
    ...overrides,
  };
}

function renderPage(provision = vi.fn()) {
  const result = render(
    <ProvisionOrganizationPage
      loadServices={async () => CATALOG}
      provision={provision}
      presetServiceKey="compute"
    />,
  );
  return { ...result, provision };
}

async function fillName(value: string) {
  fireEvent.change(await screen.findByLabelText(/^name$/i), { target: { value } });
}

describe('suggestSlug', () => {
  it('derives a hostname-safe slug from a display name', () => {
    expect(suggestSlug('MJCC Managements')).toBe('mjcc-managements');
    expect(suggestSlug('  Acme & Co.  ')).toBe('acme-co');
    expect(suggestSlug('---')).toBe('');
  });
});

describe('ProvisionOrganizationPage', () => {
  it('surfaces a catalog failure with a retry rather than an empty form', async () => {
    render(
      <ProvisionOrganizationPage
        loadServices={async () => {
          throw new Error('Backend unavailable');
        }}
        provision={vi.fn()}
      />,
    );
    expect(await screen.findByText(/backend unavailable/i)).toBeTruthy();
    expect(screen.getByRole('button', { name: /try again/i })).toBeTruthy();
  });

  it('preselects the service the flow was entered for', async () => {
    renderPage();
    await waitFor(() =>
      expect((screen.getByLabelText(/^service$/i) as HTMLSelectElement).value).toBe('compute'),
    );
    expect((screen.getByLabelText(/^plan$/i) as HTMLSelectElement).value).toBe('starter');
  });

  it('provisions a slug-addressed organization without a subdomain', async () => {
    const provision = vi.fn().mockResolvedValue({ tenant: tenant(), installation: {} });
    renderPage(provision);
    await fillName('Acme Co');
    fireEvent.click(await screen.findByRole('button', { name: /create organization/i }));

    await waitFor(() => expect(provision).toHaveBeenCalledTimes(1));
    expect(provision).toHaveBeenCalledWith({
      name: 'Acme Co',
      slug: 'acme-co',
      tenantClass: 'organization',
      subdomain: undefined,
      serviceKey: 'compute',
      planKey: 'starter',
    });
  });

  it('asks for a subdomain only once a corporation is chosen', async () => {
    renderPage();
    await fillName('MJCC');
    expect(screen.queryByLabelText(/^subdomain$/i)).toBeNull();
    fireEvent.click(screen.getByRole('radio', { name: /corporation/i }));
    expect(await screen.findByLabelText(/^subdomain$/i)).toBeTruthy();
  });

  it('provisions a corporation with its dedicated subdomain', async () => {
    const provision = vi.fn().mockResolvedValue({
      tenant: tenant({
        id: 't2',
        type: 'corporation',
        tenantClass: 'corporation',
        name: 'MJCC',
        slug: 'mjcc',
        subdomain: 'mjcc',
      }),
      installation: {},
    });
    renderPage(provision);
    await fillName('MJCC');
    fireEvent.click(screen.getByRole('radio', { name: /corporation/i }));
    fireEvent.change(await screen.findByLabelText(/^subdomain$/i), { target: { value: 'MJCC' } });
    fireEvent.click(screen.getByRole('button', { name: /create organization/i }));

    await waitFor(() => expect(provision).toHaveBeenCalledTimes(1));
    expect(provision).toHaveBeenCalledWith(
      expect.objectContaining({ tenantClass: 'corporation', subdomain: 'mjcc', slug: 'mjcc' }),
    );
    expect(await screen.findByText(/MJCC is provisioned/i)).toBeTruthy();
    expect(screen.getByText('https://mjcc.kpnsolute.com')).toBeTruthy();
  });

  it('blocks submission for a reserved corporate subdomain', async () => {
    const provision = vi.fn();
    renderPage(provision);
    await fillName('Acme');
    fireEvent.click(screen.getByRole('radio', { name: /corporation/i }));
    fireEvent.change(await screen.findByLabelText(/^subdomain$/i), {
      target: { value: 'platform' },
    });

    expect(await screen.findByText(/reserved by kpnsolute/i)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /create organization/i }));
    expect(provision).not.toHaveBeenCalled();
  });

  it('blocks submission for a reserved workspace slug', async () => {
    const provision = vi.fn();
    renderPage(provision);
    await fillName('Admin');
    expect(await screen.findByText(/reserved route/i)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /create organization/i }));
    expect(provision).not.toHaveBeenCalled();
  });

  it('reports a server refusal without losing what was entered', async () => {
    const provision = vi
      .fn()
      .mockRejectedValue(new Error('The subdomain "mjcc" is already assigned to another tenant.'));
    renderPage(provision);
    await fillName('MJCC');
    fireEvent.click(screen.getByRole('radio', { name: /corporation/i }));
    fireEvent.change(await screen.findByLabelText(/^subdomain$/i), { target: { value: 'mjcc' } });
    fireEvent.click(screen.getByRole('button', { name: /create organization/i }));

    expect(await screen.findByText(/already assigned to another tenant/i)).toBeTruthy();
    expect((screen.getByLabelText(/^name$/i) as HTMLInputElement).value).toBe('MJCC');
  });
});
