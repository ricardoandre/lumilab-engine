'use client';

// Accidental-dismiss guard for form drawers (create / edit).
//
// antd's Drawer closes on a mask click or ESC with no questions asked, which
// on a half-filled create form throws the work away (Andre, 2026-08-21). The
// guard applies to those INDIRECT dismissals only — the explicit Cancel button
// and the header × stay instant, and DETAIL drawers keep closing immediately
// (nothing to lose there).
//
// Wiring: DrawerShell takes an `onDismiss` prop that antd's Drawer onClose is
// bound to; hand it the handler from useDirtyClose(). A drawer that never
// passes onDismiss behaves exactly as before.

import { useCallback, useEffect, useRef } from 'react';
import { App } from 'antd';

// Key-order-independent snapshot, so a `{...prev, k: v}` update that appends a
// key doesn't read as a change on its own.
function stable(value: any): string {
  return JSON.stringify(value, (_k, v) =>
    v && typeof v === 'object' && !Array.isArray(v)
      ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, v[k]]))
      : v,
  );
}

export function useDirtyClose(onClose: () => void, isDirty: () => boolean) {
  // Static Modal.confirm silently no-ops under React 19 + antd's context-based
  // theming — the App-bound instance is the one that actually renders.
  const { modal } = App.useApp();
  return useCallback(() => {
    if (!isDirty()) { onClose(); return; }
    modal.confirm({
      title: 'Discard unsaved changes?',
      content: 'This form has changes that have not been saved yet.',
      okText: 'Discard',
      okButtonProps: { danger: true },
      cancelText: 'Keep editing',
      onOk: onClose,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modal, onClose, isDirty]);
}

// Dirty check for the hand-rolled drawers that keep their form in plain state:
// snapshots the value once the drawer is `ready` (loaded), then compares. The
// baseline re-arms whenever `ready` goes false, so each open starts fresh.
export function useFormDirty(value: any, ready = true) {
  const base = useRef<string | null>(null);
  const latest = useRef(value);
  latest.current = value;
  useEffect(() => {
    if (!ready) { base.current = null; return; }
    if (base.current !== null) return;
    // Deferred a macrotask on purpose: a drawer that fills in defaults or a
    // prefill from its own effect does so AFTER this one runs, and snapshotting
    // synchronously would baseline the empty form — making it read as dirty
    // before the user has touched anything. Each re-render reschedules, so the
    // baseline is whatever the form settles on.
    const t = setTimeout(() => { base.current = stable(latest.current); }, 0);
    return () => clearTimeout(t);
  }, [ready, value]);
  return useCallback(
    () => !!ready && base.current !== null && stable(latest.current) !== base.current,
    [ready, value],
  );
}
