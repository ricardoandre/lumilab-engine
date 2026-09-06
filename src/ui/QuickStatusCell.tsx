'use client';

// Clickable status pill for list rows — lets a tagColored relation field
// (e.g. Task's statusOptionId) be changed with one click, without opening
// the full edit form. Opt in per-resource via config.quickStatusField.
import { useSelect } from '@refinedev/antd';
import { useUpdate } from '@refinedev/core';
import { Dropdown } from 'antd';
import type { MenuProps } from 'antd';
import type { FieldConfig } from '../lib/resource-config';
import { StatusPill } from './StatusPill';
import { pillColor } from '../lib/pill-colors';

export function QuickStatusCell({
  resource,
  record,
  field,
}: {
  resource: string;
  record: any;
  field: FieldConfig;
}) {
  const rel = field.relation!;
  const { query } = useSelect({ resource: rel.resource, filters: rel.filters as any });
  const options = (query?.data?.data ?? []) as any[];
  const { mutate, mutation } = useUpdate();

  const displayKey = rel.displayKey ?? field.name.replace(/Id$/, '');
  const related = record[displayKey];
  const label = related ? (typeof rel.labelField === 'function' ? rel.labelField(related) : related[rel.labelField]) : undefined;
  const color = related && rel.colorField ? related[rel.colorField] : undefined;

  const items: MenuProps['items'] = options.map((o) => {
    const optLabel = typeof rel.labelField === 'function' ? rel.labelField(o) : o[rel.labelField as string];
    const optColor = rel.colorField ? o[rel.colorField] : undefined;
    return {
      key: String(o.id),
      label: (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
          <span style={{ width: 6, height: 6, borderRadius: '50%', flexShrink: 0, background: pillColor(optColor).fg }} />
          {optLabel}
        </span>
      ),
    };
  });

  return (
    <span onClick={(e) => e.stopPropagation()} style={{ display: 'inline-block' }}>
      <Dropdown
        trigger={['click']}
        disabled={mutation.isPending || items.length === 0}
        menu={{
          items,
          selectedKeys: related ? [String(related.id)] : [],
          onClick: ({ key }) => mutate({ resource, id: record.id, values: { [field.name]: key } }),
        }}
      >
        <span style={{ cursor: 'pointer' }}>
          <StatusPill label={label ?? '-'} color={color} />
        </span>
      </Dropdown>
    </span>
  );
}
