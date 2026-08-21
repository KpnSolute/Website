import type { ReactNode } from 'react';

export type BadgeTone = 'neutral' | 'accent' | 'success' | 'warning' | 'danger';

const TONE_STYLE: Record<BadgeTone, { bg: string; fg: string }> = {
  neutral: { bg: 'var(--kpn-color-surface-muted)', fg: 'var(--kpn-color-text-muted)' },
  accent: { bg: 'var(--kpn-color-info-bg)', fg: 'var(--kpn-color-accent-strong)' },
  success: { bg: 'var(--kpn-color-success-bg)', fg: 'var(--kpn-color-success)' },
  warning: { bg: 'var(--kpn-color-warning-bg)', fg: 'var(--kpn-color-warning)' },
  danger: { bg: 'var(--kpn-color-danger-bg)', fg: 'var(--kpn-color-danger)' },
};

export function Badge({ tone = 'neutral', children }: { tone?: BadgeTone; children: ReactNode }) {
  const palette = TONE_STYLE[tone];
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        background: palette.bg,
        color: palette.fg,
        borderRadius: 'var(--kpn-radius-pill)',
        padding: '2px 10px',
        fontSize: 'var(--kpn-font-size-sm)',
        fontWeight: 600,
      }}
    >
      {children}
    </span>
  );
}
