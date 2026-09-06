'use client';

import { useEffect, useState } from 'react';

// Client-side view of the current user's effective permissions (from
// GET /api/me/permissions). Module-level cache + in-flight dedupe so many
// components (every open form drawer) share ONE network request per page load.

export interface PermPayload {
  isAdmin: boolean;
  view: string[];
  // resource -> action -> allowlist of field names (only present when restricted)
  fields: Record<string, Partial<Record<'view' | 'create' | 'update' | 'delete', string[]>>>;
  // resource -> action -> denylist of field names this role can't set (blocked)
  fieldsDeny: Record<string, Partial<Record<'view' | 'create' | 'update' | 'delete', string[]>>>;
  // resource -> actions the user has (create/update/delete/view). Hides buttons.
  actions: Record<string, string[]>;
  /** Brand ids this person may NAME products for — see lib/product-naming.ts.
   *  Lets a screen decide per RECORD whether to offer an edit. */
  namingBrandIds: string[];
}

let cached: PermPayload | null = null;
let inflight: Promise<PermPayload> | null = null;

function load(): Promise<PermPayload> {
  if (cached) return Promise.resolve(cached);
  if (!inflight) {
    inflight = fetch('/api/me/permissions')
      .then((r) => r.json())
      .then((j) => {
        cached = { isAdmin: !!j.isAdmin, view: j.view ?? [], fields: j.fields ?? {}, fieldsDeny: j.fieldsDeny ?? {}, actions: j.actions ?? {}, namingBrandIds: j.namingBrandIds ?? [] };
        return cached;
      })
      .catch(() => {
        cached = { isAdmin: false, view: [], fields: {}, fieldsDeny: {}, actions: {}, namingBrandIds: [] };
        return cached;
      });
  }
  return inflight;
}

// Reset the module cache so the next load() refetches. MUST be called on every
// auth transition (login AND logout) — otherwise the previous user's cached
// permissions leak into the next user's session, because logout/login are
// client-side navigations that never reload this module. See authProvider.
export function clearPermissionsCache(): void {
  cached = null;
  inflight = null;
}

export function usePermissions(): { loaded: boolean; perm: PermPayload | null } {
  const [perm, setPerm] = useState<PermPayload | null>(cached);
  useEffect(() => {
    let cancelled = false;
    load().then((p) => {
      if (!cancelled) setPerm(p);
    });
    return () => {
      cancelled = true;
    };
  }, []);
  return { loaded: perm !== null, perm };
}

// Synchronous check against the module cache — for gating a click handler in a
// static resource-config action (which can't use the usePermissions hook). If
// perms aren't loaded yet, returns true and lets the server (403) be the
// backstop, so an authorized user is never wrongly blocked on a cold cache.
//
// NO isAdmin bypass, unlike the resource checks below. A capability is a named
// LIST of people (lib/capabilities.ts) and the server already applied the
// "empty list falls back to admins" rule when it built `view` — so an admin who
// is not on a named list genuinely does not have it, and short-circuiting here
// would put back the button-that-does-nothing this change exists to remove.
export function hasFeatureCached(key: string): boolean {
  if (!cached) return true;
  return cached.view.includes(key);
}

// Reactive feature check for a component (re-renders once perms arrive).
// Unlike hasFeatureCached it returns FALSE until loaded — use it where the
// gated thing is rendered content (e.g. a Price row), so a user without the
// feature never sees it flash in. Cold-cache-allow would be wrong there.
export function useFeature(key: string): boolean {
  const { perm } = usePermissions();
  // See hasFeatureCached: capabilities carry no isAdmin bypass.
  return !!perm && perm.view.includes(key);
}

// Like hasFeatureCached but for a resource+action (create/update/delete/view) —
// for gating a static config action (e.g. Sample's "Add Variant" by
// sample-variants create). Cold cache -> allow, server is the backstop.
export function hasActionCached(resource: string, action: string): boolean {
  if (!cached) return true;
  return cached.isAdmin || (cached.actions[resource] ?? []).includes(action);
}

// Fields the user may write for resource+action, or null = ALL (admin, perms
// not loaded yet, or no field restriction on this resource/action).
export function writableFieldSet(
  perm: PermPayload | null,
  resource: string,
  action: 'create' | 'update',
): Set<string> | null {
  if (!perm || perm.isAdmin) return null;
  const list = perm.fields[resource]?.[action];
  return list ? new Set(list) : null;
}

// Fields the user may NOT touch for resource+action (denylist). Empty set =
// nothing blocked (admin, perms not loaded, or no denylist here).
//
// `view` was added 2026-08-28 (Andre: the employee role should see Product but
// not its Material or Setting). Until then field limits were WRITE-only in
// every layer — the roles UI said as much — so a field could be made
// uneditable but never unreadable. The server strips the same fields from the
// response (see stripBlockedRead); this only decides what the screen draws.
export function blockedFieldSet(
  perm: PermPayload | null,
  resource: string,
  action: 'view' | 'create' | 'update',
): Set<string> {
  if (!perm || perm.isAdmin) return new Set();
  return new Set(perm.fieldsDeny[resource]?.[action] ?? []);
}

// Fields this role may READ, as a filter. `null` = no restriction.
// Mirrors the server's allow/deny pair: deny wins, then an allowlist narrows.
export function viewableFieldFilter(
  perm: PermPayload | null,
  resource: string,
): ((name: string) => boolean) | null {
  if (!perm || perm.isAdmin) return null;
  const denied = new Set(perm.fieldsDeny[resource]?.view ?? []);
  const allowList = perm.fields[resource]?.view;
  const allowed = allowList ? new Set(allowList) : null;
  if (!denied.size && !allowed) return null;
  return (name: string) => !denied.has(name) && (!allowed || allowed.has(name));
}

// Whether the user may perform an action on a resource. Admin => always true.
// Used to hide Edit/Delete/Add buttons in the ListEngine.
export function canAction(perm: PermPayload | null, resource: string, action: 'view' | 'create' | 'update' | 'delete'): boolean {
  if (!perm) return false;
  if (perm.isAdmin) return true;
  return (perm.actions[resource] ?? []).includes(action);
}

// Whether a RowAction's `requires` is satisfied. ONE reading of the mini-syntax,
// used by both surfaces that draw actions (the list's quick actions and the
// detail drawer's "⋯"), so the two can never disagree about who sees what.
//
//   undefined         -> always allowed
//   'update'          -> that action on `resource`
//   'samples:update'  -> that action on another resource
//   'product.approval'-> a capability key (a dot is what marks it)
//
// `perm === null` means permissions have not loaded. Callers gate on `loaded`
// before drawing anything, so this returns false rather than flashing an action
// the user may not have.
export function actionAllowed(perm: PermPayload | null, resource: string, requires?: string): boolean {
  if (!requires) return true;
  if (!perm) return false;
  // Capability first, and WITHOUT the isAdmin bypass below — see hasFeatureCached.
  if (requires.includes('.')) return perm.view.includes(requires);
  if (perm.isAdmin) return true;
  const [a, b] = requires.includes(':') ? requires.split(':').reverse() : [requires, resource];
  return (perm.actions[b] ?? []).includes(a);
}
