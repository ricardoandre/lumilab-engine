import { NextResponse } from 'next/server';
import type { Session } from 'next-auth';
import { prisma } from '../runtime';
import { namingBrandIdsForUsers } from '../runtime';

// ACL enforcement layer (Phase 1). Design: memory project_acl_design.
//
// A user's effective access = the UNION of RolePermission rows across all their
// roles. `User.isAdmin` bypasses every check (sees/does everything). Deny by
// default: no matching row => no access. `resource` is a free-form key — a
// ListEngine resource name (e.g. "launches") OR a virtual feature key (e.g.
// "sample.pricing_simulation"). `action` is view/create/update/delete, or "*"
// meaning all actions on that resource.
//
// Phase 1 enforces resource + action (route guards + nav visibility). The
// `fields` (allowlist) and `scope` (record filter) columns are carried through
// here but not yet enforced — that's Phase 2 / Phase 3.

export type Action = 'view' | 'create' | 'update' | 'delete';

// Actions the admin UI writes; "*" (all) is also honored by canWith at read
// time (e.g. from an imported NocoBase rule), even though the UI writes explicit
// actions rather than "*".
export const ACTIONS: Action[] = ['view', 'create', 'update', 'delete'];

// Gate for the role-management endpoints themselves — admin-only. Returns a
// short-circuit response, or null to proceed.
export function requireAdmin(session: Session | null): NextResponse | null {
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!session.user?.isAdmin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  return null;
}

export interface PermRow {
  resource: string;
  action: string;
  fields: unknown;
  fieldsDeny: unknown;
  scope: unknown;
}

export interface AclContext {
  userId: bigint | null;
  isAdmin: boolean;
  perms: PermRow[];
}

// Resolve a user's permissions once, per request. Admins short-circuit with an
// empty perms list (every check returns true via the isAdmin flag), so we skip
// the DB round-trip for them.
export async function getAclContext(session: Session | null): Promise<AclContext> {
  const isAdmin = !!session?.user?.isAdmin;
  const rawId = session?.user?.id;
  const userId = rawId ? BigInt(rawId) : null;
  if (!userId) return { userId: null, isAdmin: false, perms: [] };
  if (isAdmin) return { userId, isAdmin: true, perms: [] };

  const perms = await prisma.rolePermission.findMany({
    where: { role: { users: { some: { userId } } } },
    select: { resource: true, action: true, fields: true, fieldsDeny: true, scope: true },
  });
  // Scopes may carry "$option:<fieldKey>:<value>" tokens; swap them for real
  // FieldOption ids here (one extra query, only when a token is present) so
  // scopeWhereFor and its callers stay synchronous. See Phase 3 below.
  return { userId, isAdmin, perms: await resolveNamingBrands(await resolveOptionTokens(perms), userId) };
}

// Synchronous check against an already-resolved context — use this when testing
// many resources at once (e.g. filtering the whole nav) to avoid N DB queries.
export function canWith(ctx: AclContext, resource: string, action: Action): boolean {
  if (ctx.isAdmin) return true;
  return ctx.perms.some((p) => p.resource === resource && (p.action === action || p.action === '*'));
}

// One-shot check (resolves context then tests) — convenient for a single route
// guard where only one resource/action is being checked.
export async function can(session: Session | null, resource: string, action: Action): Promise<boolean> {
  const ctx = await getAclContext(session);
  return canWith(ctx, resource, action);
}

// resource -> distinct actions the user has (expanding "*" to all four). Feeds
// the client so it can hide Edit/Delete/Add buttons the user can't use. Admin
// => {} (client keys off isAdmin to show everything).
export function actionMap(ctx: AclContext): Record<string, string[]> {
  if (ctx.isAdmin) return {};
  const out: Record<string, Set<string>> = {};
  for (const p of ctx.perms) {
    (out[p.resource] ??= new Set<string>());
    if (p.action === '*') for (const a of ACTIONS) out[p.resource].add(a);
    else out[p.resource].add(p.action);
  }
  return Object.fromEntries(Object.entries(out).map(([k, v]) => [k, [...v]]));
}

// Resource keys the user may VIEW (action "view" or "*"). Feeds nav visibility.
export function viewableKeys(ctx: AclContext): string[] {
  const set = new Set<string>();
  for (const p of ctx.perms) {
    if (p.action === 'view' || p.action === '*') set.add(p.resource);
  }
  return [...set];
}

// Route guard: returns a NextResponse to short-circuit (401/403), or null to
// let the handler proceed. Usage:
//   const denied = await requirePermission(session, 'launches', 'create');
//   if (denied) return denied;
export async function requirePermission(
  session: Session | null,
  resource: string,
  action: Action,
): Promise<NextResponse | null> {
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (await can(session, resource, action)) return null;
  return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
}

// --- Phase 2: field-level ---------------------------------------------------
// A RolePermission's `fields` column is an ALLOWLIST — the fields that action
// may touch. `null` = no restriction (all fields). Multiple roles union
// most-permissively: any unrestricted grant ("*" action, or a row with
// fields=null) means all fields are allowed. Phase 2 enforces this on WRITES
// (create/update); read/view field-hiding is done client-side (hide column) —
// server read-limit is a later hardening step.

// Fields the given action may touch for this user, or null = ALL fields. Only
// meaningful once the action is granted (see can/canWith).
export function allowedFieldsFor(ctx: AclContext, resource: string, action: Action): string[] | null {
  if (ctx.isAdmin) return null;
  const matching = ctx.perms.filter((p) => p.resource === resource && (p.action === action || p.action === '*'));
  if (!matching.length) return null;
  const union = new Set<string>();
  for (const p of matching) {
    if (p.action === '*' || p.fields == null || !Array.isArray(p.fields)) return null; // unrestricted wins
    for (const f of p.fields) if (typeof f === 'string') union.add(f);
  }
  return [...union];
}

// Keep only allowlisted keys of an object (null = passthrough). `id` is always
// kept. Strips disallowed fields from a write body.
export function pickAllowed(obj: Record<string, any>, allowed: string[] | null): Record<string, any> {
  if (allowed == null) return obj;
  const set = new Set(allowed);
  const out: Record<string, any> = {};
  for (const k of Object.keys(obj)) if (k === 'id' || set.has(k)) out[k] = obj[k];
  return out;
}

// Fields this role may NOT set (denylist), the permissive-union complement of
// allowedFieldsFor: a field is blocked only if EVERY granting role blocks it —
// if any role grants the action with no denylist (or "*"), nothing is blocked.
export function blockedFieldsFor(ctx: AclContext, resource: string, action: Action): string[] {
  if (ctx.isAdmin) return [];
  const matching = ctx.perms.filter((p) => p.resource === resource && (p.action === action || p.action === '*'));
  if (!matching.length) return [];
  let inter: Set<string> | null = null;
  for (const p of matching) {
    const deny: string[] = [];
    if (p.action !== '*' && Array.isArray(p.fieldsDeny)) {
      for (const f of p.fieldsDeny) if (typeof f === 'string') deny.push(f);
    }
    if (!deny.length) return []; // this role blocks nothing -> union allows all
    if (inter === null) {
      inter = new Set(deny);
    } else {
      const denySet = new Set(deny);
      const next = new Set<string>();
      inter.forEach((f) => { if (denySet.has(f)) next.add(f); });
      inter = next;
    }
  }
  return inter ? Array.from(inter) : [];
}

// Drop blocked keys from a write body (id always kept). Complements pickAllowed.
export function stripBlocked(obj: Record<string, any>, blocked: string[]): Record<string, any> {
  if (!blocked.length) return obj;
  const set = new Set(blocked);
  const out: Record<string, any> = {};
  for (const k of Object.keys(obj)) if (k === 'id' || !set.has(k)) out[k] = obj[k];
  return out;
}

// Full field sanitize for a write body given an already-resolved ctx: strip
// blocked fields, then keep only allowlisted ones. Use from authorize()-based
// routes (which already have ctx) — deny wins over allow.
export function sanitizeBody(ctx: AclContext, resource: string, action: Action, body: Record<string, any>): Record<string, any> {
  return pickAllowed(stripBlocked(body, blockedFieldsFor(ctx, resource, action)), allowedFieldsFor(ctx, resource, action));
}

// One-shot for a write route: resolve context, verify the action is granted,
// and return the body stripped to the fields this user may set. On failure
// returns { denied } (401/403) to short-circuit.
export async function enforceWrite(
  session: Session | null,
  resource: string,
  action: Extract<Action, 'create' | 'update'>,
  body: Record<string, any>,
): Promise<{ denied: NextResponse } | { body: Record<string, any> }> {
  if (!session) return { denied: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  const ctx = await getAclContext(session);
  if (!canWith(ctx, resource, action)) return { denied: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) };
  return { body: sanitizeBody(ctx, resource, action, body) };
}

// --- Phase 3: record-level scope --------------------------------------------
// A RolePermission's `scope` column is a filter object, e.g.
// { "ownerId": "$currentUser" } or { "brand": "Kano" }. It limits the
// action to rows matching that filter. Multiple conditions in one scope = AND;
// multiple roles that each scope the same (resource, action) = OR
// (most-permissive). Any unrestricted grant ("*" action or scope=null) means
// all rows. `null` from scopeWhereFor = no restriction.
//
// The scope may NEST, so a rule can reach across a relation — the /roles editor
// writes a dotted path like `brand.namingUserId` as { brand: { namingUserId } }.
// This matters because ownership often doesn't live on the row being guarded:
// "brand lead edits only their own products" is really Product -> Brand ->
// namingUserId (Product.naming_assignee_id was dropped 2026-08-16).
//
// Two tokens are substituted at request time, at ANY depth:
//   "$currentUser"                    -> the caller's user id
//   "$option:<fieldKey>:<value>"      -> the matching FieldOption's id
// The second exists because status-ish columns are FieldOption FKs, not strings
// ("pending" is namingStatusOptionId = some bigint). Storing the raw id in the
// role would hardcode a per-database number; the token keeps a role definition
// portable between sandbox and prod, and survives an option row being recreated.
// Tokens are resolved in getAclContext (which already hits the DB) so
// scopeWhereFor stays synchronous for its callers.

const OPTION_TOKEN = /^\$option:([^:]+):(.+)$/;

// Walk a scope object, applying `fn` to every leaf value. Returns a new object;
// arrays are mapped, plain objects recursed (this is what makes nesting work).
function mapScopeLeaves(value: any, fn: (v: any, key: string) => any, key = ''): any {
  if (Array.isArray(value)) return value.map((v) => mapScopeLeaves(v, fn, key));
  if (value && typeof value === 'object') {
    const out: Record<string, any> = {};
    for (const [k, v] of Object.entries(value)) out[k] = mapScopeLeaves(v, fn, k);
    return out;
  }
  return fn(value, key);
}

// Every "$option:key:value" token in a set of permissions, deduped.
function collectOptionTokens(perms: PermRow[]): { fieldKey: string; value: string }[] {
  const seen = new Map<string, { fieldKey: string; value: string }>();
  for (const p of perms) {
    if (!p.scope || typeof p.scope !== 'object') continue;
    mapScopeLeaves(p.scope, (v) => {
      if (typeof v === 'string') {
        const m = OPTION_TOKEN.exec(v);
        if (m) seen.set(v, { fieldKey: m[1], value: m[2] });
      }
      return v;
    });
  }
  return [...seen.values()];
}

// Replace "$option:..." tokens with real FieldOption ids, in ONE query for all
// roles/resources. A token with no matching option resolves to null — which as a
// Prisma filter matches only rows whose column is NULL, i.e. it fails closed
// rather than silently widening the scope to every row.
async function resolveOptionTokens(perms: PermRow[]): Promise<PermRow[]> {
  const tokens = collectOptionTokens(perms);
  if (!tokens.length) return perms;

  const rows = await prisma.fieldOption.findMany({
    where: { OR: tokens.map(({ fieldKey, value }) => ({ fieldKey, value })) },
    select: { id: true, fieldKey: true, value: true },
  });
  // Row shape is spelled out because the Prisma client is injected (see runtime.ts)
  // and therefore structurally typed — findMany() returns `any`. The annotation is
  // also the contract: an app using ACL option-scopes needs a FieldOption table.
  type OptionRow = { id: unknown; fieldKey: string; value: string };
  const byToken = new Map<string, unknown>(
    (rows as OptionRow[]).map((r) => [`$option:${r.fieldKey}:${r.value}`, r.id]),
  );

  return perms.map((p) =>
    p.scope && typeof p.scope === 'object'
      ? { ...p, scope: mapScopeLeaves(p.scope, (v) => (typeof v === 'string' && OPTION_TOKEN.test(v) ? byToken.get(v) ?? null : v)) }
      : p,
  );
}

// "$myNamingBrands" -> the ids of the brands this user names, from the per-brand
// lists in app settings (lib/product-naming.ts). Resolved here for the same
// reason the option tokens are: it needs the database, and scopeWhereFor must
// stay synchronous.
//
// It exists because naming stopped being "one user on the brand row" and became
// a list, which `{ brand: { namingUserId: "$currentUser" } }` cannot express.
// The `naming_task` role's scope now reads
// `{ brandId: { in: "$myNamingBrands" }, ... }`.
const NAMING_BRANDS_TOKEN = '$myNamingBrands';

// Walks for the token rather than JSON.stringify-ing the scope: by this point
// resolveOptionTokens has already swapped $option:… for real FieldOption ids,
// which are BigInt, and JSON.stringify throws on those ("Do not know how to
// serialize a BigInt"). That 500'd /api/me/permissions for exactly the users
// this token exists to serve.
function containsToken(value: unknown, token: string): boolean {
  if (value === token) return true;
  if (Array.isArray(value)) return value.some((v) => containsToken(v, token));
  if (value && typeof value === 'object') return Object.values(value).some((v) => containsToken(v, token));
  return false;
}

async function resolveNamingBrands(perms: PermRow[], userId: bigint | null): Promise<PermRow[]> {
  const uses = perms.some((p) => containsToken(p.scope, NAMING_BRANDS_TOKEN));
  if (!uses || !userId) return perms;
  const brandIds = await namingBrandIdsForUsers([userId]);
  return perms.map((p) =>
    p.scope && typeof p.scope === 'object'
      ? { ...p, scope: mapScopeLeaves(p.scope, (v) => (v === NAMING_BRANDS_TOKEN ? brandIds : v)) }
      : p,
  );
}

// Substitute $currentUser and coerce id-shaped values. The /roles editor stores
// every typed value as a string, but FK columns are BigInt — passing "10" to
// Prisma for a BigInt column throws — so a numeric string under a *Id key is
// widened to BigInt. Anything else is left exactly as typed.
function resolveScope(scope: Record<string, any>, userId: bigint | null): Record<string, any> {
  return mapScopeLeaves(scope, (v, key) => {
    if (v === '$currentUser') return userId;
    if (typeof v === 'string' && /Id$/.test(key) && /^\d+$/.test(v)) return BigInt(v);
    return v;
  });
}

// A Prisma `where` fragment limiting rows for this user+action, or null = no
// restriction. AND it into a list `where`, or into a findFirst/updateMany when
// gating a single row. Only meaningful once the action is granted.
export function scopeWhereFor(ctx: AclContext, resource: string, action: Action): Record<string, any> | null {
  if (ctx.isAdmin) return null;
  const matching = ctx.perms.filter((p) => p.resource === resource && (p.action === action || p.action === '*'));
  if (!matching.length) return null;
  const scopes: Record<string, any>[] = [];
  for (const p of matching) {
    if (p.action === '*' || p.scope == null) return null; // an unrestricted grant wins
    if (typeof p.scope !== 'object' || Array.isArray(p.scope)) return null;
    scopes.push(resolveScope(p.scope as Record<string, any>, ctx.userId));
  }
  return scopes.length === 1 ? scopes[0] : { OR: scopes };
}

// Combined authorize for a route: 401 if not signed in, 403 if the action isn't
// granted, else returns the resolved context + the record-scope where fragment
// (null = unrestricted). Callers AND `scope` into their queries and, for a
// single-row write, verify the target row is in scope before mutating.
export async function authorize(
  session: Session | null,
  resource: string,
  action: Action,
): Promise<{ denied: NextResponse } | { ctx: AclContext; scope: Record<string, any> | null }> {
  if (!session) return { denied: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  const ctx = await getAclContext(session);
  if (!canWith(ctx, resource, action)) return { denied: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) };
  return { ctx, scope: scopeWhereFor(ctx, resource, action) };
}

// What this role may READ of a row, applied to a RESPONSE rather than a write
// body: deny wins, then an allowlist narrows. `id` always survives, or the
// client can't key the row it just received.
//
// Field limits were write-only everywhere until 2026-08-28 — a field could be
// made uneditable but never unreadable, so "employee sees Product but not its
// Material" had no expression. Hiding it on the client alone would be theatre:
// the value still ships in the JSON and shows up in the network tab.
export function readableFieldsFor(ctx: AclContext, resource: string): { deny: Set<string>; allow: Set<string> | null } | null {
  if (ctx.isAdmin) return null;
  const deny = new Set(blockedFieldsFor(ctx, resource, 'view'));
  const allowList = allowedFieldsFor(ctx, resource, 'view');
  const allow = allowList ? new Set(allowList) : null;
  if (!deny.size && !allow) return null;
  return { deny, allow };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function stripBlockedRead<T extends Record<string, any>>(row: T, limits: { deny: Set<string>; allow: Set<string> | null } | null): T {
  if (!limits) return row;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const out: Record<string, any> = {};
  for (const k of Object.keys(row)) {
    if (k === 'id') { out[k] = row[k]; continue; }
    if (limits.deny.has(k)) continue;
    if (limits.allow && !limits.allow.has(k)) continue;
    out[k] = row[k];
  }
  return out as T;
}

// Authorize against SEVERAL keys, granting if ANY of them is held — for a route
// whose data is legitimately reachable from more than one page.
//
// Launch is the case that forced it (Andre, 2026-08-28: "i want marketing_team
// to access launch report but not launch"). `launches` is BOTH a page key and
// an object key, and the sidebar shows any key the role can view — so granting
// `launches:view` to let the Launch REPORT read its data would also put the
// operational Launch page in that role's sidebar. There is no way to separate
// "may read launch rows" from "may open the Launch page" while they share one
// key, so the report brings its own: a role with `launch-report:view` can GET
// launches without ever holding `launches`.
//
// Writes are deliberately NOT routed through this — they stay on the single
// owning key, so a read-only page can never become a write path.
export async function authorizeAny(
  session: Session | null,
  resources: string[],
  action: Action,
): Promise<{ denied: NextResponse } | { ctx: AclContext; scope: Record<string, any> | null }> {
  if (!session) return { denied: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  const ctx = await getAclContext(session);
  // First match wins, so list the owning resource first: its row scope is the
  // one that should apply when a user holds both.
  for (const r of resources) {
    if (canWith(ctx, r, action)) return { ctx, scope: scopeWhereFor(ctx, r, action) };
  }
  return { denied: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) };
}

// Per-resource field restrictions for the CLIENT (hide form fields / columns).
// Only includes (resource, action) pairs the user HAS and that are RESTRICTED
// (non-null allowlist). Admin => {} (nothing hidden).
export function fieldRestrictionMap(ctx: AclContext): Record<string, Partial<Record<Action, string[]>>> {
  if (ctx.isAdmin) return {};
  const out: Record<string, Partial<Record<Action, string[]>>> = {};
  for (const resource of new Set(ctx.perms.map((p) => p.resource))) {
    for (const action of ACTIONS) {
      const hasAction = ctx.perms.some((r) => r.resource === resource && (r.action === action || r.action === '*'));
      if (!hasAction) continue;
      const allowed = allowedFieldsFor(ctx, resource, action);
      if (allowed !== null) (out[resource] ??= {})[action] = allowed;
    }
  }
  return out;
}

// Per-resource, per-action DENYLISTS for the CLIENT (hide/disable blocked form
// fields). Only includes pairs the user HAS and that block ≥1 field. Admin => {}.
export function fieldDenyMap(ctx: AclContext): Record<string, Partial<Record<Action, string[]>>> {
  if (ctx.isAdmin) return {};
  const out: Record<string, Partial<Record<Action, string[]>>> = {};
  for (const resource of new Set(ctx.perms.map((p) => p.resource))) {
    for (const action of ACTIONS) {
      const hasAction = ctx.perms.some((r) => r.resource === resource && (r.action === action || r.action === '*'));
      if (!hasAction) continue;
      const blocked = blockedFieldsFor(ctx, resource, action);
      if (blocked.length) (out[resource] ??= {})[action] = blocked;
    }
  }
  return out;
}
