'use client';

// Shared detail-drawer header actions: a primary "Edit" button (EditOutlined) + a single
// "⋯" dropdown of the resource's config.showActions. ONE source of truth for the
// Edit-with-more pattern so every detail surface (EntityDrawer, the Sample
// Dashboard, …) renders identical chrome from the same resource config — no
// per-view re-implementation. Edit renders only when `onEdit` is supplied (the
// caller owns whether that opens an inline drawer or navigates, and whether the
// current role may edit).
//
// ACTIONS ARE GATED HERE, not by the resource. They used to "self-gate" — each
// config wrapped its own actions in hasActionCached ternaries — and when that
// moved into RowAction.requires (2026-08-29) this surface was left reading
// showActions raw. It is the drawer EntityDrawer opens, which is how Launch
// Report opens a product, so Leya kept seeing Product Approval and Duplicate on
// a live release that had supposedly hidden them. Same `requires` contract and
// the same actionAllowed() the ListEngine adapter uses, so the two surfaces
// cannot drift apart again.

import { Dropdown } from 'antd';
import { EditOutlined } from '@ant-design/icons';
import type { ResourceConfig } from '../lib/resource-config';
import { usePermissions, actionAllowed } from '../lib/use-permissions';

const iconBtn: React.CSSProperties = { border: '1px solid #e7e2d9', background: '#fff', borderRadius: 8, height: 30, padding: '0 10px', fontSize: 13, color: '#726c63', cursor: 'pointer' };

export function DetailHeaderActions({ config, record, onEdit, onDelete, helpers }: {
  config: ResourceConfig;
  record: any;
  onEdit?: () => void;
  // Renders "🗑 Delete" as the last item of the ⋯ menu, exactly where the
  // ListEngine's own detail drawer puts it. Omitted when the caller has no
  // delete to offer (read-only resource, or the role lacks the grant).
  onDelete?: () => void;
  helpers?: any;
}) {
  // Subscribe to permissions so this (a) re-renders once they load and (b) does
  // NOT build showActions on a cold cache — hasActionCached/hasFeatureCached
  // return true before perms load, which would briefly expose forbidden actions
  // (e.g. Add Variant / Sample Pricing to a designer). Gate on `loaded`.
  const { loaded, perm } = usePermissions();
  if (!record) return null;
  const actions =
    loaded && config.showActions
      ? config.showActions(record).filter((a) => actionAllowed(perm, config.name, a.requires))
      : [];
  const menuItems = [
    ...actions.map((a, i) => ({ key: String(i), label: a.label, danger: a.danger })),
    ...(onDelete ? [{ key: 'delete', label: '🗑  Delete', danger: true }] : []),
  ];
  if (!onEdit && !menuItems.length) return null;

  return (
    <div style={{ display: 'flex', gap: 6 }}>
      {onEdit ? (
        <button onClick={onEdit} style={{ ...iconBtn, fontWeight: 600, color: '#26344b', borderColor: '#c9d3e0', background: '#e2e6ee' }}><EditOutlined style={{ marginRight: 5 }} />Edit</button>
      ) : null}
      {menuItems.length ? (
        <Dropdown
          trigger={['click']}
          placement="bottomRight"
          menu={{
            items: menuItems,
            onClick: (e: any) => {
              if (e?.domEvent?.stopPropagation) e.domEvent.stopPropagation();
              if (e.key === 'delete') { onDelete?.(); return; }
              const a = actions[Number(e.key)];
              if (a && record) a.onClick(record, helpers);
            },
          }}
        >
          <button style={{ ...iconBtn, width: 34, padding: 0, fontSize: 16 }}>⋯</button>
        </Dropdown>
      ) : null}
    </div>
  );
}
