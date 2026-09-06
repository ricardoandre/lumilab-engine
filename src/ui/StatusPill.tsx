import { pillColor } from '../lib/pill-colors';

// Soft-tint pill with a leading dot, replacing antd's stock <Tag> for every
// status/select-style field — matches the approved "Ledger" mockup exactly
// (pill shape, muted fill, dot+text same hue) rather than antd's default
// bordered rectangular chip.
export function StatusPill({ label, color, size }: { label: string; color?: string | null; size?: 'small' | 'default' }) {
  const { bg, fg } = pillColor(color);
  const small = size === 'small';
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: small ? 4 : 6,
        padding: small ? '1px 8px' : '2px 10px',
        borderRadius: 999,
        background: bg,
        color: fg,
        fontSize: small ? 11 : 12.5,
        fontWeight: 500,
        lineHeight: small ? '16px' : '20px',
        whiteSpace: 'nowrap',
      }}
    >
      <span style={{ width: small ? 5 : 6, height: small ? 5 : 6, borderRadius: '50%', background: fg, flexShrink: 0 }} />
      {label}
    </span>
  );
}
