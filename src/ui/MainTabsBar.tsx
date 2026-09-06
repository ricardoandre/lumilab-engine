'use client';

import { useEffect, useState } from 'react';
import { useSelect } from '@refinedev/antd';
import type { ResourceConfig, FieldConfig } from '../lib/resource-config';
import { PillTabs } from './PillTabs';

// Status/category PillTabs row driven by config.mainTabsField — shared by
// ResourceListCards (its original home, Product/Sample) and
// ResourceListTable (Task's status tabs), so a table-view resource gets the
// same "main filter" pattern without a second implementation.
export function MainTabsBar({
  config,
  filters,
  setFilters,
  setCurrentPage,
}: {
  config: ResourceConfig;
  filters: any[];
  setFilters: (f: any[], behavior?: 'replace' | 'merge') => void;
  setCurrentPage: (p: number) => void;
}) {
  const mainTabField = config.fields.find((f) => f.name === config.mainTabsField);
  if (!mainTabField) return null;

  const activeTab = (filters.find((f) => 'field' in f && f.field === config.mainTabsField) as any)?.value ?? 'all';
  const otherFilters = filters.filter((f) => !('field' in f && f.field === config.mainTabsField));

  function setMainTab(value: string) {
    setFilters(value === 'all' ? otherFilters : [...otherFilters, { field: config.mainTabsField!, operator: 'eq', value }], 'replace');
    setCurrentPage(1);
  }

  return (
    <MainTabs
      field={mainTabField}
      activeTab={String(activeTab)}
      onChange={setMainTab}
      resource={config.name}
      otherFilters={otherFilters}
    />
  );
}

// Main tabs source their options statically from a 'select' field's own
// `options`, or dynamically from a 'relation' field's target resource (e.g.
// Product's brand tabs — brands aren't a fixed enum, they're rows in Brand).
// Counts alongside each tab match NocoBase's own Production/Sample views.
function MainTabs({
  field,
  activeTab,
  onChange,
  resource,
  otherFilters,
}: {
  field: FieldConfig;
  activeTab: string;
  onChange: (value: string) => void;
  resource: string;
  otherFilters: any[];
}) {
  const relationOptions = useRelationTabOptions(field);
  const options = field.type === 'relation' ? relationOptions : (field.options ?? []);
  const counts = useTabCounts(resource, field.name, options.map((o) => o.value), otherFilters);

  return (
    <PillTabs
      activeKey={activeTab}
      onChange={onChange}
      items={[
        { key: 'all', label: 'All', count: counts.all },
        ...options.map((o) => ({ key: o.value, label: o.label, count: counts[o.value] })),
      ]}
    />
  );
}

function useTabCounts(
  resource: string,
  field: string,
  values: string[],
  otherFilters: any[],
): Record<string, number | undefined> {
  const [counts, setCounts] = useState<Record<string, number | undefined>>({});
  const filtersKey = JSON.stringify(otherFilters);

  useEffect(() => {
    if (values.length === 0) return;
    let cancelled = false;
    const baseFilters = JSON.parse(filtersKey);

    async function fetchCount(extra?: { field: string; operator: string; value: unknown }) {
      const params = new URLSearchParams({
        page: '1',
        pageSize: '1',
        filters: JSON.stringify(extra ? [...baseFilters, extra] : baseFilters),
      });
      const res = await fetch(`/api/${resource}?${params}`);
      const json = await res.json();
      return json.total ?? 0;
    }

    async function run() {
      const entries = await Promise.all([
        fetchCount().then((c) => ['all', c] as const),
        ...values.map((v) => fetchCount({ field, operator: 'eq', value: v }).then((c) => [v, c] as const)),
      ]);
      if (!cancelled) setCounts(Object.fromEntries(entries));
    }
    run();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resource, field, values.join(','), filtersKey]);

  return counts;
}

function useRelationTabOptions(field: FieldConfig): { label: string; value: string }[] {
  const isRelation = field.type === 'relation';
  const { selectProps } = useSelect({
    resource: isRelation ? field.relation!.resource : field.name, // dummy resource when unused; query is skipped below
    optionLabel: (item: any) =>
      isRelation && typeof field.relation!.labelField === 'function'
        ? field.relation!.labelField(item)
        : item[isRelation ? (field.relation!.labelField as string) : 'id'],
    optionValue: (item: any) => item[isRelation ? (field.relation!.valueField ?? 'id') : 'id'],
    filters: isRelation ? (field.relation!.filters as any) : undefined,
    queryOptions: { enabled: isRelation },
  });
  if (!isRelation) return [];
  return (selectProps.options ?? []) as { label: string; value: string }[];
}
