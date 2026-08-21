import type { ReactNode } from 'react';

export interface NavItem {
  key: string;
  label: string;
  href: string;
  active?: boolean;
}

export interface AppShellProps {
  productName: string;
  navItems?: NavItem[];
  headerActions?: ReactNode;
  children: ReactNode;
}

export function AppShell({ productName, navItems = [], headerActions, children }: AppShellProps) {
  return (
    <div className="kpn-root">
      <header
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: 'var(--kpn-space-4) var(--kpn-space-6)',
          borderBottom: '1px solid var(--kpn-color-border)',
          background: 'var(--kpn-color-surface)',
        }}
      >
        <a
          href="/"
          className="kpn-focusable"
          style={{ fontWeight: 700, fontSize: 'var(--kpn-font-size-lg)', textDecoration: 'none' }}
        >
          KpnSolute{' '}
          <span style={{ color: 'var(--kpn-color-text-muted)', fontWeight: 500 }}>
            {productName}
          </span>
        </a>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--kpn-space-3)' }}>
          {headerActions}
        </div>
      </header>
      <div style={{ display: 'flex', minHeight: 'calc(100vh - 65px)' }}>
        {navItems.length > 0 ? (
          <nav
            aria-label={`${productName} navigation`}
            style={{
              width: 232,
              flexShrink: 0,
              borderRight: '1px solid var(--kpn-color-border)',
              padding: 'var(--kpn-space-4)',
              display: 'flex',
              flexDirection: 'column',
              gap: 'var(--kpn-space-1)',
            }}
          >
            {navItems.map((item) => (
              <a
                key={item.key}
                href={item.href}
                aria-current={item.active ? 'page' : undefined}
                className="kpn-focusable"
                style={{
                  padding: 'var(--kpn-space-2) var(--kpn-space-3)',
                  borderRadius: 'var(--kpn-radius-md)',
                  textDecoration: 'none',
                  color: item.active ? 'var(--kpn-color-accent-strong)' : 'var(--kpn-color-text)',
                  background: item.active ? 'var(--kpn-color-info-bg)' : 'transparent',
                  fontWeight: item.active ? 600 : 500,
                  fontSize: 'var(--kpn-font-size-sm)',
                }}
              >
                {item.label}
              </a>
            ))}
          </nav>
        ) : null}
        <main style={{ flex: 1, padding: 'var(--kpn-space-6)', maxWidth: 1040 }}>{children}</main>
      </div>
    </div>
  );
}
