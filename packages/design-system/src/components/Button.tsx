import { forwardRef } from 'react';
import type { ButtonHTMLAttributes } from 'react';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  loading?: boolean;
}

const VARIANT_STYLE: Record<ButtonVariant, React.CSSProperties> = {
  primary: {
    background: 'var(--kpn-color-accent)',
    color: 'var(--kpn-color-accent-contrast)',
    border: '1px solid transparent',
  },
  secondary: {
    background: 'var(--kpn-color-surface)',
    color: 'var(--kpn-color-text)',
    border: '1px solid var(--kpn-color-border-strong)',
  },
  ghost: {
    background: 'transparent',
    color: 'var(--kpn-color-text)',
    border: '1px solid transparent',
  },
  danger: {
    background: 'var(--kpn-color-danger)',
    color: '#ffffff',
    border: '1px solid transparent',
  },
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'primary', loading = false, disabled, style, children, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      className="kpn-focusable"
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 'var(--kpn-space-2)',
        padding: '10px 16px',
        borderRadius: 'var(--kpn-radius-md)',
        fontSize: 'var(--kpn-font-size-md)',
        fontWeight: 600,
        cursor: disabled || loading ? 'not-allowed' : 'pointer',
        opacity: disabled || loading ? 0.6 : 1,
        transition: 'filter 0.15s ease',
        ...VARIANT_STYLE[variant],
        ...style,
      }}
      {...rest}
    >
      {loading ? <span aria-hidden="true">…</span> : null}
      {children}
    </button>
  );
});
