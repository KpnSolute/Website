import type { Role, Tenant, TenantMembership } from '@kpn/contracts';
import type { Repositories } from '../repositories/types.js';
import { ApiError } from '../lib/errors.js';

export interface TenantAccessContext {
  tenant: Tenant;
  membership: TenantMembership;
  role: Role;
}

/**
 * Resolves a route tenant slug to an authorized tenant context. The slug is
 * only a lookup key (ADR-0007) — access always requires an active membership
 * looked up server-side, never trusted from the path alone.
 */
export async function requireActiveMembership(
  repos: Repositories,
  tenantSlug: string,
  userId: string,
): Promise<TenantAccessContext> {
  const tenant = await repos.tenants.findBySlug(tenantSlug);
  if (!tenant || tenant.status !== 'active') {
    throw ApiError.notFound(`No active workspace matches "${tenantSlug}".`);
  }

  const membership = await repos.memberships.findActive(tenant.id, userId);
  if (!membership) {
    throw ApiError.forbidden('You are not an active member of this workspace.');
  }

  const role = await repos.roles.findById(membership.roleId);
  if (!role) {
    throw ApiError.forbidden('Your membership role could not be resolved.');
  }

  return { tenant, membership, role };
}

export function requireRole(context: TenantAccessContext, allowed: string[]): void {
  if (!allowed.includes(context.role.key)) {
    throw ApiError.forbidden(`This action requires one of these roles: ${allowed.join(', ')}.`);
  }
}
