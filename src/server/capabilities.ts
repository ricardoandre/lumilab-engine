import { prisma } from '../runtime';
import { namesAnyBrand } from '../runtime';

// CAPABILITIES — the permissions that are not "may you edit this table".
//
// Approving a pattern, approving a product, seeing cost and margin, editing a
// product's naming: none of these are CRUD on a resource, and modelling them as
// CRUD is what went wrong. A role that exists so someone can NAME a product had
// to be given `products: update`, which is the same grant that lets them change
// anything else about it.
//
// Andre, 2026-08-29: "move the acl into the settings and solve it separately so
// it doesnt disrupt general acl logic... use the same setting like pattern
// approval. I can add who can access the functionality there."
//
// So a capability is a NAMED LIST OF PEOPLE in app settings — the shape pattern
// approval already used and that Andre already edits — and the general ACL goes
// back to being only about resources and actions.
//
// Each capability keeps the key string it already had (`sample.pricing_simulation`,
// `material.pricing`), so every existing call site — useFeature, featureKey on a
// field, the server's `can()` — keeps working untouched. Only where the answer
// comes FROM has changed: a list you edit, not a role you maintain.

export interface Capability {
  /** The key checked everywhere in the app. Never rename one: role rows, field
   *  configs and saved grants all reference it by string. */
  key: string;
  label: string;
  /** The AppSetting holding the user-id list. */
  setting: string;
}

export const CAPABILITIES: Capability[] = [
  // The two that were already lists. Unchanged settings, now also readable as
  // capabilities so the UI can hide what the server would refuse.
  { key: 'pattern.approval', label: 'Approve a pattern', setting: 'approval.pattern.approvers' },
  { key: 'product.approval', label: 'Approve a product', setting: 'approval.product.approvers' },
  // Moved off roles (2026-08-29). `sample.pricing_simulation` was granted via
  // the `sample_pricing` role; the list is seeded with the people who held it,
  // so nobody gains or loses access in the move.
  { key: 'sample.pricing_simulation', label: 'See sample pricing', setting: 'access.sample.pricing' },
  { key: 'material.pricing', label: 'See material prices', setting: 'access.material.pricing' },
  // Suppliers, 2026-09-02 (Andre: "everyone access to material should not have
  // access to supplier and price... except the super admin"). Same shape as the
  // prices gate right above it: with the list unset it falls back to admins, so
  // WHO WE BUY FROM is admin-only until someone is named — no role edit needed.
  { key: 'material.suppliers', label: 'See material suppliers', setting: 'access.material.suppliers' },
];

// Naming is the one capability whose lists are PER BRAND (one setting each —
// see lib/product-naming.ts), so it cannot be a single `setting` above. Holding
// it means "you name at least one brand".
export const NAMING_CAPABILITY = 'product.naming';

export const CAPABILITY_KEYS = CAPABILITIES.map((c) => c.key);

function parseIds(value: string | null | undefined): string[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.map((v) => String(v)) : [];
  } catch {
    return [];
  }
}

/**
 * Every capability this user has, in ONE query rather than one per capability.
 *
 * An EMPTY list falls back to admins, so a capability can never reach a state
 * where nobody in the app can use it — an unset setting means "not configured
 * yet", not "permanently stuck". Once the list is named, the list is the list
 * and being an admin grants nothing extra. That rule came from
 * pattern-approval.ts and now holds for all of them.
 */
export async function capabilitiesFor(userId: bigint | string | null, isAdmin: boolean): Promise<string[]> {
  if (!userId) return [];
  const me = String(userId);
  const rows = await prisma.appSetting.findMany({
    where: { key: { in: CAPABILITIES.map((c) => c.setting) } },
    select: { key: true, value: true },
  });
  const byKey = new Map((rows as { key: string; value: string }[]).map((r) => [r.key, r.value]));
  const keys = CAPABILITIES.filter((c) => {
    const ids = parseIds(byKey.get(c.setting));
    return ids.length ? ids.includes(me) : isAdmin;
  }).map((c) => c.key);
  if (await namesAnyBrand(userId)) keys.push(NAMING_CAPABILITY);
  return keys;
}

/** One capability, for a route that only needs to ask about itself. */
export async function hasCapability(
  userId: bigint | string | null,
  isAdmin: boolean,
  key: string,
): Promise<boolean> {
  return (await capabilitiesFor(userId, isAdmin)).includes(key);
}
