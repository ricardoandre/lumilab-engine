'use client';

// Bare repeatable numeric-input list for FieldType 'numberList' — a column of
// InputNumbers with add/remove and a live running total. Used by the Material
// Ledger (In/Out) form for a transaction's roll/pack quantities, where the
// underlying rows are anonymous numbers, not relation+column rows (that's
// RepeatableListField). The form value is a plain `(number|null)[]`.

import { InputNumber, Button } from 'antd';
import { DeleteOutlined, PlusOutlined } from '@ant-design/icons';
import type { NumberListConfig } from '../lib/resource-config';
import { NumberGridField } from './NumberGridField';

export function NumberListField({ value, onChange, config }: {
  value?: (number | null)[];
  onChange?: (rows: (number | null)[]) => void;
  config: NumberListConfig;
}) {
  // Same value, Excel-like grid instead of add-a-row-at-a-time — see
  // NumberGridField and NumberListConfig.layout.
  if (config.layout === 'grid') return <NumberGridField value={value} onChange={onChange} config={config} />;
  const rows = value ?? [];
  const { addLabel, unit, itemLabel } = config;
  const total = rows.reduce((sum: number, n) => sum + (typeof n === 'number' ? n : 0), 0);

  function updateRow(i: number, v: number | null) {
    const next = rows.slice();
    next[i] = v;
    onChange?.(next);
  }
  function removeRow(i: number) {
    onChange?.(rows.filter((_, idx) => idx !== i));
  }
  function addRow() {
    onChange?.([...rows, null]);
  }

  return (
    <div>
      {rows.map((row, i) => (
        <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 8, alignItems: 'center' }}>
          {itemLabel && (
            <span style={{ width: 56, fontSize: 12.5, color: '#726c63', flexShrink: 0 }}>
              {itemLabel} {i + 1}
            </span>
          )}
          <InputNumber
            style={{ flex: 1 }}
            value={row}
            onChange={(v) => updateRow(i, v as number | null)}
            placeholder="Quantity"
          />
          <Button type="text" danger icon={<DeleteOutlined />} onClick={() => removeRow(i)} />
        </div>
      ))}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 4 }}>
        <Button type="dashed" icon={<PlusOutlined />} onClick={addRow}>
          {addLabel}
        </Button>
        <span style={{ fontSize: 12.5, color: '#726c63' }}>
          {rows.length} row{rows.length === 1 ? '' : 's'} · total{' '}
          <strong style={{ color: '#211f1c' }}>{total.toLocaleString()}{unit ? ` ${unit}` : ''}</strong>
        </span>
      </div>
    </div>
  );
}
