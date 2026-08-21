export interface TabItem {
  key: string;
  label: string;
}

export interface TabsProps {
  items: TabItem[];
  activeKey: string;
  onChange: (key: string) => void;
}

export function Tabs({ items, activeKey, onChange }: TabsProps) {
  return (
    <div
      role="tablist"
      style={{
        display: 'flex',
        gap: 'var(--kpn-space-2)',
        borderBottom: '1px solid var(--kpn-color-border)',
      }}
    >
      {items.map((item) => {
        const active = item.key === activeKey;
        return (
          <button
            key={item.key}
            role="tab"
            aria-selected={active}
            className="kpn-focusable"
            onClick={() => onChange(item.key)}
            style={{
              background: 'none',
              border: 'none',
              borderBottom: active ? '2px solid var(--kpn-color-accent)' : '2px solid transparent',
              color: active ? 'var(--kpn-color-text)' : 'var(--kpn-color-text-muted)',
              fontWeight: active ? 600 : 500,
              padding: 'var(--kpn-space-2) var(--kpn-space-1)',
              cursor: 'pointer',
              fontSize: 'var(--kpn-font-size-md)',
            }}
          >
            {item.label}
          </button>
        );
      })}
    </div>
  );
}
