import { inspectTenantRouting, isReservedWorkspaceSlug } from '@kpn/contracts';
import type { Id, Tenant, TenantClass, TenantType } from '@kpn/contracts';
import type { Db } from '../db/pool.js';
import type { Repositories } from '../repositories/types.js';
import { ApiError } from '../lib/errors.js';

const SLUG_PATTERN = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

export function assertValidSlug(slug: string): void {
  if (!SLUG_PATTERN.test(slug)) {
    throw ApiError.validation(
      'Slugs must be lowercase letters, numbers, and hyphens, and cannot start or end with a hyphen.',
    );
  }
  if (isReservedWorkspaceSlug(slug)) {
    throw ApiError.conflict(
      `"${slug}" is a reserved route and cannot be used as a workspace slug.`,
    );
  }
}

/**
 * The tenant class decides how a tenant is addressed, never what it may do.
 * `tenants.type` is the stored column; the class is the contract-level name.
 * See packages/contracts/src/tenancy.ts and docs/ROUTE_REGISTRY.md section 3.0.
 */
export function tenantTypeForClass(tenantClass: TenantClass): TenantType {
  return tenantClass === 'corporation' ? 'corporation' : 'organization';
}

export interface CreateTenantInput {
  tenantClass: TenantClass;
  name: string;
  slug: string;
  /** Required for a corporation, rejected for a slug-addressed organization. */
  subdomain?: string | null;
  ownerUserId: Id;
}

/**
 * Validates the addressing a tenant is about to be stored with. Runs before the
 * insert so an unreachable or reserved hostname is a 422 rather than a tenant
 * that exists but cannot be routed to.
 */
export function assertAddressableTenant(input: {
  tenantClass: TenantClass;
  slug: string;
  subdomain?: string | null;
}): void {
  assertValidSlug(input.slug);
  const issues = inspectTenantRouting({
    tenantClass: input.tenantClass,
    slug: input.slug,
    subdomain: input.subdomain ?? null,
  });
  const issue = issues[0];
  if (issue) {
    throw ApiError.validation(issue.reason);
  }
}

/**
 * Creates a tenant, its built-in roles, and an active owner membership in one
 * transaction.
 *
 * `repos` must be bound to the same handle as `db`. Every caller builds its
 * repositories from the transaction it passes in, so the whole provisioning
 * step commits or rolls back together. `db.transaction` re-enters an existing
 * transaction rather than opening a second one, so this is safe to call from
 * inside a larger unit of work.
 */
export async function createTenantWithOwner(
  db: Db,
  repos: Repositories,
  input: CreateTenantInput,
): Promise<Tenant> {
  const slug = input.slug.trim().toLowerCase();
  // Validate what was asked for, not a narrowed version of it. Silently
  // dropping a subdomain from an organization would store a tenant that is
  // addressed differently from the way the caller requested.
  const subdomain = input.subdomain?.trim().toLowerCase() || null;

  assertAddressableTenant({ tenantClass: input.tenantClass, slug, subdomain });

  if (await repos.tenants.slugTaken(slug)) {
    throw ApiError.conflict(`The workspace slug "${slug}" is already taken.`);
  }
  if (subdomain && (await repos.tenants.subdomainTaken(subdomain))) {
    throw ApiError.conflict(`The subdomain "${subdomain}" is already assigned to another tenant.`);
  }

  try {
    return await db.transaction(async () => {
      const tenant = await repos.tenants.create({
        type: tenantTypeForClass(input.tenantClass),
        name: input.name,
        slug,
        subdomain,
        createdByUserId: input.ownerUserId,
      });
      const roles = await repos.roles.ensureBuiltInRoles(tenant.id);
      await repos.memberships.create({
        tenantId: tenant.id,
        userId: input.ownerUserId,
        roleId: roles.owner.id,
        status: 'active',
      });
      return tenant;
    });
  } catch (error) {
    if (isUniqueViolation(error)) {
      // The pre-checks above lose to a concurrent insert, so the constraint name
      // decides which identifier the caller actually needs to change.
      const constraint = uniqueViolationConstraint(error);
      if (constraint?.includes('subdomain')) {
        throw ApiError.conflict(
          `The subdomain "${subdomain}" is already assigned to another tenant.`,
        );
      }
      throw ApiError.conflict(`The workspace slug "${slug}" is already taken.`);
    }
    throw error;
  }
}

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' && error !== null && (error as { code?: string }).code === '23505'
  );
}

function uniqueViolationConstraint(error: unknown): string | undefined {
  if (typeof error !== 'object' || error === null) return undefined;
  const constraint = (error as { constraint?: unknown }).constraint;
  return typeof constraint === 'string' ? constraint : undefined;
}
