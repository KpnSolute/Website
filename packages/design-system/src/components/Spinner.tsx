export function Spinner({ label = 'Loading' }: { label?: string }) {
  return (
    <div
      role="status"
      aria-live="polite"
      style={{ display: 'flex', alignItems: 'center', gap: 'var(--kpn-space-2)' }}
    >
      <span
        aria-hidden="true"
        style={{
          width: 16,
          height: 16,
          borderRadius: '50%',
          border: '2px solid var(--kpn-color-border-strong)',
          borderTopColor: 'var(--kpn-color-accent)',
          animation: 'kpn-spin 0.8s linear infinite',
          display: 'inline-block',
        }}
      />
      <span style={{ color: 'var(--kpn-color-text-muted)', fontSize: 'var(--kpn-font-size-sm)' }}>
        {label}
      </span>
      <style>{'@keyframes kpn-spin { to { transform: rotate(360deg); } }'}</style>
    </div>
  );
}
