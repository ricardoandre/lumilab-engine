import type { NextRequest } from 'next/server';

// Minimal filter plumbing shared by the data provider (client) and every
// list API route (server): "eq"/"in"/"ne" plus "gte"/"lte" ranges on direct
// scalar fields, and a single OR-group — enough for the engine's main tabs,
// secondary filters, and saved-filter presets (e.g. "status is Done OR
// overdue"), without pulling in Refine's full ConditionalFilter nesting.

export interface SimpleFilter {
  field: string;
  operator: 'eq' | 'in' | 'notIn' | 'contains' | 'gte' | 'lte' | 'ne';
  value: unknown;
}

// A saved filter's OR branch — e.g. "status is Done" OR "deadline overdue".
// Each branch is itself a plain SimpleFilter (no nested OR-of-OR support;
// not needed by anything so far).
export interface OrFilterGroup {
  or: SimpleFilter[];
}

export type FilterEntry = SimpleFilter | OrFilterGroup;

function isOrGroup(f: FilterEntry): f is OrFilterGroup {
  return 'or' in f && Array.isArray((f as OrFilterGroup).or);
}

function isEmptyValue(value: unknown): boolean {
  return value === undefined || value === null || value === '' || (Array.isArray(value) && value.length === 0);
}

// An unset secondary filter arrives as an empty value and is skipped. But a
// saved filter can deliberately test for null — e.g. Sample's "Need Pricing"
// (targetPrice IS NULL) — sent as { operator: 'eq'|'ne', value: null }. Those
// must NOT be skipped; buildCondition turns them into `{ field: null }` (IS
// NULL) / `{ not: null }` (IS NOT NULL). Only eq/ne carry that intent; an `in`
// with [] or a `contains` of '' is still just an empty, skippable filter.
function isSkippable(f: SimpleFilter): boolean {
  if (f.value === null && (f.operator === 'eq' || f.operator === 'ne')) return false;
  return isEmptyValue(f.value);
}

function buildCondition(f: SimpleFilter): unknown {
  if (f.operator === 'in' && Array.isArray(f.value)) return { in: f.value };
  if (f.operator === 'notIn' && Array.isArray(f.value)) return { notIn: f.value };
  if (f.operator === 'contains') return { contains: f.value };
  if (f.operator === 'gte') return { gte: f.value };
  if (f.operator === 'lte') return { lte: f.value };
  if (f.operator === 'ne') return { not: f.value };
  return f.value;
}

export function parseFiltersParam(req: NextRequest): FilterEntry[] {
  const raw = req.nextUrl.searchParams.get('filters');
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

// Builds a Prisma `where` object from filters, restricted to `allowedFields`
// so a resource can't be filtered on a field its API route didn't opt into.
export function filtersToPrismaWhere(
  filters: FilterEntry[],
  allowedFields: string[],
): Record<string, unknown> {
  const where: Record<string, unknown> = {};
  // A filter set can carry more than one OR-group — a saved filter's own group
  // ("not launched yet" = false OR never set) plus one the engine builds for a
  // secondary filter, say. They are ANDed: keeping only the last one, as this
  // did until 2026-08-28, silently dropped half of what the user asked for.
  const orGroups: unknown[][] = [];
  for (const f of filters) {
    if (isOrGroup(f)) {
      const branches = f.or
        .filter((sf) => allowedFields.includes(sf.field) && !isSkippable(sf))
        .map((sf) => ({ [sf.field]: buildCondition(sf) }));
      if (branches.length > 0) orGroups.push(branches);
      continue;
    }

    if (!allowedFields.includes(f.field)) continue;
    if (isSkippable(f)) continue;

    if (f.operator === 'gte' || f.operator === 'lte') {
      // Merge onto the same field's condition rather than overwrite, so a
      // "between" filter (gte + lte on the same field, e.g. a date range)
      // sent as two SimpleFilter entries lands in one Prisma clause.
      const existing = where[f.field];
      where[f.field] = { ...(existing && typeof existing === 'object' ? existing : {}), [f.operator]: f.value };
    } else {
      where[f.field] = buildCondition(f);
    }
  }
  // One group stays on `where.OR` (the shape every route has always seen);
  // several go under AND, where they cannot overwrite each other.
  if (orGroups.length === 1) where.OR = orGroups[0];
  else if (orGroups.length > 1) where.AND = orGroups.map((branches) => ({ OR: branches }));
  return where;
}

// gte/lte filter values arrive over the wire as ISO date strings (see
// ListToolbar's date-range control) — Prisma's DateTime filters expect real
// Date instances, not strings. Call after filtersToPrismaWhere for any
// DateTime-typed fields a route allows filtering on. Recurses into OR/AND
// branches too, since a saved filter's date condition may live there
// instead of at the top level.
export function coerceDateFilters(where: Record<string, unknown>, dateFields: string[]): Record<string, unknown> {
  function coerceNode(node: Record<string, unknown>) {
    for (const field of dateFields) {
      const cond = node[field];
      if (cond && typeof cond === 'object' && !Array.isArray(cond)) {
        const c = cond as Record<string, unknown>;
        if (typeof c.gte === 'string') c.gte = new Date(c.gte);
        if (typeof c.lte === 'string') c.lte = new Date(c.lte);
      }
    }
    for (const key of ['OR', 'AND'] as const) {
      const branch = node[key];
      if (Array.isArray(branch)) branch.forEach((n) => coerceNode(n as Record<string, unknown>));
    }
  }
  coerceNode(where);
  return where;
}

// Boolean columns need the same treatment as dates, for a sharper reason: the
// filter values arrive as the STRINGS "true"/"false" (a Yes/No dropdown is a
// multi-select like any other, so the engine sends `in: ["false"]`), and Prisma
// has no `in` on a Boolean at all. That combination answered 500 on
// /api/launches — a whole list dead the moment anyone touched its Launched
// filter (2026-08-27). serverList applies this to every Boolean column of the
// model it is querying, so no route can forget it.
//
// `nullMeansFalse` names the nullable columns where "not set" reads as No on
// screen — Launch's is_launched, where 143 of 246 rows are NULL and every one
// of them is a launch that has not gone out. Filtering those to `= false`
// alone would answer "46 not launched" on a board showing 189. Only listed
// fields get the NULL branch: `{ field: null }` is a validation error, not a
// no-op, on a column Prisma knows is non-nullable.
function toBool(v: unknown): boolean | null {
  if (typeof v === 'boolean') return v;
  if (typeof v === 'number') return v === 1 ? true : v === 0 ? false : null;
  if (typeof v === 'string') {
    const s = v.trim().toLowerCase();
    if (s === 'true' || s === '1') return true;
    if (s === 'false' || s === '0') return false;
  }
  return null;
}

function boolSet(values: unknown[]): Set<boolean> {
  const out = new Set<boolean>();
  for (const v of values) {
    const b = toBool(v);
    if (b !== null) out.add(b);
  }
  return out;
}

const invert = (want: Set<boolean>) => new Set([true, false].filter((b) => !want.has(b)));

function pushAnd(node: Record<string, unknown>, clause: unknown) {
  const existing = node.AND;
  node.AND = Array.isArray(existing) ? [...existing, clause] : existing ? [existing, clause] : [clause];
}

export function coerceBooleanFilters(
  where: Record<string, unknown>,
  booleanFields: string[],
  nullMeansFalse: string[] = [],
): Record<string, unknown> {
  function coerceNode(node: Record<string, unknown>) {
    // Branches FIRST. The "No" rewrite below appends an OR-clause of its own to
    // this node's AND, and walking into that clause would rewrite its `false`
    // branch into another one, forever — a stack overflow, not a 500 anyone
    // could read (caught on sandbox 2026-08-28).
    for (const key of ['OR', 'AND'] as const) {
      const branch = node[key];
      if (Array.isArray(branch)) branch.forEach((n) => coerceNode(n as Record<string, unknown>));
    }
    for (const field of booleanFields) {
      if (!(field in node)) continue;
      const cond = node[field];
      // `{ field: null }` is a deliberate IS NULL (see isSkippable) — leave it.
      if (cond === null) continue;

      let want: Set<boolean>;
      if (cond && typeof cond === 'object' && !Array.isArray(cond)) {
        const c = cond as Record<string, unknown>;
        if (Array.isArray(c.in)) want = boolSet(c.in);
        else if (Array.isArray(c.notIn)) want = invert(boolSet(c.notIn));
        else if ('not' in c) {
          if (c.not === null) continue; // IS NOT NULL — a real condition, not a boolean test
          want = invert(boolSet([c.not]));
        } else if ('equals' in c) {
          if (c.equals === null) continue;
          want = boolSet([c.equals]);
        } else continue;
      } else {
        want = boolSet([cond]);
      }

      delete node[field];
      const yes = want.has(true);
      const no = want.has(false);
      // Both selected matches every row, so the filter simply comes off. So
      // does a value that is neither true nor false — a malformed filter must
      // not quietly turn into "match nothing".
      if (yes && no) continue;
      if (yes) node[field] = { equals: true };
      else if (no) {
        if (nullMeansFalse.includes(field)) pushAnd(node, { OR: [{ [field]: false }, { [field]: null }] });
        else node[field] = { equals: false };
      }
    }
  }
  coerceNode(where);
  return where;
}

// Pulls the reserved "q" search-box filter out of a parsed filter list —
// for routes that need to do something with the raw search text beyond
// what applySearch's single-field `contains` clauses cover (e.g. a
// relation lookup, like fb-ad-performance's ad name/id search).
export function findSearchText(filters: FilterEntry[]): string | undefined {
  const q = filters.find((f): f is SimpleFilter => 'field' in f && f.field === 'q');
  return typeof q?.value === 'string' ? q.value : undefined;
}

// "materialDetails.code" -> { materialDetails: { code: { contains: q } } }
// A plain name stays flat. Lets a search field reach one level into a relation
// without every such resource hand-writing its own GET (the pattern konveksi-
// prices had to use before this existed).
function containsClause(field: string, q: string): Record<string, unknown> {
  const parts = field.split('.');
  let clause: Record<string, unknown> = { contains: q };
  for (let i = parts.length - 1; i >= 0; i--) clause = { [parts[i]]: clause };
  return clause;
}

// A multi-word query is matched WORD BY WORD, in any order: every word has to
// appear somewhere in the searchable fields, but not in the same field and not
// in the typed order (Andre, 2026-08-28: "i cant search indigo adair while
// there is adair indogo, do search smarter").
//
// One phrase-wide `contains` could only ever match the words in the order they
// were typed, so "indigo adair" found nothing at all against a product named
// "Adair Indigo" — and a colour is as natural to type first as last. Splitting
// also lets a query cross fields: "a43 indigo" now matches code A430041 AND
// name "… Indigo", which no single field contains.
//
// A one-word query is unchanged, which is the overwhelming majority of
// searches. Capped so a paste of a whole sentence can't turn into 40 LIKEs.
const MAX_SEARCH_WORDS = 8;

export function searchWords(q: string): string[] {
  return q.trim().split(/\s+/).filter(Boolean).slice(0, MAX_SEARCH_WORDS);
}

// Search bar support: a reserved filter with field "q" whose value gets
// OR-matched (contains) across `fields` — separate from filtersToPrismaWhere
// because "search across N fields" isn't a single-field where clause.
export function applySearch(
  where: Record<string, unknown>,
  filters: FilterEntry[],
  fields: string[],
): Record<string, unknown> {
  const q = findSearchText(filters);
  if (!q || fields.length === 0) return where;
  const words = searchWords(q);
  if (words.length === 0) return where;
  // One OR-group per word, all ANDed: "every word matches SOME field".
  where.AND = [
    ...(Array.isArray(where.AND) ? (where.AND as unknown[]) : []),
    ...words.map((w) => ({ OR: fields.map((f) => containsClause(f, w)) })),
  ];
  return where;
}
