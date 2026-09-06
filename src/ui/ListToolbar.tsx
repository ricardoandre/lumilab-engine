'use client';

import { useEffect, useRef, useState } from 'react';
import { useGetIdentity } from '@refinedev/core';
import { Button, Drawer, Select, Space, InputNumber, Dropdown, DatePicker, Divider, Tag } from 'antd';
import { FilterOutlined, SortAscendingOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import type { Dayjs } from 'dayjs';
import type { ResourceConfig, FieldConfig, SavedFilter } from '../lib/resource-config';
import { useRelationSelect } from '../lib/use-relation-select';
import { ListSearchInput } from './ListSearchInput';

const { RangePicker } = DatePicker;

// Tags which saved filter (if any) is currently active by riding along
// inside the same `filters` array Refine already round-trips through the
// URL (syncWithLocation) — so the choice survives back-navigation, page
// refresh, and shared links exactly like every other filter does, with no
// separate persistence mechanism to keep in sync. Server routes ignore it
// silently since it's never in any FILTERABLE_FIELDS allowlist.
const SAVED_FILTER_MARKER = '__savedFilter';

// A sort field with a fixed `order` gets its own menu key so it can appear
// twice (e.g. "Code (A-Z)" / "Code (Z-A)") without colliding with the
// toggle-on-click variant, which just uses the bare field name.
function sortItemKey(s: { name: string; order?: 'asc' | 'desc' }): string {
  return s.order ? `${s.name}:${s.order}` : s.name;
}

function fieldFilterValues(filters: any[], name: string) {
  return filters.filter((f) => 'field' in f && f.field === name);
}

// Human-readable chip per active secondary filter, for the always-visible
// "Showing:" summary — so the drawer's contents aren't the only place the
// current filter state is legible.
function describeSecondaryFilters(fields: FieldConfig[], filters: any[]): string[] {
  const chips: string[] = [];
  for (const field of fields) {
    const entries = fieldFilterValues(filters, field.name);
    if (entries.length === 0) continue;
    if (field.type === 'date') {
      const gte = entries.find((e) => e.operator === 'gte');
      const lte = entries.find((e) => e.operator === 'lte');
      const fmt = (v: string) => dayjs(v).format('MMM D');
      if (gte && lte) chips.push(`${field.label}: ${fmt(gte.value)} – ${fmt(lte.value)}`);
      else if (gte) chips.push(`${field.label}: ≥ ${fmt(gte.value)}`);
      else if (lte) chips.push(`${field.label}: ≤ ${fmt(lte.value)}`);
      continue;
    }
    if (field.type === 'number') {
      const gte = entries.find((e) => e.operator === 'gte');
      const lte = entries.find((e) => e.operator === 'lte');
      if (gte && lte) chips.push(`${field.label}: ${gte.value} – ${lte.value}`);
      else if (gte) chips.push(`${field.label}: ≥ ${gte.value}`);
      else if (lte) chips.push(`${field.label}: ≤ ${lte.value}`);
      continue;
    }
    const value = entries[0].value;
    chips.push(Array.isArray(value) ? `${field.label} (${value.length})` : field.label);
  }
  return chips;
}

// Shared search/filter/sort toolbar row — used by both ResourceListTable and
// ResourceListCards so every resource with searchFields/sortFields/
// secondaryFilterFields gets the same controls, not a one-off per view mode.
export function ListToolbar({
  config,
  filters,
  setFilters,
  setCurrentPage,
  sorters,
  setSorters,
}: {
  config: ResourceConfig;
  filters: any[];
  setFilters: (f: any[], behavior?: 'replace' | 'merge') => void;
  setCurrentPage: (p: number) => void;
  sorters?: { field: string; order: 'asc' | 'desc' }[];
  setSorters?: (s: { field: string; order: 'asc' | 'desc' }[]) => void;
}) {
  const [filterDrawerOpen, setFilterDrawerOpen] = useState(false);
  const [searchText, setSearchText] = useState(
    () => (filters.find((f) => 'field' in f && f.field === 'q') as any)?.value ?? '',
  );

  const secondaryFields = (config.secondaryFilterFields ?? [])
    .map((name) => config.fields.find((f) => f.name === name))
    .filter((f): f is FieldConfig => !!f);

  const { data: identity } = useGetIdentity<{ id?: string }>();
  // Seeded straight from the marker already in `filters` (itself restored
  // synchronously from the URL on mount) — not always 'all' — so a saved
  // filter chosen earlier still shows as selected after visiting a record
  // and coming back, instead of silently reverting to "All" in the UI even
  // though the underlying data filter was still correct.
  const [activeSavedFilter, setActiveSavedFilter] = useState(
    () => (filters.find((f) => 'field' in f && f.field === SAVED_FILTER_MARKER) as any)?.value ?? 'all',
  );
  const defaultSavedFilterApplied = useRef(false);

  // Remembers the last filters/sorters used on this list, per resource —
  // not everything that lands on a bare `/tasks` URL is a real back-nav
  // (browser back already works fine via the URL's own querystring; this
  // covers the Show page's breadcrumb link, sidebar nav, reopening the tab,
  // ...), all of which should still resume wherever the user left off
  // rather than snapping back to the configured default every time.
  const storageKey = `kano:list-view:${config.name}`;
  // Skips its very first run: both this effect and the restore effect below
  // fire on mount from the same render, so without the skip this would
  // write the pre-restore `filters` (empty, on a bare URL) straight over
  // whatever was actually stored, before the restore effect below ever gets
  // a chance to read it back out.
  const isFirstStorageWrite = useRef(true);
  useEffect(() => {
    if (isFirstStorageWrite.current) {
      isFirstStorageWrite.current = false;
      return;
    }
    try {
      localStorage.setItem(storageKey, JSON.stringify({ filters, sorters: sorters ?? [] }));
    } catch {
      // localStorage unavailable (private mode, quota, ...) — persistence
      // is a nice-to-have, never worth failing the list over.
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters, sorters]);

  // On a bare list URL (no filters/sorters at all): first try to resume
  // the last remembered view for this resource, and only fall back to the
  // configured default saved filter (e.g. Task's "My Recent Tasks") if
  // nothing was ever remembered — a genuinely fresh first visit. Waits for
  // identity before applying the default since presets like "owner = me"
  // need the signed-in user's id (the localStorage path doesn't need it —
  // it's already-resolved filter values, not a preset to compute).
  useEffect(() => {
    if (defaultSavedFilterApplied.current) return;
    if (filters.length > 0 || (sorters && sorters.length > 0)) {
      defaultSavedFilterApplied.current = true;
      return;
    }

    // A raw localStorage entry existing at all — even one holding empty
    // arrays — means "the user was here before and this is where they left
    // it" (e.g. they explicitly picked "All", which is filters: []). Only
    // a missing entry (raw === null) means genuinely never-visited; that
    // distinction is why this checks `stored !== null` rather than
    // `stored.filters.length > 0`, which couldn't tell "chose empty" apart
    // from "never chose anything" and fell back to the default either way.
    let stored: { filters?: any[]; sorters?: any[] } | null = null;
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw) stored = JSON.parse(raw);
    } catch {
      stored = null;
    }
    if (stored) {
      defaultSavedFilterApplied.current = true;
      const restoredFilters = stored.filters ?? [];
      setFilters(restoredFilters, 'replace');
      setSorters?.(stored.sorters ?? []);
      setActiveSavedFilter((restoredFilters.find((f) => 'field' in f && f.field === SAVED_FILTER_MARKER) as any)?.value ?? 'all');
      setSearchText((restoredFilters.find((f) => 'field' in f && f.field === 'q') as any)?.value ?? '');
      return;
    }

    const defaultFilter = config.savedFilters?.find((s) => s.isDefault);
    if (!defaultFilter) {
      defaultSavedFilterApplied.current = true;
      return;
    }
    if (!identity) return;
    defaultSavedFilterApplied.current = true;
    Promise.resolve(defaultFilter.getFilters({ userId: identity.id })).then((result) => {
      setFilters([...result, { field: SAVED_FILTER_MARKER, operator: 'eq', value: defaultFilter.key }], 'replace');
      setSorters?.(defaultFilter.sorters ?? []);
      setActiveSavedFilter(defaultFilter.key);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [identity]);

  function fullReset() {
    setSearchText('');
    setFilters([], 'replace');
    setSorters?.([]);
    setActiveSavedFilter('all');
    setCurrentPage(1);
  }

  function applySavedFilter(key: string) {
    if (key === 'all') {
      fullReset();
      return;
    }
    setActiveSavedFilter(key);
    setCurrentPage(1);
    const preset = config.savedFilters?.find((s) => s.key === key);
    if (!preset) return;
    Promise.resolve(preset.getFilters({ userId: identity?.id })).then((result) => {
      setFilters([...result, { field: SAVED_FILTER_MARKER, operator: 'eq', value: key }], 'replace');
      setSorters?.(preset.sorters ?? []);
    });
  }

  // Skip the very first run — this effect exists to react to the user
  // *typing*, not to re-assert whatever searchText was seeded from the URL
  // on mount. Without this guard it fires ~350ms after every mount (search
  // page load, or back-navigation from a show page) and silently resets
  // pagination/filters to page 1, discarding wherever the user actually was.
  const isFirstRun = useRef(true);
  useEffect(() => {
    if (isFirstRun.current) {
      isFirstRun.current = false;
      return;
    }
    if (!config.searchFields?.length) return;
    const handle = setTimeout(() => {
      const rest = filters.filter((f) => !('field' in f && f.field === 'q'));
      // 'replace' is required here — Refine's setFilters defaults to
      // *merge*, which unions the new array into whatever's already there
      // instead of replacing it. Without this, clearing the search (an
      // empty `rest`) silently kept the stale `q` filter forever, since
      // merging "nothing new" just leaves the old filter in place.
      setFilters(searchText ? [...rest, { field: 'q', operator: 'contains', value: searchText }] : rest, 'replace');
      setCurrentPage(1);
    }, 350);
    return () => clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchText]);

  const currentSort = sorters?.[0];
  const hasFilterDrawer = secondaryFields.length > 0 || !!config.savedFilters?.length;
  const hasControls = config.searchFields?.length || config.sortFields?.length || hasFilterDrawer;
  if (!hasControls) return null;

  const secondaryChips = describeSecondaryFilters(secondaryFields, filters);
  const activeSavedFilterLabel =
    activeSavedFilter !== 'all' ? config.savedFilters?.find((s) => s.key === activeSavedFilter)?.label : undefined;
  const hasActiveFilters = !!activeSavedFilterLabel || secondaryChips.length > 0;

  return (
    <>
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        {!!config.searchFields?.length && (
          <ListSearchInput
            placeholder={config.searchPlaceholder}
            value={searchText}
            onChange={setSearchText}
          />
        )}
        {hasFilterDrawer && (
          <Button
            className="kano-toolbar-btn"
            type={hasActiveFilters ? 'primary' : 'default'}
            icon={<FilterOutlined />}
            onClick={() => setFilterDrawerOpen(true)}
          />
        )}
        {!!config.sortFields?.length && setSorters && (
          <Dropdown
            menu={{
              items: config.sortFields.map((s) => ({ key: sortItemKey(s), label: s.label })),
              selectedKeys: currentSort
                ? config.sortFields
                    .filter((s) => s.name === currentSort.field && (!s.order || s.order === currentSort.order))
                    .map(sortItemKey)
                : [],
              onClick: ({ key }) => {
                const s = config.sortFields!.find((x) => sortItemKey(x) === key)!;
                const order = s.order ?? (currentSort?.field === s.name && currentSort.order === 'desc' ? 'asc' : 'desc');
                setSorters([{ field: s.name, order }]);
              },
            }}
          >
            <Button className="kano-toolbar-btn" icon={<SortAscendingOutlined />} />
          </Dropdown>
        )}
      </div>

      {hasFilterDrawer && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginBottom: 12, fontSize: 12.5 }}>
          <span style={{ color: '#9a9284' }}>Showing:</span>
          {activeSavedFilterLabel && <Tag color="blue">{activeSavedFilterLabel}</Tag>}
          {secondaryChips.map((c) => (
            <Tag key={c}>{c}</Tag>
          ))}
          {!activeSavedFilterLabel && secondaryChips.length === 0 && <Tag>No filters applied</Tag>}
        </div>
      )}

      {hasFilterDrawer && (
        <SecondaryFilterDrawer
          open={filterDrawerOpen}
          onClose={() => setFilterDrawerOpen(false)}
          fields={secondaryFields}
          savedFilters={config.savedFilters}
          activeSavedFilter={activeSavedFilter}
          onSelectSavedFilter={(key) => {
            applySavedFilter(key);
            setFilterDrawerOpen(false);
          }}
          onReset={() => {
            fullReset();
            setFilterDrawerOpen(false);
          }}
          onApply={(next) => {
            // A manual secondary-filter edit diverges from whatever saved
            // filter was active, so it's deselected (the marker is dropped)
            // rather than leaving a stale preset label showing.
            const keep = filters.filter(
              (f) => !('field' in f) || (!secondaryFields.some((sf) => sf.name === f.field) && f.field !== SAVED_FILTER_MARKER),
            );
            setFilters([...keep, ...next], 'replace');
            setActiveSavedFilter('all');
            setCurrentPage(1);
            setFilterDrawerOpen(false);
          }}
        />
      )}
    </>
  );
}

function SecondaryFilterDrawer({
  open,
  onClose,
  fields,
  savedFilters,
  activeSavedFilter,
  onSelectSavedFilter,
  onReset,
  onApply,
}: {
  open: boolean;
  onClose: () => void;
  fields: FieldConfig[];
  savedFilters?: SavedFilter[];
  activeSavedFilter?: string;
  onSelectSavedFilter?: (key: string) => void;
  onReset: () => void;
  onApply: (filters: any[]) => void;
}) {
  const [values, setValues] = useState<Record<string, unknown>>({});

  function apply() {
    const result: { field: string; operator: 'eq' | 'in' | 'gte' | 'lte'; value: unknown }[] = [];
    for (const field of fields) {
      const v = values[field.name];
      if (v === undefined || v === null) continue;
      if (field.type === 'date') {
        // "Between" where one side is left empty becomes a plain >= or <=
        // — RangePicker's allowEmpty is what lets the user leave either
        // side blank in the first place.
        const [start, end] = v as [Dayjs | null, Dayjs | null];
        if (start) result.push({ field: field.name, operator: 'gte', value: start.startOf('day').toISOString() });
        if (end) result.push({ field: field.name, operator: 'lte', value: end.endOf('day').toISOString() });
      } else if (field.type === 'number') {
        // Same "either side optional" shape as the date range above.
        const [min, max] = v as [number | null, number | null];
        if (min != null) result.push({ field: field.name, operator: 'gte', value: min });
        if (max != null) result.push({ field: field.name, operator: 'lte', value: max });
      } else if (Array.isArray(v)) {
        if (v.length > 0) result.push({ field: field.name, operator: 'in', value: v });
      } else {
        result.push({ field: field.name, operator: 'eq', value: v });
      }
    }
    onApply(result);
  }

  return (
    <Drawer title="Filters" open={open} onClose={onClose} width={320}>
      <Space direction="vertical" style={{ width: '100%' }} size="middle">
        {!!savedFilters?.length && (
          <>
            <div>
              <div style={{ marginBottom: 4, fontSize: 12, color: '#888' }}>Saved Filter</div>
              <Select
                style={{ width: '100%' }}
                value={activeSavedFilter}
                onChange={(v) => onSelectSavedFilter?.(String(v))}
                options={[...savedFilters.map((s) => ({ label: s.label, value: s.key })), { label: 'All', value: 'all' }]}
              />
            </div>
            {fields.length > 0 && <Divider style={{ margin: 0 }} />}
          </>
        )}
        {fields.map((field) => (
          <SecondaryFilterControl
            key={field.name}
            field={field}
            value={values[field.name]}
            onChange={(v) => setValues((prev) => ({ ...prev, [field.name]: v }))}
          />
        ))}
        <Space.Compact block>
          <Button
            block
            onClick={() => {
              setValues({});
              onReset();
            }}
          >
            Reset
          </Button>
          {fields.length > 0 && (
            <Button type="primary" block onClick={apply}>
              Apply
            </Button>
          )}
        </Space.Compact>
      </Space>
    </Drawer>
  );
}

function SecondaryFilterControl({
  field,
  value,
  onChange,
}: {
  field: FieldConfig;
  value: any;
  onChange: (v: any) => void;
}) {
  if (field.type === 'date') {
    return (
      <div>
        <div style={{ marginBottom: 4, fontSize: 12, color: '#888' }}>{field.label}</div>
        <RangePicker
          allowEmpty={[true, true]}
          value={value as [Dayjs | null, Dayjs | null] | undefined}
          onChange={(v) => onChange(v ?? undefined)}
          style={{ width: '100%' }}
        />
      </div>
    );
  }

  if (field.type === 'number') {
    const [min, max] = (value as [number | null, number | null] | undefined) ?? [null, null];
    return (
      <div>
        <div style={{ marginBottom: 4, fontSize: 12, color: '#888' }}>{field.label}</div>
        <Space.Compact style={{ width: '100%' }}>
          <InputNumber
            style={{ width: '50%' }}
            placeholder="Min"
            value={min}
            onChange={(v) => onChange([v ?? null, max])}
          />
          <InputNumber
            style={{ width: '50%' }}
            placeholder="Max"
            value={max}
            onChange={(v) => onChange([min, v ?? null])}
          />
        </Space.Compact>
      </div>
    );
  }

  if (field.type === 'relation') {
    const selectProps = useRelationSelect(field.relation);
    return (
      <div>
        <div style={{ marginBottom: 4, fontSize: 12, color: '#888' }}>{field.label}</div>
        <Select {...selectProps} mode="multiple" allowClear value={value} onChange={onChange} style={{ width: '100%' }} />
      </div>
    );
  }

  return (
    <div>
      <div style={{ marginBottom: 4, fontSize: 12, color: '#888' }}>{field.label}</div>
      <Select
        options={field.options}
        allowClear
        mode="multiple"
        value={value}
        onChange={onChange}
        style={{ width: '100%' }}
      />
    </div>
  );
}
