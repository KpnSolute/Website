import { useId } from 'react';
import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes } from 'react';

const controlStyle: React.CSSProperties = {
  width: '100%',
  padding: '10px 12px',
  borderRadius: 'var(--kpn-radius-md)',
  border: '1px solid var(--kpn-color-border-strong)',
  background: 'var(--kpn-color-surface)',
  color: 'var(--kpn-color-text)',
  fontSize: 'var(--kpn-font-size-md)',
};

export interface TextFieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: ReactNode;
  hint?: ReactNode;
  error?: string;
}

export function TextField({ label, hint, error, id, style, ...rest }: TextFieldProps) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const hintId = hint ? `${inputId}-hint` : undefined;
  const errorId = error ? `${inputId}-error` : undefined;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--kpn-space-1)' }}>
      <label htmlFor={inputId} style={{ fontSize: 'var(--kpn-font-size-sm)', fontWeight: 600 }}>
        {label}
      </label>
      <input
        id={inputId}
        className="kpn-focusable"
        aria-describedby={[hintId, errorId].filter(Boolean).join(' ') || undefined}
        aria-invalid={Boolean(error) || undefined}
        style={{
          ...controlStyle,
          borderColor: error ? 'var(--kpn-color-danger)' : 'var(--kpn-color-border-strong)',
          ...style,
        }}
        {...rest}
      />
      {hint ? (
        <span
          id={hintId}
          style={{ fontSize: 'var(--kpn-font-size-sm)', color: 'var(--kpn-color-text-muted)' }}
        >
          {hint}
        </span>
      ) : null}
      {error ? (
        <span
          id={errorId}
          role="alert"
          style={{ fontSize: 'var(--kpn-font-size-sm)', color: 'var(--kpn-color-danger)' }}
        >
          {error}
        </span>
      ) : null}
    </div>
  );
}

export interface SelectFieldProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label: ReactNode;
  hint?: ReactNode;
}

export function SelectField({ label, hint, id, style, children, ...rest }: SelectFieldProps) {
  const generatedId = useId();
  const selectId = id ?? generatedId;
  const hintId = hint ? `${selectId}-hint` : undefined;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--kpn-space-1)' }}>
      <label htmlFor={selectId} style={{ fontSize: 'var(--kpn-font-size-sm)', fontWeight: 600 }}>
        {label}
      </label>
      <select
        id={selectId}
        className="kpn-focusable"
        aria-describedby={hintId}
        style={{ ...controlStyle, ...style }}
        {...rest}
      >
        {children}
      </select>
      {hint ? (
        <span
          id={hintId}
          style={{ fontSize: 'var(--kpn-font-size-sm)', color: 'var(--kpn-color-text-muted)' }}
        >
          {hint}
        </span>
      ) : null}
    </div>
  );
}
