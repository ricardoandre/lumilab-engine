'use client';

// DetailAccordionShell — ported verbatim (layout/behavior unchanged) from
// NocoBase's `lib_detail_shell` source_code row: an always-visible summary
// slot, a single-open accordion of sections below it with an "Expand all" /
// "Collapse all" toggle, and an optional always-visible comments panel
// (desktop: fixed 320px right column; mobile: stacked full-width after the
// accordion — comments never require expanding anything).
//
// Used by both Sample's and Production's detail drawers in NocoBase itself
// (`view_sample_dashboard_summary`, `ui_production_detail`) — this is the
// same shared component here, not a per-module reimplementation.

import { useState, useEffect, type ReactNode } from 'react';
import { ErrorBoundary } from './ErrorBoundary';

export interface AccordionSectionDef {
  key: string;
  title: string;
  accent?: string;
  // Greyed note at the TOP OF THE SECTION BODY (Andre, 2026-09-02) — for saying
  // that what is typed in a section is saved somewhere shared. Inside the box,
  // under the title, so it reads as belonging to the fields below it.
  note?: ReactNode;
  content: ReactNode;
}

export function AccordionSection({ title, accent, note, isOpen, onToggle, children }: {
  title: string;
  accent?: string;
  note?: ReactNode;
  isOpen: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  return (
    // data-kano-* are hooks for scripts/browser-check.mjs, which drives this
    // accordion after every release. They render nothing and must stay put:
    // the check finds sections by these, not by styling.
    <div data-kano-section={title} style={{ border: '1px solid #eef0f3', borderRadius: 10, marginBottom: 8, overflow: 'hidden', background: '#fff' }}>
      <div
        data-kano-section-toggle=""
        onClick={onToggle}
        style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 12px', cursor: 'pointer', background: isOpen ? '#f8fafc' : '#fff' }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
          <span style={{ width: 8, height: 8, borderRadius: 999, background: accent || '#94a3b8', flexShrink: 0 }} />
          <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.05em', color: '#0f172a', textTransform: 'uppercase' }}>{title}</span>
        </div>
        <span style={{ fontSize: 12, color: '#94a3b8', transition: 'transform 0.15s', transform: isOpen ? 'rotate(90deg)' : 'none', display: 'inline-block' }}>›</span>
      </div>
      {isOpen && (
        <div style={{ padding: 12, borderTop: '1px solid #f1f5f9' }}>
          {/* Under the title and INSIDE the box, not on the header row (Andre,
              2026-09-02) — it belongs to the fields it describes. */}
          {note ? (
            <div style={{ fontSize: 11.5, color: '#94a3b8', marginBottom: 10 }}>{note}</div>
          ) : null}
          {children}
        </div>
      )}
    </div>
  );
}

// Click-to-enlarge overlay. Consumer owns the open/closed state (a useState
// holding the src url or null) and renders <Lightbox src={...} onClose={...}/>
// once, anywhere in its tree.
export function Lightbox({ src, onClose }: { src: string | null; onClose: () => void }) {
  if (!src) return null;
  return (
    <div
      onClick={onClose}
      style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.85)', zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, cursor: 'zoom-out' }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} onClick={onClose} style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain', borderRadius: 8, boxShadow: '0 20px 60px rgba(0,0,0,0.5)' }} alt="" />
      <button
        onClick={(e) => { e.stopPropagation(); onClose(); }}
        style={{ position: 'fixed', top: 16, right: 16, width: 36, height: 36, borderRadius: 999, border: 'none', background: 'rgba(255,255,255,0.15)', color: '#fff', fontSize: 20, lineHeight: '36px', cursor: 'pointer' }}
      >
        ✕
      </button>
    </div>
  );
}

const SHELL_CSS =
  '@media (min-width:701px){' +
  '.dtl-shell-lower{flex-direction:row !important;align-items:flex-start !important;}' +
  '.dtl-shell-body{flex:1 1 auto !important;min-width:0 !important;}' +
  '.dtl-shell-comments{width:320px !important;flex-shrink:0 !important;border-left:1px solid #f1f5f9 !important;border-top:none !important;}' +
  '}' +
  '@media (max-width:700px){' +
  '.dtl-shell-body{padding:12px !important;}' +
  '.dtl-shell-comments{padding:12px !important;}' +
  '}';

export function DetailAccordionShell({
  summary, sections, comments, defaultOpenKey, resetKey, showExpandAll = true,
}: {
  summary?: ReactNode;
  sections: AccordionSectionDef[];
  comments?: ReactNode;
  defaultOpenKey?: string | null;
  resetKey?: unknown;
  showExpandAll?: boolean;
}) {
  const initialOpenKey = defaultOpenKey !== undefined ? defaultOpenKey : (sections[0] ? sections[0].key : null);
  const [openKey, setOpenKey] = useState<string | null>(initialOpenKey ?? null);
  const [allOpen, setAllOpen] = useState(false);

  useEffect(() => {
    setOpenKey(initialOpenKey ?? null);
    setAllOpen(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetKey]);

  function toggle(key: string) {
    if (allOpen) {
      // Clicking one section while "all" is expanded just drops back to a
      // normal single-open click on that section — no separate mode to track.
      setAllOpen(false);
      setOpenKey(key);
      return;
    }
    setOpenKey((prev) => (prev === key ? null : key));
  }
  function toggleAll() {
    setAllOpen((prev) => {
      const next = !prev;
      if (!next) setOpenKey(initialOpenKey ?? null);
      return next;
    });
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
      <style>{SHELL_CSS}</style>
      {summary ? <ErrorBoundary label="Summary" compact resetKey={resetKey}>{summary}</ErrorBoundary> : null}
      <div className="dtl-shell-lower" style={{ display: 'flex', flexDirection: 'column' }}>
        <div className="dtl-shell-body" style={{ padding: '16px 20px', flexShrink: 0, minWidth: 0, overflow: 'hidden' }}>
          {showExpandAll && sections.length > 1 && (
            <div
              data-kano-expand-all=""
              onClick={toggleAll}
              style={{ border: '1px dashed #cbd5e1', borderRadius: 10, marginBottom: 8, padding: '8px 12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer' }}
            >
              <span style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#64748b' }}>{allOpen ? 'Collapse all' : 'Expand all'}</span>
              <span style={{ fontSize: 12, color: '#94a3b8' }}>↕</span>
            </div>
          )}
          {sections.map((s) => (
            // One boundary PER SECTION, which is the entire point: on
            // 2026-08-27 the Samples section threw and took the whole page with
            // it because there was nothing between it and the root.
            <AccordionSection key={s.key} accent={s.accent} title={s.title} isOpen={allOpen || openKey === s.key} onToggle={() => toggle(s.key)}>
              <ErrorBoundary label={s.title} compact resetKey={resetKey}>
                {s.content}
              </ErrorBoundary>
            </AccordionSection>
          ))}
        </div>
        {comments ? (
          <div className="dtl-shell-comments" style={{ width: '100%', flexShrink: 0, padding: '16px 20px', display: 'flex', flexDirection: 'column' }}>
            <ErrorBoundary label="Comments" compact resetKey={resetKey}>{comments}</ErrorBoundary>
          </div>
        ) : null}
      </div>
    </div>
  );
}
