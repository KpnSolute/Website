import { accountSetupStateFor, normalizeUsername } from '@kpn/contracts';
import type {
  ControlPlaneEvent,
  Id,
  InstallationAssignment,
  Product,
  ProductInstallation,
  ProductPlan,
  Role,
  ServiceResourceReference,
  Tenant,
  TenantMembership,
  User,
} from '@kpn/contracts';
import type { Db } from '../db/pool.js';
import type { Repositories } from '../repositories/types.js';

/**
 * An in-memory control plane for tests.
 *
 * It models the constraints that the operator command and the provisioning
 * service actually depend on — unique tenant slugs and subdomains, unique
 * usernames, one installation per tenant+product, one resource reference per
 * installation+type+id — so a test that passes here is testing the real
 * refusal logic rather than a permissive stub.
 *
 * Anything not implemented throws, so a code path that quietly starts using an
 * unmodelled repository fails loudly instead of silently passing.
 */

export interface InMemoryStore {
  users: User[];
  tenants: Tenant[];
  roles: Role[];
  memberships: TenantMembership[];
  products: Product[];
  plans: ProductPlan[];
  installations: ProductInstallation[];
  assignments: InstallationAssignment[];
  resources: ServiceResourceReference[];
  outbox: ControlPlaneEvent[];
  audit: {
    tenantId: Id | null;
    actorUserId: Id | null;
    action: string;
    targetType?: string | null;
    targetId?: Id | null;
    metadata?: Record<string, unknown>;
  }[];
  /** Incremented on commit; a rolled-back dry run must not advance it. */
  commits: number;
  rollbacks: number;
}

const NOW = '2026-08-19T00:00:00.000Z';

export function makeUser(overrides: Partial<User> & { id: Id }): User {
  const username = overrides.username ?? null;
  return {
    primaryEmail: `${overrides.id}@example.test`,
    displayName: 'Test person',
    status: 'active',
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
    username,
    accountSetupState: accountSetupStateFor(username),
  };
}

export function makeTenant(overrides: Partial<Tenant> & { id: Id; slug: string }): Tenant {
  const type = overrides.type ?? 'organization';
  return {
    name: overrides.slug,
    status: 'active',
    subdomain: null,
    customDomain: null,
    createdByUserId: 'seed',
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
    type,
    tenantClass: type === 'corporation' ? 'corporation' : 'organization',
  };
}

export interface InMemoryPlatform {
  db: Db;
  store: InMemoryStore;
  repositories: (db: Db) => Repositories;
}

export function createInMemoryPlatform(seed: Partial<InMemoryStore> = {}): InMemoryPlatform {
  const store: InMemoryStore = {
    users: [],
    tenants: [],
    roles: [],
    memberships: [],
    products: [],
    plans: [],
    installations: [],
    assignments: [],
    resources: [],
    outbox: [],
    audit: [],
    commits: 0,
    rollbacks: 0,
    ...seed,
  };

  let sequence = 0;
  const nextId = (prefix: string) => `${prefix}-${++sequence}`;

  const db: Db = {
    async query() {
      throw new Error(
        'The in-memory platform has no SQL engine. Code under test must go through repositories.',
      );
    },
    async transaction(fn) {
      // Snapshot/restore gives the tests a real rollback, so a dry run that
      // claims to change nothing can be verified rather than trusted.
      const snapshot = structuredClone({ ...store, commits: 0, rollbacks: 0 });
      try {
        const result = await fn(db);
        store.commits += 1;
        return result;
      } catch (error) {
        Object.assign(store, snapshot, {
          commits: store.commits,
          rollbacks: store.rollbacks + 1,
        });
        throw error;
      }
    },
  };

  const repositories = (): Repositories => ({
    users: {
      async upsertFromAuth(input) {
        const existing = store.users.find((user) => user.id === input.id);
        if (existing) return existing;
        const created = makeUser({
          id: input.id,
          primaryEmail: input.primaryEmail.toLowerCase(),
          displayName: input.displayName,
        });
        store.users.push(created);
        return created;
      },
      async findByEmail(email) {
        return store.users.find((user) => user.primaryEmail === email.toLowerCase()) ?? null;
      },
      async findById(id) {
        return store.users.find((user) => user.id === id) ?? null;
      },
      async listByUsername(username) {
        const normalized = normalizeUsername(username);
        return store.users.filter((user) => user.username === normalized);
      },
      async claimUsername(id, username) {
        const normalized = normalizeUsername(username);
        if (store.users.some((user) => user.username === normalized)) {
          throw Object.assign(new Error('duplicate key'), {
            code: '23505',
            constraint: 'account_profiles_username_unique',
          });
        }
        const index = store.users.findIndex((user) => user.id === id);
        const current = store.users[index];
        if (index < 0 || !current || current.username) return null;
        const updated = makeUser({ ...current, username: normalized });
        store.users[index] = updated;
        return updated;
      },
      async update(id, patch) {
        const index = store.users.findIndex((user) => user.id === id);
        const current = store.users[index];
        if (index < 0 || !current) throw new Error(`No user ${id}`);
        const updated = makeUser({
          ...current,
          displayName: patch.displayName ?? current.displayName,
        });
        store.users[index] = updated;
        return updated;
      },
    },
    tenants: {
      async create(input) {
        if (store.tenants.some((tenant) => tenant.slug === input.slug)) {
          throw uniqueViolation('tenants_slug_key');
        }
        if (input.subdomain && store.tenants.some((t) => t.subdomain === input.subdomain)) {
          throw uniqueViolation('tenants_subdomain_unique');
        }
        const created = makeTenant({
          id: nextId('tenant'),
          type: input.type,
          name: input.name,
          slug: input.slug,
          subdomain: input.subdomain ?? null,
          createdByUserId: input.createdByUserId,
        });
        store.tenants.push(created);
        return created;
      },
      async findBySlug(slug) {
        return store.tenants.find((tenant) => tenant.slug === slug.toLowerCase()) ?? null;
      },
      async findBySubdomain(subdomain) {
        const normalized = subdomain.toLowerCase();
        return store.tenants.find((tenant) => tenant.subdomain === normalized) ?? null;
      },
      async findById(id) {
        return store.tenants.find((tenant) => tenant.id === id) ?? null;
      },
      async listForUser(userId) {
        const tenantIds = new Set(
          store.memberships
            .filter((entry) => entry.userId === userId && entry.status === 'active')
            .map((entry) => entry.tenantId),
        );
        return store.tenants.filter((tenant) => tenantIds.has(tenant.id));
      },
      async slugTaken(slug) {
        return store.tenants.some((tenant) => tenant.slug === slug.toLowerCase());
      },
      async subdomainTaken(subdomain) {
        return store.tenants.some((tenant) => tenant.subdomain === subdomain.toLowerCase());
      },
      async setSubdomain(id, subdomain) {
        const normalized = subdomain.toLowerCase();
        if (store.tenants.some((tenant) => tenant.subdomain === normalized && tenant.id !== id)) {
          throw uniqueViolation('tenants_subdomain_unique');
        }
        const index = store.tenants.findIndex((tenant) => tenant.id === id);
        const current = store.tenants[index];
        if (index < 0 || !current) throw new Error(`No tenant ${id}`);
        const updated = { ...current, subdomain: normalized };
        store.tenants[index] = updated;
        return updated;
      },
    },
    roles: {
      async ensureBuiltInRoles(tenantId) {
        const result = {} as Record<'owner' | 'admin' | 'member', Role>;
        for (const key of ['owner', 'admin', 'member'] as const) {
          let role = store.roles.find((entry) => entry.tenantId === tenantId && entry.key === key);
          if (!role) {
            role = {
              id: nextId('role'),
              tenantId,
              key,
              name: key[0]!.toUpperCase() + key.slice(1),
              isBuiltIn: true,
            };
            store.roles.push(role);
          }
          result[key] = role;
        }
        return result;
      },
      async findByKey(tenantId, key) {
        return store.roles.find((role) => role.tenantId === tenantId && role.key === key) ?? null;
      },
      async findById(id) {
        return store.roles.find((role) => role.id === id) ?? null;
      },
    },
    memberships: {
      async create(input) {
        const created: TenantMembership = {
          id: nextId('membership'),
          tenantId: input.tenantId,
          userId: input.userId,
          roleId: input.roleId,
          status: input.status,
          joinedAt: NOW,
        };
        store.memberships.push(created);
        return created;
      },
      async findActive(tenantId, userId) {
        return (
          store.memberships.find(
            (entry) =>
              entry.tenantId === tenantId && entry.userId === userId && entry.status === 'active',
          ) ?? null
        );
      },
      async findAnyStatus(tenantId, userId) {
        return (
          store.memberships.find(
            (entry) => entry.tenantId === tenantId && entry.userId === userId,
          ) ?? null
        );
      },
      async listByTenant(tenantId) {
        return store.memberships.filter((entry) => entry.tenantId === tenantId);
      },
      async listByTenantAndRoleKey(tenantId, roleKey) {
        const roleIds = new Set(
          store.roles
            .filter((role) => role.tenantId === tenantId && role.key === roleKey)
            .map((role) => role.id),
        );
        return store.memberships.filter(
          (entry) =>
            entry.tenantId === tenantId && entry.status === 'active' && roleIds.has(entry.roleId),
        );
      },
      async updateRole(id, roleId) {
        return patchMembership(store, id, { roleId });
      },
      async updateStatus(id, status) {
        return patchMembership(store, id, { status });
      },
      async remove(id) {
        store.memberships = store.memberships.filter((entry) => entry.id !== id);
      },
    },
    invitations: unsupported('invitations'),
    products: {
      async list() {
        return store.products;
      },
      async findByKey(key) {
        return store.products.find((product) => product.key === key) ?? null;
      },
    },
    productPlans: {
      async listForProduct(productId) {
        return store.plans.filter((plan) => plan.productId === productId);
      },
      async findByKey(productId, key) {
        return store.plans.find((plan) => plan.productId === productId && plan.key === key) ?? null;
      },
      async findById(id) {
        return store.plans.find((plan) => plan.id === id) ?? null;
      },
    },
    installations: {
      async create(input) {
        const created: ProductInstallation = {
          id: nextId('installation'),
          tenantId: input.tenantId,
          productId: input.productId,
          planId: input.planId,
          status: input.status,
          settings: {},
          createdAt: NOW,
          updatedAt: NOW,
        };
        store.installations.push(created);
        return created;
      },
      async listForTenant(tenantId) {
        return store.installations.filter((entry) => entry.tenantId === tenantId);
      },
      async findByTenantAndProduct(tenantId, productId) {
        return (
          store.installations.find(
            (entry) => entry.tenantId === tenantId && entry.productId === productId,
          ) ?? null
        );
      },
      async listForTenantsWithCatalog(tenantIds) {
        const wanted = new Set(tenantIds);
        return store.installations
          .filter((entry) => wanted.has(entry.tenantId))
          .map((installation) => {
            const product = store.products.find((entry) => entry.id === installation.productId);
            const plan = store.plans.find((entry) => entry.id === installation.planId);
            if (!product || !plan) throw new Error('Seeded installation has no catalog rows.');
            return {
              installation,
              productKey: product.key,
              productName: product.name,
              planKey: plan.key,
              planName: plan.name,
            };
          });
      },
      async findById(id) {
        return store.installations.find((entry) => entry.id === id) ?? null;
      },
      async listEntitlements() {
        return [];
      },
    },
    serviceControl: {
      async assignMember(input) {
        const existing = store.assignments.find(
          (entry) =>
            entry.installationId === input.installationId &&
            entry.membershipId === input.membershipId,
        );
        if (existing) {
          const updated = {
            ...existing,
            serviceRole: input.serviceRole,
            status: 'active' as const,
          };
          store.assignments[store.assignments.indexOf(existing)] = updated;
          return updated;
        }
        const created: InstallationAssignment = {
          id: nextId('assignment'),
          installationId: input.installationId,
          membershipId: input.membershipId,
          serviceRole: input.serviceRole,
          status: 'active',
          createdAt: NOW,
          updatedAt: NOW,
        };
        store.assignments.push(created);
        return created;
      },
      async listAssignments(installationId) {
        return store.assignments.filter(
          (entry) => entry.installationId === installationId && entry.status !== 'removed',
        );
      },
      async listResources(installationId) {
        return store.resources.filter(
          (entry) => entry.installationId === installationId && entry.status !== 'deleted',
        );
      },
      async listResourcesForInstallations(installationIds) {
        const wanted = new Set(installationIds);
        return store.resources.filter(
          (entry) => wanted.has(entry.installationId) && entry.status !== 'deleted',
        );
      },
      async findResourceReferences(resourceType, serviceResourceId) {
        return store.resources.filter(
          (entry) =>
            entry.resourceType === resourceType && entry.serviceResourceId === serviceResourceId,
        );
      },
      async upsertResource(input) {
        const existing = store.resources.find(
          (entry) =>
            entry.installationId === input.installationId &&
            entry.resourceType === input.resourceType &&
            entry.serviceResourceId === input.serviceResourceId,
        );
        if (existing) {
          const updated: ServiceResourceReference = {
            ...existing,
            displayName: input.displayName ?? existing.displayName,
            metadata: { ...existing.metadata, ...(input.metadata ?? {}) },
            status: 'active',
          };
          store.resources[store.resources.indexOf(existing)] = updated;
          return updated;
        }
        const created: ServiceResourceReference = {
          id: nextId('resource'),
          installationId: input.installationId,
          resourceType: input.resourceType,
          serviceResourceId: input.serviceResourceId,
          displayName: input.displayName ?? null,
          status: 'active',
          metadata: input.metadata ?? {},
          createdAt: NOW,
          updatedAt: NOW,
        };
        store.resources.push(created);
        return created;
      },
      async recordEvent(input) {
        const created: ControlPlaneEvent = {
          id: nextId('event'),
          tenantId: input.tenantId,
          installationId: input.installationId,
          eventType: input.eventType,
          source: 'https://api.kpnsolute.com/platform',
          subject: input.subject,
          data: input.data ?? {},
          status: 'pending',
          attemptCount: 0,
          availableAt: NOW,
          occurredAt: NOW,
          publishedAt: null,
          lastError: null,
        };
        store.outbox.push(created);
        return created;
      },
    },
    subscriptions: unsupported('subscriptions'),
    invoices: unsupported('invoices'),
    paymentMethods: unsupported('paymentMethods'),
    usage: unsupported('usage'),
    notifications: unsupported('notifications'),
    audit: {
      async record(input) {
        store.audit.push(input);
      },
    },
    workforceAuth: unsupported('workforceAuth'),
    oauth: unsupported('oauth'),
  });

  return { db, store, repositories };
}

function patchMembership(
  store: InMemoryStore,
  id: Id,
  patch: Partial<TenantMembership>,
): TenantMembership {
  const index = store.memberships.findIndex((entry) => entry.id === id);
  const current = store.memberships[index];
  if (index < 0 || !current) throw new Error(`No membership ${id}`);
  const updated = { ...current, ...patch };
  store.memberships[index] = updated;
  return updated;
}

function uniqueViolation(constraint: string): Error {
  return Object.assign(
    new Error(`duplicate key value violates unique constraint "${constraint}"`),
    {
      code: '23505',
      constraint,
    },
  );
}

/** Any repository the tests do not model. Touching one is a test-design error. */
function unsupported<T>(name: string): T {
  return new Proxy(
    {},
    {
      get() {
        return () => {
          throw new Error(`The in-memory platform does not implement repositories.${name}.`);
        };
      },
    },
  ) as T;
}
