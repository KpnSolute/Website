import type { ReactNode } from 'react';

export type AlertTone = 'info' | 'success' | 'warning' | 'danger';

export interface AlertProps {
  tone?: AlertTone;
  title: ReactNode;
  children?: ReactNode;
}

const TONE_STYLE: Record<AlertTone, { bg: string; fg: string }> = {
  info: { bg: 'var(--kpn-color-info-bg)', fg: 'var(--kpn-color-accent-strong)' },
  success: { bg: 'var(--kpn-color-success-bg)', fg: 'var(--kpn-color-success)' },
  warning: { bg: 'var(--kpn-color-warning-bg)', fg: 'var(--kpn-color-warning)' },
  danger: { bg: 'var(--kpn-color-danger-bg)', fg: 'var(--kpn-color-danger)' },
};

export function Alert({ tone = 'info', title, children }: AlertProps) {
  const palette = TONE_STYLE[tone];
  return (
    <div
      role={tone === 'danger' ? 'alert' : 'status'}
      style={{
        background: palette.bg,
        color: palette.fg,
        borderRadius: 'var(--kpn-radius-md)',
        padding: 'var(--kpn-space-4)',
        fontSize: 'var(--kpn-font-size-sm)',
      }}
    >
      <p style={{ margin: 0, fontWeight: 600 }}>{title}</p>
      {children ? (
        <div style={{ marginTop: 'var(--kpn-space-1)', color: 'inherit' }}>{children}</div>
      ) : null}
    </div>
  );
}

/** Standard "this environment isn't configured yet" banner for fail-closed states. */
export function SetupRequiredAlert({ what }: { what: string }) {
  return (
    <Alert tone="warning" title={`${what} is not configured in this environment.`}>
      This is a local implementation state, not a live capability. Set the required environment
      variables to enable it.
    </Alert>
  );
}
