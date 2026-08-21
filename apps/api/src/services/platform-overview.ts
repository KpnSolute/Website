import type {
  Id,
  InstalledProductView,
  ServiceResourceReference,
  TenantOverview,
} from '@kpn/contracts';
import type { Repositories } from '../repositories/types.js';

/**
 * The Platform organization surface in one authorized read.
 *
 * Platform is the organization resource manager: it lists the tenants the
 * signed-in account may manage, the products installed in each, and the
 * discoverable references to service-owned resources. Resource payloads stay in
 * the owning product database (docs/DATA_OWNERSHIP.md) — this returns pointers
 * and safe summaries only.
 *
 * Membership is resolved from the immutable account id, so the result is
 * already scoped: a tenant the account is not an active member of never appears.
 */

export type { InstalledProductView, TenantOverview };

export async function platformOverviewForUser(
  repos: Repositories,
  userId: Id,
): Promise<TenantOverview[]> {
  const tenants = await repos.tenants.listForUser(userId);
  if (tenants.length === 0) return [];

  // Two set-based reads rather than a query per tenant and per installation:
  // an owner with many organizations should not cost a fan-out.
  const installed = await repos.installations.listForTenantsWithCatalog(
    tenants.map((tenant) => tenant.id),
  );
  const resources = await repos.serviceControl.listResourcesForInstallations(
    installed.map((entry) => entry.installation.id),
  );

  const resourcesByInstallation = new Map<Id, ServiceResourceReference[]>();
  for (const resource of resources) {
    const bucket = resourcesByInstallation.get(resource.installationId);
    if (bucket) bucket.push(resource);
    else resourcesByInstallation.set(resource.installationId, [resource]);
  }

  const installedByTenant = new Map<Id, InstalledProductView[]>();
  for (const entry of installed) {
    const view: InstalledProductView = {
      ...entry,
      resources: resourcesByInstallation.get(entry.installation.id) ?? [],
    };
    const bucket = installedByTenant.get(entry.installation.tenantId);
    if (bucket) bucket.push(view);
    else installedByTenant.set(entry.installation.tenantId, [view]);
  }

  return tenants.map((tenant) => ({
    tenant,
    installedProducts: installedByTenant.get(tenant.id) ?? [],
  }));
}
