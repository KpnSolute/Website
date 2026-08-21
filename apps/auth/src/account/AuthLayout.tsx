import type { ReactNode } from 'react';

/** Shared chrome for the direct KpnAuth account pages. */
export function AuthLayout({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <main className="kpn-root" style={{ display: 'grid', placeItems: 'center', padding: 24 }}>
      <div style={{ width: '100%', maxWidth: 480 }}>
        <p style={{ fontWeight: 700, fontSize: 18 }}>
          KpnSolute <span style={{ color: 'var(--kpn-color-text-muted)' }}>Auth</span>
        </p>
        <h1 style={{ fontSize: 'var(--kpn-font-size-2xl)', margin: '0 0 4px' }}>{title}</h1>
        {description ? (
          <p style={{ color: 'var(--kpn-color-text-muted)', marginTop: 0 }}>{description}</p>
        ) : null}
        {children}
      </div>
    </main>
  );
}
