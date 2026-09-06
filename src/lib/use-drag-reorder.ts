'use client';

import { useRef, useState } from 'react';

// The one drag-to-reorder mechanism for the whole app: a grab handle you drag,
// with the list reordering LIVE as you pass a row's midpoint, so the row you're
// holding is always where it would land (no separate drop indicator).
//
// POINTER events, not the HTML5 drag-and-drop API. This started as ListEngine's
// table reorder using `draggable`/`onDragStart`/`onDrop`, which never fires on
// mobile touch browsers — so on a phone that reorder silently did nothing. This
// app is used mostly on a phone, so pointer events (one code path for mouse,
// touch and pen) are the house pattern now. Anything that reorders rows should
// use this hook rather than rolling its own.
//
// Two things the caller MUST wire up or the drag misbehaves:
//   1. `setRowRef(i)` on every row element — the drag hit-tests against the
//      rows' real rects, so it stays correct whatever the row heights are.
//   2. `handleProps(i)` on the grab handle only, NOT the whole row. The handle
//      carries `touchAction: 'none'`; putting that on the row would kill
//      scrolling over the list on touch.

export interface DragReorderApi {
  /** Index currently being dragged, or null. For styling the held/faded rows. */
  dragIdx: number | null;
  /** ref callback for row i. */
  setRowRef: (i: number) => (el: HTMLElement | null) => void;
  /** Spread onto the grab handle for row i. */
  handleProps: (i: number) => {
    onPointerDown: (e: React.PointerEvent) => void;
    onPointerMove: (e: React.PointerEvent) => void;
    onPointerUp: (e: React.PointerEvent) => void;
    onPointerCancel: (e: React.PointerEvent) => void;
    style: React.CSSProperties;
  };
}

const HANDLE_BASE: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  color: '#94a3b8',
  fontSize: 13,
  lineHeight: 1,
  // Without this, a touch-drag on the handle scrolls the page instead of
  // dragging the row.
  touchAction: 'none',
  userSelect: 'none',
};

/**
 * @param count   number of rows currently rendered
 * @param onMove  called with (from, to) when the dragged row should change
 *                position. The caller owns the list and applies the move —
 *                which keeps this hook agnostic about how rows are stored
 *                (local state, a form field, a server PATCH, …).
 * @param onCommit optional, fired once when the drag ENDS. Use it to persist —
 *                `onMove` fires on every row crossed, so saving there would be
 *                one write per row passed over. Callers whose save is explicit
 *                (a drawer's Save button) don't need it.
 */
export function useDragReorder(
  count: number,
  onMove: (from: number, to: number) => void,
  onCommit?: () => void,
): DragReorderApi {
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const rowRefs = useRef<(HTMLElement | null)[]>([]);
  // Kept in a ref as well as state: the pointermove handler is created per
  // render, but capture means it can fire against a stale closure mid-drag.
  const dragIdxRef = useRef<number | null>(null);

  function set(i: number | null) {
    dragIdxRef.current = i;
    setDragIdx(i);
  }

  return {
    dragIdx,
    setRowRef: (i: number) => (el: HTMLElement | null) => { rowRefs.current[i] = el; },
    handleProps: (i: number) => ({
      onPointerDown: (e: React.PointerEvent) => {
        e.preventDefault();
        // Capture on the handle so move/up keep firing once the pointer leaves
        // it — without this the drag dies the moment you move faster than the
        // row follows.
        e.currentTarget.setPointerCapture(e.pointerId);
        set(i);
      },
      onPointerMove: (e: React.PointerEvent) => {
        const from = dragIdxRef.current;
        if (from === null) return;
        const y = e.clientY;
        const to = rowRefs.current.slice(0, count).findIndex((el) => {
          if (!el) return false;
          const r = el.getBoundingClientRect();
          return y >= r.top && y <= r.bottom;
        });
        if (to === -1 || to === from) return;
        onMove(from, to);
        set(to);
      },
      onPointerUp: (e: React.PointerEvent) => {
        if (dragIdxRef.current === null) return;
        try { e.currentTarget.releasePointerCapture(e.pointerId); } catch { /* already released */ }
        set(null);
        onCommit?.();
      },
      onPointerCancel: (e: React.PointerEvent) => {
        if (dragIdxRef.current === null) return;
        try { e.currentTarget.releasePointerCapture(e.pointerId); } catch { /* already released */ }
        set(null);
        onCommit?.();
      },
      style: { ...HANDLE_BASE, cursor: dragIdx === i ? 'grabbing' : 'grab' },
    }),
  };
}

/** Pure helper: move an item between positions. */
export function moveItem<T>(items: T[], from: number, to: number): T[] {
  const next = items.slice();
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return next;
}

/** The grab-handle glyph, so every handle in the app looks the same. */
export const DRAG_HANDLE_GLYPH = '⠿';
