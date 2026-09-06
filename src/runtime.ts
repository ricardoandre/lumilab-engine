/**
 * THE SEAM.
 *
 * The engine must never import an app's Prisma client, its auth, or its nav —
 * those are the four things that differ between apps. Instead every app calls
 * configureEngine() once at startup and the engine reads them back through here.
 *
 * Why it matters, concretely: Prisma never writes `SELECT *`. A generated client
 * names every column of the schema it was built from. An engine that imported one
 * app's client would drag that app's entire schema into the other app, and the
 * second app's database would be missing every one of those columns. This
 * indirection is what keeps two apps on two databases genuinely independent.
 */

import type { Session } from 'next-auth';
import type { NavGroup } from './nav-types';

export type { NavItem, NavSubGroup, NavEntry, NavGroup } from './nav-types';
export { isNavSubGroup, flattenNavResources } from './nav-types';

/**
 * Structurally typed on purpose. Each app passes its OWN generated PrismaClient,
 * which is a different type in each app. The engine only ever does
 * `db()[model].findMany(...)`, so it needs the shape, not the identity.
 */
export type EngineDb = Record<string, any>;

/**
 * next-auth's own Session, augmented in src/types/next-auth.d.ts with the three
 * fields the engine's ACL and impersonation actually read (id, isAdmin,
 * impersonatedBy). Aliased rather than redefined: crud-api passes this straight
 * into next-auth APIs, and a structurally-similar-but-separate type failed there
 * on the missing `expires`.
 */
export type EngineSession = Session;

export interface EngineConfig {
  /** The app's own generated Prisma client. SERVER ONLY. */
  db: EngineDb;
  /** The app's Auth.js `auth()` — returns the current session, or null. SERVER ONLY. */
  auth: () => Promise<EngineSession | null>;
  /** The app's sidebar definition. Needed on the client too — AppSider renders it. */
  navGroups: NavGroup[];
  /**
   * Optional per-app capability hooks. kanoapp uses these for its product-naming
   * permission; a new app that has no such concept simply omits them and the
   * defaults below deny cleanly rather than throwing.
   */
  naming?: {
    namesAnyBrand?: (userId: bigint | string | null) => Promise<boolean>;
    namingBrandIdsForUsers?: (userIds: (string | number | bigint)[]) => Promise<bigint[]>;
  };
}

let config: Partial<EngineConfig> = {};

/**
 * MERGES rather than replaces, and every field is optional, because the config
 * necessarily arrives in two halves. `db` and `auth` are server-only — bundling
 * a Prisma client into the browser is both broken and a data leak — while
 * `navGroups` is needed on the CLIENT, since AppSider renders the sidebar. So an
 * app calls this twice: once from a server entry with db + auth, once from a
 * client entry with navGroups. Requiring all three at once would force one of
 * those two calls to lie.
 *
 * Each accessor below fails on its own if its piece is missing, so a client
 * component reading NAV_GROUPS never trips over an absent database.
 */
export function configureEngine(next: Partial<EngineConfig>): void {
  config = { ...config, ...next };
}

function need<K extends keyof EngineConfig>(key: K): NonNullable<EngineConfig[K]> {
  const v = config[key];
  if (v === undefined) {
    throw new Error(
      `lumilab-engine: configureEngine({ ${key} }) was never called on this side of the ` +
        `server/client boundary. Server code needs db + auth; client code needs navGroups.`,
    );
  }
  return v as NonNullable<EngineConfig[K]>;
}

/**
 * The database. Named `db()` rather than exported as `prisma` so that a missing
 * configureEngine() fails with the message above, at the call, instead of as
 * "cannot read property findMany of undefined" somewhere unrelated.
 */
export function db(): EngineDb {
  return need('db');
}

/** Proxy so extracted code can keep saying `prisma.user.findMany(...)` unchanged. */
export const prisma: EngineDb = new Proxy({} as EngineDb, {
  get(_t, model: string) {
    return (db() as any)[model];
  },
});

export function auth(): Promise<EngineSession | null> {
  return need('auth')();
}

export const NAV_GROUPS: NavGroup[] = new Proxy([] as NavGroup[], {
  get(_t, prop) {
    const groups = need('navGroups');
    const value = (groups as any)[prop];
    return typeof value === 'function' ? value.bind(groups) : value;
  },
});

/** Defaults deny: an app without a naming concept grants the capability to nobody. */
export async function namesAnyBrand(userId: bigint | string | null): Promise<boolean> {
  const hook = config?.naming?.namesAnyBrand;
  return hook ? hook(userId) : false;
}

export async function namingBrandIdsForUsers(
  userIds: (string | number | bigint)[],
): Promise<bigint[]> {
  const hook = config?.naming?.namingBrandIdsForUsers;
  return hook ? hook(userIds) : [];
}
