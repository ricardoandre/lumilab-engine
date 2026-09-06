// The shared "UI engine" config type. One ResourceConfig per Refine resource
// (task, task-schedule, and every Product/Sample/Production table going forward)
// drives generic List/Form/Show components instead of hand-written pages per
// resource — see src/components/engine/*.
//
// Add a new resource by writing a config in src/lib/resources/*.ts and a thin
// page file that passes it to the generic components (see src/app/(protected)/tasks
// for the reference pattern). Don't hand-write another Table/Form from scratch.

import { hasFeatureCached } from './use-permissions';

export type FieldType =
  | 'text'
  | 'textarea'
  | 'richtext'
  | 'number'
  | 'date'
  | 'datetime'
  | 'select'
  // Free text WITH a suggestion list — stores a plain string, same as 'text',
  // but offers what has been typed before (e.g. Product.model). Unlike
  // 'select'/'relation' it never constrains the value to the list.
  | 'autocomplete'
  | 'relation'
  | 'boolean'
  | 'image'
  | 'imageGallery'
  | 'repeatableList'
  | 'measurementGrid'
  | 'numberList';

export interface SelectOption {
  label: string;
  value: string;
  color?: string; // antd Tag color, used when the field also has tagColored: true
}

export interface RelationConfig {
  resource: string; // Refine/API resource name to fetch options from, e.g. "users"
  labelField: string | ((record: any) => string); // field (or derived label) shown in the picker
  valueField?: string; // defaults to "id"
  // Key holding the embedded related object in API responses (Prisma `include` shape).
  // Defaults to the field name with a trailing "Id" stripped, e.g. "ownerId" -> "owner".
  displayKey?: string;
  // Constant filters applied to the options query, e.g. scoping a FieldOption
  // relation to one fieldKey ({field: 'fieldKey', operator: 'eq', value: 'task.status'}).
  filters?: { field: string; operator: 'eq' | 'in'; value: unknown }[];
  // Filters that depend on ANOTHER field in the same form, re-evaluated as that
  // field changes — for a picker whose valid options are decided by an earlier
  // answer (KOL Product Request's "Drawn from booking", which may only offer
  // bookings for the product already chosen). `dependsOn` names the fields to
  // watch; `filtersFor` turns the form's current values into extra filters,
  // ANDed with `filters` above.
  //
  // Returning null means "nothing can be picked yet": the Select renders
  // disabled showing `dependsOnHint`, rather than listing options that would be
  // wrong for the record being made.
  dependsOn?: string[];
  filtersFor?: (values: Record<string, any>) => { field: string; operator: 'eq' | 'in'; value: unknown }[] | null;
  dependsOnHint?: string;
  // Render an option as visible-but-unpickable, with the reason appended to its
  // label. For a row the user is right to expect in the list but must not
  // choose — Product Booking offers products with no size rows so a search for
  // them lands somewhere, greyed out and saying why (Andre, 2026-09-03).
  // Return null for a normal, selectable option.
  optionDisabled?: (record: any) => string | null;
  // Field on the related record holding an antd Tag color, for tagColored relations
  // (the FieldOption-backed replacement for static `select` options[].color).
  colorField?: string;
  // Escape hatch for mainTabsField when the resource's own literal palette
  // must be preserved exactly (e.g. Sample's tabs match NocoBase's specific
  // hex status colors — #f97316/#84cc16/... — not the generic FieldOption
  // .color antd-token-name mapped through pillColor(), which is a
  // DIFFERENT, muted app-wide palette that doesn't correspond 1:1). Takes
  // priority over colorField when both are set.
  colorOf?: (related: any) => { fg: string; bg: string };
  // Opt in to creating a missing option from inside the picker, instead of
  // sending the user to an admin screen to add it first. `endpoint` takes a
  // POST of { label } and returns the created (or already-existing) row —
  // deliberately per-field rather than a generic write to /api/field-options,
  // so each use is authorized by its own narrow route. Works on both the
  // ordinary relation Select (KOL's tags) and repeatableList row pickers
  // (Pattern's elements).
  allowCreate?: { endpoint: string; placeholder?: string };
  // Render as a circular-initial + first-name badge (UserBadge) instead of
  // plain text — for relations that point at a person (owner, reviewedBy, ...).
  avatar?: boolean;
  // The row's own value for this field is an array of ids, not a single id
  // — e.g. Sample's "Sewing PIC" filter, which matches against a computed
  // rollup of ALL its variants' sewingPicUserId (a one-to-many derived
  // field, not a stored column). Only meaningful for a filter-only field
  // (showInList/showInForm/showInShow: false); changes secondaryFilterFields'
  // auto-derived match from scalar equality to array-membership — see
  // resourceConfigToListView.tsx.
  multi?: boolean;
  // FORM-side multi-select: the picker takes N ids at once and the field's
  // value is an id array (e.g. Product Measurement's "Products" — one
  // measurement set covers many products, so the set's own form picks them,
  // mirroring NocoBase's o2m AssociationField with multiple: true). Distinct
  // from `multi` above, which is about how a FILTER matches a rollup value.
  // The API owns the write: it re-points the CHILD rows' FK from this array.
  multiSelect?: boolean;
}

// A single field condition inside a saved filter. Mirrors filters.ts's
// SimpleFilter (kept as an independent, structurally-compatible type here
// rather than imported — filters.ts pulls in NextRequest for server-side
// parsing, which shouldn't leak into resource-config's client bundle).
export interface SavedFilterCondition {
  field: string;
  operator: 'eq' | 'in' | 'notIn' | 'contains' | 'gte' | 'lte' | 'ne';
  value: unknown;
}
// A saved filter's condition list is normally AND'd together; an `{ or }`
// entry OR's its own conditions instead — e.g. "status is Done OR overdue".
export type SavedFilterEntry = SavedFilterCondition | { or: SavedFilterCondition[] };

// A named filter+sort preset, offered in the list toolbar's filter drawer
// instead of the user assembling it from scratch via search/secondary
// filters/sort every time. `getFilters` receives the signed-in user's id so
// presets like "assigned to me" work without a resource-specific component.
// May return a Promise — some presets (e.g. "status is Done") need to
// resolve a FieldOption's id by its stable `value` first (see task.ts).
export interface SavedFilter {
  key: string;
  label: string;
  isDefault?: boolean;
  getFilters: (ctx: { userId?: string }) => SavedFilterEntry[] | Promise<SavedFilterEntry[]>;
  sorters?: { field: string; order: 'asc' | 'desc' }[];
  // Which of the resource's `viewOptions` this preset opens in. That is how a
  // list gets a default view without any list-specific code — Launch's
  // "Not launched" preset carries view: 'model'.
  view?: string;
}

export interface FieldConfig {
  name: string; // matches the API/data field name (camelCase)
  label: string;
  type: FieldType;
  required?: boolean;
  options?: SelectOption[]; // for type: 'select'
  // Options for this field's entry in `secondaryFilterFields`, fetched once
  // when the list mounts (alongside the relation-filter options). Only needed
  // for a plain text/number field on a `serverPaged` list: ListEngine
  // otherwise derives a text filter's options by uniq'ing the LOADED rows,
  // which on a server-paged list is just the current page. Product's Designer
  // reads its list from /api/products/designers this way (Andre, 2026-08-27).
  filterOptions?: () => Promise<{ value: string; label: string }[]>;
  tagColored?: boolean; // render as a colored antd Tag in list/show, using options[].color
  relation?: RelationConfig; // for type: 'relation'
  showInList?: boolean; // default true
  showInForm?: boolean; // default true
  // Render the input greyed and unwritable, while still SHOWING the value.
  // For a form that may edit some of a record but must not edit the rest —
  // the Style Guide screen's quick edit, where description and style guide are
  // editable and everything else is context (Andre, 2026-09-02: "other colomn
  // should be just info ... if it is hard just greyed out"). Cosmetic only: the
  // API still decides what it accepts.
  disabled?: boolean;
  // Hide from the CREATE form only, keeping the field on edit. For a value the
  // user shouldn't have to think about when adding a record but must still be
  // able to change afterwards — e.g. Product's Status and Naming Status, which
  // are defaulted server-side on create (Andre, 2026-08-16). Note the create
  // form then submits nothing for the field, so anything it should start at
  // has to come from the API route, not FieldConfig.defaultValue.
  hideOnCreate?: boolean;
  // The mirror image: hide from the EDIT (and clone) form, keeping the field on
  // create. For an input that only makes sense while a record is being made —
  // Sewing Data's multi-product picker, which writes one price row per product
  // on create, where editing a saved row corrects that ONE row and must never
  // fan a correction out across products it was never part of.
  hideOnEdit?: boolean;
  // Feature-gate this ONE field: it's dropped from the list, form and show
  // views unless the user's roles grant this feature key (e.g. the material
  // module's price fields behind 'material.pricing'). The API must strip/refuse
  // the field too — this only hides the UI. Cold permission cache => visible,
  // same convention as hasFeatureCached (the server is the backstop, and the
  // sider warms the cache on every page).
  featureKey?: string;
  // Render at half width in the form (two per row on wider drawers) — e.g.
  // Difficulty + Target Price side by side. Default full width.
  halfWidth?: boolean;
  showInShow?: boolean; // default true
  showYear?: boolean; // for date/datetime fields: include the year (e.g. "07 Aug 2026") instead of the default short "Aug 7"
  // For a 'relation' field: makes the value a clickable link that opens the
  // target object's OWN detail drawer (EntityDrawer), instead of plain text.
  // The target is the field's relation.resource (must be in entity-registry),
  // e.g. Sample Variant's `sampleId` -> 'samples'. Reuses that resource's real
  // detail — no per-object rebuild, no import cycle.
  linkable?: boolean;
  // Link this field's value at a DIFFERENT object than its own relation target.
  // Returns the entity-registry resource + id to open, or null for no link.
  //
  // Why: a KOL request points at a product VARIANT, but the thing worth opening
  // is the PRODUCT (Andre, 2026-08-28: "allow click on product code/name to
  // open product details drawer") — and variants have no detail view of their
  // own. Takes priority over `linkable`, which can only ever open
  // relation.resource by the field's own id.
  linkTo?: (row: any) => { resource: string; id: string | number } | null;
  // Make the value an OUTBOUND link to another system — a TikTok profile, a
  // Shopee listing. Unlike `linkTo`, which opens a drawer inside the app, this
  // opens a new tab. Return null to leave the value as plain text.
  externalHref?: (row: any) => string | null;
  // Placeholder suffix when this number field is a range filter — "%", "Rp".
  rangeUnit?: string;
  // Draw the value yourself, in list cells and detail rows alike. The escape
  // hatch `formSections`/`detailSections` already have, for a column the
  // declarative types cannot express — a video's tagged products, each linking
  // to its own listing. Use it for display only; filtering and sorting still go
  // through the field's real name and type.
  render?: (row: any) => import('react').ReactNode;
  listWidth?: number;
  // Value the field starts at on a from-scratch CREATE form, so a column with
  // a non-falsy DB default (e.g. Product.requireFabric, default true) doesn't
  // render as an off Switch that lies about what will be saved. Deliberately
  // NOT applied on edit or clone — those get their values from the record.
  //
  // A FUNCTION is called each time the create form renders, for a default that
  // must be computed at open time rather than at module load — Fabric In's date
  // defaults to today (`() => todayDateOnly()`), and a static dayjs() would
  // freeze on whatever day the tab was first opened.
  defaultValue?: unknown | (() => unknown);
  extra?: string; // helper text shown under the form field
  // A "?" icon next to the field's LABEL, whose content appears on hover
  // (antd Form.Item's `tooltip`). For help worth having but not worth taking
  // up space — Product's Name field showing the brand's colour word for the
  // chosen fabric. Different from `extra` (always-visible static text) and
  // `addon` (a live panel under the field).
  //
  // The node is built during render but antd mounts it only on first hover, so
  // a component inside it can fetch without costing anything until used.
  // NOT wired for `relation` fields — their Form.Item lives in its own
  // component (RelationFormField); add it there if one ever needs it.
  labelHelp?: (ctx: {
    form?: import('antd').FormInstance;
    record?: any;
    mode: 'create' | 'edit' | 'clone';
  }) => import('react').ReactNode;
  placeholder?: string;
  // type: 'richtext' — show the toolbar's image button, uploading through
  // /api/attachments like every other image in the app. OFF by default: the
  // editor is shared by every remarks/description field, and a picture is only
  // wanted where the field is genuinely a document (Product's Style Guide,
  // Andre 2026-09-01). Turning it on elsewhere is this one line.
  allowImages?: boolean;
  repeatableList?: RepeatableListConfig; // for type: 'repeatableList'
  measurementGrid?: MeasurementGridConfig; // for type: 'measurementGrid'
  imageGallery?: ImageGalleryConfig; // for type: 'imageGallery'
  numberList?: NumberListConfig; // for type: 'numberList'
  autocomplete?: AutocompleteConfig; // for type: 'autocomplete'
  // Include/exclude this field from BulkExportBar's CSV — defaults to
  // "included unless it's a nested/relation type that doesn't reduce to one
  // cell" (see csv-export.ts's NON_EXPORTABLE_TYPES). Set explicitly to
  // override either direction for one field.
  exportable?: boolean;
  // Cascading side effect: fires after this field's value changes, with the
  // antd FormInstance so it can push values into OTHER fields — e.g.
  // Production's product picker auto-filling Konveksi + variants from the
  // last matching production. Most fields never need this; omit it.
  onChange?: (value: any, form: import('antd').FormInstance) => void;
  // Extra UI rendered directly under this field in the form, for state the
  // static `extra` string can't express — a live lookup result (Product's
  // Code field showing the latest code issued in the batch it just filled) or
  // an offer the user has to accept (Product's Variant section offering to
  // copy sizes/prices from another product of the same model).
  //
  // It is a SLOT, not a replacement: the field renders normally above it. The
  // node owns its own fetching and can write to other fields via `form`, so
  // per-resource behaviour lives in the resource config instead of growing
  // special cases inside the engine. `record` is undefined on create.
  addon?: (ctx: {
    form: import('antd').FormInstance;
    record?: any;
    mode: 'create' | 'edit' | 'clone';
  }) => import('react').ReactNode;
  // A small action rendered at the RIGHT END OF THE FIELD'S LABEL ROW, opposite
  // the label itself — for a shortcut that belongs to the field rather than to
  // the form ("Paste codes" on Sewing Data's Products picker). Same signature
  // as `addon`; the difference is only where it lands. Use it instead of
  // `addon` when the node is a trigger rather than a panel: a button under the
  // field has to be pushed up over the `extra` line to not look adrift, and
  // still reads as a stray control (Andre, 2026-08-25: "just look ugly").
  labelAction?: (ctx: {
    form: import('antd').FormInstance;
    record?: any;
    mode: 'create' | 'edit' | 'clone';
  }) => import('react').ReactNode;
}

// Free-text input with a "used before" suggestion list (type: 'autocomplete').
// `source` is called once when the field mounts and should do its own caching
// — see src/lib/product-field-values.ts. Filtering as the user types is client-side
// over the returned list; the value saved is always exactly what's in the box,
// list member or not.
export interface AutocompleteConfig {
  source: () => Promise<{ value: string; hint?: string }[]>;
  // Cap on options rendered at once (the list is filtered as you type, so this
  // only bounds the initial dropdown). Defaults to 50.
  maxOptions?: number;
}

// A bare repeatable list of plain numbers (no relation picker) — e.g. the
// Material Ledger's roll/pack quantities, where one In/Out entry has N rolls
// each with its own quantity. Unlike RepeatableListConfig (a picker + N
// columns per row), this is just numeric inputs with a running total. The
// wire value is a plain `number[]`; the API rebuilds its child rows from that
// array on save (they're anonymous quantities, no per-row identity to keep).
export interface NumberListConfig {
  addLabel: string; // e.g. "Add roll"
  unit?: string; // suffix shown on the running total, e.g. "yd" / "pcs"
  itemLabel?: string; // per-row prefix, e.g. "Roll" -> "Roll 1", "Roll 2"
  // Render as an Excel-like GRID (PasteGrid) instead of a column of InputNumbers
  // with an "Add" button: numbered rows, one quantity cell each, a spare row
  // always waiting at the bottom, and Excel paste. Andre, 2026-09-04, for
  // Fabric In: "xls format when user can just key in and tab" — a delivery is
  // 20-40 rolls, and clicking "Add roll" 40 times is not a data-entry UI.
  // Nothing else changes: the form value is still a plain (number|null)[].
  layout?: 'grid';
  columnLabel?: string; // grid only — the quantity column's header, e.g. "Yard"
  hint?: string; // grid only — the italic example under that header, e.g. "40"
}

// A multi-image field backed by a real join table (parentId, attachmentId) —
// e.g. Sample's reference images, SampleVariant's images/QC measurement
// photos. Distinct from FieldType 'image' (Product.imageId, a single plain
// FK column) since this needs its own array-of-rows sync, same "id present
// = existing row" contract as RepeatableListConfig — see
// src/lib/gallery-sync.ts.
export interface ImageGalleryConfig {
  itemsField: string; // record key holding the array of join rows, e.g. 'images'
  urlOf: (item: any) => string | null | undefined; // e.g. (img) => `/api/files/${img.attachment.storageKey}`
  addLabel?: string;
  // Read-only display extras (show page only — the editable form never
  // renders these, since a caption isn't something you'd type per-upload).
  // Lets the same primitive double as a "linked records with photos" tile
  // grid (e.g. Product Measurement's linked products), not just an editable
  // upload gallery.
  captionOf?: (item: any) => import('react').ReactNode;
  tileSize?: number; // px, tile width — defaults to 64
  tileAspectRatio?: string; // CSS aspect-ratio, e.g. '2 / 3' — defaults to '1 / 1' (square)
  // When set (e.g. 'products'), each tile becomes a link that opens that
  // item's detail drawer (EntityDrawer) — the item must carry an `id`. For
  // "linked records with photos" galleries like Product Measurement's products.
  linkResource?: string;
}

// A repeatable sub-table field: rows of {relation picker + N numeric
// columns}, e.g. Product's Materials (material + quantity) or Variants
// (size + web price + marketplace price). Standardized so this shape isn't
// hand-built per resource — Sample/Production can reuse it. The wire
// contract: each row is a plain object holding `relationKey` (the picked
// relation's id) plus each column's name; an `id` key on a row means it's an
// existing sub-table row (update), absence means a new one (create) — see
// src/lib/product-sync.ts for how the API syncs the submitted array.
//
// relationKey/relation are optional — omit both for a "plain" row with no
// picker at all (e.g. Collection's Checkpoints: just a date + a number, not
// linked to any other resource). itemLabel still drives the row's read-only
// title in that case; typically formats one of the row's own columns.
export interface RepeatableListConfig {
  relationKey?: string; // e.g. 'materialDetailsId' — key in each row holding the picked id
  relation?: RelationConfig; // reuses the same shape as a normal 'relation' field, for the row's picker
  // Extra fields per row. Defaults to a numeric input (e.g. quantity, webPrice).
  // type: 'relation' renders a second picker column instead (e.g. QC check's
  // status, a FieldOption relation) — needs its own `relationKey`/`relation`.
  // type: 'date' renders a DatePicker — its value is stored/sent as an ISO
  // string, converted at the row level (independent of the top-level form's
  // own date-field handling, which only looks at record-level fields).
  columns?: { name: string; label: string; type?: 'number' | 'relation' | 'date'; relationKey?: string; relation?: RelationConfig }[];
  addLabel: string; // e.g. "Add material"
  // Display label for a row's picked relation, for the read-only show view.
  // Omit entirely for a relation-less row list where the columns already say
  // everything (e.g. Collection's Checkpoints — just Date + Target Approved,
  // no separate title would add anything) — the label span is skipped.
  itemLabel?: (row: any) => string;
  // Show per-row up/down controls so the user can reorder rows, and label the
  // first row (e.g. "Main") to make it clear the order carries meaning.
  // Opt-in: for most sub-tables (QC checks, checkpoints, price rows) the order
  // is cosmetic and the extra buttons are just clutter.
  //
  // The submitted array order IS the order — the API's sync function
  // renumbers the backing `sort` column 0..n-1 on save (see
  // syncSampleVariantMaterials). Chose explicit buttons over drag-and-drop
  // because these lists are edited on mobile, where dragging inside a
  // scrolling drawer fights the scroll gesture.
  reorderable?: boolean;
  firstRowBadge?: string; // e.g. 'Main' — only rendered when reorderable
  // The rows are the server's to decide, not the user's: hides "Add" and the
  // per-row delete, leaving only the columns editable. For a list that is
  // materialised from a definition table (Pattern's approval checklist — every
  // defined check appears automatically, and removing one is not a thing a user
  // should be able to do), rather than one the user builds row by row.
  fixedRows?: boolean;
}

// A wide sub-table: rows picked via a relation (e.g. SKU size), many numeric
// columns (e.g. bust/waist/hips/...). Same row-identity contract as
// RepeatableListConfig (an `id` key means an existing row), but rendered as
// a real horizontally-scrolling <table> instead of inline rows — a
// RepeatableListField with 20 columns would be unusably wide as inline
// fields per row. Purpose-built for Product Measurement's per-size
// dimensions; not yet proven generalizable beyond that, so kept separate
// from RepeatableListConfig rather than overloading it with a "layout: grid"
// flag for a single use case.
export interface MeasurementGridConfig {
  relationKey: string; // e.g. 'skuOptionId'
  relation: RelationConfig; // the row picker (e.g. sku-options)
  columns: { name: string; label: string }[]; // every numeric column, in display order
  addLabel: string;
  rowLabel: (row: any) => string; // e.g. the picked SKU's display label, for the show view
}

// A "more" menu item, offered per-record on list rows/cards and on the show
// page. Delete is always present on the show page's More menu (built into
// ResourceShow) — this is for extra, resource-specific actions like
// Product's Duplicate.
export interface RowAction {
  key: string;
  label: string;
  icon?: import('react').ReactNode;
  danger?: boolean;
  // What the current user must be allowed to do for this action to be OFFERED.
  // Enforced centrally by the ListEngine adapter and DetailHeaderActions, so a
  // resource declares the requirement and never re-implements the check —
  // before this existed, gating was per-resource and opt-in, which is exactly
  // why Product offered "Product Approval" and "Duplicate" to roles that could
  // do neither (Andre, 2026-08-29).
  //
  //   'create' | 'update' | 'delete' | 'view'  -> that action on THIS resource
  //   'products:create'                        -> that action on ANOTHER resource
  //   'product.approval'  (contains a dot)     -> a CAPABILITY key
  //
  // Omitted = always offered (the action needs nothing beyond opening the
  // record). The server is still the real gate; this only decides what is drawn.
  requires?: string;
  // showActions only: false promotes this action to a direct button in the
  // detail drawer's header (next to Edit), instead of the "⋯" overflow menu.
  // Defaults to true (stays in the menu) — every existing showActions
  // config keeps its current layout unless it opts in. Set false sparingly:
  // the header has limited room (e.g. Production's Duplicate).
  menu?: boolean;
  // rowActions (card quick-action cluster) only: false keeps this action out
  // of the two direct hover-icon slots, pushing it into the card's own "⋯"
  // overflow dropdown instead — e.g. Production Material's Add Material Out/
  // Set Status, kept off the card face to leave room for Edit (Andre,
  // 2026-08-12). Defaults to true (eligible for a direct slot), matching
  // every existing rowActions config's current layout.
  primary?: boolean;
  // helpers (reload, openEdit, openNewWithPrefill, ...) — e.g. Production's
  // Add Comment/Change Status quick actions call helpers.reload() after
  // their own modal.confirm mutation succeeds. Optional: the legacy
  // (pre-ListEngine) ResourceList call sites — RowActions.tsx,
  // ShowActions.tsx, CreateIconButton.tsx — have no helpers to give.
  onClick: (record: any, helpers?: import('../ui/ListEngine').Helpers) => void;
}

// A selection-mode bulk action (checkbox-select rows, then act on all of
// them at once) — e.g. Production's "Prepare Fabric" over several selected
// productions. Distinct from listActions/listActionsSlot above, which sit
// next to the header's Create button and don't depend on a selection.
// onClick owns its own UI (open a modal, a drawer, ...); this only supplies
// the trigger button shown in the select-mode toolbar.
export interface SelectionBulkAction {
  key: string;
  label: string;
  bg?: string;
  color?: string;
  // `helpers` comes from ListEngine — use helpers.reload() / helpers.exitSelect()
  // to refresh the list in place after the action. Never window.location.reload():
  // that discards the user's search, tab, sort and page position.
  onClick: (selectedIds: (string | number)[], helpers: import('../ui/ListEngine').Helpers) => void;
}

export interface ResourceConfig {
  name: string; // Refine resource name, e.g. "tasks"
  label: string; // display label, e.g. "Tasks"
  fields: FieldConfig[];
  // No Create/Edit/Delete UI — for synced/raw fact data meant to be
  // browsed, not hand-edited (e.g. IG Raw Data's per-snapshot insight
  // tables). Only affects the UI; the underlying API routes can still exist
  // for other callers (e.g. the live sync). List/show remain fully usable.
  readOnly?: boolean;
  // No detail drawer either — clicking a card/row does nothing. For a browse
  // list whose card already says everything (e.g. the Production Restock
  // report, Andre 2026-08-20: "no details"). Stacks with readOnly, which on
  // its own only drops create/edit/delete.
  noDetail?: boolean;
  // Hide the toolbar's Sort control. Omitting sortFields is NOT enough — the
  // engine still renders the button with a lone decorative "Newest" entry,
  // which misdescribes a list served in a fixed order (Restock is always est.
  // finish ascending). Set alongside an empty sortFields, never instead of it.
  hideSort?: boolean;

  // Card-view mode (modeled on NocoBase's own ui_list_engine, which the app's
  // owner already approved) — swap the table for a responsive card grid.
  // Falls back to the plain table when omitted (Task/TaskSchedule's default).
  viewMode?: 'table' | 'cards';
  // Name of a 'select' field to drive the main tabs bar (e.g. status). The
  // field's own `options` become the tabs.
  mainTabsField?: string;
  // Tab the list opens on, by option value. Defaults to 'all'.
  defaultTab?: string;
  // Names of 'select' | 'relation' fields to expose as secondary filters.
  secondaryFilterFields?: string[];
  // Card title/image getters — default title falls back to the first `text` field.
  cardTitle?: (record: any) => string;
  cardImage?: (record: any) => string | undefined;
  // Fields shown in the card body, in order. Defaults to the first 4 list
  // fields (minus the title/tabs field) when omitted.
  cardFields?: string[];
  // Render cardFields as bare values (just "O420092"), no "Label: " prefix.
  cardFieldsHideLabel?: boolean;
  // A tagColored relation field in cardFields normally renders as a small
  // colored StatusPill — set true to show its plain label instead (no
  // badge), e.g. Sample Request's Type/Status kept off the colored-pill
  // treatment intentionally.
  cardFieldsPlain?: boolean;
  // CSS aspect-ratio for the card cover image, e.g. '2 / 3'. Defaults to
  // '4 / 3' when omitted.
  cardImageAspectRatio?: string;
  // 'grid' (default): the vertical cover-image cards used by Product/Sample.
  // 'row': single-column horizontal rows (small image left, title/subtitle/
  // tags right) — matches NocoBase's own Product Measurement list exactly,
  // same layout on mobile and desktop. Uses cardSubtitle/cardTags below
  // instead of cardFields.
  cardLayout?: 'grid' | 'row';
  // Muted line under the title, row layout only (e.g. Product Measurement's
  // linked product codes).
  cardSubtitle?: (record: any) => string | undefined;
  // Small pills under the subtitle, row layout only (e.g. Product
  // Measurement's linked sizes — "All Size" or "XS S M L XL").
  cardTags?: (record: any) => { label: string; color?: string }[];
  // Full custom card body, replacing cardFields/cardLayout/cardTags entirely
  // — for a card shape the generic field-list renderer can't express (e.g.
  // Production's variants table + material-status pills + quantity
  // mini-stats grid). Own the select-mode checkbox yourself when selectMode
  // is true (see ProductionCardBody for the pattern) — the engine doesn't
  // wrap one around your output.
  renderCard?: (record: any, ctx: { selectMode: boolean; selected: boolean; query: string }) => import('react').ReactNode;
  // The same rows presented a different way, behind the shared toolbar's
  // "View by" button (Andre, 2026-08-27) — beside Filter and Sort, never a
  // per-list toggle. Filter picks WHICH rows, Sort picks their ORDER, View by
  // picks WHAT A ROW IS: Launch shows one row per MODEL (the unit a drop is
  // actually scheduled in) or one per product.
  //
  // Declaring fewer than two renders no button at all, so every list that
  // declares none is untouched. The active key is sent to the list route as
  // ?view=<key>, so a view can be grouped server-side; renderCard here draws
  // that view's row when it needs a different shape from the normal card.
  // A savedFilter's `view` decides which one a fresh visit opens in.
  viewOptions?: {
    key: string;
    label: string;
    // The rows in this view are AGGREGATES, not records (Launch's model row
    // stands for several launch_plan rows). No row actions, no detail drawer,
    // no selection — the card owns its own click.
    rollup?: boolean;
    // The REAL record ids a rollup row stands for. Selecting the row selects
    // all of them, so bulk Set Value writes to the records underneath rather
    // than to a synthetic group id.
    rollupIds?: (record: any) => (string | number)[];
    // Which of `bulkActions` apply in this view, by key. Omit for all; `[]`
    // for none. The derived "Set Value" action is not a bulkActions entry and
    // is always kept — Launch's model view drops "Match to Production" (a
    // launch is matched to a production one product at a time) while keeping
    // Set Value, which is the whole point of selecting a model.
    bulkActions?: string[];
    // `openRow` opens ONE record's detail drawer — a rollup card uses it to
    // open a single row from inside itself.
    renderCard?: (record: any, ctx: { selectMode: boolean; selected: boolean; query: string; openRow: (row: any) => void }) => import('react').ReactNode;
  }[];
  // Opt-in multi-word (token-AND) search — the query splits on whitespace and
  // a row matches iff every word is somewhere in its searchText. Only the
  // Material list uses it today; other lists keep single-phrase search.
  multiWordSearch?: boolean;
  // Fully custom list body (keeps the standard toolbar/tabs/filter/search/
  // pagination + detail drawer chrome). Overrides the card/table body — for
  // shapes the built-ins can't do, e.g. Material's grouped fabric+variant rows.
  renderList?: (ctx: import('../ui/ListEngine').ListBodyCtx) => import('react').ReactNode;
  // Search bar: fields to OR-contains match server-side (see src/lib/filters.ts's
  // applySearch), and the input's placeholder text.
  searchFields?: string[];
  searchPlaceholder?: string;
  // Sort control options shown in the toolbar's sort menu.
  // A field can appear more than once with different fixed `order` values
  // (e.g. "Code (A-Z)" and "Code (Z-A)" as two separate menu items) instead
  // of one item that toggles direction on repeat clicks. Omit `order` to
  // keep the toggle behavior.
  sortFields?: { name: string; label: string; order?: 'asc' | 'desc' }[];
  // Conditions the list is PERMANENTLY scoped to — invisible in the toolbar and
  // not clearable, unlike savedFilters. This is how one resource publishes a
  // filtered VIEW of itself as its own page: Material › Fabric is the Material
  // List locked to raw_material.type = fabric, sharing one config instead of a
  // second copy of it (Andre, 2026-08-31). Client-mode lists apply them to the
  // loaded rows; serverPaged lists send them with the normal `filters` param,
  // so the route must list the field in filterableFields/relationFilters.
  lockedFilters?: SavedFilterCondition[];
  // One-click filter/sort presets shown as a small toggle in the toolbar
  // (e.g. Task's "My Recent Tasks": owner = me, due soon, sorted by start
  // date). The preset marked `isDefault` is applied automatically on a
  // fresh page load (no filters/sorters yet in the URL) — see ListToolbar.
  savedFilters?: SavedFilter[];
  // Name of a tagColored 'relation' field (e.g. statusOptionId) to render as
  // a clickable pill in the list, opening a dropdown of that relation's
  // options so the value can be changed without opening the full record —
  // see QuickStatusCell.
  quickStatusField?: string;
  // Name of a field (e.g. a 'richtext' description hidden from the list via
  // showInList: false) to show as a hover tooltip on the list's title cell —
  // a quick peek without opening the record.
  hoverPreviewField?: string;
  // Turns the auto-derived "Set <status>" bulk action into a general "Set
  // Value": the modal gets a field picker over these fields, then the matching
  // value control (options dropdown for a relation field, text box for a text
  // field). Set on Product (Andre, 2026-08-17) so status, designer, model and
  // name can all be set across a selection from one action instead of needing
  // one bulk action each. Controls follow the field type: relation -> options
  // dropdown, boolean -> Yes/No, date -> picker, anything else -> text box.
  // quickStatusField is NOT required (Launch sets launchDate/isLaunched with
  // no status relation at all); when it is set it stays in the list and still
  // drives the card pill / quick-status cell.
  // Without this, resources keep the single-field "Set <status>" behaviour.
  bulkSetFields?: string[];
  // Fetch the full record when a detail drawer opens (merged over the list row),
  // so the LIST payload can leave out relations only the detail view needs. Set
  // on Product 2026-08-18: its list was shipping productMeasurement + variants +
  // materials + mainFabric for every row — 267 KB and 637 ms per 50-row page,
  // against 46 KB / 58 ms without them. Only safe when the resource's
  // /api/<name>/<id> route returns the same shape its detail view expects.
  detailFetchById?: boolean;
  // Card layout: give the status pill its own line under the title instead of
  // sitting beside it (Andre, 2026-08-17, Product cards — name, then status,
  // then the cardFields like code). Opt-in so the other card resources keep
  // their existing title-and-pill-on-one-line look.
  cardStatusOwnLine?: boolean;

  // Extra items in each row/card's "more" menu (list views). E.g. Product's
  // Duplicate. Delete is deliberately NOT here — it lives on the show page
  // only, not the list, per the app's standardized quick-action pattern.
  // Delete-confirmation wording. Defaults to "Delete this <label>?" plus
  // "#<id> will be permanently deleted." Override when the delete reaches
  // further than the row itself — e.g. a Production DO cascades to every
  // colourway in it, and the dialog has to name them.
  deleteTitle?: string;
  deleteLabel?: (record: any) => string;
  // Body for the delete confirm, resolved when the dialog opens — for a delete
  // whose reach has to be looked up first (Material asks the server what still
  // references the fabric). The dialog stays the engine's, so a warned delete
  // still looks like every other delete. Declaring this also makes the delete
  // request carry ?force=1: the warning has been shown, so the server's own
  // "still in use" refusal (its backstop for callers that show no warning)
  // does not apply. See resourceConfigToListView.
  deleteContent?: (record: any) => Promise<import('react').ReactNode> | import('react').ReactNode;

  // THE EDIT OVERRIDE — a specific guard, consulted LAST, that may permit an
  // edit the ACL refuses (Andre, 2026-08-30: "it should be specific guard
  // against specific code and checked last. It may override anything on acl but
  // very specific code").
  //
  // Returns the writable field names when THIS person may edit THIS record, or
  // null to defer to the ACL. One hook answering both questions, because the
  // previous attempt split them across three mechanisms — a drawer flag, a row
  // predicate and a field list — and every surface I had not thought of stayed
  // broken until Andre found it. Every surface now reads this one function:
  // the drawer's Edit button, the card's Edit quick action, and the form's
  // field list.
  //
  // It never RESTRICTS: a resource without one behaves exactly as before, and a
  // user the ACL already allows is unaffected.
  editOverride?: (record: any, perm: import('./use-permissions').PermPayload | null) => string[] | null;

  rowActions?: (record: any) => RowAction[];
  // Extra items in the show page's "more" menu, alongside the always-present
  // Delete.
  showActions?: (record: any) => RowAction[];
  // Extra bulk/list-level action(s) next to the header's Create button.
  // Rendered as a second icon button only when non-empty — no resource uses
  // this yet, but the engine supports it so adding one later needs no layout
  // change.
  listActions?: RowAction[];
  // For bulk actions that need their own UI state (a modal, a drawer) rather
  // than a simple fire-and-forget click — e.g. Product's bulk image import.
  // Renders instead of the listActions dropdown when provided; the node
  // supplies its own trigger button (matching .kano-toolbar-btn sizing) and
  // manages its own open/close state.
  listActionsSlot?: import('react').ReactNode;
  // Page-level actions that aren't row/bulk-scoped (e.g. Production Result's
  // Import) — rendered as their own "⋯" dropdown, separate from the
  // Select-mode toggle so that icon keeps a single meaning (see
  // ListEngine.tsx's ListViewConfig.pageActionsMenu for the full reasoning).
  // `visible` hides an item from a role that must not use it. Without it every
  // item shows to anyone who can merely VIEW the list and refuses at the API —
  // a dead button on someone else's data reads as "I can do this", which is
  // worse than not offering it. Filtered in resourceConfigToListView, which is
  // where the permissions already live.
  pageActionsMenu?: { key: string; label: string; icon?: import('react').ReactNode; onClick: () => void; visible?: (perm: import('./use-permissions').PermPayload | null) => boolean }[];
  // Selection-mode bulk actions (select rows, act on all of them) — e.g.
  // Production's "Prepare Fabric". Shown alongside the auto-derived "Set
  // <status>" bulk action when quickStatusField is also set.
  bulkActions?: SelectionBulkAction[];
  // Suppress the list header's bulk-select (3-line) button entirely, including
  // the auto-derived "Set <status>" action — used when a resource wants its
  // own single header control (e.g. Stock Ledger folds Bulk Stock Transfer
  // into one 3-line dropdown via listActionsSlot, and a second engine-owned
  // select button would be redundant). The quick-status pill is unaffected.
  hideBulkSelect?: boolean;
  // Field names to blank out when cloning a record (e.g. Product's `code`,
  // since it's the natural key and a duplicate needs a fresh one).
  excludeOnClone?: string[];

  // Full custom create/edit forms, replacing the generic FieldConfig-driven
  // ResourceFormDrawer entirely — for cross-field logic the declarative
  // fields[] surface can't express (e.g. Production's New form: picking a
  // Product auto-fills Konveksi + Variants from that product's most recent
  // production, or fetches its catalog variants for a genuinely new one).
  // prefillData mirrors helpers.openNewWithPrefill's payload (e.g. the
  // Duplicate quick action's prefill).
  // Fires just BEFORE the form drawer submits, with the values it is about to
  // send. Return them (changed or not) to go ahead, or `null` to CANCEL the
  // save and leave the drawer open on the form.
  //
  // For a question that must be settled before anything is written — Product
  // uses it to confirm the MODEL derived from the name just typed, because a
  // model approved after the fact would already be stored under the wrong one
  // (Andre, 2026-08-27). Contrast `afterSave`, which is for offers that ride
  // along after the record exists (the colour mapping).
  //
  // It is awaited, so the save waits on whatever it does — keep that to a
  // dialog and a lookup, and never leave it unresolved.
  beforeSave?: (ctx: { values: Record<string, any>; record: any; mode: 'create' | 'edit' | 'clone' }) => Promise<Record<string, any> | null>;

  // Fires after a successful create/edit save in the form drawer, with the saved
  // record. For a follow-up OFFER rather than part of the save itself — Product
  // uses it to ask whether the colour just typed should become the brand's
  // mapping for that fabric. Must not block: the save has already happened and
  // the drawer is closing, so anything here is opt-in and failure is silent.
  // `message` is the App.useApp()-bound antd message instance — use it rather
  // than importing antd's static one, which can silently no-op under React 19.
  afterSave?: (ctx: { record: any; mode: 'create' | 'edit' | 'clone'; message: ReturnType<typeof import('antd').App.useApp>['message'] }) => void;

  // Extra content rendered INSIDE the generic form, below the fields — for a
  // companion control that needs the live form values but doesn't belong to
  // any one field (Sewing Data's "apply this rate to the rest of the model"
  // checklist). formSections[].render is the equivalent for forms long enough
  // to be sectioned; this is for the short ones, which stay a flat field list
  // rather than getting an accordion wrapped round them for one panel's sake.
  // Anything it renders in a <Form.Item name="..."> is submitted with the rest
  // of the form, so the API sees it as an ordinary body key.
  formExtra?: (ctx: { record: any; mode: 'create' | 'edit' | 'clone'; id?: string | number; form: any }) => React.ReactNode;
  renderNewForm?: (ctx: { open: boolean; onClose: () => void; helpers: import('../ui/ListEngine').Helpers; onSaved: () => void; prefillData: any }) => import('react').ReactNode;
  renderEditForm?: (record: any, ctx: { open: boolean; onClose: () => void; helpers: import('../ui/ListEngine').Helpers; onSaved: () => void }) => import('react').ReactNode;

  // Extra content appended below the config-driven detail (topFields +
  // showSections) — for things a plain field can't express, e.g. the Sample
  // Variant detail's Remarks / History / Comments (data that lives on the
  // parent sample or in the polymorphic history table). Rendered by
  // ResourceDetailBody, so it shows in the list detail AND the cross-object
  // EntityDrawer.
  detailExtra?: (row: any, helpers: import('../ui/ListEngine').Helpers) => import('react').ReactNode;

  // A banner at the TOP of the detail, above every field — for something the
  // reader must not miss, e.g. a KOL request whose deadline has passed (Andre,
  // 2026-08-28: "show warning when deadline is miss"). Return null for the
  // normal case, which is most rows. Distinct from detailExtra, which appends
  // BELOW everything and is for extra content rather than an alert.
  detailNotice?: (row: any) => import('react').ReactNode | null;

  // ---- Rich show-page layout (DetailSection/ImageGallery pattern) ----
  // Modeled on the app owner's approved NocoBase "Sample Details" view:
  // hero image + thumbnail strip, an optional category tag pill, flat
  // label:value rows above the fold, then collapsible colored-dot sections
  // below with an "Expand all" toggle. Standardized here so Product, Sample,
  // and Production show pages can each opt in with their own section list
  // rather than one-off layouts — set `showSections` to opt in; omit it to
  // keep the plain Descriptions table (Task, TaskSchedule, Shopee configs).
  showGallery?: (record: any) => string[]; // image URLs, first is the hero
  showTag?: (record: any) => { label: string; color?: string } | undefined;
  showTopFields?: string[]; // flat rows shown above the accordion, e.g. Collection/Type/Designer
  // Split a SIMPLE detail (a resource with no showSections, whose fields render
  // as one flat list) into two side-by-side columns. Field names not listed in
  // either column keep their normal place after the columns; a name listed
  // twice is drawn once, in the first column that claims it.
  //
  // For a record that is mostly numbers, where one long column means scrolling
  // past the reach figures to reach the money ones — TikTok Affiliate puts the
  // creator and its activity dates on the left, the commercial run from Orders
  // to ROI on the right (Andre, 2026-09-04). Stacks back to one column on a
  // narrow screen.
  //
  // `media` adds a THIRD column ahead of the two, for a cover or thumbnail that
  // identifies the record — TikTok Video puts the post's cover there so the
  // numbers read beside the thing they describe (Andre, 2026-09-04).
  detailColumns?: { media?: (row: any) => import('react').ReactNode; left: string[]; right: string[] };
  // Full-width label+content blocks (richtext renders as sanitized HTML,
  // everything else as pre-wrap text) shown between showTopFields and the
  // showSections accordion — e.g. Task's Description then SOP. Defaults to
  // ['description'] when omitted and a 'description' field exists, so
  // Product/Sample's existing configs keep working unchanged.
  showTextFields?: string[];
  showSections?: ShowSection[];
  // Overrides the detail drawer's default max-width (900px, capped at
  // 92vw) — e.g. Production's own detail (accordion sections + a comments
  // column) wants more room. Omit to keep the shared default.
  detailWidth?: number;
  // Full custom detail-drawer body, replacing showGallery/showTopFields/
  // showTextFields/showSections entirely — for a detail view with real
  // business logic the declarative surface can't express (e.g. Production
  // Material's need-quantity calculations + material-out ledger with its
  // own "record out" modal and per-entry cancel). Receives refreshKey (bump
  // it via helpers after a mutation to force a reload) and helpers (same
  // ones quick actions get — reload/refresh/closeDetail/...).
  renderDetail?: (record: any, ctx: { refreshKey: number; helpers: import('../ui/ListEngine').Helpers }) => import('react').ReactNode;

  // Create/Edit UX: render inside a Drawer over the list (ListEngine-driven
  // resources) instead of navigating to a separate /create or /edit/[id]
  // page. 'small'|'medium'|'large' maps to a fixed drawer width — pick based
  // on how many fields the form has (see ResourceFormDrawer.tsx for the
  // widths). Omit to keep the page-navigation bridge (the older default).
  formDrawerSize?: 'small' | 'medium' | 'large';

  // Group the generic ResourceFormDrawer's fields into collapsible
  // sections (same AccordionSection primitive the detail view and
  // Production's custom form use — see FormSections.tsx) instead of one
  // flat list. Opt-in: only worth it once a form has enough fields that
  // grouping actually helps navigating it (Production's Edit form was the
  // first case). Every field the form should show must appear in exactly
  // one section's `fields` list — anything omitted simply won't render.
  formSections?: {
    key: string;
    title: string;
    accent?: string;
    // Greyed note shown beside the section title on the FORM (Andre,
    // 2026-09-02: "put besides Description and Style Guide header in greyed
    // font") — for saying that what is typed here is saved somewhere shared.
    note?: string;
    fields?: string[];
    // Custom section content (e.g. Sample's Variants grid / Comments thread) —
    // when present, renders this instead of `fields`. Receives the current
    // record/mode/id and the antd form instance so it can fetch its own data,
    // open sub-drawers, gate by permission, etc. Lets a resource fold bespoke UI
    // into the shared form engine instead of a whole custom drawer.
    render?: (ctx: { record: any; mode: 'create' | 'edit' | 'clone'; id?: string | number; form: any }) => React.ReactNode;
    // Render the custom content ABOVE the fields instead of below (e.g. Sample's
    // reference images at the top of Details). Default false = below.
    renderTop?: boolean;
    // Hide this whole section in create mode (only shows in edit/clone). For
    // sections that are meaningless before the record exists — e.g. Sample's
    // Variants/Comments (need a saved id) or fields the create form shouldn't
    // ask for yet (Pricing/Remarks). Keeps the create form to just the fields
    // that matter at creation, matching the old bespoke create drawer.
    hideOnCreate?: boolean;
  }[];

  // Name of a numeric field (e.g. SKU Option's `sort`) that drag-to-reorder
  // in the ListEngine adapter's table view writes to. Must also appear in
  // sortFields (the list only shows the drag handle when sorted by this
  // field, unfiltered/unsearched — see ListEngine's own `reorder` doc).
  reorderField?: string;

  // For tables too large to load whole into the browser (grows past the
  // ~2000-row cap the in-browser fetchList mode silently truncates at —
  // Sample Variants, Shopee/FB Ad Performance). Search/secondary-filter/
  // sort/pagination all become real API requests (page/pageSize/sortField/
  // sortOrder/filters query params) instead of an in-browser array scan —
  // see resourceConfigToListView.tsx's serverMode wiring and ListEngine's
  // own serverMode doc. The API route must support those params
  // (parseFiltersParam/filtersToPrismaWhere/applySearch from lib/filters.ts,
  // or its own equivalent — see the sample-variants route).
  //
  // mainTabsField CAN be combined with this: the adapter sends the active
  // tab as `tab`/`tabField`, and a route that honors them returns `tabCounts`
  // (a groupBy over the full matching set) so the tab badges stay accurate.
  // A route that ignores them just shows tabs without counts.
  serverPaged?: boolean;

  // --- ACL keys ---------------------------------------------------------
  // `name` doubles as the API path AND, by default, the ACL key — fine while
  // the page route, the API resource and the grant key all share one word.
  // Two resources break that and MUST set these, or every non-admin gets the
  // "You don't have access to this page" empty state no matter what's granted:
  //   - Material list: route /material-details, config/API name `materials`,
  //     grant key `material-details` (what /api/materials also enforces).
  //   - Canvas: route /canvas, config/API name `canvases`.
  // The /roles Pages tab keys off the ROUTE, so aclViewKey is the route key.
  aclViewKey?: string;
  // ACL key for create/update/delete gating — must match what the API route
  // enforces (Material writes are enforced as `material-details`). Defaults to
  // `name`.
  aclWriteKey?: string;
}

// How a relation field's related ROW and its display label are read off a list
// row: `statusOptionId` carries its FieldOption as `statusOption` unless the
// field names a displayKey of its own. Lives here rather than in the list
// adapter because Smart Search and Product Search draw the same status pill
// from the same config and must not drift from what the card renders.
export function relationDisplayKey(field: FieldConfig): string {
  return field.relation?.displayKey ?? field.name.replace(/Id$/, '');
}
export function relationLabelOf(field: FieldConfig, related: any): string {
  if (!related) return '—';
  const lf = field.relation?.labelField;
  if (!lf) return '—';
  return (typeof lf === 'function' ? lf(related) : related[lf]) ?? '—';
}

// The status pill a card shows for this resource, or null when the row has no
// status (or the resource declares none). Same rule the list card uses:
// `quickStatusField`, resolved across its relation, coloured by `colorField`.
export function cardStatusOf(config: ResourceConfig, row: any): { label: string; color?: string; value?: string } | null {
  const field = config.quickStatusField ? config.fields.find((f) => f.name === config.quickStatusField) : undefined;
  if (!field) return null;
  const related = row[relationDisplayKey(field)];
  if (!related) return null;
  return {
    label: relationLabelOf(field, related),
    color: field.relation?.colorField ? related[field.relation.colorField] : undefined,
    // FieldOption-backed statuses carry a stable `value` beside the editable
    // label. Callers that MAP a status to something else (Product Search's
    // Active/Archive chip) must key on this, not on the label.
    value: typeof related.value === 'string' ? related.value : undefined,
  };
}

// Which ACL key gates opening this list page vs. writing its records. Use these
// instead of reading `config.name` directly for any permission check.
export const aclViewKeyOf = (config: ResourceConfig): string => config.aclViewKey ?? config.name;
export const aclWriteKeyOf = (config: ResourceConfig): string => config.aclWriteKey ?? config.name;

export interface ShowSection {
  key: string;
  label: string; // rendered uppercase with letter-spacing
  color: string; // section dot color, e.g. '#2f6846'
  fields?: string[];
  // Which fields decide whether this section shows at all. A section the role
  // can read NOTHING of disappears (see ResourceDetailBody's SectionsAccordion);
  // by default that verdict is taken over `fields`, which means a field the
  // section merely REPEATS from elsewhere keeps it alive. Product's Material is
  // exactly that case: Composition also sits beside the photo, so a role that
  // may read the composition but not the fabric would still get the whole
  // accordion (Andre, 2026-09-01: hide Material from Employee, keep Composition
  // up top). List the fields that are genuinely this section's own here.
  aclFields?: string[];
  defaultOpen?: boolean;
  // A quiet grey line under the section header — where this section's data
  // actually lives, said before someone edits it (Andre, 2026-09-02). Takes the
  // row, so it can name the model the text is shared with.
  note?: (row: any) => import('react').ReactNode;
  // Custom section body — rendered INSTEAD of `fields`, for a panel the
  // declarative field list can't express (e.g. Product's Colors: the other
  // products sharing this model, fetched on open). Same escape hatch
  // formSections already has on the form side; use it for a self-contained
  // client component, not to rebuild fields by hand.
  render?: (row: any) => import('react').ReactNode;
}

// A field with `featureKey` is only rendered for users granted that feature
// (see FieldConfig.featureKey). Applied by all three view selectors below so a
// gated field disappears from list columns, form inputs and detail rows alike.
const featureOk = (f: FieldConfig) => !f.featureKey || hasFeatureCached(f.featureKey);

export function listFields(config: ResourceConfig): FieldConfig[] {
  return config.fields.filter((f) => f.showInList !== false && featureOk(f));
}

// `mode` only matters for hideOnCreate/hideOnEdit — pass it so each form drops
// the fields that don't belong to it. Clone counts as an EDIT for both flags:
// it carries a record's values across, and a hidden field submits nothing,
// which would silently blank them.
export function formFields(config: ResourceConfig, mode?: 'create' | 'edit' | 'clone'): FieldConfig[] {
  return config.fields.filter(
    (f) =>
      f.showInForm !== false &&
      featureOk(f) &&
      !(mode === 'create' && f.hideOnCreate) &&
      !((mode === 'edit' || mode === 'clone') && f.hideOnEdit),
  );
}

export function showFields(config: ResourceConfig): FieldConfig[] {
  return config.fields.filter((f) => f.showInShow !== false && featureOk(f));
}
