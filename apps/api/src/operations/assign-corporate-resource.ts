import { tenantManagementUrl, tenantRuntimeUrl } from '@kpn/contracts';
import type { Id, ServiceKey, ServiceResourceReference, Tenant, User } from '@kpn/contracts';
import type { Db } from '../db/pool.js';
import { ApiError } from '../lib/errors.js';
import { createPgRepositories } from '../repositories/pg/index.js';
import type { Repositories } from '../repositories/types.js';
import { resolveExactlyOneAccount } from '../services/account-username.js';
import { assertAddressableTenant, createTenantWithOwner } from '../services/tenants.js';

/**
 * Assign an existing product-owned resource to a central KpnSolute account.
 *
 * This is the operator path that makes an already-running product tenant appear
 * as a managed resource in Platform. It is deliberately NOT an HTTP endpoint:
 * it grants organization ownership, so it runs from an operator shell that
 * already holds database credentials, never from a public request.
 *
 * Properties this command must keep:
 *
 *   fail closed   Every ambiguity, conflict, or missing prerequisite refuses.
 *                 It never invents a product, a plan, a second account, or a
 *                 resource id.
 *   idempotent    A re-run with the same inputs writes nothing and reports
 *                 `unchanged`.
 *   atomic        Tenant, roles, membership, installation, assignment,
 *                 resource reference, audit, and outbox are one transaction.
 *   audit-true    The audited actor is the operator who ran the command. The
 *                 account receiving ownership is the subject of the grant, so
 *                 it is recorded as the grantee and never as the actor.
 *
 * It reuses `createTenantWithOwner`, `product_installations`,
 * `installation_assignments`, and `service_resource_references` rather than
 * introducing a parallel bootstrap table.
 */

/**
 * Who ran the command, for the audit record only.
 *
 * This is identity, not authorization: holding the database credentials this
 * command needs is the authorization, and it happened before the process
 * started. Recording who used them is the point.
 *
 * Supply at most one of `accountId`/`username`. Supplying neither is a
 * supported, truthful answer — an operator shell is not always a KpnSolute
 * account holder — and records a null actor plus whatever `label` was given,
 * rather than attributing the grant to somebody who did not make it.
 */
export interface CorporateAssignmentOperator {
  accountId?: string | null;
  username?: string | null;
  /** Free-text note about the operator or the change record authorizing the run. */
  label?: string | null;
}

export interface CorporateAssignmentRequest {
  /** Exactly one of these identifies the person. Both or neither is refused. */
  account: { accountId?: string | null; username?: string | null };
  /** Who is running this command. Never inferred from the account being granted. */
  operator?: CorporateAssignmentOperator;
  tenant: { name: string; slug: string; subdomain: string };
  service: { serviceKey: string; planKey: string };
  resource: {
    resourceType: string;
    /** The product's own immutable id for the resource. Never invented here. */
    serviceResourceId: string;
    displayName?: string | null;
    metadata?: Record<string, unknown>;
  };
  /** Compute the outcome, then roll the transaction back. */
  dryRun?: boolean;
}

export type CorporateAssignmentOutcome = 'created' | 'updated' | 'unchanged';

export interface CorporateAssignmentResult {
  outcome: CorporateAssignmentOutcome;
  /** What this run actually changed. Empty when the outcome is `unchanged`. */
  changes: string[];
  dryRun: boolean;
  accountId: Id;
  username: string | null;
  /** The audited actor: the operator's own account, or null when they have none. */
  operatorAccountId: Id | null;
  operatorUsername: string | null;
  operatorLabel: string | null;
  tenantId: Id;
  tenantSlug: string;
  subdomain: string | null;
  installationId: Id;
  membershipId: Id;
  assignmentId: Id;
  resourceReferenceId: Id;
  runtimeUrl: string;
  managementUrl: string;
}

/**
 * The MJCC Compute corporation, per docs/ROUTE_REGISTRY.md section 3.0 and
 * ADR-0007: MJCC is the first corporate tenant, its canonical runtime is
 * `mjcc.kpnsolute.com`, and its management is
 * `platform.kpnsolute.com/compute/mjcc`. The Compute-side resource id is
 * intentionally absent — the operator supplies it, because inventing one would
 * point Platform at a resource that may not exist.
 *
 * `name` is the display name people read in Platform; `slug` and `subdomain`
 * are the addressing identifiers and stay `mjcc`, because changing either would
 * move a live corporate runtime host.
 */
export const MJCC_COMPUTE_CORPORATION = {
  tenant: { name: 'Miami Job Corps Center', slug: 'mjcc', subdomain: 'mjcc' },
  service: { serviceKey: 'compute', planKey: 'business' },
  resourceType: 'compute_tenant',
} as const;

/** Thrown to force a rollback once a dry run has computed its result. */
class DryRunRollback extends Error {
  constructor(readonly result: CorporateAssignmentResult) {
    super('Dry run: rolling back.');
    this.name = 'DryRunRollback';
  }
}

export interface AssignCorporateResourceOptions {
  /** Overridden in tests; production always builds PostgreSQL repositories. */
  repositories?: (db: Db) => Repositories;
}

export async function assignCorporateResource(
  db: Db,
  request: CorporateAssignmentRequest,
  options: AssignCorporateResourceOptions = {},
): Promise<CorporateAssignmentResult> {
  const normalized: CorporateAssignmentRequest = {
    ...request,
    tenant: {
      name: request.tenant.name.trim(),
      slug: request.tenant.slug.trim().toLowerCase(),
      subdomain: request.tenant.subdomain.trim().toLowerCase(),
    },
    resource: {
      ...request.resource,
      resourceType: request.resource.resourceType.trim(),
      serviceResourceId: request.resource.serviceResourceId.trim(),
    },
  };

  if (!normalized.tenant.name) {
    throw ApiError.validation('A tenant name is required.');
  }
  if (!normalized.resource.serviceResourceId) {
    throw ApiError.validation(
      'The product-owned resource id is required. Refusing to reference a resource that was not named.',
    );
  }
  if (!normalized.resource.resourceType) {
    throw ApiError.validation('A resource type is required.');
  }
  // Refuse an unroutable or reserved corporate host before anything is written.
  assertAddressableTenant({
    tenantClass: 'corporation',
    slug: normalized.tenant.slug,
    subdomain: normalized.tenant.subdomain,
  });

  const makeRepositories = options.repositories ?? createPgRepositories;

  try {
    return await db.transaction(async (tx) => {
      const result = await runAssignment(tx, makeRepositories(tx), normalized);
      if (normalized.dryRun) throw new DryRunRollback(result);
      return result;
    });
  } catch (error) {
    if (error instanceof DryRunRollback) return error.result;
    throw error;
  }
}

async function runAssignment(
  db: Db,
  repos: Repositories,
  request: CorporateAssignmentRequest,
): Promise<CorporateAssignmentResult> {
  const changes: string[] = [];

  // 1. Exactly one account, by immutable id or exact normalized username.
  const account = await resolveExactlyOneAccount(repos, request.account);
  if (account.status !== 'active') {
    throw ApiError.conflict(
      `Account ${account.id} is ${account.status}. Refusing to assign a resource to an account that is not active.`,
    );
  }

  // 1a. The operator, resolved before anything is written so a bad identity
  //     refuses rather than half-applying.
  const operator = await resolveOperator(repos, request.operator, account);

  // 2. The corporation tenant, its built-in roles, and its owner membership.
  const { tenant, createdTenant } = await ensureCorporationTenant(db, repos, {
    account,
    tenant: request.tenant,
    changes,
  });

  let ownerRole = await repos.roles.findByKey(tenant.id, 'owner');
  if (!ownerRole) {
    ownerRole = (await repos.roles.ensureBuiltInRoles(tenant.id)).owner;
    changes.push('provisioned the built-in roles');
  }

  const existingOwners = await repos.memberships.listByTenantAndRoleKey(tenant.id, 'owner');
  const conflictingOwner = existingOwners.find((entry) => entry.userId !== account.id);
  if (conflictingOwner) {
    throw ApiError.conflict(
      `Tenant "${tenant.slug}" already has an active owner (account ${conflictingOwner.userId}). Refusing to add a second owner from a bootstrap command; transfer ownership in Platform instead.`,
    );
  }

  let membership = await repos.memberships.findAnyStatus(tenant.id, account.id);
  if (!membership) {
    membership = await repos.memberships.create({
      tenantId: tenant.id,
      userId: account.id,
      roleId: ownerRole.id,
      status: 'active',
    });
    changes.push('created the active owner membership');
  } else {
    if (membership.roleId !== ownerRole.id) {
      membership = await repos.memberships.updateRole(membership.id, ownerRole.id);
      changes.push('promoted the existing membership to owner');
    }
    if (membership.status !== 'active') {
      const previous = membership.status;
      membership = await repos.memberships.updateStatus(membership.id, 'active');
      changes.push(`reactivated the owner membership (was ${previous})`);
    }
  }

  // 3. The product installation. A missing catalog row is a refusal, never a
  //    silently created product or plan.
  const product = await repos.products.findByKey(request.service.serviceKey);
  if (!product) {
    throw ApiError.notFound(
      `No product is registered with the key "${request.service.serviceKey}". Apply the product registry migration before running this command.`,
    );
  }
  const plan = await repos.productPlans.findByKey(product.id, request.service.planKey);
  if (!plan) {
    throw ApiError.notFound(
      `Product "${product.key}" has no plan "${request.service.planKey}". Refusing to invent a plan.`,
    );
  }

  let installation = await repos.installations.findByTenantAndProduct(tenant.id, product.id);
  if (!installation) {
    installation = await repos.installations.create({
      tenantId: tenant.id,
      productId: product.id,
      planId: plan.id,
      status: 'active',
    });
    changes.push(`installed ${product.key} on the ${plan.key} plan`);
  }

  // 4. Owner assignment on the installation.
  const assignments = await repos.serviceControl.listAssignments(installation.id);
  let assignment = assignments.find(
    (entry) =>
      entry.membershipId === membership.id &&
      entry.serviceRole === 'owner' &&
      entry.status === 'active',
  );
  if (!assignment) {
    assignment = await repos.serviceControl.assignMember({
      installationId: installation.id,
      membershipId: membership.id,
      serviceRole: 'owner',
    });
    changes.push(`assigned the owner to the ${product.key} installation`);
  }

  // 5. The reference to the existing product-owned resource.
  const resource = await ensureResourceReference(repos, {
    installationId: installation.id,
    tenantId: tenant.id,
    resource: request.resource,
    changes,
  });

  const routing = {
    tenantClass: tenant.tenantClass,
    slug: tenant.slug,
    subdomain: tenant.subdomain,
    customDomain: tenant.customDomain,
  };
  const serviceKey = product.key as ServiceKey;

  const result: CorporateAssignmentResult = {
    outcome: changes.length === 0 ? 'unchanged' : createdTenant ? 'created' : 'updated',
    changes,
    dryRun: Boolean(request.dryRun),
    accountId: account.id,
    username: account.username,
    operatorAccountId: operator.accountId,
    operatorUsername: operator.username,
    operatorLabel: operator.label,
    tenantId: tenant.id,
    tenantSlug: tenant.slug,
    subdomain: tenant.subdomain,
    installationId: installation.id,
    membershipId: membership.id,
    assignmentId: assignment.id,
    resourceReferenceId: resource.id,
    runtimeUrl: tenantRuntimeUrl(serviceKey, routing),
    managementUrl: tenantManagementUrl(serviceKey, routing),
  };

  // 6. Audit every run, including a no-op: that an operator executed an
  //    ownership command is itself the record worth keeping. The outbox carries
  //    only real state changes, so a re-run does not wake downstream consumers.
  //
  //    The actor is the operator, never the account being granted ownership.
  //    Writing the future owner into `actor_user_id` would make the audit trail
  //    state that they authorized their own grant, which is the one thing this
  //    record exists to disprove. An operator with no KpnSolute account is a
  //    truthful null actor; the grantee is recorded in the metadata below.
  await repos.audit.record({
    tenantId: tenant.id,
    actorUserId: operator.accountId,
    action: 'platform.corporate_resource.assigned',
    targetType: 'service_resource_reference',
    targetId: resource.id,
    metadata: {
      outcome: result.outcome,
      changes,
      dryRun: result.dryRun,
      operator: {
        actor: operator.actor,
        accountId: operator.accountId,
        username: operator.username,
        label: operator.label,
        command: 'assign-corporate-resource',
      },
      grantedToAccountId: account.id,
      grantedToUsername: account.username,
      serviceKey: product.key,
      planKey: plan.key,
      tenantSlug: tenant.slug,
      subdomain: tenant.subdomain,
      resourceType: resource.resourceType,
      serviceResourceId: resource.serviceResourceId,
      installationId: installation.id,
    },
  });

  if (changes.length > 0) {
    await repos.serviceControl.recordEvent({
      tenantId: tenant.id,
      installationId: installation.id,
      eventType: 'com.kpnsolute.platform.corporate_resource.assigned.v1',
      subject: `service_resource_reference/${resource.id}`,
      data: {
        accountId: account.id,
        tenantId: tenant.id,
        tenantSlug: tenant.slug,
        tenantClass: tenant.tenantClass,
        subdomain: tenant.subdomain,
        serviceKey: product.key,
        installationId: installation.id,
        resourceType: resource.resourceType,
        serviceResourceId: resource.serviceResourceId,
        changes,
      },
    });
  }

  return result;
}

/** The audited actor for one run, already proven to be someone other than the grantee. */
interface ResolvedOperator {
  /** `account` when a KpnSolute account was named, `system` when none was. */
  actor: 'account' | 'system';
  accountId: Id | null;
  username: string | null;
  label: string | null;
}

async function resolveOperator(
  repos: Repositories,
  operator: CorporateAssignmentOperator | undefined,
  futureOwner: User,
): Promise<ResolvedOperator> {
  const accountId = operator?.accountId?.trim() || null;
  const username = operator?.username?.trim() || null;
  const label = operator?.label?.trim() || null;

  if (!accountId && !username) {
    // No account was claimed. Record that truthfully rather than borrowing the
    // grantee's identity to fill the column.
    return { actor: 'system', accountId: null, username: null, label };
  }

  const resolved = await resolveExactlyOneAccount(repos, { accountId, username });
  if (resolved.id === futureOwner.id) {
    throw ApiError.validation(
      `Account ${resolved.id} is the account being granted ownership, so it cannot also be the operator running the command. Supply the operator's own account, or omit the operator selector to record a null actor.`,
    );
  }
  return { actor: 'account', accountId: resolved.id, username: resolved.username, label };
}

async function ensureCorporationTenant(
  db: Db,
  repos: Repositories,
  input: {
    account: User;
    tenant: { name: string; slug: string; subdomain: string };
    changes: string[];
  },
): Promise<{ tenant: Tenant; createdTenant: boolean }> {
  const { name, slug, subdomain } = input.tenant;
  const existing = await repos.tenants.findBySlug(slug);

  if (!existing) {
    const holder = await repos.tenants.findBySubdomain(subdomain);
    if (holder) {
      throw ApiError.conflict(
        `The subdomain "${subdomain}" already belongs to tenant "${holder.slug}". Refusing to move a corporate runtime host.`,
      );
    }
    // Reuses the same provisioning path as create.kpnsolute.com so a
    // bootstrapped corporation is indistinguishable from a self-served one.
    const created = await createTenantWithOwner(db, repos, {
      tenantClass: 'corporation',
      name,
      slug,
      subdomain,
      ownerUserId: input.account.id,
    });
    input.changes.push(`created the ${slug} corporation with an active owner membership`);
    return { tenant: created, createdTenant: true };
  }

  if (existing.status !== 'active') {
    throw ApiError.conflict(
      `Tenant "${existing.slug}" is ${existing.status}. Refusing to assign a resource to a tenant that is not active.`,
    );
  }
  if (existing.tenantClass !== 'corporation') {
    throw ApiError.conflict(
      `Tenant "${existing.slug}" exists as a ${existing.tenantClass} (type "${existing.type}"). Changing a tenant's class changes how it is addressed and is a Platform decision, not a bootstrap side effect.`,
    );
  }
  if (existing.subdomain && existing.subdomain.toLowerCase() !== subdomain) {
    throw ApiError.conflict(
      `Tenant "${existing.slug}" is already addressed at "${existing.subdomain}.kpnsolute.com". Refusing to re-point a live corporate runtime host.`,
    );
  }
  if (!existing.subdomain) {
    const holder = await repos.tenants.findBySubdomain(subdomain);
    if (holder && holder.id !== existing.id) {
      throw ApiError.conflict(
        `The subdomain "${subdomain}" already belongs to tenant "${holder.slug}".`,
      );
    }
    const updated = await repos.tenants.setSubdomain(existing.id, subdomain);
    input.changes.push(`assigned the ${subdomain} corporate subdomain`);
    return { tenant: updated, createdTenant: false };
  }

  return { tenant: existing, createdTenant: false };
}

async function ensureResourceReference(
  repos: Repositories,
  input: {
    installationId: Id;
    tenantId: Id;
    resource: CorporateAssignmentRequest['resource'];
    changes: string[];
  },
): Promise<ServiceResourceReference> {
  const { resourceType, serviceResourceId } = input.resource;
  const displayName = input.resource.displayName?.trim() || null;
  const metadata = input.resource.metadata ?? {};

  const references = await repos.serviceControl.findResourceReferences(
    resourceType,
    serviceResourceId,
  );

  for (const reference of references) {
    if (reference.installationId === input.installationId) continue;
    const owner = await repos.installations.findById(reference.installationId);
    if (owner && owner.tenantId !== input.tenantId) {
      throw ApiError.conflict(
        `Resource ${resourceType}/${serviceResourceId} is already referenced by tenant ${owner.tenantId}. Refusing a cross-tenant reassignment.`,
      );
    }
    throw ApiError.conflict(
      `Resource ${resourceType}/${serviceResourceId} is already referenced by installation ${reference.installationId}. Refusing to reference one resource from two installations.`,
    );
  }

  const existing = references.find(
    (reference) => reference.installationId === input.installationId,
  );
  if (existing && !referenceNeedsUpdate(existing, displayName, metadata)) {
    return existing;
  }

  const resource = await repos.serviceControl.upsertResource({
    installationId: input.installationId,
    resourceType,
    serviceResourceId,
    displayName,
    metadata,
  });
  input.changes.push(
    existing
      ? `refreshed the ${resourceType}/${serviceResourceId} reference`
      : `linked ${resourceType}/${serviceResourceId} to the installation`,
  );
  return resource;
}

function referenceNeedsUpdate(
  existing: ServiceResourceReference,
  displayName: string | null,
  metadata: Record<string, unknown>,
): boolean {
  if (existing.status !== 'active') return true;
  if (displayName && existing.displayName !== displayName) return true;
  return Object.entries(metadata).some(
    ([key, value]) => JSON.stringify(existing.metadata?.[key]) !== JSON.stringify(value),
  );
}
