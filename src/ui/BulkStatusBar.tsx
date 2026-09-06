'use client';

// Appears above the list table once one or more rows are selected (see
// ResourceListTable's rowSelection, gated on config.quickStatusField) —
// lets a status be applied to every selected record in one action instead
// of opening each record individually.
import { useState } from 'react';
import { useSelect } from '@refinedev/antd';
import { useUpdate } from '@refinedev/core';
import { Select, Button } from 'antd';
import { CloseOutlined } from '@ant-design/icons';
import type { FieldConfig } from '../lib/resource-config';

export function BulkStatusBar({
  resource,
  field,
  selectedIds,
  onClear,
  onApplied,
}: {
  resource: string;
  field: FieldConfig;
  selectedIds: (string | number)[];
  onClear: () => void;
  onApplied: () => void;
}) {
  const rel = field.relation!;
  const { selectProps } = useSelect({
    resource: rel.resource,
    optionLabel: (item: any) => (typeof rel.labelField === 'function' ? rel.labelField(item) : item[rel.labelField as string]),
    optionValue: (item: any) => item[rel.valueField ?? 'id'],
    filters: rel.filters as any,
  });
  const { mutateAsync, mutation } = useUpdate();
  const [value, setValue] = useState<string | undefined>();

  async function apply() {
    if (!value) return;
    await Promise.all(selectedIds.map((id) => mutateAsync({ resource, id, values: { [field.name]: value } })));
    setValue(undefined);
    onApplied();
  }

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: 8,
        padding: '8px 12px',
        marginBottom: 12,
        background: '#faf9f6',
        border: '1px solid #e7e2d9',
        borderRadius: 10,
      }}
    >
      <Button size="small" type="text" icon={<CloseOutlined />} onClick={onClear} />
      <span style={{ fontSize: 13, fontWeight: 500, whiteSpace: 'nowrap' }}>{selectedIds.length} selected</span>
      <Select
        {...selectProps}
        placeholder={`Set ${field.label.toLowerCase()}...`}
        value={value}
        onChange={(v: any) => setValue(v)}
        style={{ minWidth: 180, flex: '0 1 220px' }}
      />
      <Button type="primary" size="small" loading={mutation.isPending} disabled={!value} onClick={apply}>
        Apply
      </Button>
    </div>
  );
}
