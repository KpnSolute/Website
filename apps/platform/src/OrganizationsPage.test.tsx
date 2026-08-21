import { render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { TenantOverview } from '@kpn/contracts';
import { OrganizationsPage, UnauthorizedError } from './OrganizationsPage';

/**
 * Platform is the organization resource manager. These cover the states the
 * page must handle, the two tenant classes it addresses differently, and the
 * installed products and service-resource references it surfaces.
 * See docs/ROUTE_REGISTRY.md.
 */

const AT = '2026-08-01T00:00:00.000Z';
const CREATE_HREF = 'https://create.kpnsolute.com/';

function overview(partial: {
  id: string;
  name: string;
  slug: string;
  tenantClass: 'organization' | 'corporation';
  subdomain?: string | null;
  status?: 'active' | 'suspended' | 'deleted';
  installed?: TenantOverview['installedProducts'];
}): TenantOverview {
  return {
    tenant: {
      id: partial.id,
      type: partial.tenantClass === 'corporation' ? 'corporation' : 'organization',
      name: partial.name,
      slug: partial.slug,
      status: partial.status ?? 'active',
      tenantClass: partial.tenantClass,
      subdomain: partial.subdomain ?? null,
      customDomain: null,
      createdByUserId: 'account-1',
      createdAt: AT,
      updatedAt: AT,
    },
    installedProducts: partial.installed ?? [computeInstallation(partial.id)],
  };
}

function computeInstallation(
  tenantId: string,
  resources: TenantOverview['installedProducts'][number]['resources'] = [],
): TenantOverview['installedProducts'][number] {
  return {
    installation: {
      id: `inst-${tenantId}`,
      tenantId,
      productId: 'product-compute',
      planId: 'plan-business',
      status: 'active',
      settings: {},
      createdAt: AT,
      updatedAt: AT,
    },
    productKey: 'compute',
    productName: 'KpnCompute',
    planKey: 'business',
    planName: 'Business',
    resources,
  };
}

const organization = overview({
  id: 't1',
  name: 'Acme Co',
  slug: 'acme',
  tenantClass: 'organization',
});

const corporation = overview({
  id: 't2',
  name: 'MJCC',
  slug: 'mjcc',
  tenantClass: 'corporation',
  subdomain: 'mjcc',
});

describe('OrganizationsPage states', () => {
  it('shows a loading state before data arrives', () => {
    render(
      <OrganizationsPage loadOverview={() => new Promise(() => {})} createHref={CREATE_HREF} />,
    );
    expect(document.querySelector('svg, [role="status"]')).toBeTruthy();
  });

  it('shows an empty state when the account has no organizations', async () => {
    render(<OrganizationsPage loadOverview={async () => []} createHref={CREATE_HREF} />);
    expect(await screen.findByText(/no organizations yet/i)).toBeTruthy();
  });

  it('shows an unauthorized state distinctly from an error', async () => {
    render(
      <OrganizationsPage
        loadOverview={async () => {
          throw new UnauthorizedError();
        }}
        createHref={CREATE_HREF}
      />,
    );
    expect(await screen.findByText(/do not have access to any organization/i)).toBeTruthy();
  });

  it('treats an API 403 as no access rather than an unexplained error', async () => {
    render(
      <OrganizationsPage
        loadOverview={async () => {
          throw Object.assign(new Error('Forbidden'), { status: 403 });
        }}
        createHref={CREATE_HREF}
      />,
    );
    expect(await screen.findByText(/do not have access to any organization/i)).toBeTruthy();
  });

  it('shows an error state with a retry affordance', async () => {
    render(
      <OrganizationsPage
        loadOverview={async () => {
          throw new Error('Backend unavailable');
        }}
        createHref={CREATE_HREF}
      />,
    );
    expect(await screen.findByText(/backend unavailable/i)).toBeTruthy();
    expect(screen.getByRole('button', { name: /try again/i })).toBeTruthy();
  });
});

describe('tenant class addressing', () => {
  it('launches an organization at its slug path', async () => {
    render(
      <OrganizationsPage loadOverview={async () => [organization]} createHref={CREATE_HREF} />,
    );
    const launch = await screen.findByText(/launch/i);
    expect(launch.closest('a')?.getAttribute('href')).toBe(
      'https://compute.kpnsolute.com/workspaces/acme',
    );
  });

  it('launches a corporation at its own subdomain', async () => {
    render(<OrganizationsPage loadOverview={async () => [corporation]} createHref={CREATE_HREF} />);
    const launch = await screen.findByText(/launch/i);
    expect(launch.closest('a')?.getAttribute('href')).toBe('https://mjcc.kpnsolute.com');
  });

  it('always manages through Platform regardless of class', async () => {
    render(
      <OrganizationsPage
        loadOverview={async () => [organization, corporation]}
        createHref={CREATE_HREF}
      />,
    );
    const manageLinks = (await screen.findAllByText(/manage/i)).map((node) =>
      node.closest('a')?.getAttribute('href'),
    );
    expect(manageLinks).toContain('https://platform.kpnsolute.com/compute/acme');
    expect(manageLinks).toContain('https://platform.kpnsolute.com/compute/mjcc');
  });

  it('flags a corporation that has no subdomain instead of rendering a broken link', async () => {
    render(
      <OrganizationsPage
        loadOverview={async () => [
          overview({ id: 't3', name: 'MJCC', slug: 'mjcc', tenantClass: 'corporation' }),
        ]}
        createHref={CREATE_HREF}
      />,
    );
    expect(await screen.findByText(/not addressable/i)).toBeTruthy();
    expect(screen.queryByText(/launch/i)).toBeNull();
  });

  it('offers no launch link for a tenant with no installed product', async () => {
    render(
      <OrganizationsPage
        loadOverview={async () => [
          overview({
            id: 't4',
            name: 'Empty Co',
            slug: 'empty',
            tenantClass: 'organization',
            installed: [],
          }),
        ]}
        createHref={CREATE_HREF}
      />,
    );
    expect(await screen.findByText(/no kpnsolute service is installed/i)).toBeTruthy();
    expect(screen.queryByText(/launch/i)).toBeNull();
  });

  it('labels each tenant with its class', async () => {
    render(
      <OrganizationsPage
        loadOverview={async () => [organization, corporation]}
        createHref={CREATE_HREF}
      />,
    );
    await waitFor(() => expect(screen.getByText('organization')).toBeTruthy());
    expect(screen.getByText('corporation')).toBeTruthy();
  });
});

describe('installed products and resources', () => {
  it('lists the installed product with its plan and status', async () => {
    render(<OrganizationsPage loadOverview={async () => [corporation]} createHref={CREATE_HREF} />);
    expect(await screen.findByText('KpnCompute')).toBeTruthy();
    expect(screen.getByText('Business')).toBeTruthy();
    expect(screen.getByText('active')).toBeTruthy();
  });

  it('shows existing service-resource references for an installation', async () => {
    const withResource = overview({
      id: 't2',
      name: 'MJCC',
      slug: 'mjcc',
      tenantClass: 'corporation',
      subdomain: 'mjcc',
      installed: [
        computeInstallation('t2', [
          {
            id: 'res-1',
            installationId: 'inst-t2',
            resourceType: 'compute_tenant',
            serviceResourceId: 'compute-side-8f21',
            displayName: 'MJCC Compute workspace',
            status: 'active',
            metadata: {},
            createdAt: AT,
            updatedAt: AT,
          },
        ]),
      ],
    });
    render(
      <OrganizationsPage loadOverview={async () => [withResource]} createHref={CREATE_HREF} />,
    );
    expect(await screen.findByText(/MJCC Compute workspace/)).toBeTruthy();
    expect(screen.getByText(/compute_tenant/)).toBeTruthy();
  });

  it('says so plainly when an installation has no registered resources', async () => {
    render(<OrganizationsPage loadOverview={async () => [corporation]} createHref={CREATE_HREF} />);
    expect(await screen.findByText(/no resources are registered/i)).toBeTruthy();
  });
});

describe('creation', () => {
  it('links creation to the real Create flow instead of a local form', async () => {
    const assign = vi.fn();
    Object.defineProperty(window, 'location', {
      value: { ...window.location, assign },
      writable: true,
    });

    render(<OrganizationsPage loadOverview={async () => []} createHref={CREATE_HREF} />);
    const buttons = await screen.findAllByRole('button', { name: /create|start the create flow/i });
    buttons[0]?.click();
    expect(assign).toHaveBeenCalledWith(CREATE_HREF);
    // No provisioning form is rendered here; Create owns that journey.
    expect(screen.queryByLabelText(/subdomain/i)).toBeNull();
  });
});
