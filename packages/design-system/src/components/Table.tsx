import type { ReactNode } from 'react';

export interface Column<T> {
  key: string;
  header: ReactNode;
  render: (row: T) => ReactNode;
  align?: 'left' | 'right';
}

export interface TableProps<T> {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  emptyLabel?: ReactNode;
}

export function Table<T>({ columns, rows, rowKey, emptyLabel = 'No data yet.' }: TableProps<T>) {
  if (rows.length === 0) {
    return (
      <p style={{ color: 'var(--kpn-color-text-muted)', fontSize: 'var(--kpn-font-size-sm)' }}>
        {emptyLabel}
      </p>
    );
  }

  return (
    <table
      style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--kpn-font-size-sm)' }}
    >
      <thead>
        <tr>
          {columns.map((column) => (
            <th
              key={column.key}
              scope="col"
              style={{
                textAlign: column.align ?? 'left',
                padding: 'var(--kpn-space-2) var(--kpn-space-3)',
                borderBottom: '1px solid var(--kpn-color-border)',
                color: 'var(--kpn-color-text-muted)',
                fontWeight: 600,
              }}
            >
              {column.header}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={rowKey(row)}>
            {columns.map((column) => (
              <td
                key={column.key}
                style={{
                  textAlign: column.align ?? 'left',
                  padding: 'var(--kpn-space-2) var(--kpn-space-3)',
                  borderBottom: '1px solid var(--kpn-color-border)',
                }}
              >
                {column.render(row)}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
