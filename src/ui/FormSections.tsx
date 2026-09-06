'use client';

// Sectioned form layout — same visual/component family as
// DetailAccordionShell's AccordionSection (accent-dot header, collapsible
// body), reused here for long edit/create forms instead of a per-module
// reimplementation. Opt-in only: a short form (few fields) should stay a
// flat list, not get wrapped in an accordion for its own sake — only use
// this when a form genuinely has enough fields that grouping helps
// (Production's Edit form was the first case — Details/Remarks/Quantity/
// Materials, matching NocoBase's own `ui_production_edit` grouping).
//
// Unlike the detail view's single-open accordion, form sections default to
// ALL open (you're here to fill things in, not browse) and toggle
// independently — collapsing one doesn't force another shut.
import { useState, useEffect } from 'react';
import { AccordionSection, type AccordionSectionDef } from './DetailAccordionShell';

export function FormSections({ sections, resetKey }: { sections: AccordionSectionDef[]; resetKey?: unknown }) {
  const [openKeys, setOpenKeys] = useState<Set<string>>(() => new Set(sections.map((s) => s.key)));

  useEffect(() => {
    setOpenKeys(new Set(sections.map((s) => s.key)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetKey]);

  function toggle(key: string) {
    setOpenKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  return (
    <div>
      {sections.map((s) => (
        <AccordionSection key={s.key} accent={s.accent} title={s.title} note={s.note} isOpen={openKeys.has(s.key)} onToggle={() => toggle(s.key)}>
          {s.content}
        </AccordionSection>
      ))}
    </div>
  );
}
