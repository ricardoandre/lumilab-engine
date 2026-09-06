'use client';

// Collapsible, colored-dot section — matches the app owner's approved
// NocoBase "Sample Details" view (VARIANT / QC / MATERIAL AND PRICING /
// REMARKS / HISTORY). Controlled (open/onToggle) so a parent page can offer
// a single "Expand all" toggle across every section.

import { RightOutlined, DownOutlined, UpOutlined } from '@ant-design/icons';

// The `data-kano-*` attributes below render nothing and carry no styling. They
// are what scripts/browser-check.mjs uses to find the sections and click
// "Expand all", so every section body actually MOUNTS during the sweep — which
// is the only way a section that throws on render gets caught (the 2026-08-27
// blank-screen class of bug). DetailAccordionShell has carried them since it
// was written; this component — the one every config-driven detail drawer
// actually renders, via ResourceDetailBody — did not, so the sweep reported
// "0 section(s)" for every resource in the app and never opened one. Don't
// remove them in a redesign or it goes quietly blind again.
export function DetailSection({ label, color, note, open, onToggle, children }: {
  label: string;
  color: string;
  // A quiet line under the header, for saying where a section's data comes from
  // (Andre, 2026-09-02: "show just a small note below the accordion header").
  // Only while the section is OPEN — collapsed, it is noise on a row the reader
  // is scrolling past.
  note?: React.ReactNode;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <div data-kano-section={label} style={{ border: '1px solid #e7e2d9', borderRadius: 8, marginBottom: 8, overflow: 'hidden', background: '#fff' }}>
      <div
        data-kano-section-toggle=""
        onClick={onToggle}
        style={{
          display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px', cursor: 'pointer',
          background: open ? '#faf9f6' : '#fff',
        }}
      >
        <span style={{ width: 8, height: 8, borderRadius: '50%', background: color, flexShrink: 0 }} />
        <span style={{ fontSize: 12.5, fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase', color: '#211f1c', flex: 1 }}>
          {label}
        </span>
        {open ? <DownOutlined style={{ fontSize: 11, color: '#9a9284' }} /> : <RightOutlined style={{ fontSize: 11, color: '#9a9284' }} />}
      </div>
      {open && note ? (
        <div style={{ padding: '0 14px 10px 32px', marginTop: -4, fontSize: 12, lineHeight: 1.5, color: '#8a8578' }}>{note}</div>
      ) : null}
      {open && <div style={{ padding: '10px 14px 14px', borderTop: '1px solid #efebe3' }}>{children}</div>}
    </div>
  );
}

export function ExpandAllToggle({ allOpen, onToggle }: { allOpen: boolean; onToggle: () => void }) {
  return (
    <button
      data-kano-expand-all=""
      onClick={onToggle}
      style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%',
        padding: '9px 14px', marginBottom: 10, borderRadius: 8, border: '1px dashed #cbc3b3',
        background: 'transparent', cursor: 'pointer', color: '#726c63',
        fontSize: 11.5, fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase',
      }}
    >
      {allOpen ? 'Collapse all' : 'Expand all'}
      <span style={{
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 20, height: 20,
        borderRadius: 6, background: '#26344b', color: '#fff', fontSize: 9,
      }}>
        {allOpen ? <UpOutlined /> : <DownOutlined />}
      </span>
    </button>
  );
}
