'use client';

import type { ReactNode } from 'react';

// The standard "here's what the data says, want to use it?" panel inside a
// form section (Andre, 2026-08-19: "just want to standardize the help in
// variant and measurement"). One shell for every such hint rather than a
// hand-styled box per feature, so they can't drift apart again — Product's
// variant-copy offer and measurement insight were a blue box and a purple box
// with differently-sized buttons before this.
//
// Visual language is AccordionSection's, deliberately: the same #f8fafc panel
// as an open section header, the same #eef0f3 border and slate type ramp. The
// only color is the section's own accent, as a left rule — the hint reads as
// part of the section it sits in instead of as a foreign notification.
//
// Belongs at the TOP of a section (`formSections[].renderTop`), above the
// fields it talks about — a hint about a field you haven't reached yet is
// worth more than one you scroll past after filling it in.
export function FormHint({
  accent,
  title,
  detail,
  children,
}: {
  accent?: string;
  // The finding, e.g. "4 other products use model A46Mahesvara".
  title: ReactNode;
  // Optional second line — what's on offer, or the caveat.
  detail?: ReactNode;
  // Rows, chips, action buttons. Use antd <Button size="small"> for actions so
  // they match the rest of the app's inline controls.
  children?: ReactNode;
}) {
  return (
    <div
      style={{
        background: '#f8fafc',
        border: '1px solid #eef0f3',
        borderLeft: `3px solid ${accent || '#94a3b8'}`,
        borderRadius: 8,
        padding: '10px 12px',
        marginBottom: 14,
      }}
    >
      <div style={{ fontSize: 12, fontWeight: 600, color: '#334155', lineHeight: 1.45 }}>{title}</div>
      {detail && <div style={{ fontSize: 11, color: '#64748b', marginTop: 3, lineHeight: 1.45 }}>{detail}</div>}
      {children && <div style={{ marginTop: 9 }}>{children}</div>}
    </div>
  );
}
