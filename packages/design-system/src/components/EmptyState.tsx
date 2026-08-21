import type { ReactNode } from 'react';

export interface EmptyStateProps {
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
}

export function EmptyState({ title, description, action }: EmptyStateProps) {
  return (
    <div
      style={{
        textAlign: 'center',
        padding: 'var(--kpn-space-7) var(--kpn-space-4)',
        color: 'var(--kpn-color-text-muted)',
      }}
    >
      <p
        style={{
          fontSize: 'var(--kpn-font-size-lg)',
          fontWeight: 600,
          color: 'var(--kpn-color-text)',
          margin: 0,
        }}
      >
        {title}
      </p>
      {description ? (
        <p
          style={{
            marginTop: 'var(--kpn-space-2)',
            marginBottom: action ? 'var(--kpn-space-4)' : 0,
          }}
        >
          {description}
        </p>
      ) : null}
      {action}
    </div>
  );
}
