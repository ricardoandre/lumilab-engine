'use client';

// "Inner header menu" — a page-level tab switcher sitting above a page's
// own content, used to fold several related PAGES into one sidebar entry
// (e.g. Production/Production Material/Production Sample under one
// "Production" nav item) — each tab is a real route with its own URL, not a
// client-side content switch. First used ad hoc on the Production
// Dashboard's Timeline/Overview tabs (Andre liked the look, 2026-08-12);
// this is that same antd Tabs visual pulled out for reuse, now wired to
// next/link so every tab is independently bookmarkable and only its own
// page's data loads (Andre, 2026-08-13 — the original version rendered
// every tab's content into one client component tree keyed off local state,
// all sharing one URL; that's what this replaces).
//
// Usage: render this SAME tab list at the top of every page it lists (see
// ProductionTabBar.tsx and friends) — each page renders the bar plus its
// own real content below it. `activeKey` is derived from the current
// pathname, not from any local state.
import { Tabs } from 'antd';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { usePermissions, canAction } from '../lib/use-permissions';

export function InnerHeaderTabs({ items }: { items: { key: string; label: string; href: string }[] }) {
  const pathname = usePathname();
  const { perm } = usePermissions();
  // ACL: show only the tabs whose page the user can view (admins see all). While
  // perms load (perm === null) show all to avoid a flash of an empty bar — the
  // page + its API still enforce access. This gates every inner-header tab bar
  // (Sample Tools/Settings/Report, Production, Production Result) at once.
  const visible = perm ? items.filter((i) => canAction(perm, i.href.replace(/^\//, ''), 'view')) : items;
  const activeKey = visible.find((i) => i.href === pathname)?.key ?? visible[0]?.key;
  return (
    <div style={{ padding: '0 4px' }}>
      <Tabs
        activeKey={activeKey}
        items={visible.map((i) => ({ key: i.key, label: <Link href={i.href}>{i.label}</Link> }))}
      />
    </div>
  );
}
