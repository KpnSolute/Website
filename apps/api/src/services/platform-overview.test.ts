import { describe, expect, it } from 'vitest';
import type { Product, ProductPlan } from '@kpn/contracts';
import {
  createInMemoryPlatform,
  makeTenant,
  makeUser,
  type InMemoryStore,
} from '../testing/in-memory-platform.js';
import { platformOverviewForUser } from './platform-overview.js';

const COMPUTE: Product = { id: 'product-compute', key: 'compute', name: 'KpnCompute' };
const PLAN: ProductPlan = {
  id: 'plan-business',
  productId: COMPUTE.id,
  key: 'business',
  name: 'Business',
};

const AT = '2026-08-01T00:00:00.000Z';

function buildRepos(store: Partial<InMemoryStore>) {
  const platform = createInMemoryPlatform(store);
  return { repos: platform.repositories(platform.db), store: platform.store };
}

const baseStore: Partial<InMemoryStore> = {
  users: [makeUser({ id: 'account-1' }), makeUser({ id: 'account-2' })],
  products: [COMPUTE],
  plans: [PLAN],
  tenants: [
    makeTenant({ id: 't-mjcc', slug: 'mjcc', type: 'corporation', subdomain: 'mjcc' }),
    makeTenant({ id: 't-other', slug: 'other' }),
  ],
  roles: [{ id: 'role-owner', tenantId: 't-mjcc', key: 'owner', name: 'Owner', isBuiltIn: true }],
  memberships: [
    {
      id: 'm-1',
      tenantId: 't-mjcc',
      userId: 'account-1',
      roleId: 'role-owner',
      status: 'active',
      joinedAt: AT,
    },
    {
      id: 'm-2',
      tenantId: 't-other',
      userId: 'account-2',
      roleId: 'role-owner',
      status: 'active',
      joinedAt: AT,
    },
  ],
  installations: [
    {
      id: 'inst-mjcc',
      tenantId: 't-mjcc',
      productId: COMPUTE.id,
      planId: PLAN.id,
      status: 'active',
      settings: {},
      createdAt: AT,
      updatedAt: AT,
    },
    {
      id: 'inst-other',
      tenantId: 't-other',
      productId: COMPUTE.id,
      planId: PLAN.id,
      status: 'active',
      settings: {},
      createdAt: AT,
      updatedAt: AT,
    },
  ],
  resources: [
    {
      id: 'res-mjcc',
      installationId: 'inst-mjcc',
      resourceType: 'compute_tenant',
      serviceResourceId: 'compute-side-8f21',
      displayName: 'MJCC Compute workspace',
      status: 'active',
      metadata: {},
      createdAt: AT,
      updatedAt: AT,
    },
    {
      id: 'res-other',
      installationId: 'inst-other',
      resourceType: 'compute_tenant',
      serviceResourceId: 'compute-side-other',
      displayName: 'Another workspace',
      status: 'active',
      metadata: {},
      createdAt: AT,
      updatedAt: AT,
    },
  ],
};

describe('platformOverviewForUser', () => {
  it('returns the account tenants with installed products and resource references', async () => {
    const { repos } = buildRepos(baseStore);
    const overview = await platformOverviewForUser(repos, 'account-1');

    expect(overview).toHaveLength(1);
    expect(overview[0]?.tenant).toMatchObject({ slug: 'mjcc', tenantClass: 'corporation' });
    expect(overview[0]?.installedProducts).toHaveLength(1);
    expect(overview[0]?.installedProducts[0]).toMatchObject({
      productKey: 'compute',
      productName: 'KpnCompute',
      planKey: 'business',
      planName: 'Business',
    });
    expect(overview[0]?.installedProducts[0]?.resources.map((entry) => entry.id)).toEqual([
      'res-mjcc',
    ]);
  });

  it('never leaks another account tenant, installation, or resource', async () => {
    const { repos } = buildRepos(baseStore);
    const overview = await platformOverviewForUser(repos, 'account-1');
    const serialized = JSON.stringify(overview);

    expect(serialized).not.toContain('t-other');
    expect(serialized).not.toContain('inst-other');
    expect(serialized).not.toContain('res-other');
    expect(serialized).not.toContain('compute-side-other');
  });

  it('returns an empty list for an account with no memberships', async () => {
    const { repos } = buildRepos(baseStore);
    await expect(platformOverviewForUser(repos, 'nobody')).resolves.toEqual([]);
  });

  it('reports a tenant with no installation rather than omitting it', async () => {
    const { repos } = buildRepos({
      ...baseStore,
      installations: [],
      resources: [],
    });
    const overview = await platformOverviewForUser(repos, 'account-1');
    expect(overview).toHaveLength(1);
    expect(overview[0]?.installedProducts).toEqual([]);
  });
});
