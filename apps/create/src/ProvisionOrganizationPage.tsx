import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { Alert, Button, Card, SelectField, Spinner, TextField } from '@kpn/design-system';
import {
  inspectTenantRouting,
  isReservedWorkspaceSlug,
  isServiceKey,
  tenantManagementUrl,
  tenantRuntimeUrl,
  type Product,
  type ProductInstallation,
  type ProductPlan,
  type Tenant,
  type TenantClass,
  type TenantRouting,
} from '@kpn/contracts';

/**
 * The Create provisioning flow: name an organization, choose how it is
 * addressed, pick a service and plan, and provision it.
 *
 * Both commercial tenant classes are created here (ADR-0007). The class decides
 * addressing only:
 *
 *   organization  slug-addressed, {service}.kpnsolute.com/workspaces/{slug}
 *   corporation   subdomain-addressed, {subdomain}.kpnsolute.com
 *
 * Routing is validated against the shared contract before submit so an
 * unreachable or reserved hostname is caught here rather than becoming a tenant
 * that exists but cannot be routed to. The server re-validates: this is a
 * usability check, never the authority.
 */

export interface ServiceCatalogEntry {
  product: Product;
  plans: ProductPlan[];
}

export interface ProvisionResult {
  tenant: Tenant;
  installation: ProductInstallation;
}

export interface ProvisionOrganizationPageProps {
  loadServices: () => Promise<ServiceCatalogEntry[]>;
  provision: (input: {
    name: string;
    slug: string;
    tenantClass: TenantClass;
    subdomain?: string;
    serviceKey: string;
    planKey: string;
  }) => Promise<ProvisionResult>;
  /** Preselects the service when the flow was entered at /{service}/new. */
  presetServiceKey?: string;
}

type CatalogState =
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'ready'; services: ServiceCatalogEntry[] };

/** A predictable slug suggestion; the person can always override it. */
export function suggestSlug(name: string): string {
  return name
    .normalize('NFKD')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 63)
    .replace(/-+$/, '');
}

export function ProvisionOrganizationPage({
  loadServices,
  provision,
  presetServiceKey,
}: ProvisionOrganizationPageProps) {
  const [catalog, setCatalog] = useState<CatalogState>({ kind: 'loading' });
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [slugEdited, setSlugEdited] = useState(false);
  const [tenantClass, setTenantClass] = useState<TenantClass>('organization');
  const [subdomain, setSubdomain] = useState('');
  const [serviceKey, setServiceKey] = useState(presetServiceKey ?? '');
  const [planKey, setPlanKey] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ result: ProvisionResult; serviceKey: string } | null>(
    null,
  );

  const load = useCallback(async () => {
    setCatalog({ kind: 'loading' });
    try {
      const services = await loadServices();
      setCatalog({ kind: 'ready', services });
      const preferred =
        services.find((entry) => entry.product.key === presetServiceKey) ?? services[0];
      if (preferred) {
        setServiceKey((current) => current || preferred.product.key);
        setPlanKey((current) => current || (preferred.plans[0]?.key ?? ''));
      }
    } catch (error) {
      setCatalog({
        kind: 'error',
        message: error instanceof Error ? error.message : 'Could not load the service catalog.',
      });
    }
  }, [loadServices, presetServiceKey]);

  useEffect(() => {
    void load();
  }, [load]);

  const normalizedSlug = slug.trim().toLowerCase();
  const normalizedSubdomain = subdomain.trim().toLowerCase();

  const routingIssues = useMemo(() => {
    if (!normalizedSlug) return [];
    const routing: TenantRouting = {
      tenantClass,
      slug: normalizedSlug,
      subdomain: tenantClass === 'corporation' ? normalizedSubdomain || null : null,
    };
    const issues = inspectTenantRouting(routing);
    if (isReservedWorkspaceSlug(normalizedSlug)) {
      issues.unshift({
        field: 'slug',
        reason: `"${normalizedSlug}" is a reserved route and cannot be used as a workspace slug.`,
      });
    }
    return issues;
  }, [tenantClass, normalizedSlug, normalizedSubdomain]);

  const selectedService =
    catalog.kind === 'ready'
      ? catalog.services.find((entry) => entry.product.key === serviceKey)
      : undefined;

  function onNameChange(value: string) {
    setName(value);
    if (!slugEdited) setSlug(suggestSlug(value));
  }

  function onServiceChange(value: string) {
    setServiceKey(value);
    if (catalog.kind !== 'ready') return;
    const next = catalog.services.find((entry) => entry.product.key === value);
    setPlanKey(next?.plans[0]?.key ?? '');
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setFormError(null);
    const blocker = routingIssues[0];
    if (blocker) {
      setFormError(blocker.reason);
      return;
    }
    if (!serviceKey || !planKey) {
      setFormError('Choose a service and a plan.');
      return;
    }
    setBusy(true);
    try {
      const provisioned = await provision({
        name: name.trim(),
        slug: normalizedSlug,
        tenantClass,
        subdomain: tenantClass === 'corporation' ? normalizedSubdomain : undefined,
        serviceKey,
        planKey,
      });
      setResult({ result: provisioned, serviceKey });
    } catch (error) {
      setFormError(error instanceof Error ? error.message : 'Could not create the organization.');
    } finally {
      setBusy(false);
    }
  }

  if (result) {
    return <ProvisionedSummary result={result.result} serviceKey={result.serviceKey} />;
  }

  if (catalog.kind === 'loading') {
    return (
      <Card title="Create an organization">
        <div style={{ display: 'grid', placeItems: 'center', padding: 32 }}>
          <Spinner />
        </div>
      </Card>
    );
  }

  if (catalog.kind === 'error') {
    return (
      <Card title="Create an organization">
        <Alert tone="danger" title="Could not load the service catalog">
          {catalog.message}
        </Alert>
        <div style={{ marginTop: 16 }}>
          <Button onClick={() => void load()}>Try again</Button>
        </div>
      </Card>
    );
  }

  const subdomainIssue = routingIssues.find((issue) => issue.field === 'subdomain');
  const slugIssue = routingIssues.find((issue) => issue.field === 'slug');

  return (
    <Card
      title="Create an organization"
      description="Choose how this tenant is addressed. A corporation gets its own subdomain; an organization is addressed by slug."
    >
      {formError && (
        <Alert tone="danger" title="Could not create the organization">
          {formError}
        </Alert>
      )}
      <form onSubmit={submit} style={{ display: 'grid', gap: 16, marginTop: 16 }}>
        <TextField
          label="Name"
          value={name}
          onChange={(event) => onNameChange(event.target.value)}
          required
          maxLength={120}
        />
        <TextField
          label="Slug"
          value={slug}
          onChange={(event) => {
            setSlugEdited(true);
            setSlug(event.target.value);
          }}
          required
          autoCapitalize="none"
          spellCheck={false}
          hint="Lowercase letters, numbers, and hyphens. Used in management and API paths."
          error={slugIssue?.reason}
        />

        <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
          <legend style={{ fontSize: 'var(--kpn-font-size-sm)', fontWeight: 600 }}>
            Tenant class
          </legend>
          <label style={{ display: 'block', marginTop: 8 }}>
            <input
              type="radio"
              name="tenantClass"
              value="organization"
              checked={tenantClass === 'organization'}
              onChange={() => setTenantClass('organization')}
            />{' '}
            Organization — addressed at{' '}
            <code>
              {serviceKey || 'service'}.kpnsolute.com/workspaces/{normalizedSlug || 'slug'}
            </code>
          </label>
          <label style={{ display: 'block', marginTop: 8 }}>
            <input
              type="radio"
              name="tenantClass"
              value="corporation"
              checked={tenantClass === 'corporation'}
              onChange={() => setTenantClass('corporation')}
            />{' '}
            Corporation — addressed at its own subdomain
          </label>
        </fieldset>

        {tenantClass === 'corporation' && (
          <TextField
            label="Subdomain"
            value={subdomain}
            onChange={(event) => setSubdomain(event.target.value)}
            required
            autoCapitalize="none"
            spellCheck={false}
            hint={`Becomes ${normalizedSubdomain || 'name'}.kpnsolute.com. Reserved KpnSolute names cannot be used.`}
            error={subdomainIssue?.reason}
          />
        )}

        <SelectField
          label="Service"
          value={serviceKey}
          onChange={(event) => onServiceChange(event.target.value)}
          required
        >
          <option value="">Choose a service</option>
          {catalog.services.map((entry) => (
            <option key={entry.product.id} value={entry.product.key}>
              {entry.product.name}
            </option>
          ))}
        </SelectField>

        <SelectField
          label="Plan"
          value={planKey}
          onChange={(event) => setPlanKey(event.target.value)}
          required
          hint={
            selectedService && selectedService.plans.length === 0
              ? 'This service has no approved plans yet.'
              : undefined
          }
        >
          <option value="">Choose a plan</option>
          {(selectedService?.plans ?? []).map((plan) => (
            <option key={plan.id} value={plan.key}>
              {plan.name}
            </option>
          ))}
        </SelectField>

        <Button type="submit" loading={busy} disabled={routingIssues.length > 0}>
          Create organization
        </Button>
      </form>
    </Card>
  );
}

function ProvisionedSummary({
  result,
  serviceKey,
}: {
  result: ProvisionResult;
  serviceKey: string;
}) {
  const { tenant } = result;
  const routing: TenantRouting = {
    tenantClass: tenant.tenantClass,
    slug: tenant.slug,
    subdomain: tenant.subdomain,
    customDomain: tenant.customDomain,
  };
  // The service key comes from the registry-backed catalog, but this narrows it
  // rather than asserting: an unregistered key means no product link, not a
  // fabricated one.
  const service = isServiceKey(serviceKey) ? serviceKey : null;
  const addressable = inspectTenantRouting(routing).length === 0;

  return (
    <Card
      title={`${tenant.name} is provisioned`}
      description="The organization, its owner membership, and the service installation were created together."
    >
      <ul>
        {service ? (
          <li>
            Management: <a href={tenantManagementUrl(service, routing)}>Open in Platform</a>
          </li>
        ) : null}
        {service && addressable ? (
          <li>
            Runtime: <code>{tenantRuntimeUrl(service, routing)}</code>
          </li>
        ) : null}
      </ul>
      <p style={{ color: 'var(--kpn-color-text-muted)', marginBottom: 0 }}>
        Runtime availability depends on the product deployment and, for a corporation, on its
        subdomain being bound at the edge.
      </p>
    </Card>
  );
}
