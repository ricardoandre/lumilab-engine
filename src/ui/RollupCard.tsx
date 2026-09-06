'use client';

import { useState, type ReactNode } from 'react';
import { atWidth } from '../lib/file-url';

// The card a "View by" ROLLUP row draws (ListEngine's viewOptions[].rollup) —
// one row standing for several records, expanding in place to the records
// underneath.
//
// Extracted from Launch's model card when Restock grew the same view (Andre,
// 2026-08-27): both are "one row per model, tap to see the colourways", and a
// second hand-written copy of the photo stack, the count badge, the chevron and
// the child rows is exactly the copy-paste the shared-layer rule exists to
// stop. The SHELL lives here; what a group says about itself (dates, statuses,
// mapping) stays in each module's own card, passed as `children` / `renderItem`.
//
// Load-bearing for scripts/browser-check.mjs: `data-kano-rollup` on the header
// and `data-kano-rollup-item` on each child are how the sweep drills through a
// rollup view (it would otherwise find nothing to open and go quietly blind).
// Don't remove them in a redesign.

const CSS =
  '.rc{padding:11px 12px;}' +
  '.rc-head{display:flex;gap:11px;align-items:flex-start;cursor:pointer;}' +
  '.rc-stack{position:relative;width:58px;flex-shrink:0;}' +
  '.rc-sheet{position:absolute;top:0;width:44px;aspect-ratio:2/3;border-radius:7px;overflow:hidden;background:#efebe3;border:1.5px solid #fff;}' +
  '.rc-pad{width:44px;aspect-ratio:2/3;visibility:hidden;}' +
  '.rc-count{position:absolute;z-index:5;bottom:2px;right:0;background:#26344b;color:#fff;font-size:9.5px;font-weight:700;border-radius:999px;padding:1.5px 6px;border:1.5px solid #fff;}' +
  '.rc-kid{display:flex;gap:9px;align-items:center;padding:7px 0;border-top:1px solid #efe9df;}' +
  '.rc-kid img,.rc-kid .rc-noimg{width:32px;aspect-ratio:2/3;border-radius:5px;object-fit:cover;background:#efebe3;flex-shrink:0;}';

// The small amber pill a rollup uses for anything that isn't a status: "3 of 4",
// "No production linked", "unmapped". Same shape everywhere, so it's one export
// rather than a class each card redefines.
export function RollupFlag({ children }: { children: ReactNode }) {
  return (
    <span style={{ fontSize: 10.5, fontWeight: 700, borderRadius: 999, padding: '2px 8px', background: '#f1e0d6', color: '#a04e2a', whiteSpace: 'nowrap' }}>
      {children}
    </span>
  );
}

// One "Label: value" line, the shape every rollup card's meta uses.
export function RollupLine({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div style={{ fontSize: 12, color: '#726c63', marginTop: 3 }}>
      <span style={{ color: '#9a9284' }}>{label}: </span>
      {children}
    </div>
  );
}

export function RollupCard<T>({
  images,
  count,
  title,
  badge,
  subtitle,
  children,
  items,
  itemId,
  itemImage,
  renderItem,
  onItemClick,
}: {
  /** Up to three thumbnails, drawn as a fanned stack. */
  images: string[];
  /** The badge over the stack — how many records this row stands for. */
  count: number;
  title: ReactNode;
  /** Optional pill beside the title (e.g. Launch's "3 of 4"). */
  badge?: ReactNode;
  /** The line under the title — usually the members' names. */
  subtitle?: ReactNode;
  /** The group's own meta: dates, status pills, whatever the module tracks. */
  children?: ReactNode;
  items: T[];
  itemId: (item: T) => string;
  itemImage: (item: T) => string | null;
  /** The child row's content, right of its thumbnail. */
  renderItem: (item: T) => ReactNode;
  /** Omitted when a child row has nothing to open (e.g. a read-only list). */
  onItemClick?: (item: T) => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="rc">
      <style>{CSS}</style>
      <div className="rc-head" data-kano-rollup onClick={() => setOpen((v) => !v)}>
        <div className="rc-stack">
          {images.slice(0, 3).map((u, i) => (
            <div className="rc-sheet" key={i} style={{ left: i * 7, zIndex: 3 - i }}>
              {/* 44px on screen -> the 200px thumbnail, never the full upload. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={atWidth(u, 200)} loading="lazy" alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            </div>
          ))}
          <div className="rc-pad" />
          <div className="rc-count">{count}</div>
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            <span style={{ fontWeight: 700, fontSize: 14, color: '#211f1c' }}>{title}</span>
            {badge ? <RollupFlag>{badge}</RollupFlag> : null}
          </div>
          {subtitle ? (
            <div style={{ fontSize: 12.5, color: '#726c63', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{subtitle}</div>
          ) : null}
          {children}
        </div>

        <span style={{ color: '#9a9284', fontSize: 11, alignSelf: 'center', flexShrink: 0, transform: open ? 'rotate(90deg)' : 'none', transition: 'transform .16s' }}>▶</span>
      </div>

      {open ? (
        <div style={{ marginTop: 8 }}>
          {items.map((item) => {
            const url = itemImage(item);
            return (
              <div
                className="rc-kid"
                data-kano-rollup-item
                key={itemId(item)}
                style={onItemClick ? { cursor: 'pointer' } : undefined}
                onClick={onItemClick ? () => onItemClick(item) : undefined}
              >
                {url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={atWidth(url, 200)} loading="lazy" alt="" />
                ) : (
                  <div className="rc-noimg" />
                )}
                {renderItem(item)}
              </div>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
