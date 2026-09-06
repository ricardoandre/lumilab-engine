'use client';

// Repeatable sub-table row editor for FieldType 'repeatableList' — a picker
// plus N numeric columns, add/remove rows. Shared by Product's Materials
// (material + quantity) and Variants (size + web price + marketplace price)
// so the pattern isn't hand-built twice; Sample/Production can reuse it too.

import { useState } from 'react';
import { Select, InputNumber, DatePicker, Button, Tooltip, Input, Divider } from 'antd';
import { DeleteOutlined, PlusOutlined, ArrowUpOutlined, ArrowDownOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import type { RepeatableListConfig, RelationConfig } from '../lib/resource-config';
import { serializeFormDate, minFormDate, maxFormDate } from '../lib/form-dates';
import { useRelationSelect } from '../lib/use-relation-select';
import { useCreatableOptions } from '../lib/use-creatable-options';

// A relation-type column's picker — its own component (not inline in the row
// map) so its useRelationSelect call is a normal per-instance hook, not a hook
// called conditionally/in a loop inside the parent.
function RelationColumnSelect({ relation, value, onChange }: {
  relation: RelationConfig;
  value: any;
  onChange: (v: any) => void;
}) {
  const selectProps = useRelationSelect(relation, { defaultValue: value ?? undefined });
  return <Select {...selectProps} style={{ width: 140 }} value={value} onChange={onChange} placeholder="Select..." />;
}

export function RepeatableListField({ value, onChange, config }: {
  value?: any[];
  onChange?: (rows: any[]) => void;
  config: RepeatableListConfig;
}) {
  const rows = value ?? [];
  const { relationKey, relation, columns, addLabel, reorderable, firstRowBadge, fixedRows } = config;
  // Without a defaultValue, a row whose picked value falls outside the
  // picker's loaded options page renders as a raw id instead of its label
  // (Refine's useSelect only fetches labels for defaultValue on mount).
  const selectProps = useRelationSelect(relation, {
    defaultValue: relation && relationKey ? rows.map((r) => r[relationKey]).filter(Boolean) : undefined,
  });
  const creatable = useCreatableOptions(relation);
  const [newLabel, setNewLabel] = useState('');
  // What the user typed into the picker's own SEARCH box. Andre tried to add a
  // new element by typing its name there — the natural thing to do — got "no
  // matches" and concluded adding was broken, without noticing the separate box
  // at the foot of the dropdown. So the search text now flows into that box:
  // type the name once, press Add.
  const [search, setSearch] = useState('');
  const pendingLabel = newLabel || search;

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
  // Swap with the neighbour. The array order is the persisted order — the API
  // renumbers the `sort` column from it on save — so moving a row is just a
  // swap, no index bookkeeping in the row objects themselves.
  function moveRow(i: number, delta: number) {
    const j = i + delta;
    if (j < 0 || j >= rows.length) return;
    const next = rows.slice();
    [next[i], next[j]] = [next[j], next[i]];
    onChange?.(next);
  }

  return (
    <div>
      {rows.map((row, i) => (
        <div key={row.id ?? `new-${i}`} style={{ display: 'flex', gap: 8, marginBottom: 8, alignItems: 'center' }}>
          {reorderable && (
            <div style={{ display: 'flex', flexDirection: 'column', flexShrink: 0 }}>
              <Button
                size="small"
                type="text"
                icon={<ArrowUpOutlined style={{ fontSize: 11 }} />}
                disabled={i === 0}
                onClick={() => moveRow(i, -1)}
                style={{ height: 18, minWidth: 22, padding: 0 }}
              />
              <Button
                size="small"
                type="text"
                icon={<ArrowDownOutlined style={{ fontSize: 11 }} />}
                disabled={i === rows.length - 1}
                onClick={() => moveRow(i, 1)}
                style={{ height: 18, minWidth: 22, padding: 0 }}
              />
            </div>
          )}
          {reorderable && firstRowBadge && (
            <Tooltip title={i === 0 ? `First row = ${firstRowBadge}` : undefined}>
              <span
                style={{
                  flexShrink: 0, width: 40, textAlign: 'center', fontSize: 10, fontWeight: 700,
                  lineHeight: '18px', borderRadius: 4,
                  color: i === 0 ? '#166534' : '#94a3b8',
                  background: i === 0 ? '#dcfce7' : 'transparent',
                }}
              >
                {i === 0 ? firstRowBadge : i + 1}
              </span>
            </Tooltip>
          )}
          {relation && relationKey && (
            <Select
              {...selectProps}
              style={{ flex: 1 }}
              value={row[relationKey]}
              onChange={(v) => updateRow(i, { [relationKey]: v })}
              placeholder="Select..."
              options={creatable.merge(selectProps.options as { label: string; value: string }[] | undefined)}
              onSearch={relation.allowCreate
                ? (v: string) => { setSearch(v); setNewLabel(''); selectProps.onSearch?.(v); }
                : selectProps.onSearch}
              notFoundContent={relation.allowCreate && search.trim()
                ? <span style={{ fontSize: 12, color: '#9a9284' }}>No match — use Add below to create “{search.trim()}”.</span>
                : undefined}
              // Add-a-missing-option, for pickers that opt in. The new option is
              // selected into THIS row straight away — having to add it and then
              // find it again in the list is the friction this removes.
              popupRender={
                relation.allowCreate
                  ? (menu) => (
                      <>
                        {menu}
                        <Divider style={{ margin: '6px 0' }} />
                        <div style={{ display: 'flex', gap: 6, padding: '0 8px 6px' }}>
                          <Input
                            size="small"
                            value={pendingLabel}
                            placeholder={relation.allowCreate?.placeholder ?? 'Add new...'}
                            onChange={(e) => { setNewLabel(e.target.value); setSearch(''); }}
                            onKeyDown={(e) => e.stopPropagation()}
                            onPressEnter={async () => {
                              const id = await creatable.create(pendingLabel);
                              if (id) { updateRow(i, { [relationKey]: id }); setNewLabel(''); setSearch(''); }
                            }}
                          />
                          <Button
                            size="small"
                            type="text"
                            icon={<PlusOutlined />}
                            loading={creatable.busy}
                            disabled={!pendingLabel.trim()}
                            onClick={async () => {
                              const id = await creatable.create(pendingLabel);
                              if (id) { updateRow(i, { [relationKey]: id }); setNewLabel(''); setSearch(''); }
                            }}
                          >
                            Add
                          </Button>
                        </div>
                      </>
                    )
                  : undefined
              }
            />
          )}
          {(columns ?? []).map((col) =>
            col.type === 'relation' ? (
              <RelationColumnSelect
                key={col.name}
                relation={col.relation!}
                value={row[col.name]}
                onChange={(v) => updateRow(i, { [col.name]: v })}
              />
            ) : col.type === 'date' ? (
              <DatePicker
                key={col.name}
                placeholder={col.label}
                style={{ width: 140 }}
                minDate={minFormDate()}
                maxDate={maxFormDate()}
                value={row[col.name] ? dayjs(row[col.name]) : undefined}
                onChange={(d) => updateRow(i, { [col.name]: d ? serializeFormDate(d, true) : undefined })}
              />
            ) : (
              <InputNumber
                key={col.name}
                placeholder={col.label}
                style={{ width: 108 }}
                value={row[col.name]}
                onChange={(v) => updateRow(i, { [col.name]: v })}
              />
            ),
          )}
          {!fixedRows && <Button icon={<DeleteOutlined />} onClick={() => removeRow(i)} />}
        </div>
      ))}
      {/* Server-managed lists have nothing to add: every row that should exist
          already does (see RepeatableListConfig.fixedRows). */}
      {!fixedRows && <Button type="dashed" icon={<PlusOutlined />} onClick={addRow} block>{addLabel}</Button>}
    </div>
  );
}
