import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '../runtime';
import { serialize } from './serialize';
import { auth } from '../runtime';
import { requirePermission } from './acl';
import { parseFiltersParam, applySearch, filtersToPrismaWhere, coerceBooleanFilters, findSearchText } from './filters';
import { uniqueConstraintResponse } from './prisma-errors';
import { syncImageGallery } from './gallery-sync';

// Generic CRUD route factory for the plain data-only resources (the HR
// module's employee/pay/attendance/... tables). Rather than hand-writing 18
// near-identical route files with their own BigInt/date/float coercion — the
// exact copy-paste the project's architecture rules warn against — each
// resource declares a small CrudSpec and gets list+item handlers from here.
// Bespoke resources (Product, Sample, Material Ledger, ...) keep their own
// hand-written routes; this is only for the simple, one-model-one-table CRUD
// shape where a factory is clearer than nine copies.

export type CoerceKind = 'string' | 'int' | 'float' | 'bigint' | 'date' | 'bool';

export interface CrudField {
  name: string;
  kind: CoerceKind;
}

export interface CrudSpec {
  // Prisma delegate key on the client, e.g. 'employee', 'employeePay'.
  model: string;
  // Writable fields (everything the create/edit form can send). `id`,
  // relation objects and timestamps are never listed here.
  fields: CrudField[];
  // Fields a list request may filter on (secondary filters / relation pickers).
  filterFields?: string[];
  // Fields the "q" search box OR-matches with `contains`. Flat columns only.
  searchFields?: string[];
  // Whole-search override for a resource whose search must reach into a
  // relation (`applySearch` only builds flat `contains` clauses). Returns a
  // Prisma where-fragment, or null to add nothing. ANDed with `searchFields`,
  // so a spec that wants "colour OR fabric code" puts BOTH branches in here and
  // leaves `searchFields` empty rather than splitting them across the two.
  searchWhere?: (q: string) => Record<string, unknown> | null;
  // Prisma `include` shape so relation labels resolve in list/show.
  include?: Record<string, unknown>;
  // Default Prisma orderBy when the request specifies no sort. Nested is
  // allowed, so a resource can default to a RELATION's column
  // (e.g. { materialDetails: { code: 'asc' } }).
  defaultOrderBy?: Record<string, unknown>;
  // Column backing the list's main tabs (ResourceConfig.mainTabsField). When
  // the list runs serverPaged the adapter sends the active tab as `tab` +
  // `tabField`; without this the factory would ignore them and every tab would
  // show the whole table. Also drives the per-tab counts on the badges.
  tabField?: string;
  // Sort-key -> Prisma orderBy builder, for sorting on something that isn't a
  // plain column on this model. The list's sortFields offer the key; this turns
  // it into the orderBy Prisma needs. Keys not listed here fall through to the
  // plain `{ [field]: order }` form.
  sortMap?: Record<string, (order: 'asc' | 'desc') => Record<string, unknown>>;
  // Post-processes one page of list rows before serialization — for read-only
  // extras that aren't columns and can't be expressed as a Prisma `include`
  // (e.g. Color Mapping showing the products that use each mapped colour).
  // Runs on the page only, never the whole table.
  decorate?: (rows: any[]) => Promise<any[]>;
  // ACL object key for WRITES (create/update/delete), e.g. 'color-mappings'.
  // Reads stay open, per the house convention (see inner-header-resources.ts).
  // Omitted on the HR specs, which predate this and are unchanged by it.
  resource?: string;
  // An imageGallery field backed by a join table (e.g. Employee.docs). On
  // create/update the submitted `bodyKey` array (from ImageGalleryField:
  // [{ attachmentId }]) is synced against the join model, same as the
  // hand-written material-details route does.
  gallery?: { bodyKey: string; joinModel: string; parentIdField: string };
}

// undefined  -> caller omitted the key (skip it on PATCH)
// null / ''  -> explicit clear
function coerce(kind: CoerceKind, v: unknown): unknown {
  if (v === undefined) return undefined;
  if (v === null || v === '') return null;
  switch (kind) {
    case 'bigint':
      return BigInt(v as string | number);
    case 'int':
      return Math.round(Number(v));
    case 'float':
      return Number(v);
    case 'bool':
      return typeof v === 'string' ? v === 'true' : Boolean(v);
    case 'date':
      return new Date(v as string);
    default:
      return v;
  }
}

function delegate(spec: CrudSpec): any {
  return (prisma as any)[spec.model];
}

// Only keys present in `body` (and declared in the spec) are written, so a
// PATCH touches just the submitted fields and a create sets exactly what the
// form sent.
function buildData(spec: CrudSpec, body: Record<string, unknown>, mode: 'create' | 'update') {
  const data: Record<string, unknown> = {};
  for (const f of spec.fields) {
    if (!(f.name in body)) continue;
    const val = coerce(f.kind, body[f.name]);
    if (mode === 'create' && val === undefined) continue;
    data[f.name] = val;
  }
  return data;
}

export function crudListHandlers(spec: CrudSpec) {
  async function GET(req: NextRequest) {
    const session = await auth();
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { searchParams } = new URL(req.url);
    const page = Number(searchParams.get('page') ?? '1');
    const pageSize = Number(searchParams.get('pageSize') ?? '10');
    const sortField = searchParams.get('sortField');
    const sortOrder = searchParams.get('sortOrder');
    const dir = sortOrder === 'desc' ? ('desc' as const) : ('asc' as const);
    const orderBy = sortField
      ? (spec.sortMap?.[sortField]?.(dir) ?? { [sortField]: dir })
      : spec.defaultOrderBy ?? { id: 'desc' as const };

    const parsedFilters = parseFiltersParam(req);
    const where = applySearch(
      filtersToPrismaWhere(parsedFilters, spec.filterFields ?? []),
      parsedFilters,
      spec.searchFields ?? [],
    );
    // A Yes/No filter arrives as the strings "true"/"false" inside an `in`,
    // which Prisma rejects outright on a Boolean column — a 500 for the whole
    // list. serverList does this from the model's own metadata; here the spec
    // already declares which fields are booleans, so use that.
    coerceBooleanFilters(where, spec.fields.filter((f) => f.kind === 'bool').map((f) => f.name));

    const q = findSearchText(parsedFilters);
    const relationSearch = spec.searchWhere && q ? spec.searchWhere(q) : null;
    if (relationSearch) {
      where.AND = [...(Array.isArray(where.AND) ? (where.AND as unknown[]) : []), relationSearch];
    }

    // Main-tab filter. The tab value arrives as a string; coerce it with the
    // field's own declared kind so a BigInt FK column doesn't get a string.
    const reqTabField = searchParams.get('tabField');
    const tab = searchParams.get('tab');
    const tabActive = !!(spec.tabField && reqTabField === spec.tabField);
    const tabKind = spec.fields.find((f) => f.name === spec.tabField)?.kind ?? 'string';
    const tabbedWhere =
      tabActive && tab
        ? { AND: [where, { [spec.tabField as string]: coerce(tabKind, tab) }] }
        : where;

    const [data, total, grouped] = await Promise.all([
      delegate(spec).findMany({ where: tabbedWhere, skip: (page - 1) * pageSize, take: pageSize, orderBy, include: spec.include }),
      delegate(spec).count({ where: tabbedWhere }),
      // Counts come from the UNTABBED where, so every badge shows its own total
      // rather than only the active tab's.
      spec.tabField && tabActive
        ? delegate(spec).groupBy({ by: [spec.tabField], where, _count: { _all: true } })
        : null,
    ]);

    const tabCounts = grouped
      ? {
          // The "All" pill reads tabCounts.all, NOT `total` — and `total` is the
          // count for the ACTIVE tab, so it cannot serve both. Without this key
          // every tabbed list built on this factory rendered "All 0" while the
          // other pills were correct (found on the Shopify lists 2026-08-26;
          // the colour/material mapping pages had it too). server-list.ts has
          // always set it — this factory just never did.
          //
          // Summed from the groups rather than a second count(): the group rows
          // already cover every row matching the untabbed where, INCLUDING the
          // null-tab group that the filter below drops from the per-value keys.
          all: grouped.reduce((n: number, g: any) => n + g._count._all, 0),
          ...Object.fromEntries(
            grouped
              .filter((g: any) => g[spec.tabField as string] != null)
              .map((g: any) => [String(g[spec.tabField as string]), g._count._all]),
          ),
        }
      : undefined;

    return NextResponse.json({
      data: serialize(spec.decorate ? await spec.decorate(data) : data),
      total,
      ...(tabCounts ? { tabCounts } : {}),
    });
  }

  async function POST(req: NextRequest) {
    const session = await auth();
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (spec.resource) {
      const denied = await requirePermission(session, spec.resource, 'create');
      if (denied) return denied;
    }

    const body = await req.json();
    // A duplicate value on a unique column is a user mistake, not a server
    // fault — it comes back as a 409 the form can show (see prisma-errors).
    let created;
    try {
      created = await delegate(spec).create({ data: buildData(spec, body, 'create'), include: spec.include });
    } catch (err) {
      const conflict = uniqueConstraintResponse(err);
      if (!conflict) throw err;
      return conflict;
    }
    if (spec.gallery) {
      await syncImageGallery((prisma as any)[spec.gallery.joinModel], spec.gallery.parentIdField, created.id, body[spec.gallery.bodyKey]);
      const withGallery = await delegate(spec).findUnique({ where: { id: created.id }, include: spec.include });
      return NextResponse.json(serialize(withGallery));
    }
    return NextResponse.json(serialize(created));
  }

  return { GET, POST };
}

export function crudItemHandlers(spec: CrudSpec) {
  async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const session = await auth();
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id } = await params;
    if (!/^\d+$/.test(id)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 });
    const row = await delegate(spec).findUnique({ where: { id: BigInt(id) }, include: spec.include });
    if (!row) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json(serialize(row));
  }

  async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const session = await auth();
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    if (spec.resource) {
      const denied = await requirePermission(session, spec.resource, 'update');
      if (denied) return denied;
    }

    const { id } = await params;
    const body = await req.json();
    let updated;
    try {
      updated = await delegate(spec).update({
        where: { id: BigInt(id) },
        data: buildData(spec, body, 'update'),
        include: spec.include,
      });
    } catch (err) {
      const conflict = uniqueConstraintResponse(err);
      if (!conflict) throw err;
      return conflict;
    }
    if (spec.gallery) {
      await syncImageGallery((prisma as any)[spec.gallery.joinModel], spec.gallery.parentIdField, BigInt(id), body[spec.gallery.bodyKey]);
      const withGallery = await delegate(spec).findUnique({ where: { id: BigInt(id) }, include: spec.include });
      return NextResponse.json(serialize(withGallery));
    }
    return NextResponse.json(serialize(updated));
  }

  async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const session = await auth();
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    if (spec.resource) {
      const denied = await requirePermission(session, spec.resource, 'delete');
      if (denied) return denied;
    }

    const { id } = await params;
    await delegate(spec).delete({ where: { id: BigInt(id) } });
    return NextResponse.json({ success: true });
  }

  return { GET, PATCH, DELETE };
}
