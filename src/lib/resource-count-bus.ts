// Generic "a sidebar count badge is now out of date" signal.
//
// AppSider's count badges fetch once on mount, so any action that changes the
// number they show has to say so or the badge sits stale until the next full
// navigation. Deliberately generic (not notification-specific): every live
// badge refetches on this event, so the next resource that grows one needs no
// further wiring.
export const RESOURCE_COUNT_CHANGED = 'resource-count-changed';

export function emitResourceCountChanged(): void {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(RESOURCE_COUNT_CHANGED));
}
