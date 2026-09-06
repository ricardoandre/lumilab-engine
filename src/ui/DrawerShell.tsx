'use client';

// Shared Drawer chrome — ported verbatim (layout/behavior unchanged) from
// NocoBase's `lib_drawer_shell` source_code row: explicit close button,
// consistent header/footer/accent-bar layout, an explicit `loading` state
// so callers can mount the Drawer immediately (open toggled from the very
// first click) instead of returning null while data loads.

import { Drawer, Spin } from 'antd';
import type { ReactNode } from 'react';

export function DrawerShell(props: {
  open: boolean;
  onClose: () => void;
  // Indirect dismissal (mask click / ESC). Defaults to onClose; form drawers
  // pass a guarded handler from useDirtyClose so a stray click outside can't
  // throw away a half-filled form. The explicit × below always uses onClose.
  onDismiss?: () => void;
  title?: ReactNode;
  extra?: ReactNode;
  accentColor?: string;
  width?: number;
  placement?: 'right' | 'left' | 'top' | 'bottom';
  rootClassName?: string;
  zIndex?: number;
  footer?: ReactNode;
  loading?: boolean;
  children?: ReactNode;
}) {
  const closeBtn = (
    <button
      onClick={props.onClose}
      title="Close"
      style={{
        border: '1px solid #e7e2d9', background: '#fff', borderRadius: 8,
        width: 30, height: 30, padding: 0, display: 'flex', alignItems: 'center',
        justifyContent: 'center', fontSize: 15, color: '#726c63', cursor: 'pointer',
      }}
    >
      &#215;
    </button>
  );

  return (
    <Drawer
      open={props.open}
      onClose={props.onDismiss ?? props.onClose}
      closable={false}
      title={props.title}
      extra={<div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>{props.extra ?? null}{closeBtn}</div>}
      width={props.width || 480}
      placement={props.placement || 'right'}
      rootClassName={props.rootClassName}
      zIndex={props.zIndex}
      footer={!props.loading && props.footer ? props.footer : undefined}
    >
      <div>
        {props.accentColor ? (
          <div style={{ height: 4, borderRadius: 999, background: props.accentColor, marginBottom: 6, opacity: 0.85 }} />
        ) : null}
        {props.loading ? (
          <div style={{ padding: 60, textAlign: 'center' }}><Spin /></div>
        ) : (
          props.children
        )}
      </div>
    </Drawer>
  );
}
