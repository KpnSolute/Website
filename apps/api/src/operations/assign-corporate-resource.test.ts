import { beforeEach, describe, expect, it } from 'vitest';
import type { Product, ProductPlan } from '@kpn/contracts';
import {
  createInMemoryPlatform,
  makeTenant,
  makeUser,
  type InMemoryPlatform,
  type InMemoryStore,
} from '../testing/in-memory-platform.js';
import {
  assignCorporateResource,
  MJCC_COMPUTE_CORPORATION,
  type CorporateAssignmentRequest,
} from './assign-corporate-resource.js';

/**
 * The MJCC vertical slice: assign the existing Compute corporation to a central
 * KpnSolute account so it appears as that account's managed resource.
 *
 * These cover the two properties the command exists to guarantee — it is
 * idempotent, and it refuses rather than guessing.
 */

const COMPUTE: Product = { id: 'product-compute', key: 'compute', name: 'KpnCompute' };
const PLANS: ProductPlan[] = [
  { id: 'plan-business', productId: COMPUTE.id, key: 'business', name: 'Business' },
  { id: 'plan-starter', productId: COMPUTE.id, key: 'starter', name: 'Starter' },
];

const COMPUTE_TENANT_ID = 'compute-side-tenant-8f21';

function request(overrides: Partial<CorporateAssignmentRequest> = {}): CorporateAssignmentRequest {
  return {
    account: { username: 'mjcc_owner' },
    operator: { username: 'kpn_operator', label: 'shell run' },
    tenant: { ...MJCC_COMPUTE_CORPORATION.tenant },
    service: { ...MJCC_COMPUTE_CORPORATION.service },
    resource: {
      resourceType: MJCC_COMPUTE_CORPORATION.resourceType,
      serviceResourceId: COMPUTE_TENANT_ID,
      displayName: 'MJCC Compute workspace',
    },
    ...overrides,
  };
}

let platform: InMemoryPlatform;
let store: InMemoryStore;

/** The person running the command. Always present, never the tenant's owner. */
const OPERATOR = makeUser({ id: 'account-operator', username: 'kpn_operator' });

function seed(extra: Partial<InMemoryStore> = {}): void {
  const { users, ...rest } = extra;
  platform = createInMemoryPlatform({
    users: [...(users ?? [makeUser({ id: 'account-mjcc', username: 'mjcc_owner' })]), OPERATOR],
    products: [COMPUTE],
    plans: PLANS,
    ...rest,
  });
  store = platform.store;
}

function run(overrides: Partial<CorporateAssignmentRequest> = {}) {
  return assignCorporateResource(platform.db, request(overrides), {
    repositories: platform.repositories,
  });
}

beforeEach(() => seed());

describe('assigning MJCC to a KpnSolute account', () => {
  it('creates the corporation, ownership, installation, assignment, and resource reference', async () => {
    const result = await run();

    expect(result.outcome).toBe('created');
    expect(result.accountId).toBe('account-mjcc');
    expect(result.username).toBe('mjcc_owner');
    expect(result.runtimeUrl).toBe('https://mjcc.kpnsolute.com');
    expect(result.managementUrl).toBe('https://platform.kpnsolute.com/compute/mjcc');

    const tenant = store.tenants.find((entry) => entry.slug === 'mjcc');
    expect(tenant).toMatchObject({ type: 'corporation', subdomain: 'mjcc', status: 'active' });

    const owner = store.roles.find((role) => role.tenantId === tenant?.id && role.key === 'owner');
    const membership = store.memberships.find((entry) => entry.tenantId === tenant?.id);
    expect(membership).toMatchObject({
      userId: 'account-mjcc',
      roleId: owner?.id,
      status: 'active',
    });

    const installation = store.installations[0];
    expect(installation).toMatchObject({
      tenantId: tenant?.id,
      productId: COMPUTE.id,
      planId: 'plan-business',
      status: 'active',
    });
    expect(store.assignments[0]).toMatchObject({
      installationId: installation?.id,
      membershipId: membership?.id,
      serviceRole: 'owner',
      status: 'active',
    });
    expect(store.resources[0]).toMatchObject({
      installationId: installation?.id,
      resourceType: 'compute_tenant',
      serviceResourceId: COMPUTE_TENANT_ID,
      displayName: 'MJCC Compute workspace',
    });
  });

  it('records the corporation under its display name while staying addressed at mjcc', async () => {
    const result = await run();

    expect(MJCC_COMPUTE_CORPORATION.tenant).toEqual({
      name: 'Miami Job Corps Center',
      slug: 'mjcc',
      subdomain: 'mjcc',
    });
    const tenant = store.tenants.find((entry) => entry.slug === 'mjcc');
    expect(tenant?.name).toBe('Miami Job Corps Center');
    expect(result.tenantSlug).toBe('mjcc');
    expect(result.subdomain).toBe('mjcc');
    expect(result.runtimeUrl).toBe('https://mjcc.kpnsolute.com');
    expect(result.managementUrl).toBe('https://platform.kpnsolute.com/compute/mjcc');
  });

  it('emits an audit record and a control-plane outbox event', async () => {
    await run();

    expect(store.audit).toHaveLength(1);
    expect(store.audit[0]).toMatchObject({
      action: 'platform.corporate_resource.assigned',
      targetType: 'service_resource_reference',
    });

    expect(store.outbox).toHaveLength(1);
    expect(store.outbox[0]).toMatchObject({
      eventType: 'com.kpnsolute.platform.corporate_resource.assigned.v1',
    });
    expect(store.outbox[0]?.data).toMatchObject({
      serviceKey: 'compute',
      tenantSlug: 'mjcc',
      tenantClass: 'corporation',
      subdomain: 'mjcc',
      serviceResourceId: COMPUTE_TENANT_ID,
    });
  });

  it('resolves the account by immutable id as well as by username', async () => {
    const result = await run({ account: { accountId: 'account-mjcc' } });
    expect(result.outcome).toBe('created');
    expect(result.accountId).toBe('account-mjcc');
  });
});

describe('audit truth: the actor is the operator, never the new owner', () => {
  it('records the operator as the actor and the grantee as the subject', async () => {
    const result = await run();

    expect(result.operatorAccountId).toBe('account-operator');
    expect(result.operatorUsername).toBe('kpn_operator');
    expect(result.operatorLabel).toBe('shell run');
    expect(result.accountId).toBe('account-mjcc');

    expect(store.audit).toHaveLength(1);
    expect(store.audit[0]?.actorUserId).toBe('account-operator');
    expect(store.audit[0]?.actorUserId).not.toBe(result.accountId);
    expect(store.audit[0]?.metadata).toMatchObject({
      operator: {
        actor: 'account',
        accountId: 'account-operator',
        username: 'kpn_operator',
        label: 'shell run',
        command: 'assign-corporate-resource',
      },
      grantedToAccountId: 'account-mjcc',
      grantedToUsername: 'mjcc_owner',
    });
  });

  it('accepts the operator by immutable account id', async () => {
    const result = await run({ operator: { accountId: 'account-operator' } });
    expect(result.operatorAccountId).toBe('account-operator');
    expect(result.operatorLabel).toBeNull();
    expect(store.audit[0]?.actorUserId).toBe('account-operator');
  });

  it('records a truthful null actor when the operator holds no KpnSolute account', async () => {
    const result = await run({ operator: { label: 'ops shell, change CR-14' } });

    expect(result.operatorAccountId).toBeNull();
    expect(result.operatorUsername).toBeNull();
    expect(store.audit[0]?.actorUserId).toBeNull();
    expect(store.audit[0]?.metadata).toMatchObject({
      operator: {
        actor: 'system',
        accountId: null,
        username: null,
        label: 'ops shell, change CR-14',
      },
      grantedToAccountId: 'account-mjcc',
    });
    // The grant still happened; only the attribution differs.
    expect(result.outcome).toBe('created');
  });

  it('records a null actor rather than the owner when no operator is supplied at all', async () => {
    const result = await run({ operator: undefined });

    expect(result.operatorAccountId).toBeNull();
    expect(store.audit[0]?.actorUserId).toBeNull();
    expect(store.audit[0]?.actorUserId).not.toBe(result.accountId);
    expect(store.audit[0]?.metadata).toMatchObject({ operator: { actor: 'system', label: null } });
  });

  it('refuses when the operator is the account being granted ownership', async () => {
    await expect(run({ operator: { username: 'mjcc_owner' } })).rejects.toMatchObject({
      status: 422,
    });
    await expect(run({ operator: { accountId: 'account-mjcc' } })).rejects.toMatchObject({
      status: 422,
    });
    // Refused before anything was written.
    expect(store.tenants).toEqual([]);
    expect(store.audit).toEqual([]);
  });

  it('refuses an unresolvable or ambiguous operator rather than falling back to null', async () => {
    await expect(run({ operator: { username: 'nobody_here' } })).rejects.toMatchObject({
      status: 404,
    });
    await expect(
      run({ operator: { accountId: 'account-operator', username: 'kpn_operator' } }),
    ).rejects.toMatchObject({ status: 422 });
    expect(store.tenants).toEqual([]);
  });

  it('audits a no-op re-run against the operator who re-ran it', async () => {
    await run();
    await run({ operator: { username: 'kpn_operator', label: 'second look' } });

    expect(store.audit).toHaveLength(2);
    expect(store.audit[1]).toMatchObject({ actorUserId: 'account-operator' });
    expect(store.audit[1]?.metadata).toMatchObject({
      outcome: 'unchanged',
      operator: { label: 'second look' },
    });
  });
});

describe('idempotency', () => {
  it('changes nothing on a second identical run', async () => {
    await run();
    const before = structuredClone({
      tenants: store.tenants,
      memberships: store.memberships,
      installations: store.installations,
      assignments: store.assignments,
      resources: store.resources,
    });

    const second = await run();

    expect(second.outcome).toBe('unchanged');
    expect(second.changes).toEqual([]);
    expect(store.tenants).toEqual(before.tenants);
    expect(store.memberships).toEqual(before.memberships);
    expect(store.installations).toEqual(before.installations);
    expect(store.assignments).toEqual(before.assignments);
    expect(store.resources).toEqual(before.resources);
  });

  it('does not re-emit the outbox event on a no-op re-run, but still audits it', async () => {
    await run();
    await run();

    expect(store.outbox).toHaveLength(1);
    expect(store.audit).toHaveLength(2);
    expect(store.audit[1]?.metadata).toMatchObject({ outcome: 'unchanged', changes: [] });
  });

  it('adopts an existing corporation that has no subdomain yet', async () => {
    seed({ tenants: [makeTenant({ id: 't-mjcc', slug: 'mjcc', type: 'corporation' })] });

    const result = await run();

    expect(result.outcome).toBe('updated');
    expect(result.changes).toContain('assigned the mjcc corporate subdomain');
    expect(store.tenants[0]?.subdomain).toBe('mjcc');
  });

  it('promotes an existing non-owner membership rather than creating a second one', async () => {
    seed({
      tenants: [makeTenant({ id: 't-mjcc', slug: 'mjcc', type: 'corporation', subdomain: 'mjcc' })],
      roles: [
        { id: 'role-owner', tenantId: 't-mjcc', key: 'owner', name: 'Owner', isBuiltIn: true },
        { id: 'role-member', tenantId: 't-mjcc', key: 'member', name: 'Member', isBuiltIn: true },
      ],
      memberships: [
        {
          id: 'm-1',
          tenantId: 't-mjcc',
          userId: 'account-mjcc',
          roleId: 'role-member',
          status: 'active',
          joinedAt: '2026-08-01T00:00:00.000Z',
        },
      ],
    });

    const result = await run();

    expect(result.changes).toContain('promoted the existing membership to owner');
    expect(store.memberships).toHaveLength(1);
    expect(store.memberships[0]).toMatchObject({ id: 'm-1', roleId: 'role-owner' });
  });
});

describe('dry run', () => {
  it('reports the outcome and persists nothing', async () => {
    const result = await run({ dryRun: true });

    expect(result.dryRun).toBe(true);
    expect(result.outcome).toBe('created');
    expect(store.tenants).toEqual([]);
    expect(store.memberships).toEqual([]);
    expect(store.installations).toEqual([]);
    expect(store.resources).toEqual([]);
    expect(store.audit).toEqual([]);
    expect(store.outbox).toEqual([]);
  });
});

describe('fail-closed refusals', () => {
  it('refuses an ambiguous username instead of choosing an account', async () => {
    seed({
      users: [
        makeUser({ id: 'account-a', username: 'mjcc_owner' }),
        makeUser({ id: 'account-b', username: 'mjcc_owner' }),
      ],
      products: [COMPUTE],
      plans: PLANS,
    });
    await expect(run()).rejects.toMatchObject({ status: 409 });
    expect(store.tenants).toEqual([]);
  });

  it('refuses when both or neither account selector is supplied', async () => {
    await expect(
      run({ account: { accountId: 'account-mjcc', username: 'mjcc_owner' } }),
    ).rejects.toMatchObject({ status: 422 });
    await expect(run({ account: {} })).rejects.toMatchObject({ status: 422 });
  });

  it('refuses an account that is not active', async () => {
    seed({
      users: [makeUser({ id: 'account-mjcc', username: 'mjcc_owner', status: 'suspended' })],
      products: [COMPUTE],
      plans: PLANS,
    });
    await expect(run()).rejects.toMatchObject({ status: 409 });
  });

  it('refuses a conflicting owner rather than adding a second one', async () => {
    seed({
      users: [
        makeUser({ id: 'account-mjcc', username: 'mjcc_owner' }),
        makeUser({ id: 'account-other', username: 'someone_else' }),
      ],
      products: [COMPUTE],
      plans: PLANS,
      tenants: [makeTenant({ id: 't-mjcc', slug: 'mjcc', type: 'corporation', subdomain: 'mjcc' })],
      roles: [
        { id: 'role-owner', tenantId: 't-mjcc', key: 'owner', name: 'Owner', isBuiltIn: true },
      ],
      memberships: [
        {
          id: 'm-other',
          tenantId: 't-mjcc',
          userId: 'account-other',
          roleId: 'role-owner',
          status: 'active',
          joinedAt: '2026-08-01T00:00:00.000Z',
        },
      ],
    });

    await expect(run()).rejects.toMatchObject({ status: 409 });
    expect(store.memberships).toHaveLength(1);
  });

  it('refuses a cross-tenant reassignment of the same product resource', async () => {
    seed({
      users: [makeUser({ id: 'account-mjcc', username: 'mjcc_owner' })],
      products: [COMPUTE],
      plans: PLANS,
      tenants: [makeTenant({ id: 't-other', slug: 'other', type: 'organization' })],
      installations: [
        {
          id: 'inst-other',
          tenantId: 't-other',
          productId: COMPUTE.id,
          planId: 'plan-starter',
          status: 'active',
          settings: {},
          createdAt: '2026-08-01T00:00:00.000Z',
          updatedAt: '2026-08-01T00:00:00.000Z',
        },
      ],
      resources: [
        {
          id: 'res-other',
          installationId: 'inst-other',
          resourceType: 'compute_tenant',
          serviceResourceId: COMPUTE_TENANT_ID,
          displayName: 'Someone else',
          status: 'active',
          metadata: {},
          createdAt: '2026-08-01T00:00:00.000Z',
          updatedAt: '2026-08-01T00:00:00.000Z',
        },
      ],
    });

    await expect(run()).rejects.toThrow(/cross-tenant reassignment/i);
    // The whole transaction rolls back: no half-created MJCC tenant survives.
    expect(store.tenants.map((tenant) => tenant.slug)).toEqual(['other']);
    expect(store.resources).toHaveLength(1);
    expect(store.resources[0]?.installationId).toBe('inst-other');
  });

  it('refuses a missing product catalog entry', async () => {
    seed({
      users: [makeUser({ id: 'account-mjcc', username: 'mjcc_owner' })],
      products: [],
      plans: [],
    });
    await expect(run()).rejects.toMatchObject({ status: 404 });
    expect(store.tenants).toEqual([]);
  });

  it('refuses a plan the product does not have, rather than inventing one', async () => {
    seed({
      users: [makeUser({ id: 'account-mjcc', username: 'mjcc_owner' })],
      products: [COMPUTE],
      plans: [PLANS[1] as ProductPlan],
    });
    await expect(run()).rejects.toThrow(/no plan "business"/i);
    expect(store.installations).toEqual([]);
  });

  it('refuses a reserved corporate subdomain', async () => {
    await expect(
      run({ tenant: { name: 'MJCC', slug: 'mjcc', subdomain: 'platform' } }),
    ).rejects.toMatchObject({ status: 422 });
  });

  it('refuses an invalid slug or hostname label', async () => {
    await expect(
      run({ tenant: { name: 'MJCC', slug: 'Bad Slug', subdomain: 'mjcc' } }),
    ).rejects.toMatchObject({ status: 422 });
    await expect(
      run({ tenant: { name: 'MJCC', slug: 'mjcc', subdomain: '-bad-' } }),
    ).rejects.toMatchObject({ status: 422 });
  });

  it('refuses to change an existing tenant from an organization into a corporation', async () => {
    seed({
      users: [makeUser({ id: 'account-mjcc', username: 'mjcc_owner' })],
      products: [COMPUTE],
      plans: PLANS,
      tenants: [makeTenant({ id: 't-mjcc', slug: 'mjcc', type: 'organization' })],
    });
    await expect(run()).rejects.toThrow(/Platform decision/i);
    expect(store.tenants[0]?.type).toBe('organization');
  });

  it('refuses to re-point a corporation that already has a different subdomain', async () => {
    seed({
      users: [makeUser({ id: 'account-mjcc', username: 'mjcc_owner' })],
      products: [COMPUTE],
      plans: PLANS,
      tenants: [
        makeTenant({ id: 't-mjcc', slug: 'mjcc', type: 'corporation', subdomain: 'mjcc-legacy' }),
      ],
    });
    await expect(run()).rejects.toThrow(/re-point a live corporate runtime host/i);
    expect(store.tenants[0]?.subdomain).toBe('mjcc-legacy');
  });

  it('refuses when another tenant already holds the subdomain', async () => {
    seed({
      users: [makeUser({ id: 'account-mjcc', username: 'mjcc_owner' })],
      products: [COMPUTE],
      plans: PLANS,
      tenants: [
        makeTenant({ id: 't-other', slug: 'other', type: 'corporation', subdomain: 'mjcc' }),
      ],
    });
    await expect(run()).rejects.toMatchObject({ status: 409 });
  });

  it('refuses a tenant that is not active', async () => {
    seed({
      users: [makeUser({ id: 'account-mjcc', username: 'mjcc_owner' })],
      products: [COMPUTE],
      plans: PLANS,
      tenants: [
        makeTenant({
          id: 't-mjcc',
          slug: 'mjcc',
          type: 'corporation',
          subdomain: 'mjcc',
          status: 'suspended',
        }),
      ],
    });
    await expect(run()).rejects.toThrow(/is suspended/i);
  });

  it('refuses an empty product-owned resource id', async () => {
    await expect(
      run({ resource: { resourceType: 'compute_tenant', serviceResourceId: '   ' } }),
    ).rejects.toThrow(/resource id is required/i);
  });
});
