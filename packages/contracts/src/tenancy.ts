import { RESERVED_SUBDOMAINS, ROOT_DOMAIN, type ServiceKey } from './registry';

/**
 * KpnCompute (and every product) supports two commercial tenant classes over one
 * tenant model. The class decides how the tenant is *addressed*, never what it
 * is allowed to do:
 *
 *   organization  standard SaaS tenant, addressed by slug path
 *                 compute.kpnsolute.com/workspaces/{slug}
 *
 *   corporation   enterprise tenant, addressed by a dedicated subdomain
 *                 {corporation}.kpnsolute.com
 *
 * A hostname or path is navigation context only. Authorization always resolves
 * from the immutable tenant id, never from the slug or host that was used to
 * arrive. See docs/ROUTE_REGISTRY.md.
 */
export type TenantClass = 'organization' | 'corporation';

export const TENANT_CLASSES: readonly TenantClass[] = ['organization', 'corporation'];

export function isTenantClass(value: string): value is TenantClass {
  return (TENANT_CLASSES as readonly string[]).includes(value);
}

export interface TenantRouting {
  tenantClass: TenantClass;
  slug: string;
  /** Present only for corporations; the verified first-level subdomain label. */
  subdomain?: string | null;
  /** Optional verified customer-owned domain, corporations only. */
  customDomain?: string | null;
}

const SLUG_PATTERN = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

export function isValidTenantSlug(value: string): boolean {
  return SLUG_PATTERN.test(value);
}

/**
 * A corporate subdomain must be a valid label AND must not collide with a
 * reserved platform or product hostname. This is the check that stops a tenant
 * from claiming `api`, `auth`, `billing`, `compute`, and so on.
 */
export function isAvailableCorporateSubdomain(value: string): boolean {
  if (!isValidTenantSlug(value)) return false;
  return !(RESERVED_SUBDOMAINS as readonly string[]).includes(value);
}

export interface TenantRoutingIssue {
  field: 'slug' | 'subdomain' | 'customDomain' | 'tenantClass';
  reason: string;
}

/** Validates a routing record before it is stored or rendered as a link. */
export function inspectTenantRouting(routing: TenantRouting): TenantRoutingIssue[] {
  const issues: TenantRoutingIssue[] = [];

  if (!isTenantClass(routing.tenantClass)) {
    issues.push({ field: 'tenantClass', reason: 'Unknown tenant class.' });
    return issues;
  }
  if (!isValidTenantSlug(routing.slug)) {
    issues.push({
      field: 'slug',
      reason:
        'Use 1–63 lowercase letters, numbers, or hyphens, not starting or ending with a hyphen.',
    });
  }

  if (routing.tenantClass === 'corporation') {
    if (!routing.subdomain) {
      issues.push({ field: 'subdomain', reason: 'A corporation requires a dedicated subdomain.' });
    } else if (!isValidTenantSlug(routing.subdomain)) {
      issues.push({ field: 'subdomain', reason: 'That subdomain is not a valid hostname label.' });
    } else if (!isAvailableCorporateSubdomain(routing.subdomain)) {
      issues.push({
        field: 'subdomain',
        reason: 'That subdomain is reserved by KpnSolute and cannot be assigned.',
      });
    }
  } else {
    // Organizations are addressed by path. Holding a subdomain would make the
    // tenant reachable two ways with different trust properties.
    if (routing.subdomain) {
      issues.push({
        field: 'subdomain',
        reason: 'Only a corporation may hold a dedicated subdomain.',
      });
    }
    if (routing.customDomain) {
      issues.push({
        field: 'customDomain',
        reason: 'Only a corporation may hold a verified custom domain.',
      });
    }
  }

  return issues;
}

/** The canonical runtime URL a person should be sent to for this tenant. */
export function tenantRuntimeUrl(service: ServiceKey, routing: TenantRouting): string {
  if (routing.tenantClass === 'corporation') {
    if (routing.customDomain) return `https://${routing.customDomain}`;
    if (!routing.subdomain) {
      throw new Error('A corporation must have a subdomain or a verified custom domain.');
    }
    return `https://${routing.subdomain}.${ROOT_DOMAIN}`;
  }
  if (!isValidTenantSlug(routing.slug)) throw new Error('Invalid tenant slug.');
  return `https://${service}.${ROOT_DOMAIN}/workspaces/${routing.slug}`;
}

/** Where an organization owner administers this tenant. Always Platform. */
export function tenantManagementUrl(service: ServiceKey, routing: TenantRouting): string {
  if (!isValidTenantSlug(routing.slug)) throw new Error('Invalid tenant slug.');
  return `https://platform.${ROOT_DOMAIN}/${service}/${routing.slug}`;
}

/**
 * Compatibility runtime paths that must keep resolving during migration. The
 * canonical URL is always first.
 */
export function tenantCompatibilityUrls(service: ServiceKey, routing: TenantRouting): string[] {
  const urls = [tenantRuntimeUrl(service, routing)];
  if (routing.tenantClass === 'corporation') {
    if (routing.customDomain && routing.subdomain) {
      urls.push(`https://${routing.subdomain}.${ROOT_DOMAIN}`);
    }
    urls.push(`https://${service}.${ROOT_DOMAIN}/workspaces/${routing.slug}`);
  }
  urls.push(`https://${service}.${ROOT_DOMAIN}/${routing.slug}`);
  return Array.from(new Set(urls));
}

/**
 * Resolve which tenant a request is addressing, from host and path together.
 * Returns null when neither identifies a tenant.
 */
export function resolveTenantFromRequest(
  hostname: string,
  pathname: string,
): { by: 'subdomain' | 'path'; value: string } | null {
  const host = hostname.trim().toLowerCase().replace(/\.$/, '');
  if (host.endsWith(`.${ROOT_DOMAIN}`)) {
    const label = host.slice(0, -`.${ROOT_DOMAIN}`.length);
    // A reserved label is a platform or product host, never a corporation.
    if (label && !label.includes('.') && isAvailableCorporateSubdomain(label)) {
      return { by: 'subdomain', value: label };
    }
  }
  const canonical = pathname.match(/^\/workspaces\/([^/]+)(?:\/|$)/i);
  if (canonical?.[1]) {
    const slug = decodeURIComponent(canonical[1]).toLowerCase();
    if (isValidTenantSlug(slug)) return { by: 'path', value: slug };
  }
  return null;
}
