'use client';

// The one place list-header action buttons are drawn. Every list header shows
// the same two controls in the same shapes, so they live here instead of being
// re-drawn per page (Andre, 2026-08-20 — Product's header button had drifted to
// a different icon than every other list's):
//   • MoreActionsIcon  (⋯)  — the page-level "More action" dropdown beside "+"
//   • SelectRowsIcon   (☰)  — enter select-and-bulk-action mode
// Both render inside HeaderIconButton so border, size and radius can't drift
// either. ListEngine owns the "+" itself; these are its two neighbours.

import type { ComponentPropsWithoutRef, ReactNode } from 'react';
import { forwardRef } from 'react';

const ICON_COLOR = '#726c63';

export function MoreActionsIcon({ color = ICON_COLOR }: { color?: string }) {
  return (
    <svg width={18} height={18} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="5" cy="12" r="1.9" fill={color} />
      <circle cx="12" cy="12" r="1.9" fill={color} />
      <circle cx="19" cy="12" r="1.9" fill={color} />
    </svg>
  );
}

export function SelectRowsIcon({ color = ICON_COLOR }: { color?: string }) {
  return (
    <svg width={18} height={18} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

// forwardRef because antd's <Dropdown> clones its child to attach the trigger
// ref — a plain function component would silently lose the click handling.
//
// Props are the real <button> props rather than the named four plus a
// `Record<string, unknown>` catch-all. The catch-all was there to let the
// props antd's Dropdown injects (click/keyboard/hover/aria) pass through, but
// an index signature of `unknown` is contagious: it swallowed the types of
// `title`, `onClick`, `style` and `children` too, leaving the one component
// every list header depends on with no checking at all. Button props cover
// everything antd injects, and keep the named four honest.
export const HeaderIconButton = forwardRef<
  HTMLButtonElement,
  ComponentPropsWithoutRef<'button'> & { children: ReactNode }
>(function HeaderIconButton({ title, onClick, children, style, ...rest }, ref) {
  return (
    <button
      ref={ref}
      type="button"
      title={title}
      onClick={onClick}
      {...rest}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        border: '1px solid #e7e2d9',
        background: '#fff',
        borderRadius: 10,
        width: 40,
        height: 40,
        color: ICON_COLOR,
        cursor: 'pointer',
        ...style,
      }}
    >
      {children}
    </button>
  );
});
