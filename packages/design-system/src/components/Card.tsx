import type { HTMLAttributes, ReactNode } from 'react';

export interface CardProps extends Omit<HTMLAttributes<HTMLDivElement>, 'title'> {
  title?: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
}

export function Card({ title, description, actions, children, style, ...rest }: CardProps) {
  return (
    <div
      style={{
        background: 'var(--kpn-color-surface)',
        border: '1px solid var(--kpn-color-border)',
        borderRadius: 'var(--kpn-radius-lg)',
        boxShadow: 'var(--kpn-shadow-sm)',
        padding: 'var(--kpn-space-5)',
        ...style,
      }}
      {...rest}
    >
      {(title || actions) && (
        <div
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'space-between',
            gap: 'var(--kpn-space-4)',
            marginBottom: description ? 'var(--kpn-space-1)' : 'var(--kpn-space-4)',
          }}
        >
          {title ? (
            <h2 style={{ fontSize: 'var(--kpn-font-size-lg)', fontWeight: 600, margin: 0 }}>
              {title}
            </h2>
          ) : (
            <span />
          )}
          {actions ? (
            <div style={{ display: 'flex', gap: 'var(--kpn-space-2)' }}>{actions}</div>
          ) : null}
        </div>
      )}
      {description ? (
        <p
          style={{
            color: 'var(--kpn-color-text-muted)',
            fontSize: 'var(--kpn-font-size-sm)',
            marginTop: 0,
            marginBottom: 'var(--kpn-space-4)',
          }}
        >
          {description}
        </p>
      ) : null}
      {children}
    </div>
  );
}
