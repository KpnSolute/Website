import { crossAppUrl, useSession } from '@kpn/app-runtime';
import { Button, Card } from '@kpn/design-system';
import { IS_DEV } from '../env';

const SHARED_SERVICES: {
  key: 'accounts' | 'platform' | 'create' | 'billing' | 'link' | 'flow';
  name: string;
  description: string;
}[] = [
  {
    key: 'accounts',
    name: 'Accounts',
    description: 'Personal identity, security, and organizations.',
  },
  {
    key: 'platform',
    name: 'Platform',
    description: 'Organization control plane for every KpnSolute product.',
  },
  { key: 'create', name: 'Create', description: 'Provision a new service and workspace.' },
  {
    key: 'billing',
    name: 'Billing',
    description: 'Subscriptions, invoices, payment methods, and usage.',
  },
  {
    key: 'link',
    name: 'Link',
    description: 'Connections, credentials, and webhook delivery health.',
  },
  {
    key: 'flow',
    name: 'Flow',
    description: 'Cross-product workflow authoring and run monitoring.',
  },
];

export function HomePage() {
  const { status, user, signOut } = useSession();

  return (
    <div className="kpn-root">
      <header
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: 'var(--kpn-space-4) var(--kpn-space-6)',
          borderBottom: '1px solid var(--kpn-color-border)',
        }}
      >
        <strong style={{ fontSize: 'var(--kpn-font-size-lg)' }}>KpnSolute</strong>
        {status === 'signed-in' && user ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--kpn-space-3)' }}>
            <a href={crossAppUrl('accounts', '/', IS_DEV)}>{user.displayName}</a>
            <Button variant="secondary" onClick={() => void signOut()}>
              Sign out
            </Button>
          </div>
        ) : (
          <a href={crossAppUrl('platform', '/', IS_DEV)} className="kpn-focusable">
            <Button>Log into Platform</Button>
          </a>
        )}
      </header>

      <main
        style={{
          maxWidth: 960,
          margin: '0 auto',
          padding: 'var(--kpn-space-7) var(--kpn-space-6)',
        }}
      >
        <h1 style={{ fontSize: 'var(--kpn-font-size-2xl)', marginBottom: 'var(--kpn-space-2)' }}>
          One account for every KpnSolute product.
        </h1>
        <p
          style={{
            color: 'var(--kpn-color-text-muted)',
            maxWidth: 560,
            marginBottom: 'var(--kpn-space-6)',
          }}
        >
          Identity, organizations, provisioning, billing, integrations, and automation share one
          secure commercial foundation without erasing each product&apos;s identity.
        </p>

        {/* Platform is the organization resource manager. Tenant staff do not
            come through here: they sign in inside their own product workspace
            (docs/ROUTE_REGISTRY.md section 1). */}
        <div
          style={{
            display: 'flex',
            gap: 'var(--kpn-space-3)',
            marginBottom: 'var(--kpn-space-6)',
            flexWrap: 'wrap',
          }}
        >
          <a href={crossAppUrl('platform', '/', IS_DEV)} className="kpn-focusable">
            <Button>Log into Platform</Button>
          </a>
          <a href={crossAppUrl('accounts', '/', IS_DEV)} className="kpn-focusable">
            <Button variant="secondary">Manage your account</Button>
          </a>
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
            gap: 'var(--kpn-space-4)',
          }}
        >
          {SHARED_SERVICES.map((service) => (
            <Card key={service.key} title={service.name} description={service.description}>
              <a href={crossAppUrl(service.key, '/', IS_DEV)} className="kpn-focusable">
                Open {service.name} &rarr;
              </a>
            </Card>
          ))}
        </div>
      </main>
    </div>
  );
}
