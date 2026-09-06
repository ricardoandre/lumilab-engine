// App-wide "open this entity's detail in a drawer" bus. Any detail (a
// ResourceDetailBody relation field with `linkable`, or a custom body) emits
// the target resource NAME + id; the global EntityDrawerHost resolves the
// config (entity-registry, dynamic import) and opens a generic EntityDrawer —
// so a link to a Sample / Product / Sample Variant opens that object's OWN
// detail (same renderer as its page), no per-object rebuild and no import
// cycle (only names travel on the event).
//
// "Close current, open new": every detail-drawer HOST (ListEngine's detail
// drawer, the Sample Dashboard/Workload drawers, ...) registers a close
// callback via onCloseOpenDetails. emitOpenEntity fires those FIRST, so the
// drawer you're jumping FROM closes before the linked one opens — no stacking,
// no unlimited drawers. The global EntityDrawerHost does NOT register a closer:
// it swaps its single drawer in place, so entity->entity jumps replace cleanly.
export interface EntityTarget {
  resource: string;
  id: string;
}

let openListeners: ((t: EntityTarget) => void)[] = [];
let closeListeners: (() => void)[] = [];

export function onOpenEntity(cb: (t: EntityTarget) => void): () => void {
  openListeners.push(cb);
  return () => { openListeners = openListeners.filter((l) => l !== cb); };
}

// A detail-drawer host registers here so it closes when the user jumps to
// another entity's drawer.
export function onCloseOpenDetails(cb: () => void): () => void {
  closeListeners.push(cb);
  return () => { closeListeners = closeListeners.filter((l) => l !== cb); };
}

export function emitOpenEntity(resource: string, id: string | number): void {
  closeListeners.forEach((c) => c()); // close whatever detail drawer is open first
  const t = { resource, id: String(id) };
  openListeners.forEach((l) => l(t)); // then open the linked one
}
