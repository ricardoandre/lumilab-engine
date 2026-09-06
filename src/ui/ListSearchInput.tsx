'use client';

import { Input } from 'antd';
import { SearchOutlined } from '@ant-design/icons';

// THE search box. ListToolbar draws it for every resource list, and screens
// that aren't Refine lists (the Launch Report's card sections) draw the same
// one rather than a lookalike — Andre, 2026-08-28: "use the same ListEngine
// for consistency". Pill shape, size and icon live in one place, so a change
// to the control reaches every screen that has one.
//
// Presentational on purpose: it owns no debounce and no filter state. The
// toolbar's 350ms debounce is tied to Refine's filters/pagination and its
// first-run guard; a client-side screen filtering an already-loaded array
// wants neither. Both callers keep their own `value`/`onChange`.
export function ListSearchInput({
  value,
  onChange,
  placeholder,
  style,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  style?: React.CSSProperties;
}) {
  return (
    <Input
      allowClear
      className="kano-toolbar-input"
      prefix={<SearchOutlined style={{ color: '#9a9284' }} />}
      placeholder={placeholder ?? 'Search...'}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      style={{ flex: 1, ...style }}
    />
  );
}
