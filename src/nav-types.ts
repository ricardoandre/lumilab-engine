/**
 * Navigation shapes. These are structural — the engine renders whatever the app
 * hands it — so they live here rather than in any one app's nav file.
 *
 * An app defines its own NAV_GROUPS using these types and passes them to
 * configureEngine(). AppSider renders them; nothing in the engine knows what a
 * "Production" or a "Portfolio" is.
 */

export interface NavItem {
  label: string;
  href?: string;
  badge?: 'soon' | 'next' | 'count';
  countResource?: string;
  /**
   * Other real routes this entry should ALSO count as active for — sibling
   * routes reached from a page's own inner tab bar, which plain prefix matching
   * misses because they are not nested under `href`. Without this the sidebar
   * loses its highlight when moving between a group's tabs.
   */
  matchHrefs?: string[];
  /**
   * Permission key this entry is gated by, when the route is a filtered VIEW of
   * another page rather than a resource of its own. Entries carrying an aclKey
   * are left OUT of flattenNavResources: they ride on the underlying resource's
   * grant, so there is nothing separate to give a role.
   */
  aclKey?: string;
}

export interface NavSubGroup {
  label: string;
  items?: NavItem[];
  badge?: 'soon' | 'next';
}

export type NavEntry = NavItem | NavSubGroup;

export interface NavGroup {
  label: string;
  entries: NavEntry[];
}

export function isNavSubGroup(entry: NavEntry): entry is NavSubGroup {
  return Array.isArray((entry as NavSubGroup).items);
}

/** Every grantable resource in the nav — what the Roles grid lists. */
export function flattenNavResources(groups: NavGroup[]): { label: string; href: string }[] {
  const out: { label: string; href: string }[] = [];
  for (const group of groups) {
    for (const entry of group.entries) {
      const items = isNavSubGroup(entry) ? (entry.items ?? []) : [entry];
      for (const item of items) {
        if (item.href && !item.aclKey) out.push({ label: item.label, href: item.href });
      }
    }
  }
  return out;
}
