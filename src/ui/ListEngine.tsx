'use client';

// ui_list_engine — config-driven list-view ENGINE, ported from NocoBase's
// `ui_list_engine` source_code row (v6, 2026-08-05). Faithful 1:1 port of
// the layout, styling, and interaction behavior — search, main tabs,
// secondary filter popup, saved filters, sort, pagination, selection +
// bulk actions, swipe cards (mobile) / hover actions (desktop), detail
// drawer, new/edit drawer shell. Per Andre: migrate as-is, don't alter.
//
// The engine owns the REUSABLE wiring; a view supplies a CONFIG object
// describing the DOMAIN bits (status colors, data fetching, card layout).
//
// Deliberately NOT ported: the original's own data-fetching helpers
// (lib_data_access's fetchAllPages/fetchByIn, working around NocoBase's
// REST pagination/414 limits) — kanoapp's API routes already return joined
// data per page via Prisma `include`, so views here call fetch() against
// kanoapp's own /api/* routes directly. This changes nothing about the
// UI/UX, only how each view's fetchList/fetchSummaries get their data.

import { useState, useEffect, useMemo, useRef, forwardRef, useImperativeHandle, type ReactNode } from 'react';
import { ErrorBoundary } from './ErrorBoundary';
import { confirmDelete } from './confirm-delete';
import { App, Modal, Drawer, Select, DatePicker, InputNumber, Spin, Dropdown, Pagination, Table, Tooltip } from 'antd';
import { EditOutlined } from '@ant-design/icons';
import { useDragReorder, moveItem, DRAG_HANDLE_GLYPH } from '../lib/use-drag-reorder';
import dayjs, { type Dayjs } from 'dayjs';
import { onCloseOpenDetails } from '../lib/entity-drawer-bus';
import { useDirtyClose, useFormDirty } from '../lib/use-dirty-close';
import { HeaderIconButton, MoreActionsIcon, SelectRowsIcon } from './header-icons';

const { RangePicker } = DatePicker;

function uniq<T>(a: T[]): T[] {
  const out: T[] = [];
  const seen: Record<string, 1> = {};
  a.forEach((x) => {
    if (x == null) return;
    const k = String(x);
    if (!seen[k]) { seen[k] = 1; out.push(x); }
  });
  return out;
}
function inDateBound(dateStr: string | null | undefined, range: [Dayjs | null, Dayjs | null] | null): boolean {
  if (!range || (!range[0] && !range[1])) return true;
  if (!dateStr) return false;
  const d = dayjs(dateStr);
  if (range[0] && d.isBefore(range[0], 'day')) return false;
  if (range[1] && d.isAfter(range[1], 'day')) return false;
  return true;
}

function errText(e: any): string {
  if (!e) return 'unknown error';
  const body = e.response && e.response.data;
  const apiMsg = body && body.errors && body.errors[0] && body.errors[0].message;
  const status = e.response && e.response.status ? `[HTTP ${e.response.status}] ` : '';
  return status + String(apiMsg || e.message || e);
}
function warn(what: string, e: any) {
  try { console.warn('[ListEngine] ' + what + ': ' + errText(e)); } catch { /* noop */ }
}

const BASE_CSS =
  '.kano-root *{box-sizing:border-box;}' +
  '.kano-root .kano-cardwrap{position:relative;overflow:hidden;border-radius:14px;margin-bottom:10px;background:#f1dcd8;}' +
  '.kano-root .kano-card{position:relative;z-index:2;background:#fff;border:1px solid #e7e2d9;border-radius:14px;transition:transform .18s ease;touch-action:pan-y;}' +
  '.kano-root .kano-actions{position:absolute;top:0;right:0;height:100%;display:flex;z-index:1;}' +
  '.kano-root .kano-actbtn{width:70px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:3px;color:#fff;font-size:11px;font-weight:700;cursor:pointer;border:none;}' +
  '.kano-root .kano-hover-actions{position:absolute;top:8px;right:8px;display:flex;gap:6px;opacity:0;transition:opacity .15s;z-index:3;}' +
  '@media (hover:hover) and (pointer:fine){.kano-root .kano-card:hover .kano-hover-actions,.kano-root .kano-tile:hover .kano-hover-actions{opacity:1;}}' +
  '@media (hover:none){.kano-root .kano-tile .kano-hover-actions{opacity:1;}}' +
  '.kano-root .kano-hover-btn{width:30px;height:30px;padding:0;border-radius:8px;border:1px solid #e7e2d9;background:#fff;color:#3d4658;display:flex;align-items:center;justify-content:center;font-size:15px;cursor:pointer;box-shadow:0 1px 2px rgba(15,23,42,0.08);}' +
  '.kano-root .kano-hover-btn:hover{background:#faf9f6;}' +
  '.kano-root .kano-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:12px;margin-bottom:12px;}' +
  '.kano-root .kano-tile{position:relative;border:1px solid #e7e2d9;border-radius:14px;background:#fff;overflow:hidden;cursor:pointer;transition:box-shadow .15s;}' +
  '.kano-root .kano-tile:hover{box-shadow:0 2px 8px rgba(15,23,42,0.08);}' +
  '.kano-root .kano-searchrow{display:flex;gap:8px;align-items:center;margin-bottom:12px;}' +
  '.kano-root .kano-tabs{display:flex;gap:6px;flex-wrap:nowrap;overflow-x:auto;margin-bottom:14px;padding-bottom:2px;-webkit-overflow-scrolling:touch;scrollbar-width:none;}' +
  '.kano-root .kano-tabs::-webkit-scrollbar{display:none;}' +
  '.kano-root .kano-tabs > button{flex-shrink:0;}' +
  '.kano-sortlabel{display:none;}' +
  '.kano-detail-drawer .ant-drawer-content-wrapper{width:min(var(--kano-detail-w,900px),92vw) !important;}' +
  '@media (max-width:700px){.kano-detail-drawer .ant-drawer-content-wrapper{width:100% !important;}}' +
  '.kano-edit-drawer .ant-drawer-content-wrapper{width:min(560px,100vw) !important;}' +
  '@media (max-width:700px){.kano-edit-drawer .ant-drawer-content-wrapper{width:100% !important;}}';

// ── types ──
export interface MainTab { key: string; label: string; color?: string; bg?: string }
export interface SecondaryFilterDef {
  key: string;
  label?: string;
  kind?: 'select' | 'dateRange' | 'numberRange';
  // Suffix on a numberRange's Min/Max placeholders — "Min %", "Min Rp".
  rangeUnit?: string;
  multi?: boolean;
  field?: string;
  search?: boolean;
  placeholder?: string;
  normalize?: 'lower';
  default?: any;
  options?: (data: any[]) => any[];
  optionLabel?: (o: any) => string;
  match?: (row: any, vals: any) => boolean;
}
export interface SavedFilterDef {
  key: string;
  label: string;
  apply?: { filters?: Record<string, any>; sort?: string; view?: string };
  match?: (row: any) => boolean;
}
export interface QuickAction {
  key: string;
  icon: ReactNode;
  label: string;
  color?: string;
  primary?: boolean;
  danger?: boolean;
  // Hide this action on SOME rows. Used for Edit, which can be permitted per
  // record by ResourceConfig.editOverride.
  visible?: (row: any) => boolean;
  run: (row: any, helpers: Helpers) => void;
}
export interface DetailAction {
  label: string;
  menu?: boolean;
  color?: string;
  bg?: string;
  borderColor?: string;
  run: (row: any, helpers: Helpers) => void;
}
export interface BulkAction {
  label: string;
  bg?: string;
  color?: string;
  requireSelection?: boolean;
  // The views this action applies in (ResourceConfig.viewOptions keys).
  // Undefined means every view — which is every action on every list that
  // declares no views. Launch's "Match to Production" is product-view only:
  // a launch is matched to a production one product at a time.
  views?: string[];
  run: (ids: string[], helpers: Helpers) => void;
}
// Shared by Card's swipe/hover actions and the table view's row-actions
// column, so both fall back to the same Edit/Delete pair when a view
// doesn't supply its own config.quickActions.
function defaultQuickActions(onEdit: (row: any) => void, onDelete: (row: any) => void): QuickAction[] {
  return [
    { key: 'edit', icon: <EditOutlined />, label: 'Edit', color: '#26344b', run: (r) => onEdit(r) },
    { key: 'delete', icon: '🗑', label: 'Delete', color: '#a23b2e', danger: true, run: (r) => onDelete(r) },
  ];
}

export interface Helpers {
  // App.useApp()'s bound message. Action handlers live in resource configs and
  // module-level functions, which cannot call the hook themselves — and antd's
  // STATIC message is inert under React 19, so without this their toasts
  // silently never render.
  message: import('antd').MessageArgsProps extends never ? never : ReturnType<typeof import('antd').App.useApp>['message'];
  reload: (keepOpenId?: string | number | null) => Promise<any>;
  reloadUntil: (predicate?: (rows: any[], summaries: any) => boolean, attempts?: number) => Promise<any>;
  closeDetail: () => void;
  refresh: () => void;
  reloadKeepOpen: () => Promise<any>;
  getImage: (row: any) => string;
  exitSelect: () => void;
  openNewWithPrefill: (data: any) => void;
  selectAll: () => void;
  selectIds: (ids: (string | number)[]) => void;
  clearSelection: () => void;
  openEdit: (row: any) => void;
  confirmDelete: (row: any) => void;
}

// Imperative escape hatch for a page-level component rendered OUTSIDE the
// list (a modal opened via ctx, not a rowAction/quickAction/detailAction —
// those already get `helpers` passed straight in). Those page-level modals
// otherwise have no way to ask the list to refresh itself in place, and
// fell back to a full `window.location.reload()` — harmless on a standalone
// list page, but wrong once that list lives inside an inner-header-menu tab
// (a full reload drops you back on the tab group's default tab). See
// ProductionTabs.tsx's Material Out wiring for the first real caller.
export interface ListViewHandle {
  reload: () => void;
  // Leave selection mode and drop the selection — for a wrapper that just
  // finished acting on the selected rows (e.g. the bulk "Set <status>"
  // modal) and wants the list back in its normal state.
  exitSelect: () => void;
}

// Context passed to a custom list body (ListViewConfig.renderList).
export interface ListBodyCtx {
  rows: any[]; // the current page's rows (already filtered/searched/sorted/paged)
  query: string;
  selectMode: boolean;
  helpers: Helpers;
  openRow: (row: any) => void;
  editRow: (row: any) => void;
  deleteRow: (row: any) => void;
  isSelected: (id: string) => boolean;
  toggleSelect: (id: string) => void;
  getId: (row: any) => string | number;
}

export interface ListViewConfig {
  title?: string;
  css?: string;
  searchPlaceholder?: string;
  emptyText?: string;
  pageSize?: number;
  getRowId?: (row: any) => string | number;
  // Extra header button(s) with their own open/close state (e.g. Product's
  // Bulk Image Import) — rendered before the +/select icon buttons. The node
  // supplies its own trigger; the engine just gives it a slot.
  headerExtra?: ReactNode;
  // Page-level actions that aren't row/bulk-scoped (e.g. Production Result's
  // Import) — rendered as their own "⋯" dropdown between headerExtra and the
  // Select icon. Kept separate from bulkActions/the Select toggle on
  // purpose: Select only ever means "enter row-selection mode" (Andre,
  // 2026-08-13 — folding Import into that same icon's dropdown would give it
  // two unrelated meanings and get muddier as more page actions are added).
  pageActionsMenu?: { key: string; label: string; icon?: ReactNode; onClick: () => void }[];

  // Required unless serverMode is set (serverMode.fetchPage replaces it).
  // `view` is the active viewOptions key ('' when the list declares none) — a
  // list whose rows are GROUPED server-side (Restock's model rollup) gets a
  // fresh fetch when it changes; one that ignores the argument doesn't.
  fetchList?: (params: { view: string }) => Promise<any[]>;
  // For tables too large to load whole (100k+ rows) — search/secondary-
  // filter/sort/pagination all become a network request instead of an
  // in-browser array scan. data holds only the CURRENT page; total drives
  // the Pagination control. When the resource has main tabs, fetchPage may
  // also return `tabCounts` (a server-side groupBy over the full matching
  // set, keyed the same as the tabs plus an 'all' total) so the tab badges
  // stay accurate — an in-browser tally would only see the current page.
  // The selection bar's "Select all" needs every matching id, which in this
  // mode the browser doesn't have (only the current page is loaded) — supply
  // fetchAllIds so it can ask the server for the full id set under the same
  // search/filters/tab. Without it, "Select all" is limited to the loaded
  // page and says so.
  serverMode?: {
    fetchPage: (params: {
      page: number; pageSize: number; search: string; sortKey: string | undefined; filters: Record<string, any>; tab: string; savedFilterKey: string | null; view: string;
    }) => Promise<{ data: any[]; total: number; tabCounts?: Record<string, number> }>;
    fetchAllIds?: (params: {
      search: string; sortKey: string | undefined; filters: Record<string, any>; tab: string; savedFilterKey: string | null; view: string;
    }) => Promise<(string | number)[]>;
  };
  fetchSummaries?: (rows: any[]) => Promise<any>;
  fetchExtra?: () => Promise<any>;
  fetchImages?: () => Promise<any>;
  getImage?: (row: any, imgMap: any) => string;

  searchText?: (row: any) => any[];

  mainTabs?: { allLabel?: string; tabs: MainTab[]; classify: (row: any) => string };
  // Which main tab a fresh visit lands on. Defaults to 'all'. Set it when the
  // list's whole point is the un-dealt-with subset — Admin > Errors opens on
  // Open, because a problem already marked fixed is not what you came to see.
  defaultTab?: string;
  secondaryFilters?: SecondaryFilterDef[];
  savedFilters?: SavedFilterDef[];
  // Applied on first load, before the user touches anything — e.g. Task's
  // "My Recent Tasks". Must match one of savedFilters[].key.
  defaultSavedFilterKey?: string;

  // The same rows presented a different way — e.g. Launch as one row per
  // MODEL (the colourways of a style, which is the unit it is actually
  // scheduled in) or one row per product. Renders the shared "View by" control
  // beside Filter and Sort; fewer than two options renders nothing at all.
  //
  // Engine-level on purpose (Andre, 2026-08-27): a list declares what it can
  // be viewed by and gets the same button in the same place, rather than each
  // list growing its own toggle. Filter picks WHICH rows, Sort picks their
  // ORDER, View by picks WHAT A ROW IS.
  //
  // The active key reaches the server as serverMode.fetchPage's `view`, and
  // renderCard's `view`, so a resource can both group server-side and draw a
  // different card per view.
  // `rollup: true` marks a view whose rows are AGGREGATES rather than records
  // — Launch's model row stands for 4-7 launch_plan rows and has no id of its
  // own to edit, delete or open. The engine then offers no row actions, no
  // detail drawer and no row selection in that view; the card owns its own
  // click (Launch's expands in place to show the colourways, each of which IS
  // a real record).
  viewOptions?: {
    key: string;
    label: string;
    rollup?: boolean;
    // The REAL record ids a rollup row stands for. Selecting the row selects
    // all of them, so a bulk action (Set Value) writes to the records rather
    // than to a group id that no route has ever heard of.
    rollupIds?: (row: any) => (string | number)[];
  }[];

  sortOptions?: { key: string; label: string }[];
  sortComparator?: (key: string) => ((a: any, b: any) => number) | null;
  // Hide the toolbar's Sort control entirely. Without sortOptions the button
  // still renders a lone decorative "Newest" item, which lies about a list
  // that arrives in a fixed server-chosen order (e.g. Restock, always est.
  // finish ascending). Only for lists whose order is not the user's to pick.
  hideSort?: boolean;

  quickActions?: QuickAction[];
  // `query` is the current (trimmed, lowercased) search text — passed through
  // so a custom card can highlight matched substrings (e.g. the merged
  // Material list). Empty string when not searching.
  renderCard: (o: { row: any; summary: any; imgMap: any; getImage: (row: any, imgMap: any) => string; selectMode: boolean; selected: boolean; query: string; view: string; openRow: (row: any) => void }) => ReactNode;
  // Opt-in multi-word search: split the query on whitespace and match a row
  // iff EVERY token appears somewhere in its searchText haystack (token-AND),
  // instead of the default single contiguous-phrase match. Only set by
  // resources that want it (currently the Material list) — every other list
  // keeps the existing single-phrase behavior.
  multiWordSearch?: boolean;
  // Fully custom list BODY, keeping all the standard chrome above (toolbar,
  // tabs-with-counts, filter popup, search, pagination) and the detail drawer.
  // Overrides the card/grid/table body when set — for lists that need a shape
  // the built-in bodies can't express (e.g. Material's grouped fabric +
  // variant rows). Receives the current page's rows plus helpers/handlers.
  renderList?: (ctx: ListBodyCtx) => ReactNode;
  // 'cards' (default): the swipe/hover card list every existing view uses.
  // 'table': a plain columns table instead — same toolbar/tabs/filters/
  // saved-filters/detail-drawer chrome, just a different list body. Needs
  // tableColumns when set.
  viewMode?: 'cards' | 'table';
  tableColumns?: { key: string; title: string; width?: number; render: (row: any) => ReactNode }[];
  // When viewMode is 'cards': true renders a multi-column CSS grid of tiles
  // (renderCard's content, e.g. Product's image-on-top catalog look) instead
  // of the default vertical stack of full-width swipe/hover Cards (Sample's
  // feed look). Tiles don't swipe — a hover cluster (desktop) or a select
  // checkbox overlay (select mode) stand in for that.
  cardGrid?: boolean;
  // Drag-to-reorder for the table view — a leftmost drag-handle column that
  // appears only when the list is showing its true, unambiguous order
  // (sorted by `sortKey`, no active search/secondary filter — reordering a
  // filtered/searched subset doesn't map cleanly onto a single global sort
  // number). Dropping a row calls onReorder with that page's rows in their
  // new order; the caller persists it (e.g. PATCHing each row's sort field).
  reorder?: { sortKey: string; onReorder: (rows: any[]) => void };

  detailTitle?: (row: any) => string;
  // Overrides the detail drawer's default max-width (900px, still capped at
  // 92vw) via the --kano-detail-w CSS var — e.g. Production's own detail
  // has enough content (accordion sections + a comments column) to want
  // more room than the 900px default. Omit to keep the shared default.
  detailWidth?: number;
  statusAccent?: (row: any) => string;
  // Fetches the FULL record when a detail drawer opens, merged over the list
  // row. Lets a resource keep heavy relations OUT of its list payload (a card
  // needs an image and a name; the drawer needs measurements, materials,
  // variants) without the drawer losing them — Product's list went 267 KB/637 ms
  // to 46 KB/58 ms per 50 rows this way. Opt-in: a resource whose list rows are
  // computed/derived shapes its detail API doesn't reproduce must NOT set it.
  fetchDetail?: (id: string) => Promise<any | undefined>;
  detailRender?: (row: any, refreshKey: number, helpers: Helpers) => ReactNode;
  detailSections?: { title: string; render: (row: any, refreshKey: number, helpers: Helpers) => ReactNode }[];
  detailActions?: DetailAction[];

  renderNewDrawer?: (api: { open: boolean; onClose: () => void; helpers: Helpers; prefillData: any }) => ReactNode;
  renderEditDrawer?: (api: { open: boolean; row: any; onClose: () => void; helpers: Helpers }) => ReactNode;
  newForm?: FormSpec;
  editForm?: FormSpec;

  deleteRow?: (id: string | number) => Promise<any>;
  deleteTitle?: string;
  deleteLabel?: (row: any) => string;
  // Extra body for the delete confirm, resolved when the dialog opens — for a
  // delete that reaches past the row and has to look it up first (Material
  // asks the server what still references the fabric). Replaces the default
  // "<label> will be permanently deleted." line; the dialog itself stays the
  // engine's, so every list confirms a delete the same way.
  deleteContent?: (row: any) => Promise<ReactNode> | ReactNode;
  // ACL: when false, the detail drawer's "Edit" button is hidden (the caller
  // also strips the row-level Edit quick action). Defaults to shown.
  canEdit?: boolean;
  // Per-row override of `canEdit`, from ResourceConfig.editOverride.
  canEditRow?: (row: any) => boolean;
  // No detail drawer at all — clicking a row/card does nothing. For a pure
  // browse list whose card already shows everything there is to say (e.g. the
  // Production Restock report). Different from readOnly, which only drops
  // create/edit/delete and keeps the detail view.
  noDetail?: boolean;

  bulkActions?: BulkAction[];
  banner?: (data: any[]) => ReactNode | string | { type: 'warning' | 'info' | 'error' | 'success'; text: string } | null;

  DrawerShell?: React.ComponentType<any>;
}
export interface FormSpec {
  title?: string;
  width?: number;
  load?: (row: any) => Promise<any>;
  initial?: () => any;
  validate?: (form: any) => string | null;
  submit: (idOrForm: any, form?: any) => Promise<any>;
  successMsg?: string;
  render: (form: any, setF: (k: string, v: any) => void, extra: any, errs: any, setErrs: any) => ReactNode;
}

// ── shared icons ──
// Both were plain text glyphs / a borrowed hamburger before. Drawn as SVGs so
// they render identically across platforms (the text "⋯" sits differently in
// every font) and so "select rows" stops reading as a nav menu.
function MoreDotsIcon(p: { color?: string }) {
  const c = p.color || '#3d4658';
  return (
    <svg width={18} height={18} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="5" cy="12" r="1.9" fill={c} />
      <circle cx="12" cy="12" r="1.9" fill={c} />
      <circle cx="19" cy="12" r="1.9" fill={c} />
    </svg>
  );
}
// ── small shared chrome ──
function SearchBar(p: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <div style={{ flex: 1, position: 'relative', display: 'flex', alignItems: 'center' }}>
      <input
        value={p.value}
        onChange={(e) => p.onChange(e.target.value)}
        placeholder={p.placeholder || 'Search…'}
        // Rounded to match the pill search bar used everywhere else in the
        // app (kano-toolbar-input) and bumped to 16px so focusing it doesn't
        // trigger iOS Safari's auto-zoom — an explicit exception to this
        // file's "migrate as-is" rule, requested directly for consistency.
        style={{ width: '100%', height: 44, padding: '0 32px 0 16px', borderRadius: 22, border: '1px solid #e7e2d9', fontSize: 16, outline: 'none', boxSizing: 'border-box' }}
      />
      {p.value ? (
        <button
          onClick={() => p.onChange('')}
          title="Clear"
          style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', border: 'none', background: '#efebe3', color: '#726c63', borderRadius: 999, width: 20, height: 20, cursor: 'pointer', fontSize: 13, lineHeight: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
        >
          ×
        </button>
      ) : null}
    </div>
  );
}
function MainFilterBar(p: { tabs: (MainTab & { count: number })[]; value: string; onChange: (k: string) => void }) {
  return (
    <div className="kano-tabs">
      {p.tabs.map((t) => {
        const active = p.value === t.key;
        const c = t.color || '#726c63';
        const bg = t.bg || (t.key === 'all' ? '#faf9f6' : c + '14');
        return (
          <button
            key={t.key}
            onClick={() => p.onChange(t.key)}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '5px 12px', borderRadius: 20, border: '1.5px solid ' + (active ? c : '#e7e2d9'), background: active ? bg : '#fff', color: active ? c : '#726c63', fontWeight: active ? 700 : 500, fontSize: 12, cursor: 'pointer' }}
          >
            {t.label}
            <span style={{ background: active ? c : '#e7e2d9', color: active ? '#fff' : '#726c63', borderRadius: 20, padding: '0 6px', fontSize: 11, fontWeight: 700 }}>{t.count ?? 0}</span>
          </button>
        );
      })}
    </div>
  );
}
function FilterButton(p: { activeCount: number; onClick: () => void }) {
  const a = p.activeCount;
  return (
    <button onClick={p.onClick} style={{ position: 'relative', flexShrink: 0, width: 40, height: 40, borderRadius: 10, border: '1.5px solid ' + (a ? '#26344b' : '#e7e2d9'), background: a ? '#e2e6ee' : '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <svg width={18} height={18} viewBox="0 0 24 24" fill="none"><path d="M4 5h16l-6 8v5l-4 2v-7L4 5z" stroke={a ? '#1c2738' : '#726c63'} strokeWidth={1.6} strokeLinejoin="round" /></svg>
      {a ? <span style={{ position: 'absolute', top: -5, right: -5, background: '#26344b', color: '#fff', borderRadius: 999, minWidth: 16, height: 16, fontSize: 10, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 4px' }}>{a}</span> : null}
    </button>
  );
}
function SortButton(p: { value: string; onChange: (k: string) => void; options: { key: string; label: string }[] }) {
  if (!p.options || !p.options.length) return null;
  const active = p.value !== p.options[0].key;
  const current = (p.options.find((o) => o.key === p.value) || p.options[0]).label;
  const menu = { selectable: true, selectedKeys: [p.value], items: p.options.map((o) => ({ key: o.key, label: o.label })), onClick: (e: any) => p.onChange(e.key) };
  return (
    <Dropdown menu={menu} trigger={['click']} placement="bottomRight">
      <button title="Sort" style={{ display: 'inline-flex', alignItems: 'center', gap: 7, flexShrink: 0, height: 40, padding: '0 12px', borderRadius: 10, border: '1.5px solid ' + (active ? '#26344b' : '#e7e2d9'), background: active ? '#e2e6ee' : '#fff', color: active ? '#1c2738' : '#726c63', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
        <svg width={15} height={15} viewBox="0 0 24 24" fill="none"><path d="M7 20V4M4 7l3-3 3 3M17 4v16M14 17l3 3 3-3" stroke={active ? '#1c2738' : '#726c63'} strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" /></svg>
        <span className="kano-sortlabel">{current}</span>
      </button>
    </Dropdown>
  );
}
// "View by" — the third toolbar control, between Filter and Sort (Andre,
// 2026-08-27: "one more button like filter for view... we call it view by").
// Deliberately NOT folded into Sort and deliberately NOT a saved filter: a
// saved filter REPLACES filters and sort when picked, so a view living there
// would silently wipe the list's default filter.
//
// Same shape as SortButton so the row reads as three siblings. A list with
// fewer than two views renders nothing, so every existing list is untouched.
function ViewByButton(p: { value: string; onChange: (k: string) => void; options: { key: string; label: string }[] }) {
  if (!p.options || p.options.length < 2) return null;
  const active = p.value !== p.options[0].key;
  const current = (p.options.find((o) => o.key === p.value) || p.options[0]).label;
  const menu = {
    selectable: true,
    selectedKeys: [p.value],
    items: [{ key: '__viewby', type: 'group' as const, label: 'View by', children: p.options.map((o) => ({ key: o.key, label: o.label })) }],
    onClick: (e: any) => p.onChange(e.key),
  };
  return (
    <Dropdown menu={menu} trigger={['click']} placement="bottomRight">
      <button title="View by" style={{ display: 'inline-flex', alignItems: 'center', gap: 7, flexShrink: 0, height: 40, padding: '0 12px', borderRadius: 10, border: '1.5px solid ' + (active ? '#26344b' : '#e7e2d9'), background: active ? '#e2e6ee' : '#fff', color: active ? '#1c2738' : '#726c63', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
        {/* a group header with rows beneath it — "what a row is" */}
        <svg width={15} height={15} viewBox="0 0 24 24" fill="none"><rect x={3} y={4} width={18} height={6} rx={1.5} stroke={active ? '#1c2738' : '#726c63'} strokeWidth={1.7} /><path d="M7 14h11M7 18h7" stroke={active ? '#1c2738' : '#726c63'} strokeWidth={1.7} strokeLinecap="round" /></svg>
        <span className="kano-sortlabel">{current}</span>
      </button>
    </Dropdown>
  );
}

const BANNER_PALETTE = {
  warning: { bg: '#f6e9c9', border: '#e8cf8f', color: '#9c6b14', icon: '⚠' },
  info: { bg: '#e2e6ee', border: '#c5cddb', color: '#26344b', icon: 'ℹ' },
  error: { bg: '#f1dcd8', border: '#dbb0a8', color: '#7a2e22', icon: '⛔' },
  success: { bg: '#dcebe0', border: '#b8d4c0', color: '#2f6846', icon: '✓' },
} as const;
function renderBanner(b: ReactNode | string | { type?: keyof typeof BANNER_PALETTE; text: string } | null) {
  if (!b) return null;
  if (typeof b !== 'string' && typeof b === 'object' && 'type' in (b as any) === false && '$$typeof' in (b as any)) return b as ReactNode;
  const isObj = typeof b === 'object' && b !== null && !('$$typeof' in (b as any));
  const type = isObj ? (b as any).type || 'warning' : 'warning';
  const text = isObj ? (b as any).text : b;
  const p = BANNER_PALETTE[type as keyof typeof BANNER_PALETTE] || BANNER_PALETTE.warning;
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, background: p.bg, border: '1px solid ' + p.border, color: p.color, borderRadius: 10, padding: '10px 12px', marginBottom: 12, fontSize: 13, lineHeight: 1.5 }}>
      <span style={{ flexShrink: 0 }}>{p.icon}</span>
      <span>{text}</span>
    </div>
  );
}

function LoadError(p: { error: string; onRetry?: () => void }) {
  return (
    <div style={{ textAlign: 'center', padding: 40 }}>
      <div style={{ fontSize: 14, fontWeight: 700, color: '#7a2e22', marginBottom: 6 }}>Could not load this list</div>
      <div style={{ fontSize: 12, color: '#726c63', lineHeight: 1.6, wordBreak: 'break-word', maxWidth: 520, margin: '0 auto' }}>{p.error}</div>
      {p.onRetry ? <button onClick={p.onRetry} style={{ marginTop: 14, border: '1px solid #e7e2d9', background: '#fff', borderRadius: 8, padding: '7px 18px', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Retry</button> : null}
    </div>
  );
}

// data-kano-section* mirror DetailAccordionShell's hooks so scripts/browser-check.mjs
// drives this older accordion the same way. They render nothing.
function AccordionItem(p: { title: string; open: boolean; onToggle: () => void; children: ReactNode }) {
  return (
    <div data-kano-section={p.title} style={{ borderTop: '1px solid #efebe3' }}>
      <div data-kano-section-toggle="" onClick={p.onToggle} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 4px', cursor: 'pointer', userSelect: 'none' }}>
        <span style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: p.open ? '#211f1c' : '#726c63' }}>{p.title}</span>
        <span style={{ display: 'inline-block', color: '#9a9284', fontSize: 18, transform: p.open ? 'rotate(90deg)' : 'none', transition: 'transform .2s' }}>›</span>
      </div>
      {p.open ? <div style={{ padding: '0 4px 18px' }}>{p.children}</div> : null}
    </div>
  );
}

// Recolored from NocoBase's own indigo/slate default palette to kanoapp's
// "Ledger" template (navy #26344b, warm paper tones) at Andre's request —
// this supersedes the "migrate as-is, don't alter" note at the top of this
// file for colors specifically; layout/interaction behavior is unchanged.

// =====================================================
// FACTORY
// =====================================================
export function createListView(config: ListViewConfig) {
  const PAGE_SIZE = config.pageSize || 15;
  const getId = config.getRowId || ((r: any) => r.id);
  const sortOptions = config.sortOptions || [{ key: 'created_desc', label: 'Newest' }];
  const filterDefs = config.secondaryFilters || [];
  const savedFilterDefs = config.savedFilters || [];

  function defaultFilterVals(): Record<string, any> {
    const z: Record<string, any> = {};
    filterDefs.forEach((f) => { z[f.key] = f.kind === 'dateRange' || f.kind === 'numberRange' ? null : (f.multi ? [] : 'all'); });
    return z;
  }

  function FilterPopup(p: {
    open: boolean; values: Record<string, any>; savedFilterKey: string | null; options: Record<string, any[]>;
    onClose: () => void; onApply: (vals: Record<string, any>, savedKey: string | null, pendingSort: string | null) => void;
  }) {
    const [vals, setVals] = useState(p.values);
    const [savedKey, setSavedKey] = useState<string | null>(p.savedFilterKey || null);
    const [pendingSort, setPendingSort] = useState<string | null>(null);
    useEffect(() => { if (p.open) { setVals(p.values); setSavedKey(p.savedFilterKey || null); setPendingSort(null); } }, [p.open]);
    function setOne(k: string, v: any) { setVals((prev) => ({ ...prev, [k]: v })); }
    const label = (t: string) => <div style={{ fontSize: 11, fontWeight: 600, color: '#726c63', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{t}</div>;

    function onPickSaved(key: string) {
      setSavedKey(key === 'none' ? null : key);
      if (key === 'none') { setPendingSort(null); return; }
      const preset = savedFilterDefs.find((sf) => sf.key === key);
      if (!preset) return;
      const resetVals = defaultFilterVals();
      setVals(preset.apply?.filters ? { ...resetVals, ...preset.apply.filters } : resetVals);
      setPendingSort(preset.apply?.sort || null);
    }
    const savedFilterControl = savedFilterDefs.length ? (
      <div key="__saved_filter">
        {label('Saved Filter')}
        <Select
          value={savedKey || 'none'}
          onChange={onPickSaved}
          style={{ width: '100%' }}
          options={[{ value: 'none', label: 'None' }, ...savedFilterDefs.map((sf) => ({ value: sf.key, label: sf.label }))]}
        />
      </div>
    ) : null;

    function control(f: SecondaryFilterDef) {
      if (f.kind === 'dateRange') {
        return <RangePicker allowEmpty={[true, true]} value={vals[f.key] || null} onChange={(v) => setOne(f.key, v)} format="DD/MM/YYYY" style={{ width: '100%' }} />;
      }
      if (f.kind === 'numberRange') {
        // Either side may be left blank. antd writes null into a cleared
        // InputNumber, and null is what we want — an empty Min must mean "no
        // lower bound", never 0, or "CTR from blank to 4%" would silently
        // become "CTR 0-4%" and hide every uncounted row.
        const cur: [number | null, number | null] = vals[f.key] ?? [null, null];
        const setSide = (i: 0 | 1, n: number | null) => {
          const next: [number | null, number | null] = i === 0 ? [n, cur[1]] : [cur[0], n];
          setOne(f.key, next[0] == null && next[1] == null ? null : next);
        };
        return (
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <InputNumber
              style={{ width: '100%' }}
              placeholder={f.rangeUnit ? `Min ${f.rangeUnit}` : 'Min'}
              value={cur[0]}
              onChange={(n) => setSide(0, n as number | null)}
            />
            <span style={{ color: '#9a9284' }}>–</span>
            <InputNumber
              style={{ width: '100%' }}
              placeholder={f.rangeUnit ? `Max ${f.rangeUnit}` : 'Max'}
              value={cur[1]}
              onChange={(n) => setSide(1, n as number | null)}
            />
          </div>
        );
      }
      if (f.multi) {
        const mopts = (p.options[f.key] || []).map((o) => (typeof o === 'object' ? o : { value: o, label: f.optionLabel ? f.optionLabel(o) : o }));
        return (
          <Select
            mode="multiple" allowClear showSearch={f.search !== false}
            value={vals[f.key] || []} onChange={(v) => setOne(f.key, v)} style={{ width: '100%' }}
            placeholder={f.placeholder || `Any ${String(f.label || f.key).toLowerCase()}`}
            filterOption={(i, o: any) => String(o.label).toLowerCase().includes(i.toLowerCase())}
            options={mopts}
          />
        );
      }
      const opts = [{ value: 'all', label: `All ${(f.label || f.key).toLowerCase()}` }, ...(p.options[f.key] || []).map((o) => (typeof o === 'object' ? o : { value: o, label: f.optionLabel ? f.optionLabel(o) : o }))];
      return (
        <Select
          showSearch={!!f.search} value={vals[f.key] != null ? vals[f.key] : 'all'} onChange={(v) => setOne(f.key, v)} style={{ width: '100%' }}
          filterOption={(i, o: any) => String(o.label).toLowerCase().includes(i.toLowerCase())}
          options={opts}
        />
      );
    }
    function clearAll() { const z = defaultFilterVals(); setVals(z); setSavedKey(null); setPendingSort(null); }

    return (
      <Modal
        open={p.open} title="Filters" onCancel={p.onClose} width={420}
        footer={
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <button onClick={clearAll} style={{ border: 'none', background: 'transparent', color: '#a23b2e', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Clear all</button>
            <button onClick={() => p.onApply(vals, savedKey, pendingSort)} style={{ background: '#211f1c', color: '#fff', border: 'none', borderRadius: 8, padding: '7px 18px', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>Apply</button>
          </div>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, paddingTop: 4 }}>
          {savedFilterControl}
          {savedFilterDefs.length ? <div style={{ borderTop: '1px solid #efebe3', margin: '2px 0' }} /> : null}
          {filterDefs.map((f) => <div key={f.key}>{label(f.label || f.key)}{control(f)}</div>)}
          <div style={{ height: 8 }} />
        </div>
      </Modal>
    );
  }

  function SelectionBar(p: {
    actions: BulkAction[];
    count: number; selectedIds: string[]; onCancel: () => void; helpers: Helpers;
    // Total rows matching the current search/filters/tab — across every page,
    // not just the loaded one (serverMode included).
    matchCount: number;
    // False in serverMode when the resource didn't supply fetchAllIds: only
    // the loaded page can be selected, so the link says that instead.
    canSelectAllMatching: boolean;
    allSelected: boolean;
    selectAllBusy: boolean;
    onSelectAll: () => void;
  }) {
    const n = p.count;
    const btn = (label: string, bg: string, color: string, onClick: () => void, disabled: boolean) => (
      <button onClick={onClick} disabled={disabled} style={{ border: 'none', background: bg, color, borderRadius: 10, padding: '0 14px', height: 40, fontSize: 13, fontWeight: 700, cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.5 : 1, whiteSpace: 'nowrap' }}>{label}</button>
    );
    const link = (label: string, onClick: () => void, disabled?: boolean) => (
      <button
        onClick={onClick} disabled={disabled}
        style={{ border: 'none', background: 'none', color: '#26344b', fontSize: 12.5, fontWeight: 600, cursor: disabled ? 'default' : 'pointer', padding: '2px 4px', textDecoration: 'underline', opacity: disabled ? 0.5 : 1 }}
      >
        {label}
      </button>
    );
    return (
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, gap: 8, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 4, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 15, fontWeight: 800, color: '#1c2738' }}>{n} selected</span>
          {p.allSelected
            ? link('Clear', () => p.helpers.clearSelection())
            : p.matchCount > 0
              ? link(
                  p.selectAllBusy
                    ? 'Selecting…'
                    : p.canSelectAllMatching
                      ? `Select all ${p.matchCount}`
                      : `Select page (${p.matchCount})`,
                  p.onSelectAll,
                  p.selectAllBusy,
                )
              : null}
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {(p.actions || []).map((a, i) => (
            <span key={i}>{btn(a.label, a.bg || '#26344b', a.color || '#fff', () => a.run(p.selectedIds, p.helpers), n === 0 && a.requireSelection !== false)}</span>
          ))}
          {btn('Cancel', '#efebe3', '#726c63', p.onCancel, false)}
        </div>
      </div>
    );
  }

  function Card(p: {
    row: any; summary: any; imgMap: any; selectMode: boolean; selected: boolean; helpers: Helpers; query: string; view: string; rollup: boolean;
    onOpen: (row: any) => void; onDelete: (row: any) => void; onEdit: (row: any) => void; onToggleSelect: (id: string) => void;
  }) {
    const row = p.row;
    const { selectMode, selected } = p;
    const [dx, setDx] = useState(0);
    const startRef = useRef(0);
    const quickActions: QuickAction[] = (config.quickActions || defaultQuickActions(p.onEdit, p.onDelete))
      .filter((a) => !a.visible || a.visible(row));
    const REVEAL = quickActions.length * 70;
    useEffect(() => { if (selectMode) setDx(0); }, [selectMode]);
    function onStart(e: React.TouchEvent) { if (selectMode) return; startRef.current = e.touches[0].clientX - dx; }
    function onMove(e: React.TouchEvent) { if (selectMode) return; let nx = e.touches[0].clientX - startRef.current; if (nx > 0) nx = 0; if (nx < -REVEAL) nx = -REVEAL; setDx(nx); }
    function onEnd() { if (selectMode) return; setDx(dx < -REVEAL / 2 ? -REVEAL : 0); }
    function runAction(a: QuickAction) { setDx(0); a.run(row, p.helpers); }

    // A rollup row (see viewOptions.rollup) stands for several records, so
    // Edit/Delete/open have nothing to act on — the card handles its own click.
    if (p.rollup) {
      return (
        <div className="kano-cardwrap">
          <div
            className="kano-card"
            onClick={selectMode ? () => p.onToggleSelect(String(getId(row))) : undefined}
            style={{
              cursor: selectMode ? 'pointer' : undefined,
              borderColor: selectMode && selected ? '#26344b' : '#e7e2d9',
              boxShadow: selectMode && selected ? '0 0 0 2px #26344b55' : 'none',
            }}
          >
            {config.renderCard({ row, summary: p.summary, imgMap: p.imgMap, getImage: config.getImage ? (r, m) => config.getImage!(r, m) : () => '', selectMode, selected, query: p.query, view: p.view, openRow: p.onOpen })}
          </div>
        </div>
      );
    }

    const primaryActions = quickActions.filter((a) => a.primary !== false).slice(0, 2);
    const overflowActions = quickActions.filter((a) => primaryActions.indexOf(a) === -1);
    const hoverCluster = !selectMode ? (
      <div className="kano-hover-actions">
        {primaryActions.map((a) => (
          <Tooltip key={a.key} title={a.label}>
            <button className="kano-hover-btn" aria-label={a.label} onClick={(e) => { e.stopPropagation(); runAction(a); }}>{a.icon}</button>
          </Tooltip>
        ))}
        {overflowActions.length ? (
          <Dropdown
            menu={{
              items: overflowActions.map((a) => ({ key: a.key, label: a.label, danger: a.danger })),
              onClick: (e: any) => { if (e?.domEvent?.stopPropagation) e.domEvent.stopPropagation(); const a = overflowActions.find((x) => x.key === e.key); if (a) runAction(a); },
            }}
            trigger={['click']}
          >
            <Tooltip title="More actions">
              <button className="kano-hover-btn" aria-label="More actions" onClick={(e) => e.stopPropagation()}><MoreDotsIcon /></button>
            </Tooltip>
          </Dropdown>
        ) : null}
      </div>
    ) : null;

    return (
      <div className="kano-cardwrap">
        {!selectMode ? (
          <div className="kano-actions">
            {quickActions.map((a) => (
              <button key={a.key} className="kano-actbtn" style={{ background: a.color || '#726c63' }} onClick={(e) => { e.stopPropagation(); runAction(a); }}>
                <span style={{ fontSize: 16 }}>{a.icon}</span>{a.label}
              </button>
            ))}
          </div>
        ) : null}
        <div
          className="kano-card"
          style={{ transform: selectMode ? 'none' : `translateX(${dx}px)`, transition: selectMode ? 'none' : 'transform .18s ease', borderColor: selectMode && selected ? '#26344b' : '#e7e2d9', boxShadow: selectMode && selected ? '0 0 0 2px #26344b55' : 'none' }}
          onTouchStart={onStart} onTouchMove={onMove} onTouchEnd={onEnd}
          onClick={() => { if (selectMode) { p.onToggleSelect(String(getId(row))); return; } if (dx === 0) p.onOpen(row); else setDx(0); }}
        >
          {config.renderCard({ row, summary: p.summary, imgMap: p.imgMap, getImage: config.getImage ? (r, m) => config.getImage!(r, m) : () => '', selectMode, selected, query: p.query, view: p.view, openRow: p.onOpen })}
          {hoverCluster}
        </div>
      </div>
    );
  }

  function GridTile(p: {
    row: any; summary: any; imgMap: any; selectMode: boolean; selected: boolean; helpers: Helpers; query: string; view: string; rollup: boolean;
    onOpen: (row: any) => void; onDelete: (row: any) => void; onEdit: (row: any) => void; onToggleSelect: (id: string) => void;
  }) {
    const row = p.row;
    const { selectMode, selected } = p;
    const quickActions: QuickAction[] = (config.quickActions || defaultQuickActions(p.onEdit, p.onDelete))
      .filter((a) => !a.visible || a.visible(row));
    function runAction(a: QuickAction) { a.run(row, p.helpers); }
    const primaryActions = quickActions.filter((a) => a.primary !== false).slice(0, 2);
    const overflowActions = quickActions.filter((a) => primaryActions.indexOf(a) === -1);

    return (
      <div
        className="kano-tile"
        style={{ borderColor: selectMode && selected ? '#26344b' : '#e7e2d9', boxShadow: selectMode && selected ? '0 0 0 2px #26344b55' : 'none' }}
        onClick={() => { if (selectMode) { p.onToggleSelect(String(getId(row))); return; } p.onOpen(row); }}
      >
        {selectMode ? (
          <div style={{ position: 'absolute', top: 8, left: 8, zIndex: 4, width: 22, height: 22, borderRadius: 6, border: '2px solid #fff', background: selected ? '#26344b' : 'rgba(255,255,255,0.85)', boxShadow: '0 1px 3px rgba(0,0,0,0.25)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            {selected && <span style={{ color: '#fff', fontSize: 13, fontWeight: 700 }}>✓</span>}
          </div>
        ) : primaryActions.length || overflowActions.length ? (
          <div className="kano-hover-actions">
            {primaryActions.map((a) => (
              <Tooltip key={a.key} title={a.label}>
                <button className="kano-hover-btn" aria-label={a.label} onClick={(e) => { e.stopPropagation(); runAction(a); }}>{a.icon}</button>
              </Tooltip>
            ))}
            {overflowActions.length ? (
              <Dropdown
                menu={{
                  items: overflowActions.map((a) => ({ key: a.key, label: a.label, danger: a.danger })),
                  onClick: (e: any) => { if (e?.domEvent?.stopPropagation) e.domEvent.stopPropagation(); const a = overflowActions.find((x) => x.key === e.key); if (a) runAction(a); },
                }}
                trigger={['click']}
              >
                <Tooltip title="More actions">
                  <button className="kano-hover-btn" aria-label="More actions" onClick={(e) => e.stopPropagation()}><MoreDotsIcon /></button>
                </Tooltip>
              </Dropdown>
            ) : null}
          </div>
        ) : null}
        {config.renderCard({ row, summary: p.summary, imgMap: p.imgMap, getImage: config.getImage ? (r, m) => config.getImage!(r, m) : () => '', selectMode, selected, query: p.query, view: p.view, openRow: p.onOpen })}
      </div>
    );
  }

  function FormDrawer(p: { mode: 'new' | 'edit'; open: boolean; row?: any; extra?: any; onClose: () => void; onDone: () => void }) {
    // Bound instance — antd's static `message` renders nothing under React 19.
    const { message } = App.useApp();
    const isEdit = p.mode === 'edit';
    const spec = (isEdit ? config.editForm : config.newForm)!;
    const [loading, setLoading] = useState(!!isEdit);
    const [busy, setBusy] = useState(false);
    const [form, setForm] = useState<any>({});
    const [errs, setErrs] = useState<any>({});
    useEffect(() => {
      if (!p.open) return;
      setErrs({});
      if (isEdit && spec.load) {
        setLoading(true);
        Promise.resolve(spec.load(p.row)).then((f) => { setForm(f || {}); setLoading(false); }).catch((e) => { message.error('Load failed: ' + errText(e)); setLoading(false); });
      } else {
        setForm(spec.initial ? spec.initial() : {});
        setLoading(false);
      }
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [p.open, p.row && getId(p.row)]);
    function setF(k: string, v: any) { setForm((prev: any) => ({ ...prev, [k]: v })); }
    // Mask click / ESC on a touched form asks before throwing the input away;
    // Cancel and the header × still close straight off.
    const dismiss = useDirtyClose(p.onClose, useFormDirty(form, p.open && !loading));
    function submit() {
      const err = spec.validate ? spec.validate(form) : null;
      if (err) { message.warning(err); return; }
      setBusy(true);
      const action = isEdit ? spec.submit(getId(p.row), form) : spec.submit(form);
      Promise.resolve(action)
        .then(() => { message.success(spec.successMsg || (isEdit ? 'Saved.' : 'Created.')); p.onDone(); })
        .catch((e) => message.error((isEdit ? 'Update' : 'Create') + ' failed: ' + errText(e)))
        .finally(() => setBusy(false));
    }

    const footerNode = (
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
        <button onClick={p.onClose} style={{ border: '1px solid #e7e2d9', background: '#fff', borderRadius: 8, padding: '7px 16px', cursor: 'pointer', fontSize: 13 }}>Cancel</button>
        <button onClick={submit} disabled={busy || loading} style={{ background: '#26344b', color: '#fff', border: 'none', borderRadius: 8, padding: '7px 20px', fontSize: 13, fontWeight: 700, cursor: busy || loading ? 'not-allowed' : 'pointer', opacity: busy || loading ? 0.6 : 1 }}>{busy ? 'Saving…' : isEdit ? 'Save changes' : 'Create'}</button>
      </div>
    );
    const bodyNode = <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>{spec.render(form, setF, p.extra || {}, errs, setErrs)}</div>;

    if (config.DrawerShell) {
      const Shell = config.DrawerShell;
      return (
        <Shell open={p.open} onClose={p.onClose} onDismiss={dismiss} title={spec.title || (isEdit ? 'Edit' : 'New')} width={spec.width || 540} placement="right" rootClassName={isEdit ? 'kano-edit-drawer' : undefined} zIndex={isEdit ? 1100 : undefined} loading={loading} footer={footerNode}>
          {bodyNode}
        </Shell>
      );
    }
    return (
      <Drawer open={p.open} title={spec.title || (isEdit ? 'Edit' : 'New')} width={spec.width || 540} placement="right" onClose={dismiss} rootClassName={isEdit ? 'kano-edit-drawer' : undefined} zIndex={isEdit ? 1100 : undefined} footer={footerNode}>
        {loading ? <div style={{ padding: 60, textAlign: 'center' }}><Spin /></div> : bodyNode}
      </Drawer>
    );
  }

  function DetailDrawer(p: { row: any; refreshKey: number; helpers: Helpers; onClose: () => void; onEdit: (row: any) => void; onDelete: (row: any) => void }) {
    // config.fetchDetail resources carry a deliberately light list row; the full
    // record arrives here and is MERGED OVER it, so anything the list computed
    // and the detail API doesn't return (derived/flattened helpers) survives.
    // Until it resolves the light row renders, so the drawer opens instantly
    // rather than blocking on a fetch.
    const [detail, setDetail] = useState<any | null>(null);
    const rowId = p.row ? getId(p.row) : null;
    // Clearing is keyed on the ROW, not on refreshKey: a different record must
    // never show the previous one's detail, but a re-fetch of the record
    // already open must not blank it — the sections would collapse to the light
    // list row, the drawer would lose its scroll position, and everything would
    // pop back a moment later. Stale detail stays up until fresh detail lands.
    useEffect(() => { setDetail(null); }, [rowId]);
    useEffect(() => {
      if (!config.fetchDetail || rowId == null) return;
      let stale = false;
      config.fetchDetail(String(rowId)).then((full) => { if (!stale && full) setDetail(full); }, () => {});
      return () => { stale = true; };
      // refreshKey so a save/reload re-pulls the record too
    }, [rowId, p.refreshKey]);
    const row = p.row && detail ? { ...p.row, ...detail } : p.row;
    const [openIdx, setOpenIdx] = useState(0);
    useEffect(() => { setOpenIdx(0); }, [row && getId(row)]);
    function toggle(i: number) { setOpenIdx(openIdx === i ? -1 : i); }
    const sections = row ? config.detailSections || [] : [];
    const accent = row && config.statusAccent ? config.statusAccent(row) : '#9a9284';
    const iconBtn: React.CSSProperties = { border: '1px solid #e7e2d9', background: '#fff', borderRadius: 8, height: 30, padding: '0 10px', fontSize: 13, color: '#726c63', cursor: 'pointer' };
    const allActions = config.detailActions || [];
    const headerActions = allActions.filter((a) => !a.menu);
    const menuActions = allActions.filter((a) => a.menu);
    const canDelete = typeof config.deleteRow === 'function';
    const overflowMenu = {
      items: (menuActions.map((a, i) => ({ key: 'act_' + i, label: a.label, danger: false })) as { key: string; label: string; danger: boolean }[]).concat(canDelete ? [{ key: 'delete', danger: true, label: '🗑  Delete' }] : []),
      onClick: (e: any) => {
        if (e?.domEvent?.stopPropagation) e.domEvent.stopPropagation();
        if (e.key === 'delete') { if (row) p.onDelete(row); return; }
        const a = menuActions[Number(String(e.key).slice(4))];
        if (a && row) a.run(row, p.helpers);
      },
    };
    const hasOverflow = menuActions.length > 0 || canDelete;

    const innerContent = row ? (
      <div style={{ fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", ui-sans-serif, system-ui, sans-serif' }}>
        {/* A crash in a detail body must cost the drawer, not the page. Custom
            bodies built on DetailAccordionShell also have a boundary per
            section inside this one, so the smallest thing that can break is
            one section. */}
        <ErrorBoundary label={config.detailTitle ? config.detailTitle(row) : 'Details'} resetKey={getId(row)}>
          {config.detailRender
            ? config.detailRender(row, p.refreshKey, p.helpers)
            : sections.map((s, i) => (
                <AccordionItem key={i} title={s.title} open={openIdx === i} onToggle={() => toggle(i)}>
                  <ErrorBoundary label={s.title} compact resetKey={getId(row)}>{s.render(row, p.refreshKey, p.helpers)}</ErrorBoundary>
                </AccordionItem>
              ))}
        </ErrorBoundary>
        <div style={{ height: 120 }} />
      </div>
    ) : null;

    const headerExtraNode = row ? (
      <div style={{ display: 'flex', gap: 6 }}>
        {headerActions.map((a, i) => (
          <button key={i} onClick={() => a.run(row, p.helpers)} style={{ ...iconBtn, fontWeight: 600, color: a.color || '#2f6846', borderColor: a.borderColor || '#b8d4c0', background: a.bg || '#dcebe0' }}>{a.label}</button>
        ))}
        {(config.canEditRow ? config.canEditRow(row) : config.canEdit !== false) ? (
          <button onClick={() => p.onEdit(row)} style={{ ...iconBtn, fontWeight: 600, color: '#26344b', borderColor: '#c9d3e0', background: '#e2e6ee' }}><EditOutlined style={{ marginRight: 5 }} />Edit</button>
        ) : null}
        {hasOverflow ? (
          <Dropdown menu={overflowMenu} trigger={['click']} placement="bottomRight">
            <button aria-label="More actions" style={{ ...iconBtn, width: 34, padding: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}><MoreDotsIcon color="#726c63" /></button>
          </Dropdown>
        ) : null}
      </div>
    ) : null;

    // Per-resource width override (e.g. Production's own detail wants more
    // room than the 900px shared default) — a scoped <style> tag beats the
    // base rule's !important on source order, without touching every other
    // resource's drawer. See ListViewConfig.detailWidth's own doc comment.
    const widthOverride = config.detailWidth ? (
      <style>{`.kano-detail-drawer-w .ant-drawer-content-wrapper{width:min(${config.detailWidth}px,92vw) !important;}`}</style>
    ) : null;
    const detailRootClassName = 'kano-detail-drawer' + (config.detailWidth ? ' kano-detail-drawer-w' : '');

    if (config.DrawerShell) {
      const Shell = config.DrawerShell;
      return (
        <Shell open={!!row} onClose={p.onClose} title={row ? (config.detailTitle ? config.detailTitle(row) : '#' + getId(row)) : ''} placement="right" rootClassName={detailRootClassName} accentColor={row ? accent : null} extra={headerExtraNode}>
          {widthOverride}
          {innerContent}
        </Shell>
      );
    }
    return (
      <Drawer open={!!row} placement="right" rootClassName={detailRootClassName} title={row ? (config.detailTitle ? config.detailTitle(row) : '#' + getId(row)) : ''} onClose={p.onClose} extra={headerExtraNode}>
        {widthOverride}
        {row ? (
          <div style={{ fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", ui-sans-serif, system-ui, sans-serif' }}>
            <div style={{ height: 4, borderRadius: 999, background: accent, marginBottom: 6, opacity: 0.85 }} />
            {innerContent}
          </div>
        ) : null}
      </Drawer>
    );
  }

  // ── root ──
  return forwardRef<ListViewHandle>(function ListView(_props, ref) {
    // Static Modal.confirm() doesn't reliably mount under React 19 / this
    // app's <App> setup — silently no-ops (no error, no DOM node). Confirmed
    // live; see production-list-view.tsx's runAddComment for the original
    // find. The context-bound instance from App.useApp() is antd's own fix.
    // `message` for the same reason as `modal`: antd's static helpers are
    // inert under React 19 and render nothing at all.
    const { modal, message } = App.useApp();
    const [data, setData] = useState<any[]>([]);
    const [serverTotal, setServerTotal] = useState(0);
    // serverMode-only: per-tab counts from the server's groupBy (see the
    // serverMode doc). Null in client mode, where counts are tallied locally.
    const [serverTabCounts, setServerTabCounts] = useState<Record<string, number> | null>(null);
    const [summaries, setSummaries] = useState<any>(null);
    const [extra, setExtra] = useState<any>({});
    const [imgMap, setImgMap] = useState<any>({});
    const [loading, setLoading] = useState(true);
    // A re-fetch of a list that ALREADY has rows on screen is a background
    // refresh, not a load: `loading` blanks the whole body for a spinner, the
    // page collapses to one screen, the browser clamps the scroll to the top,
    // and the rows come back under a reader who was halfway down the list
    // (Andre, 2026-08-27 — "i keep scrolling again and again to the same
    // place"). So a refresh keeps the stale rows visible and swaps them for
    // the fresh ones in one paint; only a first load with nothing to show
    // still gets the spinner.
    const [refreshing, setRefreshing] = useState(false);
    const [loadError, setLoadError] = useState<string | null>(null);
    // ?q=<text> pre-fills the search box, so another page can deep-link INTO a
    // filtered list — Smart Search sends the term it matched on, which also
    // makes a paired ?open=<id> land on a page that actually contains the row.
    const [query, setQuery] = useState(
      typeof window !== 'undefined' ? (new URLSearchParams(window.location.search).get('q') ?? '') : '',
    );
    const [tab, setTab] = useState(config.defaultTab || 'all');
    const initFilters = useMemo(() => {
      const z: Record<string, any> = {};
      filterDefs.forEach((f) => { z[f.key] = f.default !== undefined ? f.default : f.kind === 'dateRange' || f.kind === 'numberRange' ? null : f.multi ? [] : 'all'; });
      return z;
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);
    // A link can pre-set any secondary filter with ?f_<key>=<value>, e.g.
    // /tiktok-videos?f_creatorRowId=12&f_productId=abc — the TikTok Affiliate
    // detail uses it to open "this creator's videos for this product" (Andre,
    // 2026-09-04). Only DECLARED filters are honoured, so a stale or invented
    // key in a URL is ignored rather than silently narrowing the list to
    // nothing. Multi-valued filters take a comma-separated list.
    const [filters, setFilters] = useState<Record<string, any>>(() => {
      if (typeof window === 'undefined') return initFilters;
      const sp = new URLSearchParams(window.location.search);
      const seeded = { ...initFilters };
      for (const f of filterDefs) {
        const raw = sp.get(`f_${f.key}`);
        if (raw == null || raw === '') continue;
        if (f.kind === 'dateRange' || f.kind === 'numberRange') continue; // ranges need two bounds; not worth a URL grammar
        seeded[f.key] = f.multi ? raw.split(',').filter(Boolean) : raw;
      }
      return seeded;
    });
    // Seeded from config.defaultSavedFilterKey (e.g. Task's "My Recent
    // Tasks") rather than always starting at null/first-option — without
    // this a resource-level "apply this view by default" preference has
    // nowhere to live once the list has mounted.
    // A link into this list can request a specific saved filter via
    // ?sf=<key> (e.g. a "You have N pending tasks" notification banner
    // linking straight into that filtered view) — takes priority over
    // config.defaultSavedFilterKey, same idea just URL-driven instead of
    // resource-config-driven.
    const initialSavedFilterKey = useMemo(() => {
      if (typeof window !== 'undefined') {
        const sf = new URLSearchParams(window.location.search).get('sf');
        if (sf && savedFilterDefs.some((d) => d.key === sf)) return sf;
      }
      return config.defaultSavedFilterKey || null;
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);
    const [savedFilterKey, setSavedFilterKey] = useState<string | null>(initialSavedFilterKey);
    const [filterOpen, setFilterOpen] = useState(false);
    const [newOpen, setNewOpen] = useState(false);
    const [newPrefill, setNewPrefill] = useState<any>(null);
    const [openRow, setOpenRowState] = useState<any>(null);
    // config.noDetail: a browse-only list with no detail view at all (e.g. the
    // Production Restock report) — every "open this row" path becomes a no-op
    // so a card/row click does nothing instead of popping an empty drawer.
    // Closing paths (setOpenRow(null)) stay harmless: openRow is always null.
    const setOpenRow: (row: any) => void = config.noDetail ? () => {} : setOpenRowState;
    // App-wide entity-link drawer: a detail link (e.g. Sample Variant -> Sample,
    // material variant -> Product) opens the target's own detail over this list.
    // When such a jump fires, close this list's own detail drawer first so we
    // never stack drawers (the global EntityDrawerHost opens the linked one).
    useEffect(() => onCloseOpenDetails(() => setOpenRow(null)), []);
    const [editRow, setEditRow] = useState<any>(null);
    const [refreshKey, setRefreshKey] = useState(0);
    const [page, setPage] = useState(1);
    const [selectMode, setSelectMode] = useState(false);
    const [selected, setSelected] = useState<Record<string, boolean>>({});
    const [selectAllBusy, setSelectAllBusy] = useState(false);
    // Which view a "Select all" was made under. A select-all selection MEANS
    // "everything matching this filter", so it stops being true the moment the
    // filter changes — see the effect below.
    const [selectAllSig, setSelectAllSig] = useState<string | null>(null);
    const [sortKey, setSortKey] = useState(() => {
      // ?sort=<key> lets a link choose the order it wants the list in — the
      // creator/product links above ask for GMV, which is the whole point of
      // opening them. Checked against the declared options, so an unknown key
      // falls through to the normal default instead of breaking the sort.
      if (typeof window !== 'undefined') {
        const wanted = new URLSearchParams(window.location.search).get('sort');
        if (wanted && sortOptions.some((o) => o.key === wanted)) return wanted;
      }
      if (initialSavedFilterKey) {
        const preset = savedFilterDefs.find((sf) => sf.key === initialSavedFilterKey);
        if (preset?.apply?.sort) return preset.apply.sort;
      }
      return sortOptions[0].key;
    });
    // Which view the list opens in — the default saved filter's, else the
    // first declared option. '' when the list has no views, which is every
    // list that hasn't declared any.
    const [viewBy, setViewBy] = useState(() => {
      if (initialSavedFilterKey) {
        const preset = savedFilterDefs.find((sf) => sf.key === initialSavedFilterKey);
        if (preset?.apply?.view) return preset.apply.view;
      }
      return config.viewOptions?.[0]?.key ?? '';
    });
    const activeView = config.viewOptions?.find((o) => o.key === viewBy);
    const rollupView = !!activeView?.rollup;
    const rollupIdsOf = activeView?.rollupIds;
    const viewBulkActions = (config.bulkActions || []).filter((a) => !a.views || a.views.includes(viewBy));
    const [reorderRows, setReorderRows] = useState<any[] | null>(null);
    // Drag-to-reorder via the shared pointer-event hook (works on touch, unlike
    // the HTML5 drag API this used to use — see use-drag-reorder.ts). The list
    // reorders live as you drag; the PATCH happens once, on release.
    const reorderRowsRef = useRef<any[] | null>(null);
    // ?open=<id> waiting for serverMode's first page fetch (see the mount effect).
    const pendingOpenRef = useRef<string | null>(null);
    reorderRowsRef.current = reorderRows;
    const rowDrag = useDragReorder(
      reorderRows?.length ?? 0,
      (from, to) => setReorderRows((prev) => (prev ? moveItem(prev, from, to) : prev)),
      () => {
        // Read through the ref: this fires after the drag, and must persist the
        // order as it ENDED, not as it was when the handler was created.
        const rows = reorderRowsRef.current;
        if (rows) config.reorder?.onReorder(rows);
      },
    );

    // Whether anything is currently painted — see reload().
    const hasRowsRef = useRef(false);
    hasRowsRef.current = data.length > 0;

    function loadSummaries(rows: any[]) {
      if (!config.fetchSummaries) return;
      config.fetchSummaries(rows).then(setSummaries, (e) => warn('fetchSummaries failed — card summary columns will stay empty', e));
    }

    // Request sequencing. Every fetch takes a ticket, and a response whose
    // ticket is no longer the current one is DROPPED — rows, totals, spinner
    // and all. Without it a slow earlier request wins simply by landing last:
    // picking a saved filter (e.g. Sample's "Need Pricing") while the initial
    // unfiltered page was still in flight showed the filtered rows, then
    // snapped back to the unfiltered view seconds later when the first
    // response finally arrived (Andre, 2026-08-28). Returning null means
    // "superseded" — never an empty result.
    const reqSeq = useRef(0);

    function fetchRows(seq: number): Promise<any[] | null> {
      if (config.serverMode) {
        return config.serverMode.fetchPage({ page, pageSize: PAGE_SIZE, search: query, sortKey, filters, tab, savedFilterKey, view: viewBy }).then((res) => {
          if (seq !== reqSeq.current) return null;
          setServerTotal(res.total);
          if (res.tabCounts) setServerTabCounts(res.tabCounts);
          return res.data;
        });
      }
      return config.fetchList!({ view: viewBy }).then((rows) => (seq === reqSeq.current ? rows : null));
    }

    function reload(keepOpenId?: string | number | null): Promise<any[] | undefined> {
      // Read through the ref, not `data`: reload is re-created every render but
      // is also captured by helpers/handles that may be a render behind.
      if (hasRowsRef.current) setRefreshing(true); else setLoading(true);
      setLoadError(null);
      const seq = ++reqSeq.current;
      return fetchRows(seq).then(
        (rows) => {
          // Superseded mid-flight: the newer fetch owns the rows AND the
          // spinner, so touch neither.
          if (!rows) return undefined;
          setData(rows); setLoading(false); setRefreshing(false);
          loadSummaries(rows);
          if (keepOpenId != null) { const fresh = rows.find((r) => String(getId(r)) === String(keepOpenId)); if (fresh) setOpenRow(fresh); }
          return rows;
        },
        (e) => {
          if (seq !== reqSeq.current) return undefined;
          setLoading(false); setRefreshing(false); setLoadError(errText(e)); warn('fetchList failed', e); return undefined;
        },
      );
    }

    function reloadUntil(predicate?: (rows: any[], summaries: any) => boolean, attempts = 0): Promise<any> {
      // serverMode resources don't use the quick-status/bulk-action flows
      // this polling exists for — a plain reload covers them.
      if (config.serverMode) return reload();
      const seq = ++reqSeq.current;
      return fetchRows(seq).then(
        (rows) => {
          if (!rows) return undefined;
          setData(rows);
          setLoadError(null);
          const sp = config.fetchSummaries ? config.fetchSummaries(rows) : Promise.resolve(null);
          return sp.then((sum: any) => {
            if (sum != null) setSummaries(sum);
            let ok = true;
            try { ok = predicate ? !!predicate(rows, sum) : true; } catch { ok = true; }
            if (!ok && attempts < 6) return reloadUntil(predicate, attempts + 1);
            return rows;
          });
        },
        (e) => {
          if (seq !== reqSeq.current) return;
          setLoading(false); setRefreshing(false); setLoadError(errText(e)); warn('fetchList failed during reloadUntil', e);
        },
      );
    }

    function selectIds(ids: (string | number)[]) {
      if (!ids || !ids.length) return;
      setSelectMode(true);
      setSelected((prev) => { const n = { ...prev }; ids.forEach((id) => { n[String(id)] = true; }); return n; });
    }
    // "Select all" means everything under the CURRENT search/filters/tab, not
    // just the visible page. In the default mode the browser already holds
    // every matching row (`filtered`); in serverMode it holds one page, so the
    // full id set has to come from the server — and if the resource didn't
    // wire up fetchAllIds, this honestly falls back to the loaded page.
    function selectAllFiltered() {
      const fetchAllIds = config.serverMode?.fetchAllIds;
      if (!fetchAllIds) { selectIds(filtered.map((r: any) => getId(r))); setSelectAllSig(viewSig); return; }
      setSelectAllBusy(true);
      setSelectMode(true);
      fetchAllIds({ search: query, sortKey, filters, tab, savedFilterKey, view: viewBy }).then(
        (ids) => {
          setSelectAllBusy(false);
          selectIds(ids);
          setSelectAllSig(viewSig);
          // fetchAllIds may cap how many it will pull back — say so rather
          // than letting the bar read "4,000 selected" under a 12,000 match.
          if (serverTotal && ids.length < serverTotal) message.info(`Selected the first ${ids.length} of ${serverTotal} matching rows.`);
        },
        (e) => { setSelectAllBusy(false); message.error('Select all failed: ' + errText(e)); warn('fetchAllIds failed', e); },
      );
    }

    const helpers: Helpers = {
      message,
      reload, reloadUntil, closeDetail: () => setOpenRow(null), refresh: () => setRefreshKey((k) => k + 1),
      reloadKeepOpen: () => reload(openRow ? getId(openRow) : null),
      getImage: (row) => (config.getImage ? config.getImage(row, imgMap) : ''),
      exitSelect: () => { setSelectMode(false); setSelected({}); setSelectAllSig(null); },
      openNewWithPrefill: (d) => { setNewPrefill(d || null); setNewOpen(true); },
      selectAll: selectAllFiltered, selectIds, clearSelection: () => { setSelected({}); setSelectAllSig(null); },
      openEdit: (r) => setEditRow(r), confirmDelete: (r) => onDelete(r),
    };

    useImperativeHandle(ref, () => ({
      reload: () => { reload(); },
      exitSelect: () => { setSelectMode(false); setSelected({}); },
    }), [reload]);

    useEffect(() => {
      // Deep link: ?open=<id> auto-opens that row's detail drawer once the
      // list has loaded — e.g. clicking a "Production Ref" from another
      // resource's detail navigates here with ?open=<productionId> instead
      // of reimplementing the detail drawer cross-resource. Consumed once
      // and stripped from the URL so a later refresh/back doesn't re-fire
      // it. serverMode resources don't wire this up yet — none need it.
      const openId = typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('open') : null;
      // serverMode's own effect below covers the initial load too (it fires
      // once on mount, same as this would) — calling reload() here as well
      // would just double the first fetch.
      if (!config.serverMode) {
        reload().then((rows) => {
          if (!openId || !rows) return;
          const row = rows.find((r) => String(getId(r)) === String(openId));
          if (row) setOpenRow(row);
        });
      } else if (openId) {
        // serverMode fetches its first page from its own effect below, so hand
        // the id to that fetch instead of firing a second one here. reload()
        // already opens a row whose id it is given.
        pendingOpenRef.current = openId;
      }
      if (config.fetchExtra) config.fetchExtra().then(setExtra, (e) => warn('fetchExtra failed — view-supplied extra data unavailable', e));
      if (config.fetchImages) config.fetchImages().then(setImgMap, (e) => warn('fetchImages failed — cards will show placeholders', e));
      if (openId && typeof window !== 'undefined') {
        const params = new URLSearchParams(window.location.search);
        params.delete('open');
        const qs = params.toString();
        window.history.replaceState(null, '', window.location.pathname + (qs ? '?' + qs : ''));
      }
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useEffect(() => { setPage(1); }, [query, tab, filters, savedFilterKey, sortKey, viewBy]);

    // A view can change WHAT A ROW IS, and the grouping may be the server's
    // (Restock's model rollup is built in its route, like Launch's). serverMode
    // already refetches on `viewBy` in its own effect below; the default mode
    // needs the same, minus the first run — the mount effect above has already
    // fetched the initial view.
    const fetchedViewRef = useRef(viewBy);
    useEffect(() => {
      if (config.serverMode || fetchedViewRef.current === viewBy) return;
      fetchedViewRef.current = viewBy;
      reload();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [viewBy]);

    // Identity of the current VIEW — everything that changes which rows match.
    // Sort is deliberately out: reordering the same set doesn't change it.
    const viewSig = JSON.stringify([query.trim(), tab, filters, savedFilterKey]);

    // A "Select all" selection is a claim about a filter ("all 70 launches"),
    // so it must not survive that filter changing — otherwise narrowing the
    // search leaves rows armed that the user can no longer see, and the next
    // bulk action hits them. Manual row-by-row picks are left alone: those are
    // deliberate, visible choices, and carrying them across a search is a
    // workflow people actually use.
    useEffect(() => {
      if (!selectAllSig || selectAllSig === viewSig) return;
      setSelected({});
      setSelectAllSig(null);
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [viewSig]);

    // serverMode: every param that would otherwise just re-scan the
    // in-memory array instead triggers a fresh page fetch. Debounced so
    // typing in the search box doesn't fire a request per keystroke.
    useEffect(() => {
      if (!config.serverMode) return;
      // Invalidate anything already in flight the MOMENT the view changes, not
      // 300ms later when the replacement fetch starts — otherwise a response
      // for the PREVIOUS filter can still land in that gap and paint the old
      // view over the one the user just picked.
      reqSeq.current++;
      const t = setTimeout(() => {
        const openNow = pendingOpenRef.current;
        pendingOpenRef.current = null;
        reload(openNow);
      }, 300);
      return () => clearTimeout(t);
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [page, query, JSON.stringify(filters), savedFilterKey, sortKey, tab, viewBy]);

    function onDelete(row: any) {
      const fallback = (config.deleteLabel ? config.deleteLabel(row) : '#' + getId(row)) + ' will be permanently deleted.';
      void confirmDelete({
        modal, message,
        title: config.deleteTitle || 'Delete?',
        content: config.deleteContent ? () => Promise.resolve(config.deleteContent!(row)) : fallback,
        onDelete: () => config.deleteRow!(getId(row)),
        onDone: () => { setOpenRow(null); reload(); },
      });
    }
    function toggleSelect(id: string) { setSelected((prev) => { const n = { ...prev }; if (n[id]) delete n[id]; else n[id] = true; return n; }); }
    // A rollup row is all-or-nothing: it reads as selected only when every
    // record under it is, and tapping it flips the whole set.
    function toggleMany(ids: string[]) {
      setSelected((prev) => {
        const n = { ...prev };
        const allOn = ids.length > 0 && ids.every((i) => n[i]);
        ids.forEach((i) => { if (allOn) delete n[i]; else n[i] = true; });
        return n;
      });
    }
    function exitSelect() { setSelectMode(false); setSelected({}); setSelectAllSig(null); }
    const selectedIds = Object.keys(selected);

    const activeSavedFilter = useMemo(() => (savedFilterKey ? savedFilterDefs.find((sf) => sf.key === savedFilterKey) || null : null), [savedFilterKey]);

    const facetBase = useMemo(() => {
      // serverMode: search/filters/saved-filter were already applied by the
      // server that produced `data` (just the current page) — re-scanning
      // here would be redundant at best and wrong at worst (e.g. no
      // config.searchText means every row would look like a non-match).
      if (config.serverMode) return data;
      const q = query.trim().toLowerCase();
      return data.filter((r) => {
        if (q) {
          const hay = (config.searchText ? config.searchText(r) : []).map((x: any) => String(x || '').toLowerCase()).join(' ');
          if (config.multiWordSearch) {
            // token-AND: every whitespace-separated word must appear somewhere.
            if (!q.split(/\s+/).filter(Boolean).every((t) => hay.indexOf(t) !== -1)) return false;
          } else if (hay.indexOf(q) === -1) return false;
        }
        for (let i = 0; i < filterDefs.length; i++) {
          const f = filterDefs[i]; const v = filters[f.key];
          if (f.kind === 'dateRange') { if (!inDateBound(r[f.field!], v)) return false; }
          else if (f.kind === 'numberRange') {
            const n = Number(r[f.field!]);
            if (!Number.isFinite(n)) return false;
            if (v?.[0] != null && n < v[0]) return false;
            if (v?.[1] != null && n > v[1]) return false;
          }
          else if (f.multi) {
            if (Array.isArray(v) && v.length) {
              if (f.match) { if (!f.match(r, v)) return false; }
              else { let cell = r[f.field!]; if (f.normalize === 'lower') cell = String(cell || '').toLowerCase(); if (v.indexOf(cell) === -1) return false; }
            }
          } else if (v != null && v !== 'all') {
            if (f.match) { if (!f.match(r, v)) return false; }
            else { let cell = r[f.field!]; if (f.normalize === 'lower') cell = String(cell || '').toLowerCase(); if (String(cell) !== String(v)) return false; }
          }
        }
        if (activeSavedFilter?.match) { if (!activeSavedFilter.match(r)) return false; }
        return true;
      });
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [data, query, filters, activeSavedFilter]);

    const mainTabs = config.mainTabs;
    const counts = useMemo(() => {
      // serverMode: counts come from the server's groupBy over the FULL
      // matching set — facetBase here is only the current page, so an
      // in-browser tally would undercount to ~one page's worth.
      if (config.serverMode && serverTabCounts) return serverTabCounts;
      const c: Record<string, number> = { all: facetBase.length };
      if (mainTabs) { mainTabs.tabs.forEach((t) => { c[t.key] = 0; }); facetBase.forEach((r) => { const k = mainTabs.classify(r); if (c[k] != null) c[k]++; }); }
      return c;
    }, [facetBase, mainTabs, serverTabCounts]);

    const filterOptions = useMemo(() => {
      const o: Record<string, any[]> = {};
      filterDefs.forEach((f) => {
        if (f.kind === 'dateRange' || f.kind === 'numberRange') return;
        if (f.options) { o[f.key] = f.options(data); return; }
        const vals = data.map((r) => { let c = r[f.field!]; if (f.normalize === 'lower') c = String(c || '').toLowerCase(); return c; });
        o[f.key] = uniq(vals).filter((x) => x !== '' && x != null).sort();
      });
      return o;
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [data]);

    const activeFilterCount = filterDefs.reduce((n, f) => {
      const v = filters[f.key];
      if (f.kind === 'dateRange') return n + (v && (v[0] || v[1]) ? 1 : 0);
      if (f.kind === 'numberRange') return n + (v && (v[0] != null || v[1] != null) ? 1 : 0);
      if (f.multi) return n + (Array.isArray(v) && v.length ? 1 : 0);
      return n + (v != null && v !== 'all' ? 1 : 0);
    }, 0) + (savedFilterKey ? 1 : 0);

    // filterOptions[f.key] holds either {value,label} objects (relation/
    // select filters built by the ListEngine adapter) or plain raw values
    // (anything using the uniq'd-from-data fallback) — resolve either shape
    // back to a human label for the "Showing:" chip.
    function optionLabel(f: SecondaryFilterDef, val: any): string {
      const opts = filterOptions[f.key] ?? [];
      const match = opts.find((o: any) => (o != null && typeof o === 'object' ? String(o.value) === String(val) : String(o) === String(val)));
      if (match == null) return String(val);
      return match != null && typeof match === 'object' ? match.label : String(match);
    }

    // Labels for the "Showing:" summary — only used when no saved filter is
    // active (a saved filter's own label stands in for all of this). Shows
    // the actual selected value(s), not just a count — "Naming Status:
    // Pending", not "Naming Status (1)".
    function secondaryChipLabels(): string[] {
      const labels: string[] = [];
      filterDefs.forEach((f) => {
        const v = filters[f.key];
        const label = f.label || f.key;
        if (f.kind === 'numberRange') {
          if (v && (v[0] != null || v[1] != null)) {
            labels.push(`${label}: ${v[0] ?? '…'} – ${v[1] ?? '…'}`);
          }
        } else if (f.kind === 'dateRange') {
          if (v && (v[0] || v[1])) labels.push(label);
        } else if (f.multi) {
          if (Array.isArray(v) && v.length) labels.push(`${label}: ${v.map((x: any) => optionLabel(f, x)).join(', ')}`);
        } else if (v != null && v !== 'all') {
          labels.push(`${label}: ${optionLabel(f, v)}`);
        }
      });
      return labels;
    }

    // Full clean-slate reset — search, secondary filters, saved filter, and
    // main tab all back to their defaults. Only surfaced (see the "Showing:"
    // row below) when there's actually something to reset.
    function resetAll() {
      setQuery('');
      setFilters(initFilters);
      setSavedFilterKey(null);
      setTab(config.defaultTab || 'all');
    }

    const filtered = useMemo(() => (!mainTabs || tab === 'all' ? facetBase : facetBase.filter((r) => mainTabs.classify(r) === tab)), [facetBase, tab, mainTabs]);

    const sorted = useMemo(() => {
      const cmp = config.sortComparator ? config.sortComparator(sortKey) : null;
      if (!cmp) return filtered;
      return filtered.slice().sort(cmp);
    }, [filtered, sortKey]);

    // serverMode: `sorted` is already just the current page (the server
    // paginated it) — slicing by page/PAGE_SIZE again would be wrong past
    // page 1 (e.g. page 2 sliced from a 20-row array returns nothing).
    const paged = config.serverMode ? sorted : sorted.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
    // Only the list's true, unfiltered/unsearched order (sorted by the
    // reorder field) is safe to drag-reorder — see the ListViewConfig
    // comment on `reorder`.
    const reorderActive = !!config.reorder && sortKey === config.reorder.sortKey && !query.trim() && activeFilterCount === 0 && (!mainTabs || tab === 'all');
    const pagedKey = paged.map((r) => getId(r)).join(',');
    useEffect(() => {
      setReorderRows(reorderActive ? paged.slice() : null);
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [reorderActive, pagedKey]);
    const tabsWithCounts = mainTabs
      ? [{ key: 'all', label: mainTabs.allLabel || 'All', color: '#726c63', bg: '#faf9f6', count: counts.all }, ...mainTabs.tabs.map((t) => ({ ...t, count: counts[t.key] }))]
      : null;

    function listBody() {
      if (loading) return <div style={{ textAlign: 'center', padding: 60 }}><Spin size="large" /></div>;
      if (loadError) return <LoadError error={loadError} onRetry={() => reload()} />;
      if (filtered.length === 0) return <div style={{ textAlign: 'center', color: '#9a9284', padding: 40 }}>{config.emptyText || 'Nothing matches this filter'}</div>;
      if (config.renderList) {
        return config.renderList({
          rows: paged, query, selectMode, helpers,
          openRow: setOpenRow, editRow: setEditRow, deleteRow: onDelete,
          isSelected: (id: string) => !!selected[id], toggleSelect, getId,
        });
      }
      if (config.viewMode === 'table' && config.tableColumns) {
        const actions = config.quickActions || defaultQuickActions(setEditRow, onDelete);
        const tableRows = reorderActive && reorderRows ? reorderRows : paged;
        const columns = [
          ...(reorderActive
            ? [{
                key: '__drag',
                title: '',
                width: 32,
                // The handle — and ONLY the handle — carries the pointer
                // listeners. Putting them on the whole row would set
                // touch-action:none across it and kill scrolling the table on
                // touch.
                render: (_: any, __: any, index: number) => (
                  <span {...rowDrag.handleProps(index)} style={{ ...rowDrag.handleProps(index).style, color: '#9a9284', fontSize: 14 }}>
                    {DRAG_HANDLE_GLYPH}
                  </span>
                ),
              }]
            : []),
          ...config.tableColumns.map((c) => ({ key: c.key, title: c.title, width: c.width, render: (_: any, row: any) => c.render(row) })),
          {
            key: '__actions',
            title: '',
            width: actions.length * 34 + 16,
            fixed: 'right' as const,
            render: (_: any, row: any) => (
              <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
                {actions.map((a) => (
                  <button
                    key={a.key}
                    title={a.label}
                    onClick={(e) => { e.stopPropagation(); a.run(row, helpers); }}
                    style={{
                      border: '1px solid #e7e2d9', background: '#fff', borderRadius: 8, width: 28, height: 28,
                      display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', fontSize: 13,
                      color: a.danger ? '#a23b2e' : a.color || '#726c63',
                    }}
                  >
                    {a.icon}
                  </button>
                ))}
              </div>
            ),
          },
        ];
        return (
          <Table
            className="kano-table"
            rowKey={(row: any) => String(getId(row))}
            dataSource={tableRows}
            columns={columns as any}
            pagination={false}
            size="small"
            scroll={{ x: 'max-content' }}
            rowSelection={
              viewBulkActions.length && selectMode
                ? {
                    selectedRowKeys: selectedIds,
                    // Only reconcile THIS page's keys. Replacing the whole map
                    // with antd's keys would silently drop everything selected
                    // on other pages (e.g. right after "Select all").
                    onChange: (keys) => {
                      const picked = new Set(keys.map((k) => String(k)));
                      setSelected((prev) => {
                        const n = { ...prev };
                        tableRows.forEach((r: any) => {
                          const id = String(getId(r));
                          if (picked.has(id)) n[id] = true; else delete n[id];
                        });
                        return n;
                      });
                    },
                  }
                : undefined
            }
            onRow={(row: any, index?: number) => ({
              onClick: () => { if (reorderActive || selectMode) { if (selectMode) toggleSelect(String(getId(row))); return; } setOpenRow(row); },
              style: {
                cursor: reorderActive ? 'default' : 'pointer',
                ...(reorderActive && rowDrag.dragIdx === index
                  ? { background: '#faf8f4', boxShadow: '0 2px 8px rgba(15,23,42,0.12)' }
                  : {}),
                ...(reorderActive && rowDrag.dragIdx !== null && rowDrag.dragIdx !== index ? { opacity: 0.65 } : {}),
              },
              ...(reorderActive ? { ref: rowDrag.setRowRef(index ?? 0) } : {}),
            })}
          />
        );
      }
      if (config.cardGrid) {
        return (
          <div className="kano-grid">
            {paged.map((row) => (
              <GridTile
                key={getId(row)} row={row} summary={summaries} imgMap={imgMap} query={query} view={viewBy} rollup={rollupView}
                selectMode={selectMode} selected={!!selected[String(getId(row))]} helpers={helpers}
                onOpen={setOpenRow} onDelete={onDelete} onEdit={setEditRow} onToggleSelect={toggleSelect}
              />
            ))}
          </div>
        );
      }
      return paged.map((row) => {
        const kids = rollupIdsOf ? rollupIdsOf(row).map(String) : null;
        return (
          <Card
            key={getId(row)} row={row} summary={summaries} imgMap={imgMap} query={query} view={viewBy} rollup={rollupView}
            selectMode={selectMode}
            selected={kids ? kids.length > 0 && kids.every((i) => !!selected[i]) : !!selected[String(getId(row))]}
            helpers={helpers}
            onOpen={setOpenRow} onDelete={onDelete} onEdit={setEditRow}
            onToggleSelect={kids ? () => toggleMany(kids) : toggleSelect}
          />
        );
      });
    }

    return (
      <div className="kano-root" style={{ padding: 12, fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", ui-sans-serif, system-ui, sans-serif' }}>
        <style>{BASE_CSS + (config.css || '')}</style>
        {selectMode ? (
          <SelectionBar
            actions={viewBulkActions}
            count={selectedIds.length} selectedIds={selectedIds} onCancel={exitSelect} helpers={{ ...helpers, exitSelect }}
            canSelectAllMatching={!config.serverMode || !!config.serverMode.fetchAllIds}
            matchCount={config.serverMode ? (config.serverMode.fetchAllIds ? serverTotal : paged.length) : filtered.length}
            // Count alone would misread a stale selection made under a wider
            // filter as "everything is selected" — check the rows themselves
            // wherever they're actually in memory.
            allSelected={
              config.serverMode?.fetchAllIds
                // Both halves matter: the count can only be checked against the
                // server's total, but a count alone would call 10 manual picks
                // "all" the moment a filter narrows to 5 matches — so the rows
                // actually on screen have to be selected too.
                ? serverTotal > 0 && selectedIds.length >= serverTotal && paged.length > 0 && paged.every((r: any) => selected[String(getId(r))])
                : (config.serverMode ? paged : filtered).length > 0 && (config.serverMode ? paged : filtered).every((r: any) => selected[String(getId(r))])
            }
            selectAllBusy={selectAllBusy} onSelectAll={selectAllFiltered}
          />
        ) : (
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <div style={{ fontSize: 18, fontWeight: 800, color: '#211f1c' }}>{config.title || 'List'}</div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              {config.newForm || config.renderNewDrawer ? (
                <button onClick={() => { setNewPrefill(null); setNewOpen(true); }} style={{ background: '#26344b', color: '#fff', border: 'none', borderRadius: 10, width: 40, height: 40, fontSize: 22, fontWeight: 700, cursor: 'pointer', lineHeight: 1 }}>+</button>
              ) : null}
              {config.headerExtra}
              {config.pageActionsMenu?.length ? (
                <Dropdown
                  menu={{
                    items: config.pageActionsMenu.map((a) => ({ key: a.key, label: a.label, icon: a.icon })),
                    onClick: (e: any) => { const a = config.pageActionsMenu!.find((x) => x.key === e.key); if (a) a.onClick(); },
                  }}
                  trigger={['click']}
                  placement="bottomRight"
                >
                  <HeaderIconButton title="More action">
                    <MoreActionsIcon />
                  </HeaderIconButton>
                </Dropdown>
              ) : null}
              {viewBulkActions.length ? (
                <HeaderIconButton onClick={() => setSelectMode(true)} title="Select">
                  <SelectRowsIcon />
                </HeaderIconButton>
              ) : null}
            </div>
          </div>
        )}
        {config.banner ? renderBanner(config.banner(data)) : null}
        <div className="kano-searchrow">
          <SearchBar value={query} onChange={setQuery} placeholder={config.searchPlaceholder} />
          {filterDefs.length || savedFilterDefs.length ? <FilterButton activeCount={activeFilterCount} onClick={() => setFilterOpen(true)} /> : null}
          {config.hideSort ? null : <SortButton value={sortKey} onChange={setSortKey} options={sortOptions} />}
          {/* Far right, after Sort (Andre, 2026-08-27). */}
          <ViewByButton value={viewBy} onChange={setViewBy} options={config.viewOptions ?? []} />
        </div>
        {filterDefs.length || savedFilterDefs.length ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginBottom: 12, fontSize: 12.5 }}>
            <span style={{ color: '#9a9284' }}>Showing:</span>
            {activeSavedFilter ? (
              // A saved filter governs the view — show just its name, not
              // also every underlying condition it happens to set.
              <span style={{ background: '#e2e6ee', color: '#26344b', borderRadius: 20, padding: '2px 10px', fontWeight: 600 }}>{activeSavedFilter.label}</span>
            ) : secondaryChipLabels().length ? (
              secondaryChipLabels().map((c) => (
                <span key={c} style={{ background: '#f1f0ea', color: '#4a453d', borderRadius: 20, padding: '2px 10px' }}>{c}</span>
              ))
            ) : (
              <span style={{ background: '#f1f0ea', color: '#9a9284', borderRadius: 20, padding: '2px 10px' }}>No filters applied</span>
            )}
            {/* The view belongs on this row too: it changes what you are
                looking at as much as a filter does, and reading it here means
                never opening the menu to find out how the list is set. */}
            {(config.viewOptions?.length ?? 0) > 1 && (
              <span style={{ background: '#e2e6ee', color: '#26344b', borderRadius: 20, padding: '2px 10px', fontWeight: 600 }}>
                View by {(config.viewOptions!.find((o) => o.key === viewBy) || config.viewOptions![0]).label}
              </span>
            )}
            {activeFilterCount > 0 && (
              <button
                onClick={resetAll}
                style={{ border: 'none', background: 'none', color: '#26344b', fontWeight: 600, fontSize: 12.5, cursor: 'pointer', padding: '2px 4px', textDecoration: 'underline' }}
              >
                Reset
              </button>
            )}
          </div>
        ) : null}
        {tabsWithCounts ? <MainFilterBar tabs={tabsWithCounts} value={tab} onChange={setTab} /> : null}
        {refreshing ? <div className="kano-refresh-bar" role="status" aria-label="Refreshing" /> : null}
        {listBody()}
        {!loading && !loadError && (config.serverMode ? serverTotal : filtered.length) > PAGE_SIZE ? (
          <div style={{ display: 'flex', justifyContent: 'center', marginTop: 14 }}>
            <Pagination current={page} pageSize={PAGE_SIZE} total={config.serverMode ? serverTotal : filtered.length} onChange={setPage} showSizeChanger={false} size="small" />
          </div>
        ) : null}
        {filterDefs.length || savedFilterDefs.length ? (
          <FilterPopup
            open={filterOpen} values={filters} savedFilterKey={savedFilterKey} options={filterOptions}
            onClose={() => setFilterOpen(false)}
            onApply={(v, sfKey, pendingSort) => { setFilters(v); setSavedFilterKey(sfKey || null); if (pendingSort) setSortKey(pendingSort); setFilterOpen(false); }}
          />
        ) : null}
        {config.renderNewDrawer
          ? config.renderNewDrawer({ open: newOpen, onClose: () => { setNewOpen(false); setNewPrefill(null); }, helpers, prefillData: newPrefill })
          : config.newForm
          ? <FormDrawer mode="new" open={newOpen} extra={extra} onClose={() => setNewOpen(false)} onDone={() => { setNewOpen(false); reload(); }} />
          : null}
        {config.renderEditDrawer
          ? config.renderEditDrawer({ open: !!editRow, row: editRow, onClose: () => setEditRow(null), helpers })
          : config.editForm
          ? (
            <FormDrawer
              mode="edit" open={!!editRow} row={editRow} extra={extra}
              onClose={() => setEditRow(null)}
              // reload(id) re-opens the detail drawer on that row — only wanted
              // when the edit was launched FROM the detail drawer (it sits open
              // behind the form and needs the refreshed row). A row quick-action
              // edit has no drawer open, so passing the id there would pop one
              // open on save instead of just returning to the list.
              onDone={() => {
                const id = editRow ? getId(editRow) : null;
                const keepOpenId = openRow && id != null && String(getId(openRow)) === String(id) ? id : null;
                setEditRow(null); setRefreshKey((k) => k + 1); reload(keepOpenId);
              }}
            />
          )
          : null}
        <DetailDrawer row={openRow} refreshKey={refreshKey} helpers={helpers} onClose={() => setOpenRow(null)} onEdit={(r) => setEditRow(r)} onDelete={onDelete} />
      </div>
    );
  });
}
