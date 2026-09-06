// Pill-shaped tab bar with a count badge per tab — matches NocoBase's own
// Production/Sample list views ("Planning 41", "Done 28", ...), which Andre
// pointed to as the reference for tabs-with-counts. Replaces antd's default
// underline <Tabs>.
export interface PillTabItem {
  key: string;
  label: string;
  count?: number;
}

export function PillTabs({
  items,
  activeKey,
  onChange,
}: {
  items: PillTabItem[];
  activeKey: string;
  onChange: (key: string) => void;
}) {
  return (
    <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 4, marginBottom: 16 }}>
      {items.map((item) => {
        const active = item.key === activeKey;
        return (
          <button
            key={item.key}
            onClick={() => onChange(item.key)}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              padding: '9px 16px',
              borderRadius: 999,
              border: active ? '1px solid #26344b' : '1px solid #e7e2d9',
              background: active ? '#26344b' : '#fff',
              color: active ? '#fff' : '#211f1c',
              fontSize: 14,
              fontWeight: 500,
              cursor: 'pointer',
              whiteSpace: 'nowrap',
              flexShrink: 0,
            }}
          >
            {item.label}
            {item.count !== undefined && (
              <span
                style={{
                  fontSize: 11,
                  fontWeight: 600,
                  padding: '0 7px',
                  borderRadius: 999,
                  background: active ? 'rgba(255,255,255,0.2)' : '#efebe3',
                  color: active ? '#fff' : '#726c63',
                }}
              >
                {item.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
