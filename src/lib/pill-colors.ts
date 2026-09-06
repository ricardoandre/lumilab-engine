// Soft-tint pill palette for the "Ledger" design — maps the same antd Tag
// color names already stored on FieldOption/select options (gold, green,
// red, ...) to a muted, warm-paper-consistent {bg, fg} pair, used by
// StatusPill instead of antd's stock Tag chip.
export const PILL_COLORS: Record<string, { bg: string; fg: string }> = {
  default: { bg: '#f1e9da', fg: '#8a6a2f' },
  blue: { bg: '#e2e6ee', fg: '#26344b' },
  gold: { bg: '#f6e9c9', fg: '#9c6b14' },
  cyan: { bg: '#dcecec', fg: '#1f6060' },
  green: { bg: '#dcebe0', fg: '#2f6846' },
  purple: { bg: '#e6e0ee', fg: '#5b3f8c' },
  red: { bg: '#f1dcd8', fg: '#a23b2e' },
  volcano: { bg: '#f1e0d6', fg: '#a04e2a' },
  lime: { bg: '#e8edd8', fg: '#5c7a29' },
};

export function pillColor(token?: string | null) {
  return PILL_COLORS[token ?? 'default'] ?? PILL_COLORS.default;
}
