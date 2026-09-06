'use client';

import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { usePathname } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { usePermissions } from '../lib/use-permissions';
import Link from 'next/link';
import { Layout, Grid, Drawer } from 'antd';
import { useThemedLayoutContext } from '@refinedev/antd';
import { RightOutlined } from '@ant-design/icons';
import { NAV_GROUPS, adminNavGroup, subscribeEngine, engineVersion, isNavSubGroup, type NavItem, type NavGroup, type NavEntry } from '../runtime';
import { AppTitle } from './AppTitle';
import { useIsSandbox, SANDBOX_SIDER_BG } from '../lib/sandbox-env';
import { RESOURCE_COUNT_CHANGED } from '../lib/resource-count-bus';

const DEFAULT_SIDER_BG = '#faf9f6';

const SIDER_WIDTH = 240;

// Path-segment-aware active match: exact, or a real nested route (`/canvas`
// matches `/canvas/edit/1` but NOT the sibling `/canvas-mix`). A plain
// startsWith() lit up every item whose href is a prefix of another's.
function isActiveHref(pathname: string | null | undefined, href: string | undefined): boolean {
  if (!pathname || !href) return false;
  return pathname === href || pathname.startsWith(href + '/');
}

// Same match, plus any of the item's own matchHrefs — sibling routes an
// inner-header-menu tab bar covers (e.g. Production's own /production-
// materials, /production-samples) that plain prefix matching can't catch
// since they aren't nested under `href`.
function isActiveNavItem(pathname: string | null | undefined, item: NavItem): boolean {
  return isActiveHref(pathname, item.href) || (item.matchHrefs ?? []).some((h) => isActiveHref(pathname, h));
}

// Fully custom Sider (passed to <ThemedLayout Sider={AppSider}>) — replaces
// Refine's auto-generated resource-tree menu, which can only show routes
// that actually exist. This one is a static roadmap: groups (and, for Ads,
// one level of subgroups) with SOON/NEXT/live-count badges on resources
// that aren't built yet, matching Andre's approved structure.
//
// Groups/subgroups are collapsible accordions, collapsed by default (so the
// default view is just the top-level group names — Operations, Ads,
// Catalog, ...) — whichever group/subgroup contains the current route
// auto-expands on load/navigation so you're never looking at a collapsed
// tree hiding the page you're on.
export function AppSider() {
  const pathname = usePathname();
  const { data: session } = useSession();
  const screens = Grid.useBreakpoint();
  const isMobile = !screens.lg;
  const siderBg = useIsSandbox() ? SANDBOX_SIDER_BG : DEFAULT_SIDER_BG;
  // Shared with AppHeader's own mobile trigger (rendered inline in the
  // header, next to the account avatar) so both sit in the same flex row
  // instead of one being an independently-positioned floating button that
  // can never guarantee pixel alignment with the other.
  const { mobileSiderOpen: mobileOpen, setMobileSiderOpen: setMobileOpen } = useThemedLayoutContext();

  // Effective permissions for nav visibility (deny-by-default; see lib/acl.ts).
  // Single source of truth is the API — it also reports isAdmin, so we don't
  // depend on the client session having resolved yet. `null` = not loaded.
  // Reads through the shared usePermissions cache so the sider shares the ONE
  // /api/me/permissions request every other component already makes, instead of
  // firing its own duplicate on each mount.
  const { perm: permPayload } = usePermissions();
  const perm = useMemo(
    () => (permPayload ? { admin: permPayload.isAdmin, view: new Set<string>(permPayload.view) } : null),
    [permPayload],
  );

  const isAdmin = !!session?.user?.isAdmin || !!perm?.admin;
  const ready = perm !== null;
  const canViewKey = (key: string) => isAdmin || (perm?.view.has(key) ?? false);

  // Re-read the nav when configureEngine() runs again — see subscribeEngine.
  const configVersion = useSyncExternalStore(subscribeEngine, engineVersion, engineVersion);

  const groups = useMemo(() => {
    const g = [...NAV_GROUPS];
    // App-supplied, never hardcoded here. The engine used to append kanoapp's
    // own ADMIN group (Smart Search, System Health, Integrations, Database...),
    // so a second app got a menu of routes it does not have, sitting next to its
    // own admin group — two entries both reading "Admin".
    const extra = isAdmin ? adminNavGroup() : null;
    if (extra) g.push(extra);
    return g;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdmin, configVersion]);

  // Deny-by-default filter: an item shows only if the user can view its key
  // (href without the leading slash). Roadmap placeholders (no href) and
  // empty-subgroup rows are admin-only. Groups/subgroups with nothing visible
  // are dropped. Until permissions load (`ready`), render nothing rather than
  // flashing the full menu.
  const visibleGroups = useMemo(() => {
    if (!ready) return [] as NavGroup[];
    const hrefKey = (href: string) => href.replace(/^\//, '');
    // An item is visible if the user can view its own route OR any sibling tab
    // it covers (matchHrefs — the inner-header tabs folded under it), and it
    // links to the FIRST route they can actually reach. So e.g. "Tools" still
    // shows for a role granted Canvas Mix but not the primary tab (Photoshoot),
    // and clicking it lands on a tab they can access.
    // An item that is a filtered VIEW of another page carries the key it rides
    // on (NavItem.aclKey) — Material › Fabric's screens are gated by the
    // Material grants, not by three keys of their own.
    const firstViewableHref = (item: NavItem): string | undefined => {
      if (item.aclKey) return item.href && canViewKey(item.aclKey) ? item.href : undefined;
      for (const h of [item.href, ...(item.matchHrefs ?? [])]) if (h && canViewKey(hrefKey(h))) return h;
      return undefined;
    };
    const filterEntry = (entry: NavEntry): NavEntry | null => {
      if (isNavSubGroup(entry)) {
        if (!entry.items?.length) return isAdmin ? entry : null;
        const items = entry.items
          .map((it): NavItem | null => {
            if (!it.href) return isAdmin ? it : null;
            const vh = firstViewableHref(it);
            return vh ? { ...it, href: vh } : null;
          })
          .filter((it): it is NavItem => it !== null);
        return items.length ? { ...entry, items } : null;
      }
      if (!entry.href) return isAdmin ? entry : null;
      const vh = firstViewableHref(entry);
      return vh ? { ...entry, href: vh } : null;
    };
    return groups
      .map((g) => ({ ...g, entries: g.entries.map(filterEntry).filter((e): e is NavEntry => e !== null) }))
      .filter((g) => g.entries.length > 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groups, ready, isAdmin, perm]);

  // Keys of every open group ("Group") and subgroup ("Group>Subgroup").
  // Recomputed from scratch (not accumulated) whenever the route changes —
  // navigating into a different section expands it AND collapses whatever
  // else was open, accordion-style, instead of every visited group staying
  // open forever.
  const [openKeys, setOpenKeys] = useState<Set<string>>(() => new Set());

  useEffect(() => {
    if (!pathname) return;
    setOpenKeys(() => {
      const next = new Set<string>();
      for (const group of groups) {
        for (const entry of group.entries) {
          if (isNavSubGroup(entry)) {
            if (entry.items?.some((item) => isActiveNavItem(pathname, item))) {
              next.add(group.label);
              next.add(`${group.label}>${entry.label}`);
            }
          } else if (isActiveNavItem(pathname, entry)) {
            next.add(group.label);
          }
        }
      }
      return next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  function toggle(key: string) {
    setOpenKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  const nav = (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div
        style={{
          height: 64,
          display: 'flex',
          alignItems: 'center',
          padding: '0 8px',
          background: siderBg,
          borderBottom: '1px solid #e7e2d9',
          flexShrink: 0,
        }}
      >
        <AppTitle />
      </div>
      <div style={{ flex: 1, overflowY: 'auto', padding: '10px 8px' }}>
        {visibleGroups.map((group) => (
          <GroupSection key={group.label} group={group} pathname={pathname} openKeys={openKeys} onToggle={toggle} />
        ))}
      </div>
    </div>
  );

  if (isMobile) {
    // The open trigger lives in AppHeader (left side, same row as the
    // account avatar on the right) — this component just owns the drawer.
    return (
      <Drawer
        open={mobileOpen}
        onClose={() => setMobileOpen(false)}
        placement="left"
        closable={false}
        width={SIDER_WIDTH}
        styles={{ body: { padding: 0, background: siderBg } }}
      >
        {nav}
      </Drawer>
    );
  }

  return (
    <Layout.Sider
      width={SIDER_WIDTH}
      style={{ background: siderBg, borderRight: '1px solid #e7e2d9' }}
      theme="light"
    >
      {nav}
    </Layout.Sider>
  );
}

function GroupSection({
  group,
  pathname,
  openKeys,
  onToggle,
}: {
  group: NavGroup;
  pathname: string | null;
  openKeys: Set<string>;
  onToggle: (key: string) => void;
}) {
  const open = openKeys.has(group.label);
  return (
    <div style={{ marginBottom: 4 }}>
      <button
        onClick={() => onToggle(group.label)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          width: '100%',
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          padding: '8px 10px',
          textAlign: 'left',
        }}
      >
        <RightOutlined style={{ fontSize: 9, color: '#9a9284', transform: open ? 'rotate(90deg)' : 'none', transition: 'transform 0.15s' }} />
        <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', color: '#726c63' }}>{group.label}</span>
      </button>
      {open && (
        <div style={{ paddingLeft: 4 }}>
          {group.entries.map((entry) => (
            <EntryRow key={entry.label} entry={entry} groupLabel={group.label} pathname={pathname} openKeys={openKeys} onToggle={onToggle} />
          ))}
        </div>
      )}
    </div>
  );
}

function EntryRow({
  entry,
  groupLabel,
  pathname,
  openKeys,
  onToggle,
}: {
  entry: NavEntry;
  groupLabel: string;
  pathname: string | null;
  openKeys: Set<string>;
  onToggle: (key: string) => void;
}) {
  if (isNavSubGroup(entry)) {
    // No items yet (e.g. "Tiktok Ads Report") — a plain disabled row, not
    // an accordion header that expands to nothing.
    if (!entry.items?.length) {
      return <NavRow item={{ label: entry.label, badge: entry.badge }} active={false} indent={1} />;
    }
    const key = `${groupLabel}>${entry.label}`;
    const open = openKeys.has(key);
    return (
      <div>
        <button
          onClick={() => onToggle(key)}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            width: '100%',
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            padding: '6px 10px 6px 20px',
            textAlign: 'left',
          }}
        >
          <RightOutlined style={{ fontSize: 8, color: '#9a9284', transform: open ? 'rotate(90deg)' : 'none', transition: 'transform 0.15s' }} />
          <span style={{ fontSize: 12.5, fontWeight: 600, color: '#494540' }}>{entry.label}</span>
        </button>
        {open && (
          <div>
            {entry.items.map((item) => (
              <NavRow key={item.label} item={item} active={isActiveNavItem(pathname, item)} indent={2} />
            ))}
          </div>
        )}
      </div>
    );
  }
  return <NavRow item={entry} active={isActiveNavItem(pathname, entry)} indent={1} />;
}

function NavRow({ item, active, indent }: { item: NavItem; active: boolean; indent: number }) {
  const badge = <NavBadge item={item} />;

  const rowStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '7px 10px',
    paddingLeft: 10 + indent * 16,
    borderRadius: 6,
    fontSize: 13,
    marginBottom: 1,
    background: active ? '#dce3ec' : 'transparent',
    color: item.href ? '#211f1c' : '#9a9284',
    textDecoration: 'none',
  };

  if (!item.href) {
    return (
      <div style={rowStyle}>
        <span>{item.label}</span>
        {badge}
      </div>
    );
  }

  return (
    <Link href={item.href} style={rowStyle}>
      <span>{item.label}</span>
      {badge}
    </Link>
  );
}

function NavBadge({ item }: { item: NavItem }) {
  // Always call the hook (Rules of Hooks) — it's a no-op fetch for non-count badges.
  const count = useResourceCount(item.badge === 'count' ? item.countResource! : undefined);
  if (!item.badge) return null;
  if (item.badge === 'count') {
    // A zero badge is noise, not information — an empty inbox should look
    // empty rather than wear a "0".
    if (count === null || count === 0) return null;
    return <Pill>{count.toLocaleString()}</Pill>;
  }
  return <Pill>{item.badge === 'soon' ? 'SOON' : 'NEXT'}</Pill>;
}

function Pill({ children }: { children: React.ReactNode }) {
  return (
    <span
      style={{
        fontSize: 10.5,
        fontWeight: 600,
        letterSpacing: '0.03em',
        color: '#726c63',
        background: '#efebe3',
        borderRadius: 999,
        padding: '1px 8px',
        flexShrink: 0,
      }}
    >
      {children}
    </span>
  );
}

function useResourceCount(resource: string | undefined): number | null {
  const [count, setCount] = useState<number | null>(null);
  useEffect(() => {
    if (!resource) return;
    let cancelled = false;
    const load = () => {
      fetch(`/api/${resource}?page=1&pageSize=1`)
        .then((res) => res.json())
        .then((json) => {
          if (!cancelled) setCount(json.total ?? null);
        })
        .catch(() => {});
    };
    load();
    // A badge is fetched once on mount, so anything that CHANGES the number it
    // shows (marking notifications read, say) would leave it stale until the
    // next full navigation. Any such action announces itself on this generic
    // event and every live badge refetches — see lib/notification-bus.ts.
    window.addEventListener(RESOURCE_COUNT_CHANGED, load);
    return () => {
      cancelled = true;
      window.removeEventListener(RESOURCE_COUNT_CHANGED, load);
    };
  }, [resource]);
  return count;
}
