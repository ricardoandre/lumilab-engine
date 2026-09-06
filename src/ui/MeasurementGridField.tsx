'use client';

// Wide sub-table editor for FieldType 'measurementGrid' — one row per size
// (SKU option), one column per measurement dimension. Rendered as a real
// scrollable <table> rather than RepeatableListField's inline rows, since
// this has ~20 numeric columns. Rows with no size picked yet (skuOptionId
// null) still render, so orphaned rows from a bad import can be fixed
// directly here instead of via a script.

import { Select, InputNumber, Button } from 'antd';
import { DeleteOutlined, PlusOutlined } from '@ant-design/icons';
import type { MeasurementGridConfig } from '../lib/resource-config';
import { useRelationSelect } from '../lib/use-relation-select';

export function MeasurementGridField({ value, onChange, config }: {
  value?: any[];
  onChange?: (rows: any[]) => void;
  config: MeasurementGridConfig;
}) {
  const rows = value ?? [];
  const { relationKey, relation, columns, addLabel } = config;
  const selectProps = useRelationSelect(relation, {
    defaultValue: rows.map((r) => r[relationKey]).filter(Boolean),
  });

  function updateRow(i: number, patch: Record<string, any>) {
    const next = rows.slice();
    next[i] = { ...next[i], ...patch };
    onChange?.(next);
  }
  function removeRow(i: number) {
    onChange?.(rows.filter((_, idx) => idx !== i));
  }
  function addRow() {
    onChange?.([...rows, {}]);
  }

  // Pasting a block copied from Excel/Sheets (tab-separated columns,
  // newline-separated rows) fills cells starting at (rowIndex, colIndex),
  // extending into new rows automatically if the paste has more rows than
  // currently exist. Never extends into new COLUMNS — a paste wider than
  // the remaining columns just gets clipped, since the grid's column set is
  // fixed by config, not user-editable.
  function handlePaste(e: React.ClipboardEvent, rowIndex: number, colIndex: number) {
    const text = e.clipboardData?.getData('text/plain') ?? '';
    if (!text.includes('\t') && !text.includes('\n')) return; // single value — let the input handle it normally
    e.preventDefault();
    const grid = text
      .replace(/\r/g, '')
      .split('\n')
      .filter((line, idx, arr) => !(idx === arr.length - 1 && line === '')) // trailing blank line from a copied range
      .map((line) => line.split('\t').map((cell) => cell.trim()));

    const next = rows.slice();
    grid.forEach((line, r) => {
      const targetRowIndex = rowIndex + r;
      while (next.length <= targetRowIndex) next.push({});
      const patch: Record<string, any> = {};
      line.forEach((cell, c) => {
        const col = columns[colIndex + c];
        if (!col) return; // past the last column — clip rather than invent new ones
        if (cell === '') return; // blank cell in the pasted range — leave existing value alone
        const num = Number(cell.replace(/,/g, ''));
        if (!Number.isNaN(num)) patch[col.name] = num;
      });
      next[targetRowIndex] = { ...next[targetRowIndex], ...patch };
    });
    onChange?.(next);
  }

  return (
    <div>
      <div style={{ overflowX: 'auto', border: '1px solid #e7e2d9', borderRadius: 8 }}>
        <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 12.5 }}>
          <thead>
            <tr>
              <th style={{ ...thStyle, position: 'sticky', left: 0, background: '#faf9f6', zIndex: 1 }}>Size</th>
              {columns.map((c) => <th key={c.name} style={thStyle}>{c.label}</th>)}
              <th style={thStyle} />
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={row.id ?? `new-${i}`}>
                <td style={{ ...tdStyle, position: 'sticky', left: 0, background: '#fff', zIndex: 1 }}>
                  <Select
                    {...selectProps}
                    size="small"
                    style={{ width: 96 }}
                    value={row[relationKey]}
                    onChange={(v) => updateRow(i, { [relationKey]: v })}
                    placeholder="Size"
                  />
                </td>
                {columns.map((c, colIndex) => (
                  <td key={c.name} style={tdStyle}>
                    <InputNumber
                      size="small"
                      style={{ width: 64 }}
                      value={row[c.name]}
                      onChange={(v) => updateRow(i, { [c.name]: v })}
                      onPaste={(e) => handlePaste(e, i, colIndex)}
                    />
                  </td>
                ))}
                <td style={tdStyle}>
                  <Button size="small" icon={<DeleteOutlined />} onClick={() => removeRow(i)} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Button type="dashed" icon={<PlusOutlined />} onClick={addRow} block style={{ marginTop: 8 }}>{addLabel}</Button>
    </div>
  );
}

const thStyle: React.CSSProperties = {
  textAlign: 'left', padding: '6px 8px', fontSize: 10.5, fontWeight: 700, color: '#9a9284',
  textTransform: 'uppercase', letterSpacing: '0.03em', borderBottom: '1px solid #e7e2d9', whiteSpace: 'nowrap',
};
const tdStyle: React.CSSProperties = {
  padding: '4px 8px', borderBottom: '1px solid #f1eee7', whiteSpace: 'nowrap',
};
