'use client';

// Adapter: turns a declarative ResourceConfig (the format Task/Product/
// Product Measurement/etc. already use, driving the auto-generated
// List/Form/Show components) into a ListViewConfig for ListEngine.tsx (the
// recolored NocoBase-UI engine Sample already used). One resource still
// means one config file — nothing here is hand-written per resource — but
// the RENDERING now goes through ListEngine instead of ResourceList, so
// every resource picks up the same look: swipe/hover quick actions,
// tabs-with-counts, filter popup, saved filters, detail drawer.
//
// Create/Edit render inside a Drawer over the list (ResourceFormDrawer),
// reusing the same field-driven ResourceForm knows how to render (richtext,
// images, repeatableList, measurementGrid, ...) — no page navigation. Width
// is configurable per resource via config.formDrawerSize.

import { useEffect, useMemo, useState, useCallback, useRef, forwardRef } from 'react';
import { useGetIdentity } from '@refinedev/core';
import { App, Spin, Select, Modal, Tooltip, Input, DatePicker } from 'antd';
import { EditOutlined } from '@ant-design/icons';
import {
  createListView,
  type ListViewConfig,
  type SecondaryFilterDef,
  type QuickAction,
  type BulkAction,
  type DetailAction,
  type Helpers,
  type ListViewHandle,
} from './ListEngine';
import { DrawerShell } from './DrawerShell';
import { ResourceFormDrawer } from './ResourceFormDrawer';
import type { ResourceConfig, FieldConfig, RowAction, SavedFilterCondition, SavedFilterEntry } from '../lib/resource-config';
import { listFields, showFields, aclViewKeyOf, aclWriteKeyOf, relationDisplayKey, relationLabelOf } from '../lib/resource-config';
import { usePermissions, canAction, actionAllowed, type PermPayload } from '../lib/use-permissions';
import { renderFieldValue } from './field-value';
import { serializeFormDate } from '../lib/form-dates';
import dayjs from 'dayjs';
import { thumbUrl } from '../lib/file-url';
import { RichTextValue } from './RichTextValue';
import { StatusPill } from './StatusPill';
import { QuickStatusCell } from './QuickStatusCell';
import { ImageGallery } from './ImageGallery';
import { ResourceDetailBody } from './ResourceDetailBody';
import { pillColor } from '../lib/pill-colors';

// Same small pill ResourceShow's own (unexported) CategoryTag renders for
// config.showTag — kept here rather than exporting theirs, since it's an
// 8-line leaf component with no other callers.
function CategoryTag({ label, color }: { label: string; color?: string }) {
  const { fg } = pillColor(color);
  return (
    <span style={{ display: 'inline-block', padding: '4px 14px', borderRadius: 999, border: `1px solid ${fg}`, color: fg, fontSize: 13, fontWeight: 600, marginBottom: 16 }}>
      {label}
    </span>
  );
}

// ── client-side saved-filter matching ──
// Mirrors src/lib/filters.ts's server-side filtersToPrismaWhere semantics,
// but evaluated as a JS predicate against an already-loaded row — needed
// because ListEngine filters/sorts/paginates client-side (it loads up to
// ~2000 rows up front, same as Sample already did), and a saved filter like
// Task's "status is Done OR overdue" doesn't fit ListEngine's own
// apply.filters (simple per-field equality) shape.
function conditionMatches(row: any, c: SavedFilterCondition): boolean {
  const val = row[c.field];
  switch (c.operator) {
    case 'eq':
      return String(val ?? '') === String(c.value ?? '');
    case 'ne':
      return String(val ?? '') !== String(c.value ?? '');
    case 'in':
      return Array.isArray(c.value) && c.value.some((v) => String(v) === String(val ?? ''));
    case 'contains':
      return String(val ?? '').toLowerCase().includes(String(c.value ?? '').toLowerCase());
    case 'gte':
      return val != null && c.value != null && new Date(val).getTime() >= new Date(c.value as string).getTime();
    case 'lte':
      return val != null && c.value != null && new Date(val).getTime() <= new Date(c.value as string).getTime();
    default:
      return true;
  }
}
function entriesMatch(row: any, entries: SavedFilterEntry[]): boolean {
  return entries.every((e) => ('or' in e ? e.or.some((c) => conditionMatches(row, c)) : conditionMatches(row, e)));
}

// Every option row for a relation field (e.g. all task.status
// FieldOptions, or all Users) — used for main tabs / secondary filter
// dropdowns, so they list every possible value, not just ones present
// among currently-loaded rows.
async function fetchRelationOptions(field: FieldConfig): Promise<any[]> {
  const rel = field.relation!;
  const params = new URLSearchParams({ pageSize: '500' });
  if (rel.filters?.length) params.set('filters', JSON.stringify(rel.filters));
  const res = await fetch(`/api/${rel.resource}?${params}`);
  if (!res.ok) return [];
  const json = await res.json();
  return json.data ?? [];
}

interface AdapterCtx {
  relationOptions: Record<string, any[]>;
  // Secondary-filter options for NON-relation fields that declared
  // FieldConfig.filterOptions — fetched once by the wrapper, keyed by field
  // name. See the filterOptions doc in resource-config.ts.
  fieldFilterOptions: Record<string, { value: string; label: string }[]>;
  resolvedSaved: Record<string, SavedFilterEntry[] | null>;
  // A rowAction/showAction whose key is 'duplicate' (e.g. Product's
  // Duplicate) opens the clone drawer through here instead of running its
  // own onClick (a page navigation to /resource/clone/[id]) — same drawer
  // UX as create/edit, not a special case per resource.
  onDuplicate: (id: string | number) => void;
  // App.useApp()'s bound message. buildListViewConfig is a plain function, not
  // a component, so it cannot call the hook itself — and antd's STATIC message
  // is inert under React 19, rendering nothing at all.
  message: { success: (c: string) => void; error: (c: string) => void; warning: (c: string) => void; info: (c: string) => void };
  // The viewer's permissions, so an action they cannot perform is never drawn.
  // null until they load — deriveActions treats that as "draw nothing yet"
  // rather than flashing forbidden actions in and out.
  perm: PermPayload | null;
}

function buildListViewConfig(config: ResourceConfig, ctx: AdapterCtx): ListViewConfig {
  const titleField = config.fields.find((f) => f.type === 'text');
  const titleOf = (record: any) => (config.cardTitle ? config.cardTitle(record) : titleField ? record[titleField.name] : `#${record.id}`);
  const hoverField = config.hoverPreviewField ? config.fields.find((f) => f.name === config.hoverPreviewField) : undefined;

  // The active view goes to the server for the same reason serverListParams
  // sends it (see below): a view can be GROUPED server-side — Restock returns
  // one row per model under ?view=model. Only sent when the list actually
  // declares views, so no existing route sees a new parameter.
  async function fetchList({ view }: { view: string }) {
    const params = new URLSearchParams({ pageSize: '2000' });
    if (view && (config.viewOptions?.length ?? 0) > 1) params.set('view', view);
    const res = await fetch(`/api/${config.name}?${params}`);
    if (!res.ok) throw new Error(`Failed to load ${config.name}`);
    const json = await res.json();
    const rows: any[] = json.data ?? [];
    // config.lockedFilters — the resource's own permanent scope (Fabric List is
    // the Material List locked to type = fabric). A client-mode list gets the
    // whole table back, so the scope is applied here; serverListParams sends the
    // same conditions to the route for a serverPaged one.
    return config.lockedFilters?.length
      ? rows.filter((r) => config.lockedFilters!.every((c) => conditionMatches(r, c)))
      : rows;
  }

  const searchText = config.searchFields?.length
    ? (row: any) =>
        config.searchFields!.map((name) => {
          const f = config.fields.find((x) => x.name === name);
          const v = row[name];
          return f?.type === 'richtext' ? String(v ?? '').replace(/<[^>]+>/g, ' ') : v;
        })
    : undefined;

  let mainTabs: ListViewConfig['mainTabs'];
  const mainTabField = config.mainTabsField ? config.fields.find((f) => f.name === config.mainTabsField) : undefined;
  if (mainTabField?.type === 'select') {
    // Static enum classification, not a stored relation — e.g. Production
    // Material's Fabric/Accessories split (computed server-side from the
    // material's raw_material.type, not a column of its own). Tabs come
    // straight from the field's own static `options`, no relation fetch.
    mainTabs = {
      allLabel: 'All',
      tabs: (mainTabField.options ?? []).map((o) => {
        const c = pillColor(o.color);
        return { key: o.value, label: o.label, color: c.fg, bg: c.bg };
      }),
      classify: (row: any) => String(row[mainTabField.name] ?? ''),
    };
  } else if (mainTabField) {
    const options = ctx.relationOptions[mainTabField.name] ?? [];
    mainTabs = {
      allLabel: 'All',
      tabs: options.map((o: any) => {
        const c = mainTabField.relation?.colorOf
          ? mainTabField.relation.colorOf(o)
          : mainTabField.relation?.colorField
            ? pillColor(o[mainTabField.relation.colorField])
            : pillColor();
        return { key: String(o.id), label: relationLabelOf(mainTabField, o), color: c.fg, bg: c.bg };
      }),
      classify: (row: any) => String(row[mainTabField.name] ?? ''),
    };
  }

  const secondaryFilters: SecondaryFilterDef[] = (config.secondaryFilterFields ?? [])
    .map((name) => config.fields.find((f) => f.name === name))
    .filter((f): f is FieldConfig => !!f)
    .map((f) => {
      if (f.type === 'date' || f.type === 'datetime') {
        return { key: f.name, label: f.label, kind: 'dateRange', field: f.name };
      }
      // A number is a RANGE, not a list of every distinct value it happens to
      // take. "CTR above 4%" is the question; a dropdown of 300 rates is not.
      if (f.type === 'number') {
        return { key: f.name, label: f.label, kind: 'numberRange', field: f.name, rangeUnit: f.rangeUnit };
      }
      if (f.type === 'relation') {
        const options = ctx.relationOptions[f.name] ?? [];
        // f.relation.multi: the row's own value is an array of ids (e.g.
        // Sample's Sewing PIC, rolled up from all its variants) rather than
        // a single id — match by intersection instead of equality.
        const rowMulti = !!f.relation?.multi;
        return {
          key: f.name,
          label: f.label,
          multi: true,
          field: f.name,
          search: true,
          options: () => options.map((o: any) => ({ value: String(o.id), label: relationLabelOf(f, o) })),
          match: (row: any, vals: string[]) =>
            rowMulti
              ? (row[f.name] ?? []).some((id: any) => vals.includes(String(id)))
              : vals.includes(String(row[f.name] ?? '')),
        };
      }
      // Yes/No, from the field's type rather than from whatever strings
      // happen to be in the data — a uniq-from-data fallback labels the
      // options "true"/"false".
      if (f.type === 'boolean') {
        return {
          key: f.name, label: f.label, multi: true, field: f.name,
          options: () => [{ value: 'true', label: 'Yes' }, { value: 'false', label: 'No' }],
        };
      }
      if (f.type === 'select' && f.options) {
        return { key: f.name, label: f.label, multi: true, field: f.name, options: () => f.options! };
      }
      // Text field that brings its own option list from the server (Product's
      // Designer) — the uniq-from-data fallback below can't see past the
      // loaded page on a serverPaged list.
      if (f.filterOptions) {
        const options = ctx.fieldFilterOptions[f.name] ?? [];
        return {
          key: f.name, label: f.label, multi: true, field: f.name, search: true,
          options: () => options,
        };
      }
      // Plain text/number field with no static option set (e.g. Production
      // Sample's konveksiName, productionRef) — omit `options` entirely so
      // ListEngine's own filterOptions falls through to its uniq-from-data
      // derivation instead of getting stuck on an always-empty list.
      return { key: f.name, label: f.label, multi: true, field: f.name, search: true };
    });

  const sortOptions = (config.sortFields ?? []).map((s, i) => ({ key: `${s.name}:${s.order ?? 'toggle'}:${i}`, label: s.label }));
  const sortKeyMeta = new Map(sortOptions.map((o, i) => [o.key, config.sortFields![i]]));
  // A saved filter's own `sorters` (e.g. Task's "My Recent Tasks" -> start
  // date ascending) needs the matching sortOptions key so picking it in the
  // filter popup also flips the sort dropdown — ListEngine's own
  // apply.sort expects one of those keys, not a bare {field, order} pair.
  function sortKeyFor(field: string, order: 'asc' | 'desc'): string | undefined {
    const idx = (config.sortFields ?? []).findIndex((s) => s.name === field && (s.order ?? order) === order);
    return idx >= 0 ? sortOptions[idx].key : undefined;
  }

  // Drag-to-reorder (e.g. SKU Option's `sort`) — renumbers the dragged page
  // sequentially (0..N-1) and PATCHes only the rows whose value actually
  // changed. Assumes the whole reorderable set fits on one page, true for
  // every resource that uses this today (short reference lists); a resource
  // with more rows than pageSize would need real cross-page offsets, not
  // built here since nothing needs it yet.
  const reorderSortIdx = config.reorderField ? (config.sortFields ?? []).findIndex((s) => s.name === config.reorderField) : -1;
  const reorder =
    config.reorderField && reorderSortIdx >= 0
      ? {
          sortKey: sortOptions[reorderSortIdx].key,
          onReorder: (rows: any[]) => {
            rows.forEach((row, i) => {
              if (row[config.reorderField!] !== i) {
                fetch(`/api/${config.name}/${row.id}`, {
                  method: 'PATCH',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ [config.reorderField!]: i }),
                }).catch(() => ctx.message.error('Failed to save the new order.'));
              }
            });
          },
        }
      : undefined;

  // Real server-side pagination for tables too large to load whole (see
  // resource-config.ts's serverPaged doc). Reuses the same query-param
  // contract the old ResourceListTable already relies on
  // (page/pageSize/sortField/sortOrder/filters — parseFiltersParam +
  // filtersToPrismaWhere + applySearch server-side), so no API route
  // changes were needed for Shopee Ads Performance / FB Ad Performance.
  //
  // Main tabs work too: the active tab is sent as `tab` alongside `tabField`
  // (the mainTabsField name), kept OUT of the filters list so the route can
  // compute per-tab counts over the tab-independent where. Routes that want
  // accurate tab badges honor those two params and return `tabCounts`;
  // routes with no tabs (Shopee/FB Ads) never receive them. See the
  // sample-variants route for the reference server-tabs implementation.
  interface ServerQuery {
    page: number;
    pageSize: number;
    search: string;
    sortKey: string | undefined;
    filters: Record<string, any>;
    tab: string;
    savedFilterKey: string | null;
    view: string;
  }

  function serverListParams({ page, pageSize, search, sortKey: sk, filters: liveFilters, tab, savedFilterKey, view }: ServerQuery) {
    const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
    const meta = sk ? sortKeyMeta.get(sk) : undefined;
    if (meta) {
      params.set('sortField', meta.name);
      params.set('sortOrder', meta.order ?? 'asc');
    }
    if (mainTabField) {
      params.set('tabField', mainTabField.name);
      if (tab && tab !== 'all') params.set('tab', tab);
    }
    const entries: SavedFilterEntry[] = [];
    if (search.trim()) entries.push({ field: 'q', operator: 'eq', value: search.trim() });
    secondaryFilters.forEach((f) => {
      const v = liveFilters[f.key];
      if (f.kind === 'dateRange') {
        if (v?.[0]) entries.push({ field: f.field!, operator: 'gte', value: v[0].startOf('day').toISOString() });
        if (v?.[1]) entries.push({ field: f.field!, operator: 'lte', value: v[1].endOf('day').toISOString() });
      } else if (f.kind === 'numberRange') {
        if (v?.[0] != null) entries.push({ field: f.field!, operator: 'gte', value: v[0] });
        if (v?.[1] != null) entries.push({ field: f.field!, operator: 'lte', value: v[1] });
      } else if (f.multi) {
        if (Array.isArray(v) && v.length) entries.push({ field: f.field!, operator: 'in', value: v });
      } else if (v != null && v !== 'all') {
        entries.push({ field: f.field!, operator: 'eq', value: v });
      }
    });
    // A picked saved filter's own conditions (resolved to real field/op/
    // value entries by the adapter's ctx) must go to the SERVER in
    // serverMode — unlike client mode, its `match` predicate can't run
    // against rows that were never loaded. filtersToPrismaWhere on the
    // route understands the exact SavedFilterEntry shape (incl. `{or}`),
    // provided those fields are in the route's filterable allowlist.
    if (savedFilterKey) {
      const conds = ctx.resolvedSaved[savedFilterKey];
      if (conds) entries.push(...conds);
    }
    if (config.lockedFilters?.length) entries.push(...config.lockedFilters);
    if (entries.length) params.set('filters', JSON.stringify(entries));
    // Only sent when the list actually declares views, so no existing route
    // sees a parameter it has never been given before.
    if (view && (config.viewOptions?.length ?? 0) > 1) params.set('view', view);
    return params;
  }

  const serverMode = config.serverPaged
    ? {
        fetchPage: async (q: ServerQuery) => {
          const res = await fetch(`/api/${config.name}?${serverListParams(q)}`);
          if (!res.ok) throw new Error(`Failed to load ${config.name}`);
          const json = await res.json();
          return { data: json.data ?? [], total: json.total ?? 0, tabCounts: json.tabCounts };
        },
        // "Select all" across every matching row, not just the loaded page.
        // The route contract has no ids-only mode, so this walks the same
        // endpoint in big pages and keeps only the ids. Capped: a bulk action
        // over more rows than this is a script's job, not the UI's — the
        // engine tells the user when the cap trims the selection.
        fetchAllIds: async (q: Omit<ServerQuery, 'page' | 'pageSize'>) => {
          const CAP = 5000;
          const CHUNK = 500;
          const ids: (string | number)[] = [];
          for (let page = 1; ids.length < CAP; page++) {
            const res = await fetch(`/api/${config.name}?${serverListParams({ ...q, page, pageSize: CHUNK })}`);
            if (!res.ok) throw new Error(`Failed to load ${config.name}`);
            const json = await res.json();
            const rows: any[] = json.data ?? [];
            // A grouped page returns rollup rows carrying their records in
            // `items`; select-all means every record, not every group.
            rows.forEach((r) => (Array.isArray(r.items) ? r.items.forEach((i: any) => ids.push(i.id)) : ids.push(r.id)));
            if (rows.length < CHUNK) break;
          }
          return ids.slice(0, CAP);
        },
      }
    : undefined;

  const savedFilters = (config.savedFilters ?? []).map((sf) => ({
    key: sf.key,
    label: sf.label,
    apply: sf.sorters?.[0] || sf.view
      ? { ...(sf.sorters?.[0] ? { sort: sortKeyFor(sf.sorters[0].field, sf.sorters[0].order) } : {}), ...(sf.view ? { view: sf.view } : {}) }
      : undefined,
    match: (row: any) => {
      const entries = ctx.resolvedSaved[sf.key];
      return entries ? entriesMatch(row, entries) : true;
    },
  }));
  function sortComparator(key: string) {
    const s = sortKeyMeta.get(key);
    if (!s) return null;
    const dir = s.order === 'desc' ? -1 : 1;
    return (a: any, b: any) => {
      const av = a[s.name];
      const bv = b[s.name];
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      return dir * (new Date(av).getTime() - new Date(bv).getTime() || String(av).localeCompare(String(bv)));
    };
  }

  const statusField = config.quickStatusField ? config.fields.find((f) => f.name === config.quickStatusField) : undefined;

  const cardFieldList = () =>
    config.cardFields
      ? config.cardFields.map((name) => config.fields.find((f) => f.name === name)).filter((f): f is FieldConfig => !!f)
      : listFields(config)
          .filter((f) => f.name !== mainTabField?.name && f.name !== titleField?.name && f.name !== statusField?.name)
          .slice(0, 4);

  // Card fields render at a smaller pill size than the detail view by
  // default (they sit in a compact caption, not a full-width row) —
  // config.cardFieldsPlain drops the colored pill entirely for a
  // tagColored relation, showing its label as plain text instead (e.g.
  // Sample Request's Type/Status, kept off the colored-badge treatment).
  function cardFieldValue(f: FieldConfig, row: any) {
    if (config.cardFieldsPlain && f.type === 'relation' && f.tagColored) {
      return relationLabelOf(f, row[relationDisplayKey(f)]);
    }
    return renderFieldValue(f, row, { pillSize: 'small' });
  }

  function renderCard({ row, selectMode, selected, query, view, openRow }: { row: any; selectMode: boolean; selected: boolean; query: string; view: string; openRow: (row: any) => void }) {
    // A view that draws its own card wins — e.g. Launch's model row, which is
    // a rollup of several products and shares nothing with the product card.
    const vo = config.viewOptions?.find((v) => v.key === view);
    if (vo?.renderCard) return vo.renderCard(row, { selectMode, selected, query, openRow });
    if (config.renderCard) return config.renderCard(row, { selectMode, selected, query });

    const statusRelated = statusField ? row[relationDisplayKey(statusField)] : null;
    const statusPill = statusField && statusRelated && (
      <StatusPill label={relationLabelOf(statusField, statusRelated)} color={statusField.relation?.colorField ? statusRelated[statusField.relation.colorField] : undefined} />
    );

    // 'grid' (default): a vertical tile — image full-bleed on top, caption
    // (name + cardFields, e.g. Product's code) centered below. Matches the
    // catalog-grid look Product/Sample use. 'row': the old single-row
    // layout (small thumbnail left, text beside it) — Product Measurement's
    // shape, ported straight from NocoBase.
    if (config.cardLayout === 'row') {
      return (
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 12, minWidth: 0 }}>
          {config.cardImage && (
            <div style={{ width: 56, aspectRatio: config.cardImageAspectRatio || '2 / 3', flexShrink: 0, borderRadius: 8, overflow: 'hidden', background: '#efebe3' }}>
              {/* 56px on screen -> 200px thumbnail. thumbUrl no-ops on external
                  urls and on one that already carries its own ?w=. */}
              {config.cardImage(row) && <img src={thumbUrl(config.cardImage(row), 200)} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />}
            </div>
          )}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <span style={{ fontWeight: 700, fontSize: 14, color: '#211f1c' }}>{titleOf(row)}</span>
              {statusPill}
            </div>
            {config.cardSubtitle?.(row) && (
              <div style={{ fontSize: 12.5, color: '#726c63', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{config.cardSubtitle(row)}</div>
            )}
            {cardFieldList().map((f) => (
              <div key={f.name} style={{ fontSize: 12, color: '#726c63', marginTop: 2 }}>
                {!config.cardFieldsHideLabel && <span style={{ color: '#9a9284' }}>{f.label}: </span>}
                {cardFieldValue(f, row)}
              </div>
            ))}
            {(config.cardTags?.(row) ?? []).length > 0 && (
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 6 }}>
                {config.cardTags!(row).map((t, i) => (
                  <StatusPill key={i} label={t.label} color={t.color} size="small" />
                ))}
              </div>
            )}
          </div>
        </div>
      );
    }

    return (
      <div>
        <div style={{ width: '100%', aspectRatio: config.cardImageAspectRatio || '2 / 3', background: '#efebe3', overflow: 'hidden' }}>
          {/* Grid tiles run ~200-300px wide; 400 keeps them sharp on retina
              without pulling the ~410 KB original (Andre, 2026-08-17). */}
          {config.cardImage?.(row) && <img src={thumbUrl(config.cardImage(row), 400)} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />}
        </div>
        <div style={{ padding: '10px 10px 12px' }}>
          {/* cardStatusOwnLine: title, then the pill on its own line below it,
              then cardFields — so a long name can't push the pill out of view
              and every card's rows line up vertically. Default keeps the pill
              beside the title. */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            <span style={{ fontWeight: 700, fontSize: 13, color: '#211f1c', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{titleOf(row)}</span>
            {!config.cardStatusOwnLine && statusPill}
          </div>
          {config.cardStatusOwnLine && statusPill && <div style={{ marginTop: 4 }}>{statusPill}</div>}
          {config.cardSubtitle?.(row) && (
            <div style={{ fontSize: 12, color: '#726c63', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{config.cardSubtitle(row)}</div>
          )}
          {cardFieldList().map((f) => (
            <div key={f.name} style={{ fontSize: 12, color: '#726c63', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {!config.cardFieldsHideLabel && <span style={{ color: '#9a9284' }}>{f.label}: </span>}
              {cardFieldValue(f, row)}
            </div>
          ))}
          {(config.cardTags?.(row) ?? []).length > 0 && (
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 6 }}>
              {config.cardTags!(row).map((t, i) => (
                <StatusPill key={i} label={t.label} color={t.color} size="small" />
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  function detailRender(row: any, refreshKey: number, helpers: Helpers) {
    // Single source of truth for config-driven detail, shared with EntityDrawer.
    return <ResourceDetailBody config={config} row={row} refreshKey={refreshKey} helpers={helpers} />;
  }

  // config.rowActions/showActions (e.g. Product's Duplicate) are
  // `(record) => RowAction[]` — resolved per record on the old engine — but
  // every existing call site returns the same static list regardless of the
  // record passed in (only each action's own onClick(record) closure uses
  // the real row). Calling once with `{}` is enough to discover that static
  // shape; each derived QuickAction/DetailAction still calls the RowAction's
  // onClick with the REAL row when actually clicked.
  //
  // THE PERMISSION GUARD FOR EVERY CONFIG-DRIVEN ACTION lives here, at the one
  // choke point both the card's quick actions and the drawer's "⋯" pass
  // through. Before this, gating was each resource's own job — Sample and
  // Sample Request remembered, Product and Pattern did not, so Product offered
  // "Product Approval" and "Duplicate" to roles that could do neither (Andre,
  // 2026-08-29). A resource now DECLARES what an action needs (RowAction's
  // `requires`) and never re-implements the check.
  function deriveActions(fn: ((record: any) => RowAction[]) | undefined): RowAction[] {
    if (!fn) return [];
    // Permissions not loaded: draw nothing rather than draw everything. The
    // list re-renders the moment they arrive.
    if (!ctx.perm) return [];
    return fn({}).filter((a) => actionAllowed(ctx.perm, config.name, a.requires));
  }

  // Edit + any config.rowActions (Product/Product Measurement's Duplicate) —
  // no Delete here, since Delete already lives in the detail drawer's menu
  // (see canDelete in ListEngine's DetailDrawer), so surfacing it a second
  // time on every row/card is redundant and one accidental swipe/click away.
  // Edit opens the drawer (helpers.openEdit), not a page navigation.
  const quickActions: QuickAction[] = [
    { key: 'edit', icon: <EditOutlined />, label: 'Edit', color: '#26344b', run: (row, helpers: Helpers) => helpers.openEdit(row) },
    ...deriveActions(config.rowActions).map((ra) => ({
      key: ra.key,
      icon: ra.icon,
      label: ra.label,
      danger: ra.danger,
      primary: ra.primary,
      run: (row: any, helpers: Helpers) => (ra.key === 'duplicate' ? ctx.onDuplicate(row.id) : ra.onClick(row, helpers)),
    })),
  ];

  // Same idea for the detail drawer's overflow "⋯" menu (next to Edit and
  // Delete) — config.showActions, e.g. Product's Duplicate again.
  const detailActions: DetailAction[] = deriveActions(config.showActions).map((ra) => ({
    label: ra.label,
    menu: ra.menu !== false,
    run: (row: any, helpers: Helpers) => (ra.key === 'duplicate' ? ctx.onDuplicate(row.id) : ra.onClick(row, helpers)),
  }));

  // Table view (config.viewMode !== 'cards', e.g. Task) — same column set/
  // order as the old ResourceListTable, including the quick-status pill and
  // hover-preview tooltip on the title column. Row-actions (Edit/Delete) are
  // ListEngine's own table default, not built here.
  const tableColumns =
    config.viewMode !== 'cards'
      ? listFields(config).map((f) => ({
          key: f.name,
          title: f.label,
          width: f.listWidth,
          render: (row: any) => {
            const content =
              f.name === config.quickStatusField ? (
                <QuickStatusCell resource={config.name} record={row} field={f} />
              ) : (
                renderFieldValue(f, row)
              );
            if (hoverField && f.name === titleField?.name) {
              const preview = renderFieldValue(hoverField, row);
              if (preview && preview !== '-') {
                return (
                  <Tooltip title={<div style={{ maxWidth: 280 }}>{preview}</div>} placement="topLeft" mouseEnterDelay={0.3}>
                    <span>{content}</span>
                  </Tooltip>
                );
              }
            }
            return content;
          },
        }))
      : undefined;

  // The auto-derived "Set <status>" action always sits at index 0 (its
  // `run` gets swapped for the bulk-status-modal opener in
  // createResourceListView below, by position — everything after it is a
  // config.bulkActions entry and keeps its own onClick untouched).
  // With config.bulkSetFields the one action covers several fields, so it can't
  // be labelled after any single one of them.
  // Gated on EITHER a status field or an explicit bulkSetFields list: Launch
  // has the second without the first (Andre, 2026-08-19 — set Launched /
  // Launch Date across a selection), so quickStatusField can't be the trigger.
  const statusBulkAction: BulkAction | null = statusField || config.bulkSetFields?.length
    ? {
        label: config.bulkSetFields?.length ? 'Set Value' : `Set ${statusField!.label}`,
        bg: '#26344b', color: '#fff', requireSelection: true, run: () => {},
      }
    : null;
  // Which views each custom action applies in. A view that names an allowlist
  // (viewOptions[].bulkActions) keeps only those keys; a view that names none
  // keeps them all. Undefined `views` means "every view", which is every list
  // that declares no views at all.
  const viewKeys = config.viewOptions?.map((v) => v.key) ?? [];
  const viewsFor = (key: string): string[] | undefined =>
    viewKeys.length
      ? config.viewOptions!.filter((v) => !v.bulkActions || v.bulkActions.includes(key)).map((v) => v.key)
      : undefined;

  const customBulkActions: BulkAction[] = (config.bulkActions ?? []).map((ba) => ({
    label: ba.label,
    bg: ba.bg,
    color: ba.color,
    requireSelection: true,
    views: viewsFor(ba.key),
    // `helpers` is passed straight through so a resource's bulk action can
    // refresh the list IN PLACE (helpers.reload / helpers.exitSelect) instead
    // of reaching for window.location.reload(), which throws away the user's
    // search, tab, sort and page. See ListEngine's Helpers.
    run: (ids: string[], helpers: Helpers) => ba.onClick(ids, helpers),
  }));
  const bulkActions: BulkAction[] | undefined = config.hideBulkSelect
    ? undefined
    : statusBulkAction || customBulkActions.length
      ? [...(statusBulkAction ? [statusBulkAction] : []), ...customBulkActions]
      : undefined;

  return {
    title: config.label,
    headerExtra: config.listActionsSlot,
    pageActionsMenu: config.pageActionsMenu?.filter((a) => !a.visible || a.visible(ctx.perm)),
    searchPlaceholder: config.searchPlaceholder,
    emptyText: 'Nothing matches this filter',
    // Grid tiles fill several per row, so a page size only divisible by a
    // couple of numbers (15) reliably ends mid-row. 30 divides cleanly by
    // the common column counts a responsive grid lands on (2,3,5,6,10,15).
    // serverPaged tables aren't held in browser memory, so a bigger page
    // costs a bigger response, not a slower UI — 50 is a reasonable browse
    // density for a plain columns table.
    pageSize: config.serverPaged ? 50 : config.viewMode === 'cards' && config.cardLayout !== 'row' ? 30 : 15,
    DrawerShell,

    fetchList,
    searchText,
    multiWordSearch: config.multiWordSearch,
    renderList: config.renderList,
    mainTabs,
    defaultTab: config.defaultTab,
    secondaryFilters,
    savedFilters,
    serverMode,
    sortOptions: sortOptions.length ? sortOptions : undefined,
    hideSort: config.hideSort,
    // serverMode already returns rows in server-sorted order — re-sorting
    // the same (already-correct) single page client-side is redundant and
    // risks disagreeing with the DB on edge cases (null handling, ties).
    sortComparator: sortOptions.length && !config.serverPaged ? sortComparator : undefined,
    defaultSavedFilterKey: config.savedFilters?.find((sf) => sf.isDefault)?.key,

    quickActions: config.readOnly ? quickActions.filter((a) => a.key !== 'edit') : quickActions,
    // readOnly dropped the CARD's Edit quick action but not the DETAIL drawer's
    // Edit button, so an admin still got an Edit on a resource that declares
    // itself unwritable — and on a resource whose routes export GET only (the
    // WhatsApp chat archive), pressing it opens a form that can only fail.
    // Below, ACL can still take Edit away from someone who has it; readOnly is
    // the resource saying nobody has it.
    canEdit: config.readOnly ? false : undefined,
    renderCard,
    viewOptions: config.viewOptions?.map((v) => ({ key: v.key, label: v.label, rollup: v.rollup, rollupIds: v.rollupIds })),
    viewMode: config.viewMode === 'cards' ? 'cards' : 'table',
    cardGrid: config.viewMode === 'cards' && config.cardLayout !== 'row',
    reorder,
    tableColumns,

    // Products opts in (config.detailFetchById): its cards need an image and a
    // name, while its drawer needs measurements/materials/variants — fetching
    // those per-record instead of per-list-page is what lets the list include
    // stay light. Reuses the same /api/<resource>/<id> route EntityDrawer uses.
    fetchDetail: config.detailFetchById
      ? (id: string) => fetch(`/api/${config.name}/${id}`).then((r) => (r.ok ? r.json() : undefined))
      : undefined,
    detailTitle: titleOf,
    detailWidth: config.detailWidth,
    statusAccent: (row) => {
      if (!statusField) return '#9a9284';
      const related = row[relationDisplayKey(statusField)];
      return statusField.relation?.colorField && related ? pillColor(related[statusField.relation.colorField]).fg : '#9a9284';
    },
    detailRender,
    detailActions: detailActions.length ? detailActions : undefined,
    noDetail: config.noDetail,

    bulkActions,

    // ?force=1 only when the resource showed its own warning (deleteContent) —
    // otherwise a server that guards a destructive delete behind a confirmation
    // gets to refuse, and its reason (not a bare "Delete failed") is surfaced.
    deleteRow: config.readOnly
      ? undefined
      : (id) => fetch(`/api/${config.name}/${id}${config.deleteContent ? '?force=1' : ''}`, { method: 'DELETE' }).then(async (r) => {
        if (r.ok) return;
        const body = await r.json().catch(() => null);
        throw new Error(body?.error || 'Delete failed');
      }),
    deleteTitle: config.deleteTitle || `Delete this ${config.label.toLowerCase().replace(/s$/, '')}?`,
    deleteLabel: config.deleteLabel || titleOf,
    deleteContent: config.deleteContent,

    renderNewDrawer: config.readOnly ? undefined : (api) =>
      config.renderNewForm ? (
        config.renderNewForm({
          open: api.open, onClose: api.onClose, helpers: api.helpers, prefillData: api.prefillData,
          onSaved: () => { api.onClose(); api.helpers.reload(); },
        })
      ) : api.open ? (
        <ResourceFormDrawer
          config={config}
          mode="create"
          open
          onClose={api.onClose}
          onSaved={() => {
            api.onClose();
            api.helpers.reload();
          }}
        />
      ) : null,
    // On save: reloadKeepOpen, NOT reload(row.id). reload(<id>) re-opens the
    // detail drawer on that row — right when the edit was launched from inside
    // the detail drawer (it sits open behind the form and needs the refreshed
    // row), but wrong for a row quick-action edit, where no drawer was open and
    // passing the id pops one open on save. reloadKeepOpen refreshes whichever
    // detail row is actually open, and opens nothing when none is.
    renderEditDrawer: (api) =>
      config.renderEditForm ? (
        api.row ? config.renderEditForm(api.row, {
          open: true, onClose: api.onClose, helpers: api.helpers,
          onSaved: () => { api.onClose(); api.helpers.reloadKeepOpen(); },
        }) : null
      ) : api.row ? (
        <ResourceFormDrawer
          // KEYED BY RECORD. Going straight from one row's edit to another's
          // (Edit from inside the detail drawer, or a quick action on a second
          // row) swaps `row` without ever passing through null, so without a
          // key React keeps the SAME form instance and only changes the `id`
          // prop — leaving the previous record's loaded values in the form
          // while the save targets whichever id the hook has settled on. The
          // key forces a fresh mount per record, so a form can never be
          // showing one record and writing another.
          key={String(api.row.id)}
          config={config}
          mode="edit"
          id={api.row.id}
          open
          onClose={api.onClose}
          onSaved={() => {
            api.onClose();
            api.helpers.reloadKeepOpen();
          }}
        />
      ) : null,
  };
}

export function createResourceListView(config: ResourceConfig) {
  return forwardRef<ListViewHandle>(function ResourceListViewPage(_props, ref) {
    // Bound instance — antd's static `message` renders nothing under React 19.
    const { message } = App.useApp();
    const { data: identity } = useGetIdentity<{ id?: string }>();
    const { perm } = usePermissions();
    const [relationOptions, setRelationOptions] = useState<Record<string, any[]> | null>(null);
    // Non-relation secondary filters that fetch their own options (Product's
    // Designer). Gates the first render like relationOptions/resolvedSaved
    // rather than filling in late: createListView builds a NEW component from
    // the config, so a config that changes after mount remounts the whole list
    // and loses page/scroll/selection. Resources with no such field resolve to
    // {} immediately and never wait.
    const [fieldFilterOptions, setFieldFilterOptions] = useState<Record<string, { value: string; label: string }[]> | null>(null);
    const [resolvedSaved, setResolvedSaved] = useState<Record<string, SavedFilterEntry[] | null> | null>(null);
    const [bulkStatusIds, setBulkStatusIds] = useState<string[] | null>(null);
    // "Set Value" is a form over config.bulkSetFields, keyed by field name
    // (Andre, 2026-08-17): fill in as many fields as you want in one pass, and
    // anything left blank is left alone rather than written as empty. Resources
    // without bulkSetFields still use exactly one entry — the status field.
    const [bulkValues, setBulkValues] = useState<Record<string, string>>({});
    const [bulkBusy, setBulkBusy] = useState(false);
    const [cloneId, setCloneId] = useState<string | number | null>(null);

    // The wrapper needs its OWN handle on the list (to refresh in place after
    // a bulk status change / clone) while still honouring any ref its parent
    // passed down — so keep a local ref and fan the instance out to both.
    const listRef = useRef<ListViewHandle | null>(null);
    const setListRef = useCallback(
      (inst: ListViewHandle | null) => {
        listRef.current = inst;
        if (typeof ref === 'function') ref(inst);
        else if (ref) (ref as React.MutableRefObject<ListViewHandle | null>).current = inst;
      },
      [ref],
    );
    // Refresh the rows without a browser reload, so search / tab / sort / page
    // survive. Falls back to a hard reload only if the list somehow isn't
    // mounted (it always is by the time either caller can fire).
    const refreshInPlace = useCallback(() => {
      if (listRef.current) listRef.current.reload();
      else window.location.reload();
    }, []);

    const relationFieldNames = useMemo(() => {
      const names = new Set<string>();
      if (config.mainTabsField) {
        const f = config.fields.find((x) => x.name === config.mainTabsField);
        if (f?.type === 'relation') names.add(config.mainTabsField);
      }
      if (config.quickStatusField) names.add(config.quickStatusField);
      // Relation fields offered by the "Set Value" bulk action need their
      // options fetched too, not just the status field.
      (config.bulkSetFields ?? []).forEach((n) => {
        const f = config.fields.find((x) => x.name === n);
        if (f?.type === 'relation') names.add(n);
      });
      (config.secondaryFilterFields ?? []).forEach((n) => {
        const f = config.fields.find((x) => x.name === n);
        if (f?.type === 'relation') names.add(n);
      });
      return Array.from(names);
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useEffect(() => {
      Promise.all(
        relationFieldNames.map((name) => {
          const f = config.fields.find((x) => x.name === name)!;
          return fetchRelationOptions(f).then((rows) => [name, rows] as const);
        }),
      ).then((pairs) => setRelationOptions(Object.fromEntries(pairs)));
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useEffect(() => {
      const own = (config.secondaryFilterFields ?? [])
        .map((n) => config.fields.find((x) => x.name === n))
        .filter((f): f is FieldConfig => !!f?.filterOptions);
      if (!own.length) {
        setFieldFilterOptions({});
        return;
      }
      Promise.all(own.map((f) => f.filterOptions!().then((opts) => [f.name, opts] as const)))
        .then((pairs) => setFieldFilterOptions(Object.fromEntries(pairs)))
        // A failed options fetch must not leave the list stuck on its loading
        // gate — render with the filter simply offering nothing.
        .catch(() => setFieldFilterOptions({}));
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useEffect(() => {
      if (!config.savedFilters?.length) {
        setResolvedSaved({});
        return;
      }
      Promise.all(
        config.savedFilters.map((sf) =>
          Promise.resolve(sf.getFilters({ userId: identity?.id })).then((entries) => [sf.key, entries] as const),
        ),
      ).then((pairs) => setResolvedSaved(Object.fromEntries(pairs)));
    }, [identity?.id]);

    const statusField = config.quickStatusField ? config.fields.find((f) => f.name === config.quickStatusField) : undefined;
    const statusOptions = statusField ? relationOptions?.[statusField.name] ?? [] : [];

    // The fields the "Set Value" form offers. Without config.bulkSetFields
    // that's just the status field, which keeps the old single-control modal.
    const bulkSetFieldList = (
      config.bulkSetFields?.length
        ? config.bulkSetFields.map((n) => config.fields.find((f) => f.name === n))
        : [statusField]
    ).filter((f): f is FieldConfig => !!f);
    const isMultiField = (config.bulkSetFields?.length ?? 0) > 0;

    // Only the fields actually filled in get written — a blank one is "leave
    // as-is", not "set to empty". That does mean this action can't CLEAR a
    // field; doing that needs an explicit affordance, deliberately not
    // smuggled into an empty box where a mistyped blank would wipe a
    // selection.
    const bulkFilled = bulkSetFieldList.filter((f) => {
      const v = bulkValues[f.name];
      return v !== undefined && v !== '';
    });
    function bulkSummary(f: FieldConfig): string {
      const v = bulkValues[f.name];
      if (f.type === 'boolean') return v === 'true' ? 'Yes' : 'No';
      if (f.type === 'date' || f.type === 'datetime') return dayjs(v).format(f.type === 'date' ? 'DD MMM YYYY' : 'DD MMM YYYY HH:mm');
      if (f.type !== 'relation') return v;
      const opt = (relationOptions?.[f.name] ?? []).find((o: any) => String(o.id) === v);
      return opt ? relationLabelOf(f, opt) : v;
    }

    const listViewConfig = useMemo(() => {
      if (!relationOptions || !fieldFilterOptions || !resolvedSaved || !perm) return null;
      const built = buildListViewConfig(config, { relationOptions, fieldFilterOptions, resolvedSaved, onDuplicate: setCloneId, message, perm });
      // ACL: hide action buttons the user's role can't use (admins bypass via
      // canAction). No `update` -> drop the row Edit quick action + the detail
      // drawer's Edit button; no `delete` -> drop deleteRow (hides Delete in the
      // detail menu); no `create` -> drop the "+" New button.
      const writeKey = aclWriteKeyOf(config);
      // The specific override, consulted LAST — see ResourceConfig.editOverride.
      // One predicate feeds BOTH the drawer's Edit button and the card's Edit
      // quick action, so the two cannot disagree about a row again.
      const mayEditRow = (row: any) =>
        canAction(perm, writeKey, 'update') || !!config.editOverride?.(row, perm);
      if (config.editOverride) {
        built.canEditRow = mayEditRow;
        built.quickActions = built.quickActions?.map((a) =>
          a.key === 'edit' ? { ...a, visible: mayEditRow } : a,
        );
      }
      if (!canAction(perm, writeKey, 'update')) {
        // Duplicate creates an edited copy, so it's gated as an edit action too
        // (drop it from the row quick actions and the detail overflow menu).
        const dupLabel = built.quickActions?.find((a) => a.key === 'duplicate')?.label;
        built.quickActions = built.quickActions?.filter(
          (a) => (a.key === 'edit' ? !!config.editOverride : false) || (a.key !== 'edit' && a.key !== 'delete' && a.key !== 'duplicate'),
        );
        built.canEdit = false;
        if (dupLabel) built.detailActions = built.detailActions?.filter((a) => a.label !== dupLabel);
      }
      if (!canAction(perm, writeKey, 'delete')) built.deleteRow = undefined;
      if (!canAction(perm, writeKey, 'create')) {
        built.renderNewDrawer = undefined;
        built.newForm = undefined;
      }
      // Only the auto-derived "Set <status>" action (index 0, present when
      // quickStatusField is set) redirects to the bulk-status modal below —
      // config.bulkActions entries keep the onClick they were given.
      const hasAutoBulk = !!(statusField || config.bulkSetFields?.length);
      if (built.bulkActions && hasAutoBulk) {
        built.bulkActions = canAction(perm, writeKey, 'update')
          ? built.bulkActions.map((a, i) =>
              i === 0 ? { ...a, run: (ids: string[]) => setBulkStatusIds(ids) } : a,
            )
          // It writes, so a role without `update` gets it dropped rather than
          // an action that only ever produces failed PATCHes.
          : built.bulkActions.slice(1);
        if (!built.bulkActions.length) built.bulkActions = undefined;
      }
      return built;
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [relationOptions, fieldFilterOptions, resolvedSaved, perm]);

    const ListView = useMemo(() => (listViewConfig ? createListView(listViewConfig) : null), [listViewConfig]);

    async function applyBulkStatus(reload: () => void) {
      if (!bulkStatusIds || !bulkFilled.length) return;
      // Every filled field goes in ONE patch per row, so a row either gets all
      // of the changes or none of them — no half-applied rows if a later field
      // is rejected.
      // Booleans are held as 'true'/'false' strings by the form state (one
      // Record<string,string> for every control) and must be converted back
      // before they go out — the API's Boolean() cast reads the STRING
      // "false" as true. Dates are already serialized by the picker.
      const patch = Object.fromEntries(
        bulkFilled.map((f) => [f.name, f.type === 'boolean' ? bulkValues[f.name] === 'true' : bulkValues[f.name]]),
      );
      setBulkBusy(true);
      try {
        // Chunked rather than one Promise.all over the whole selection: a full
        // page of 50 rows fired at once opens 50 concurrent PATCHes, each doing
        // its own ACL check and write, which is enough to exhaust the Prisma
        // pool and stall the rest of the app mid-update.
        const CHUNK = 8;
        let failed = 0;
        for (let i = 0; i < bulkStatusIds.length; i += CHUNK) {
          const results = await Promise.all(
            bulkStatusIds.slice(i, i + CHUNK).map((id) =>
              fetch(`/api/${config.name}/${id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(patch),
              }).then((r) => r.ok).catch(() => false),
            ),
          );
          failed += results.filter((ok) => !ok).length;
        }
        // Close and refresh first, toast last and guarded. The toast is the
        // least important thing that happens here and it renders through
        // antd's static `message`, a render root outside this tree; ordered
        // the other way round, a throw from it would leave the modal sitting
        // open over rows that had in fact already been written.
        setBulkStatusIds(null);
        setBulkValues({});
        // Drop out of selection mode too — the rows just acted on are done,
        // and leaving stale checkboxes ticked invites a double-apply.
        listRef.current?.exitSelect();
        reload();
        try {
          // A rejected PATCH used to pass silently — fetch only throws on a
          // network error, so a 400/403 still resolved and reported success.
          if (failed) message.error(`${bulkStatusIds.length - failed} updated, ${failed} failed.`);
          else message.success(`Updated ${bulkStatusIds.length}.`);
        } catch { /* toast unavailable — the list already shows the result */ }
      } catch {
        setBulkStatusIds(null);
        try { message.error('Update failed.'); } catch { /* as above */ }
      } finally {
        setBulkBusy(false);
      }
    }

    // Page-level view enforcement (deny-by-default). A role without `view` on
    // this resource can't open its list page even by direct URL — while the
    // underlying data API stays open so aggregate pages (dashboards) and relation
    // pickers that read it keep working. Admins bypass. `perm === null` = still
    // loading -> fall through to the spinner below.
    if (perm && !canAction(perm, aclViewKeyOf(config), 'view')) {
      return (
        <div style={{ textAlign: 'center', padding: 60, color: '#9a9284', fontSize: 14 }}>
          You don’t have access to this page.
        </div>
      );
    }
    if (!ListView) {
      return (
        <div style={{ textAlign: 'center', padding: 60 }}>
          <Spin size="large" />
        </div>
      );
    }

    return (
      <>
        <ListView ref={setListRef} />
        {cloneId != null && (
          <ResourceFormDrawer
            key={String(cloneId)}
            config={config}
            mode="clone"
            id={cloneId}
            open
            onClose={() => setCloneId(null)}
            onSaved={() => { setCloneId(null); refreshInPlace(); }}
          />
        )}
        {/* Both the clone drawer and the bulk-status modal refresh the list
            through ListEngine's imperative handle (see setListRef above)
            rather than reloading the browser — a hard reload dropped the
            user's search, tab, sort and page every time they set a status. */}
        <Modal
          open={!!bulkStatusIds}
          title={isMultiField ? `Set value — ${bulkStatusIds?.length ?? 0} selected` : `Set ${statusField?.label ?? 'status'}`}
          onCancel={() => { setBulkStatusIds(null); setBulkValues({}); }}
          onOk={() => applyBulkStatus(refreshInPlace)}
          confirmLoading={bulkBusy}
          // Nothing filled in = nothing to do. Also stops an accidental OK on
          // an untouched form from writing anything.
          okButtonProps={{ disabled: !bulkFilled.length }}
          // Only the multi-field form restyles the footer/summary; a resource
          // that just has quickStatusField keeps the modal it had before.
          okText={isMultiField && bulkFilled.length ? `Apply to ${bulkStatusIds?.length ?? 0}` : undefined}
        >
          {isMultiField && (
            <div style={{ fontSize: 12, color: '#726c63', marginBottom: 12, lineHeight: 1.5 }}>
              Fill in only what you want to change — anything left blank stays as it is.
            </div>
          )}
          {bulkSetFieldList.map((f) => (
            <div key={f.name} style={{ marginBottom: 10 }}>
              {isMultiField && <div style={{ fontSize: 11, color: '#9a9284', fontWeight: 600, marginBottom: 3 }}>{f.label}</div>}
              {f.type === 'relation' ? (
                <Select
                  style={{ width: '100%' }}
                  placeholder={`Choose ${f.label.toLowerCase()}...`}
                  value={bulkValues[f.name]}
                  // allowClear so a picked option can be taken back OUT of the
                  // patch — clearing the control means "don't touch this
                  // field", not "set it to empty".
                  allowClear
                  onChange={(v) => setBulkValues((prev) => ({ ...prev, [f.name]: v ?? '' }))}
                  options={(relationOptions?.[f.name] ?? []).map((o: any) => ({ value: String(o.id), label: relationLabelOf(f, o) }))}
                />
              ) : f.type === 'boolean' ? (
                // Yes/No, never a text box: a boolean typed as free text
                // reaches the API as the string "false", which is truthy.
                <Select
                  style={{ width: '100%' }}
                  placeholder="Leave blank to keep"
                  value={bulkValues[f.name] || undefined}
                  allowClear
                  onChange={(v) => setBulkValues((prev) => ({ ...prev, [f.name]: v ?? '' }))}
                  options={[{ value: 'true', label: 'Yes' }, { value: 'false', label: 'No' }]}
                />
              ) : f.type === 'date' || f.type === 'datetime' ? (
                <DatePicker
                  style={{ width: '100%' }}
                  placeholder="Leave blank to keep"
                  format={f.type === 'date' ? 'DD MMM YYYY' : 'DD MMM YYYY HH:mm'}
                  showTime={f.type === 'datetime'}
                  value={bulkValues[f.name] ? dayjs(bulkValues[f.name]) : null}
                  // Date-only fields serialize through serializeFormDate, never
                  // a raw UTC conversion — the picked day would roll back one
                  // under +07:00. Same rule the form drawer follows.
                  onChange={(d) => setBulkValues((prev) => ({ ...prev, [f.name]: d ? serializeFormDate(d, f.type === 'date') : '' }))}
                />
              ) : (
                <Input
                  placeholder={isMultiField ? 'Leave blank to keep' : `New ${f.label.toLowerCase()}...`}
                  value={bulkValues[f.name] ?? ''}
                  onChange={(e) => setBulkValues((prev) => ({ ...prev, [f.name]: e.target.value }))}
                />
              )}
            </div>
          ))}
          {/* Spelling out the write before it happens: bulk edits are not
              undoable, and "24 rows × 3 fields" is worth reading back once. */}
          {isMultiField && bulkFilled.length > 0 && (
            <div style={{ fontSize: 11, color: '#726c63', marginTop: 12, padding: '8px 10px', background: '#faf7f2', border: '1px solid #efebe3', borderRadius: 6, lineHeight: 1.6 }}>
              <b>On {bulkStatusIds?.length ?? 0} {config.label.toLowerCase()}:</b>
              {bulkFilled.map((f) => (
                <div key={f.name}>{f.label} → <b>{bulkSummary(f)}</b></div>
              ))}
              <div style={{ color: '#9a9284', marginTop: 4 }}>Overwrites whatever is there now.</div>
            </div>
          )}
        </Modal>
      </>
    );
  });
}
