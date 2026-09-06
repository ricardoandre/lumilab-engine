'use client';

// Generic detail drawer for ANY resource: fetches /api/{config.name}/{id} and
// renders that resource's OWN config-driven detail (ResourceDetailBody — the
// exact same renderer its list/page detail uses). So a cross-object link
// (e.g. a Product from a material variant, or a Sample from a variant's Sample
// link) reuses that resource's real detail instead of a hand-built one.
//
// Header actions mirror ListEngine's own DetailDrawer: an Edit button plus a ⋯
// menu of config.showActions — so a sample opened here from a variant link still
// has Edit / Add Variant / Set Status / Pricing, not a dead read-only view.
// Those sample actions run through the global sample-action-bus, so they work
// with no per-page wiring.
//
// Edit falls back to the GENERIC ResourceFormDrawer when a resource has no
// custom renderEditForm, exactly as the ListEngine adapter does (see
// resourceConfigToListView's renderEditDrawer). Without that fallback every
// field-driven resource — Product being the one people actually hit, via a
// production item's product code — opened here with no Edit button at all
// (Andre, 2026-08-19).

import { useEffect, useState } from 'react';
import { App, Spin } from 'antd';
import { DrawerShell } from './DrawerShell';
import { DetailHeaderActions } from './DetailHeaderActions';
import { ResourceDetailBody } from './ResourceDetailBody';
import { ErrorBoundary } from './ErrorBoundary';
import { confirmDelete } from './confirm-delete';
import { ResourceFormDrawer } from './ResourceFormDrawer';
import type { ResourceConfig } from '../lib/resource-config';
import { aclWriteKeyOf } from '../lib/resource-config';
import { usePermissions, canAction } from '../lib/use-permissions';
import type { Helpers } from './ListEngine';

// Standalone drawer has no live list to drive — reload re-fetches the record.
function makeHelpers(reload: () => void, message: Helpers['message']): Helpers {
  const noop = () => {};
  const asyncNoop = async () => [] as any;
  return {
    message,
    reload: async () => { reload(); return []; },
    reloadUntil: asyncNoop,
    closeDetail: noop,
    refresh: reload,
    reloadKeepOpen: asyncNoop,
    getImage: () => '',
    exitSelect: noop,
    openNewWithPrefill: noop,
    selectAll: noop,
    selectIds: noop,
    clearSelection: noop,
    openEdit: noop,
    confirmDelete: noop,
  };
}

export function EntityDrawer({ config, id, open, onClose, onDeleted, onChanged }: {
  config: ResourceConfig; id: string; open: boolean; onClose: () => void;
  // Called after the record is deleted, for a host that must react (close this
  // drawer, reload its list). Without it Delete is not offered: a drawer whose
  // host can't hear about the delete would sit there showing a record that no
  // longer exists.
  onDeleted?: () => void;
  // Called whenever the record is MUTATED from inside this drawer — an edit
  // saved, or a detail body calling helpers.reload (e.g. a fabric's "Add
  // variant"). This drawer knows how to refresh ITSELF and nothing else, so
  // without it a host list keeps showing the row as it was before the edit
  // (Andre, 2026-08-28: "when editing -> the list doesnt get updated").
  onChanged?: () => void;
}) {
  // Bound instances — antd's static `message`/`Modal.confirm` are inert under React 19.
  const { message, modal } = App.useApp();
  const [rec, setRec] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);
  const [editing, setEditing] = useState(false);
  const { perm } = usePermissions();

  function load() {
    setLoading(true);
    setRec(null); // clear so a chained jump never flashes the previous entity
    fetch(`/api/${config.name}/${id}`).then((r) => (r.ok ? r.json() : null)).then(setRec).finally(() => setLoading(false));
  }
  useEffect(() => { if (open) { setEditing(false); load(); } /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [config.name, id, open]);

  // A sample action fired from THIS drawer (Add Variant / Set Status) mutates
  // the record via the global host — refresh it in place when that happens.
  useEffect(() => {
    if (!open) return;
    const onChanged = () => load();
    window.addEventListener('samples-changed', onChanged);
    return () => window.removeEventListener('samples-changed', onChanged);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, config.name, id]);

  const titleField = config.fields.find((f) => f.type === 'text');
  const title = rec ? (rec[titleField?.name ?? 'code'] ?? config.label) : config.label;

  // Match the resource's OWN detail-drawer width (ListEngine's DetailDrawer):
  // min(900px, 92vw), or config.detailWidth. ListEngine injects that base rule
  // itself, but a host WITHOUT a ListEngine (e.g. the Photoshoot page opening a
  // Reshoot here) doesn't — so this drawer must inject the SAME rule, or antd
  // falls back to its narrow default. Kept byte-for-byte in sync with
  // ListEngine.tsx's `.kano-detail-drawer` rules.
  const detailW = config.detailWidth ?? 900;
  const rootClassName = 'kano-detail-drawer';

  const reloadAll = () => { load(); setRefreshKey((k) => k + 1); onChanged?.(); };
  const helpers = makeHelpers(reloadAll, message);
  // Read-only resources stay read-only; everything else needs the UPDATE grant.
  // This used to be `!config.readOnly` alone, which showed Edit to any role that
  // could merely VIEW the record (Andre, 2026-08-28: "not allowed to edit
  // (currently can edit)"). The save was always refused server-side, so this
  // was a dead button rather than a hole — but a dead button on someone else's
  // data reads as "I can change this", which is worse than not offering it.
  // ACL first, then the specific override — see ResourceConfig.editOverride.
  const canEdit =
    !config.readOnly &&
    (canAction(perm, aclWriteKeyOf(config), 'update') || !!config.editOverride?.(rec, perm));
  // Same grant and the same dialog as the ListEngine's detail drawer — see
  // confirm-delete.tsx. ?force=1 mirrors the list adapter: a resource that
  // declares deleteContent has just shown its warning, so a server guarding the
  // delete behind confirmation has had its answer.
  const canDelete = !config.readOnly && !!onDeleted && canAction(perm, aclWriteKeyOf(config), 'delete');
  const onDelete = () => {
    void confirmDelete({
      modal, message,
      title: config.deleteTitle || `Delete this ${config.label.toLowerCase().replace(/s$/, '')}?`,
      content: config.deleteContent
        ? () => Promise.resolve(config.deleteContent!(rec))
        : `${config.deleteLabel ? config.deleteLabel(rec) : '#' + id} will be permanently deleted.`,
      onDelete: () => fetch(`/api/${config.name}/${id}${config.deleteContent ? '?force=1' : ''}`, { method: 'DELETE' }).then(async (r) => {
        if (r.ok) return;
        const body = await r.json().catch(() => null);
        throw new Error(body?.error || 'Delete failed');
      }),
      onDone: () => { onClose(); onDeleted!(); },
    });
  };
  const extra = (
    <DetailHeaderActions
      config={config}
      record={rec}
      onEdit={canEdit ? () => setEditing(true) : undefined}
      onDelete={canDelete ? onDelete : undefined}
      helpers={helpers}
    />
  );

  return (
    <>
      <DrawerShell
        open={open}
        onClose={onClose}
        title={title}
        accentColor="#26344b"
        rootClassName={rootClassName}
        loading={loading}
        extra={extra}
      >
        <style>{`.kano-detail-drawer .ant-drawer-content-wrapper{width:min(${detailW}px,92vw) !important;}@media (max-width:700px){.kano-detail-drawer .ant-drawer-content-wrapper{width:100% !important;}}`}</style>
        {rec ? (
          <ErrorBoundary label={config.label} resetKey={rec?.id}>
            <ResourceDetailBody config={config} row={rec} refreshKey={refreshKey} helpers={helpers} />
          </ErrorBoundary>
        ) : loading ? <div style={{ padding: 30, textAlign: 'center' }}><Spin /></div> : <div>Not found.</div>}
      </DrawerShell>
      {editing && rec ? (
        config.renderEditForm ? (
          config.renderEditForm(rec, { open: true, onClose: () => setEditing(false), onSaved: () => { setEditing(false); reloadAll(); }, helpers })
        ) : (
          <ResourceFormDrawer
            config={config}
            mode="edit"
            id={rec.id}
            open
            onClose={() => setEditing(false)}
            onSaved={() => { setEditing(false); reloadAll(); }}
          />
        )
      ) : null}
    </>
  );
}
