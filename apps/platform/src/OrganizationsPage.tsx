import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Badge, Button, Card, EmptyState, Spinner } from '@kpn/design-system';
import {
  inspectTenantRouting,
  isServiceKey,
  tenantManagementUrl,
  tenantRuntimeUrl,
  type ServiceKey,
  type TenantOverview,
  type TenantRouting,
} from '@kpn/contracts';

/**
 * The organization resource manager.
 *
 * Platform is where an authorized person selects and manages organizations and
 * their installed services. Two tenant classes are addressed differently and
 * that difference is managed here, not in a product runtime:
 *
 *   organization -> compute.kpnsolute.com/workspaces/{slug}
 *   corporation  -> {subdomain}.kpnsolute.com
 *
 * Provisioning is not done here. Creating a tenant is a reviewed multi-step
 * journey owned by create.kpnsolute.com (ADR-0007), so this page links to it
 * rather than carrying a second, divergent create form.
 *
 * Tenant staff never come here to do daily work; they sign in inside their own
 * product workspace. See docs/ROUTE_REGISTRY.md.
 */

export class UnauthorizedError extends Error {}

export interface OrganizationsPageProps {
  /**
   * Injected by the connected wrapper, which binds it to the authenticated
   * KpnSolute API client. Required, so this page can never fall back to an
   * unauthenticated cookie-only fetch.
   */
  loadOverview: () => Promise<TenantOverview[]>;
  /** Absolute URL of the real Create provisioning flow. */
  createHref: string;
}

type LoadState =
  | { kind: 'loading' }
  | { kind: 'unauthorized' }
  | { kind: 'error'; message: string }
  | { kind: 'ready'; organizations: TenantOverview[] };

export function OrganizationsPage({ loadOverview, createHref }: OrganizationsPageProps) {
  const [state, setState] = useState<LoadState>({ kind: 'loading' });

  const load = useCallback(async () => {
    setState({ kind: 'loading' });
    try {
      setState({ kind: 'ready', organizations: await loadOverview() });
    } catch (error) {
      if (error instanceof UnauthorizedError || isUnauthorized(error)) {
        setState({ kind: 'unauthorized' });
        return;
      }
      setState({
        kind: 'error',
        message: error instanceof Error ? error.message : 'Could not load organizations.',
      });
    }
  }, [loadOverview]);

  useEffect(() => {
    void load();
  }, [load]);

  if (state.kind === 'loading') {
    return (
      <Card title="Organizations">
        <div style={{ display: 'grid', placeItems: 'center', padding: 32 }}>
          <Spinner />
        </div>
      </Card>
    );
  }

  if (state.kind === 'unauthorized') {
    return (
      <Card title="Organizations">
        <Alert tone="danger" title="You do not have access to any organization">
          Your KpnSolute account is not a member of an organization, or your access was removed. Ask
          an organization owner to invite you.
        </Alert>
      </Card>
    );
  }

  if (state.kind === 'error') {
    return (
      <Card title="Organizations">
        <Alert tone="danger" title="Could not load your organizations">
          {state.message}
        </Alert>
        <div style={{ marginTop: 16 }}>
          <Button onClick={() => void load()}>Try again</Button>
        </div>
      </Card>
    );
  }

  return (
    <div style={{ display: 'grid', gap: 'var(--kpn-space-4)' }}>
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <Button onClick={() => window.location.assign(createHref)}>Create an organization</Button>
      </div>

      {state.organizations.length === 0 ? (
        <EmptyState
          title="No organizations yet"
          description="Create an organization to install KpnSolute services, invite people, and manage resources."
          action={
            <Button onClick={() => window.location.assign(createHref)}>
              Start the Create flow
            </Button>
          }
        />
      ) : (
        <div style={{ display: 'grid', gap: 'var(--kpn-space-3)' }}>
          {state.organizations.map((organization) => (
            <OrganizationCard key={organization.tenant.id} organization={organization} />
          ))}
        </div>
      )}
    </div>
  );
}

function OrganizationCard({ organization }: { organization: TenantOverview }) {
  const { tenant, installedProducts } = organization;
  const routing: TenantRouting = {
    tenantClass: tenant.tenantClass,
    slug: tenant.slug,
    subdomain: tenant.subdomain ?? null,
    customDomain: tenant.customDomain ?? null,
  };
  const issues = inspectTenantRouting(routing);
  // The launch target belongs to a product, so it is only built from a product
  // this organization actually has installed. A tenant with no installation has
  // nothing to launch, and guessing one would produce a link to nowhere.
  const primaryService = useMemo<ServiceKey | null>(() => {
    for (const entry of installedProducts) {
      if (isServiceKey(entry.productKey)) return entry.productKey;
    }
    return null;
  }, [installedProducts]);

  return (
    <Card
      title={tenant.name}
      description={
        tenant.tenantClass === 'corporation'
          ? 'Corporation — dedicated subdomain'
          : 'Organization — slug addressed'
      }
    >
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <Badge>{tenant.tenantClass}</Badge>
        {tenant.status !== 'active' && <Badge tone="warning">{tenant.status}</Badge>}
        <code>{tenant.slug}</code>
        {tenant.subdomain ? <code>{tenant.subdomain}.kpnsolute.com</code> : null}
      </div>

      {issues.length > 0 ? (
        <Alert tone="warning" title="This organization is not addressable">
          {issues[0]?.reason}
        </Alert>
      ) : (
        <div style={{ display: 'flex', gap: 12, marginTop: 12, flexWrap: 'wrap' }}>
          {primaryService ? (
            <a href={tenantRuntimeUrl(primaryService, routing)}>Launch &rarr;</a>
          ) : null}
          <a href={tenantManagementUrl(primaryService ?? 'platform', routing)}>Manage &rarr;</a>
        </div>
      )}

      <InstalledProducts organization={organization} />
    </Card>
  );
}

function InstalledProducts({ organization }: { organization: TenantOverview }) {
  const { installedProducts } = organization;
  if (installedProducts.length === 0) {
    return (
      <p style={{ marginBottom: 0, color: 'var(--kpn-color-text-muted)' }}>
        No KpnSolute service is installed in this organization yet.
      </p>
    );
  }

  return (
    <div style={{ display: 'grid', gap: 'var(--kpn-space-3)', marginTop: 'var(--kpn-space-4)' }}>
      <strong style={{ fontSize: 'var(--kpn-font-size-sm)' }}>Installed services</strong>
      {installedProducts.map((entry) => (
        <div
          key={entry.installation.id}
          style={{
            border: '1px solid var(--kpn-color-border)',
            borderRadius: 'var(--kpn-radius-md)',
            padding: 'var(--kpn-space-3)',
          }}
        >
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <span style={{ fontWeight: 600 }}>{entry.productName}</span>
            <Badge>{entry.planName}</Badge>
            <Badge tone={entry.installation.status === 'active' ? 'success' : 'warning'}>
              {entry.installation.status}
            </Badge>
          </div>
          {entry.resources.length === 0 ? (
            <p
              style={{
                margin: '8px 0 0',
                fontSize: 'var(--kpn-font-size-sm)',
                color: 'var(--kpn-color-text-muted)',
              }}
            >
              No resources are registered for this installation yet.
            </p>
          ) : (
            <ul style={{ margin: '8px 0 0', paddingLeft: 20 }}>
              {entry.resources.map((resource) => (
                <li key={resource.id} style={{ fontSize: 'var(--kpn-font-size-sm)' }}>
                  {resource.displayName ?? resource.serviceResourceId}{' '}
                  <span style={{ color: 'var(--kpn-color-text-muted)' }}>
                    ({resource.resourceType})
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      ))}
    </div>
  );
}

/** The API client raises its own error type; treat 401/403 as "no access". */
function isUnauthorized(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false;
  const status = (error as { status?: unknown }).status;
  return status === 401 || status === 403;
}
