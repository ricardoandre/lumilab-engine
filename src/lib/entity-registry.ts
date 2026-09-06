// Lazy registry mapping a resource NAME to its ResourceConfig, resolved via
// DYNAMIC import. Entity links (see entity-drawer-bus) carry only the target
// resource name; the ListEngine host resolves the config here to open a generic
// EntityDrawer. Dynamic imports keep this a leaf module with no static config
// imports — so bidirectional links (Sample <-> Sample Variant, whose configs
// reference each other's components) cannot form an import cycle.
//
// ENGINE VERSION: the mechanism is generic, the contents are not. Each app
// registers its own entities at startup instead of this file naming them:
//
//   registerEntities({
//     accounts: () => import('@/lib/resources/account').then((m) => m.accountResource),
//   })
//
// An unregistered name resolves to undefined, which is exactly what a click on a
// link to a resource the app does not have should do — nothing, silently. That
// was already the behaviour for a missing entry, so it is not a new failure mode.
import type { ResourceConfig } from './resource-config';

export type EntityLoader = () => Promise<ResourceConfig | undefined>;

const loaders: Record<string, EntityLoader> = {};

/** Merges into the registry; safe to call more than once (later wins). */
export function registerEntities(entries: Record<string, EntityLoader>): void {
  Object.assign(loaders, entries);
}

// Every registered resource, for callers that want to work across all of them
// (Smart Search) rather than resolve one by name.
export function linkableResourceNames(): string[] {
  return Object.keys(loaders);
}

export function resolveEntityConfig(name: string): Promise<ResourceConfig | undefined> {
  return loaders[name]?.() ?? Promise.resolve(undefined);
}

export function isLinkableResource(name: string | undefined): boolean {
  return !!name && name in loaders;
}
