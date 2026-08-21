import type { ReactNode } from 'react';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { AppShell, Button, Card } from '@kpn/design-system';
import { CallbackPage } from './CallbackPage';
import { RequireSession } from './RequireSession';
import { SessionProvider, useSession, type AppRuntimeConfig } from './SessionProvider';

export interface PortalSection {
  path: string;
  label: string;
  title: string;
  description: string;
  actions?: { label: string; href: string }[];
  /**
   * Real content for this section. When present it replaces the placeholder
   * card, so a portal can ship a working surface instead of a description.
   */
  content?: ReactNode;
}

export interface ManagedPortalProps {
  productName: string;
  config: AppRuntimeConfig;
  sections: PortalSection[];
}

function PortalPage({
  productName,
  sections,
}: Pick<ManagedPortalProps, 'productName' | 'sections'>) {
  const { user, signOut } = useSession();
  const path = window.location.pathname.replace(/\/$/, '') || '/';
  const section = sections.find((item) => item.path === path) ?? sections[0];
  if (!section) {
    throw new Error(`${productName} must define at least one portal section.`);
  }
  return (
    <AppShell
      productName={productName}
      navItems={sections.map((item) => ({
        key: item.path,
        label: item.label,
        href: item.path,
        active: item.path === section.path,
      }))}
      headerActions={
        <>
          <span style={{ color: 'var(--kpn-color-text-muted)' }}>{user?.displayName}</span>
          <Button variant="ghost" onClick={() => void signOut()}>
            Sign out
          </Button>
        </>
      }
    >
      <div style={{ display: 'grid', gap: 'var(--kpn-space-5)' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 'var(--kpn-font-size-2xl)' }}>{section.title}</h1>
          <p style={{ color: 'var(--kpn-color-text-muted)', maxWidth: 720 }}>
            {section.description}
          </p>
        </div>
        {section.content ?? (
          <Card
            title={section.label}
            description="This view uses the centralized KpnSolute identity and API boundary."
          >
            {section.actions?.length ? (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--kpn-space-3)' }}>
                {section.actions.map((action) => (
                  <a key={action.href} href={action.href}>
                    {action.label} &rarr;
                  </a>
                ))}
              </div>
            ) : (
              <p style={{ margin: 0, color: 'var(--kpn-color-text-muted)' }}>
                Customer records appear here only after the shared backend is configured and
                authorizes this account.
              </p>
            )}
          </Card>
        )}
      </div>
    </AppShell>
  );
}

export function ManagedPortal({ productName, config, sections }: ManagedPortalProps) {
  return (
    <SessionProvider config={config}>
      <BrowserRouter>
        <Routes>
          <Route path="/auth/callback" element={<CallbackPage successPath="/" />} />
          <Route
            path="*"
            element={
              <RequireSession>
                <PortalPage productName={productName} sections={sections} />
              </RequireSession>
            }
          />
        </Routes>
      </BrowserRouter>
    </SessionProvider>
  );
}
