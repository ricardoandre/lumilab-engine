'use client';

// The single config-driven detail renderer — used by BOTH the list's detail
// drawer (resourceConfigToListView's detailRender) and the generic
// EntityDrawer that opens any object's detail from a cross-object link. One
// resource's detail is defined once (its ResourceConfig) and rendered the same
// everywhere: renderDetail override, or the rich topFields/textFields/sections
// layout, or the plain flat field list. Extracted so links to a Product (etc.)
// reuse the exact same detail as its own page — no per-object rebuild.

import { useState } from 'react';
import type { ResourceConfig, FieldConfig, ShowSection } from '../lib/resource-config';
import { showFields, aclViewKeyOf } from '../lib/resource-config';
import { usePermissions, viewableFieldFilter } from '../lib/use-permissions';
import type { Helpers } from './ListEngine';
import { renderFieldValue } from './field-value';
import { RichTextValue } from './RichTextValue';
import { ImageGallery } from './ImageGallery';
import { DetailSection, ExpandAllToggle } from './DetailSection';
import { pillColor } from '../lib/pill-colors';
import { emitOpenEntity } from '../lib/entity-drawer-bus';

// Render a field's value, but if it's a relation marked `linkable` with a
// value, make it a clickable link that opens that object's detail drawer
// (via the target relation.resource + the ListEngine host).
function fieldValueOrLink(f: FieldConfig, row: any) {
  const value = renderFieldValue(f, row);
  // An outbound link wins over everything: it points at a system we do not own,
  // so there is no drawer to open instead.
  const href = f.externalHref?.(row) ?? null;
  if (href) {
    return (
      <a href={href} target="_blank" rel="noreferrer" style={{ color: '#26344b', fontWeight: 600 }}>
        {value} ↗
      </a>
    );
  }
  // FieldConfig.linkTo wins when set — it can point somewhere other than the
  // field's own relation target (a variant field opening its PRODUCT).
  const target = f.linkTo
    ? f.linkTo(row)
    : f.type === 'relation' && f.linkable && f.relation?.resource && row[f.name]
      ? { resource: f.relation.resource, id: row[f.name] }
      : null;
  if (target && target.resource && target.id != null && target.id !== '') {
    return (
      <span onClick={() => emitOpenEntity(target.resource, target.id)} style={{ cursor: 'pointer', color: '#26344b', fontWeight: 600 }}>
        {value}
      </span>
    );
  }
  return value;
}

function CategoryTag({ label, color }: { label: string; color?: string }) {
  const { fg } = pillColor(color);
  return (
    <span style={{ display: 'inline-block', padding: '4px 14px', borderRadius: 999, border: `1px solid ${fg}`, color: fg, fontSize: 13, fontWeight: 600, marginBottom: 16 }}>
      {label}
    </span>
  );
}

// One section's field list, in one place so the "is this section just the one
// table?" test below and the render loop can never disagree.
const sectionFields = (section: { fields?: string[] }) => section.fields ?? [];

function SectionsAccordion({ sections, fields, row, canRead }: { sections: ShowSection[]; fields: FieldConfig[]; row: any; canRead: (name: string) => boolean }) {
  // A section the role can read NOTHING of disappears entirely (Andre,
  // 2026-08-28: employee should not see Material or Setting on Product).
  // Sections with their own `render` are kept: their body fetches its own data
  // and isn't described by the field list, so field limits can't judge it.
  // `aclFields` narrows the verdict to the fields that are really this
  // section's own — see the ShowSection docs.
  sections = sections.filter((sec) => sec.render || (sec.aclFields ?? sec.fields ?? []).some(canRead));
  const [openKeys, setOpenKeys] = useState<Set<string>>(new Set(sections.filter((s) => s.defaultOpen).map((s) => s.key)));
  const allOpen = openKeys.size === sections.length;
  function toggle(key: string) {
    setOpenKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }
  return (
    <>
      <ExpandAllToggle allOpen={allOpen} onToggle={() => setOpenKeys(allOpen ? new Set() : new Set(sections.map((s) => s.key)))} />
      {sections.map((section) => (
        <DetailSection key={section.key} label={section.label} color={section.color} note={section.note?.(row)} open={openKeys.has(section.key)} onToggle={() => toggle(section.key)}>
          {/* A section with its own body renders that and nothing else — the
              panel fetches what it needs when the section is opened, which is
              why it is mounted only while open. */}
          {section.render && section.render(row)}
          {!section.render && sectionFields(section).filter(canRead).map((name) => {
            const f = fields.find((x) => x.name === name);
            if (!f) return null;
            if (f.type === 'repeatableList' || f.type === 'measurementGrid' || f.type === 'imageGallery') {
              // A table no longer carries its own name (see field-value.tsx),
              // and a gallery never did, so both are labelled here — but only
              // when the section holds more than this one field. A section whose whole content IS the table is
              // already named by its own header, and labelling it again is the
              // doubled "ELEMENTS / ELEMENTS" this change exists to remove.
              const named = sectionFields(section).filter(canRead).length > 1;
              return (
                <div key={name} style={{ marginTop: 10, marginBottom: 8 }}>
                  {named ? (
                    <div style={{ fontSize: 11, fontWeight: 700, color: '#9a9284', marginBottom: 4 }}>{f.label}</div>
                  ) : null}
                  {fieldValueOrLink(f, row)}
                </div>
              );
            }
            // Richtext is a BLOCK, not a row: fieldValueOrLink would hand back
            // the 140-character plain-text preview it renders for table cells,
            // losing the formatting and every image. The other two detail
            // layouts already special-case this; the accordion did not, so any
            // section holding a remarks/description field was quietly showing a
            // truncated stub (found 2026-09-01 moving Product's Description and
            // Style Guide into a section of their own).
            if (f.type === 'richtext') {
              if (!row[f.name]) return null;
              return (
                <div key={name} style={{ padding: '8px 0', borderBottom: '0.5px solid rgba(33,31,28,0.08)' }}>
                  <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase', color: '#9a9284', marginBottom: 6 }}>{f.label}</div>
                  <RichTextValue html={row[f.name]} />
                </div>
              );
            }
            return (
              <div key={name} style={{ display: 'flex', gap: 12, padding: '8px 0', fontSize: 13.5, borderBottom: '0.5px solid rgba(33,31,28,0.08)' }}>
                <div style={{ width: 120, flexShrink: 0, color: '#9a9284' }}>{f.label}</div>
                {/* pre-wrap for textarea only: a typed-in paragraph keeps the
                    line breaks it was written with, the way it did when these
                    fields rendered as full-width blocks above the accordion. */}
                <div style={{ color: '#211f1c', fontWeight: 400, flex: 1, minWidth: 0, whiteSpace: f.type === 'textarea' ? 'pre-wrap' : undefined }}>{fieldValueOrLink(f, row)}</div>
              </div>
            );
          })}
        </DetailSection>
      ))}
    </>
  );
}

export function ResourceDetailBody({ config, row, refreshKey, helpers }: { config: ResourceConfig; row: any; refreshKey: number; helpers: Helpers }) {
  // Field-level READ limits for this role, resolved BEFORE any early return —
  // usePermissions is a hook, and renderDetail bails out on the next line.
  // The server already strips these fields from the payload; this stops the
  // screen drawing empty labels where they used to be.
  const { perm } = usePermissions();
  const readFilter = viewableFieldFilter(perm, aclViewKeyOf(config));
  const canRead = (name: string) => (readFilter ? readFilter(name) : true);

  if (config.renderDetail) return <>{config.renderDetail(row, { refreshKey, helpers })}</>;

  // Simple resources (no showSections) get every show-field flat, matching
  // ResourceShow's plain Descriptions fallback.
  if (!config.showSections) {
    const simpleFields = showFields(config).filter((f) => canRead(f.name));
    const cols = config.detailColumns;
    const pick = (names: string[], taken: Set<string>) =>
      names
        .map((n) => simpleFields.find((f) => f.name === n))
        .filter((f): f is FieldConfig => !!f && !taken.has(f.name))
        .map((f) => { taken.add(f.name); return f; });
    const claimed = new Set<string>();
    const leftCol = cols ? pick(cols.left, claimed) : [];
    const rightCol = cols ? pick(cols.right, claimed) : [];
    const restFields = cols ? simpleFields.filter((f) => !claimed.has(f.name)) : simpleFields;

    const fieldRow = (f: FieldConfig) => (
      <div key={f.name} style={{ display: 'flex', gap: 12, padding: '8px 0', fontSize: 13.5, borderBottom: '0.5px solid rgba(33,31,28,0.08)' }}>
        <div style={{ width: 120, flexShrink: 0, color: '#9a9284' }}>{f.label}</div>
        <div style={{ color: '#211f1c', fontWeight: 400, flex: 1, minWidth: 0 }}>
          {f.type === 'richtext' ? <RichTextValue html={row[f.name]} /> : fieldValueOrLink(f, row)}
        </div>
      </div>
    );

    return (
      <div>
        {/* Same both-layouts reasoning as detailExtra below. */}
        {config.detailNotice?.(row)}
        {cols && (leftCol.length > 0 || rightCol.length > 0) && (
          <>
            <style>{'.kano-detail-cols{display:block;}.kano-detail-media{margin-bottom:12px;}@media(min-width:720px){.kano-detail-cols{display:flex;gap:28px;align-items:flex-start;}.kano-detail-cols>div{flex:1;min-width:0;}.kano-detail-cols>.kano-detail-media{flex:0 0 auto;width:150px;margin-bottom:0;}}'}</style>
            <div className="kano-detail-cols">
              {cols.media && <div className="kano-detail-media">{cols.media(row)}</div>}
              <div>{leftCol.map(fieldRow)}</div>
              <div>{rightCol.map(fieldRow)}</div>
            </div>
          </>
        )}
        {restFields.map(fieldRow)}
        {/* detailExtra belongs to BOTH layouts. It used to hang off the rich
            one only, so a simple resource could set it and silently get
            nothing — which is exactly what Sewing Data's rate history did
            (2026-08-25). */}
        {config.detailExtra && <div style={{ marginTop: 16 }}>{config.detailExtra(row, helpers)}</div>}
      </div>
    );
  }

  const images = config.showGallery?.(row) ?? [];
  // A resource that defines showGallery always gets a hero slot — even with no
  // images, so a blank placeholder shows (e.g. Sample Variant: variant image →
  // sample image → blank).
  const wantsGallery = !!config.showGallery;
  const tag = config.showTag?.(row);
  const topFields = (config.showTopFields ?? []).filter(canRead).map((n) => config.fields.find((f) => f.name === n)).filter((f): f is FieldConfig => !!f);
  const hasDescription = config.fields.some((f) => f.name === 'description');
  const textFieldNames = config.showTextFields ?? (hasDescription ? ['description'] : []);
  const textFields = textFieldNames.filter(canRead).map((n) => config.fields.find((f) => f.name === n)).filter((f): f is FieldConfig => !!f);

  return (
    <div>
      {/* detailNotice used to render ONLY in the no-gallery layout below, so a
          resource with a hero image silently never got its notice — Product's
          naming-edit button among them. It belongs above the record either way. */}
      {wantsGallery && config.detailNotice?.(row)}
      {wantsGallery && (
        <>
          <style>{'.kano-detail-hero{display:block;}@media(min-width:640px){.kano-detail-hero{display:flex;gap:20px;align-items:flex-start;}.kano-detail-hero .kano-detail-gallery{width:220px;flex-shrink:0;}.kano-detail-hero .kano-detail-top{flex:1;min-width:0;}}'}</style>
          <div className="kano-detail-hero">
            <div className="kano-detail-gallery">
              {images.length > 0 ? (
                <ImageGallery images={images} aspectRatio={config.cardImageAspectRatio} />
              ) : (
                <div style={{ width: '100%', aspectRatio: config.cardImageAspectRatio || '2 / 3', borderRadius: 8, background: '#efebe3', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 40, color: '#cbd5e1' }}>👕</div>
              )}
            </div>
            <div className="kano-detail-top">
              {tag && <CategoryTag label={tag.label} color={tag.color} />}
              {topFields.map((f) => (
                <div key={f.name} style={{ display: 'flex', gap: 12, padding: '8px 0', fontSize: 13.5, borderBottom: '0.5px solid rgba(33,31,28,0.08)' }}>
                  <div style={{ width: 120, flexShrink: 0, color: '#9a9284' }}>{f.label}</div>
                  <div style={{ color: '#211f1c', fontWeight: 400 }}>{fieldValueOrLink(f, row)}</div>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
      {!wantsGallery && (
        <>
          {config.detailNotice?.(row)}
          {tag && <CategoryTag label={tag.label} color={tag.color} />}
          {topFields.map((f) => (
            <div key={f.name} style={{ display: 'flex', gap: 12, padding: '8px 0', fontSize: 13.5, borderBottom: '0.5px solid rgba(33,31,28,0.08)' }}>
              <div style={{ width: 120, flexShrink: 0, color: '#9a9284' }}>{f.label}</div>
              <div style={{ color: '#211f1c', fontWeight: 400 }}>{fieldValueOrLink(f, row)}</div>
            </div>
          ))}
        </>
      )}
      {textFields.map((f) => {
        const isListLike = f.type === 'measurementGrid' || f.type === 'repeatableList' || f.type === 'imageGallery';
        const itemsKey = f.type === 'imageGallery' ? f.imageGallery!.itemsField : f.name;
        const hasContent = isListLike ? (row[itemsKey]?.length ?? 0) > 0 : !!row[f.name];
        if (!hasContent) return null;
        return (
          <div key={f.name} style={{ marginTop: 16 }}>
            <div style={{ fontSize: 11.5, fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase', color: '#9a9284', marginBottom: 6 }}>
              {f.type === 'imageGallery' ? `${f.label} (${row[itemsKey]?.length ?? 0})` : f.label}
            </div>
            {f.type === 'richtext' ? (
              <RichTextValue html={row[f.name]} />
            ) : isListLike ? (
              fieldValueOrLink(f, row)
            ) : (
              <div style={{ fontSize: 14, lineHeight: 1.6, color: '#211f1c', whiteSpace: 'pre-wrap' }}>{row[f.name]}</div>
            )}
          </div>
        );
      })}
      {(config.showSections ?? []).length > 0 && (
        <div style={{ marginTop: 20 }}>
          <SectionsAccordion sections={config.showSections!} fields={config.fields} row={row} canRead={canRead} />
        </div>
      )}
      {config.detailExtra && <div style={{ marginTop: 16 }}>{config.detailExtra(row, helpers)}</div>}
    </div>
  );
}
