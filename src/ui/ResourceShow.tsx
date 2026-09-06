'use client';

import { useState } from 'react';
import { Show } from '@refinedev/antd';
import { useShow } from '@refinedev/core';
import { Descriptions } from 'antd';
import type { ResourceConfig } from '../lib/resource-config';
import { showFields, aclViewKeyOf } from '../lib/resource-config';
import { usePermissions, viewableFieldFilter } from '../lib/use-permissions';
import { renderFieldValue } from './field-value';
import { ShowActions } from './ShowActions';
import { ImageGallery } from './ImageGallery';
import { DetailSection, ExpandAllToggle } from './DetailSection';
import { RichTextValue } from './RichTextValue';
import { pillColor } from '../lib/pill-colors';

export function ResourceShow({ config }: { config: ResourceConfig }) {
  const { query } = useShow({ resource: config.name });
  const record: any = query?.data?.data;
  // Read limits for the plain fallback layout below — RichShow resolves its
  // own for the accordion layout. Both mirror the drawer (ResourceDetailBody).
  const { perm } = usePermissions();
  const readFilter = viewableFieldFilter(perm, aclViewKeyOf(config));

  return (
    <Show
      isLoading={query?.isFetching}
      title={config.label}
      headerButtons={record && !config.readOnly ? <ShowActions resource={config.name} record={record} moreActions={config.showActions?.(record)} /> : null}
    >
      {record && config.showSections ? (
        <RichShow config={config} record={record} />
      ) : (
        // column drops to 1 below the "sm" breakpoint so long values don't get squeezed on mobile
        <Descriptions column={{ xs: 1, sm: 1, md: 2 }} bordered size="small">
          {showFields(config).filter((f) => (readFilter ? readFilter(f.name) : true)).map((field) => (
            <Descriptions.Item key={field.name} label={field.label}>
              {field.type === 'richtext' ? <RichTextValue html={record?.[field.name]} /> : renderFieldValue(field, record)}
            </Descriptions.Item>
          ))}
        </Descriptions>
      )}
    </Show>
  );
}

function CategoryTag({ label, color }: { label: string; color?: string }) {
  const { fg } = pillColor(color);
  return (
    <span
      style={{
        display: 'inline-block', padding: '4px 14px', borderRadius: 999, border: `1px solid ${fg}`,
        color: fg, fontSize: 13, fontWeight: 600, marginBottom: 16,
      }}
    >
      {label}
    </span>
  );
}

function MetaRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', gap: 12, padding: '8px 0', fontSize: 13.5, borderBottom: '0.5px solid rgba(33,31,28,0.08)' }}>
      <div style={{ width: 110, flexShrink: 0, color: '#9a9284' }}>{label}</div>
      <div style={{ color: '#211f1c', fontWeight: 400 }}>{children}</div>
    </div>
  );
}

function RichShow({ config, record }: { config: ResourceConfig; record: any }) {
  // The same field-level READ limits the detail drawer applies (Andre,
  // 2026-09-01). This page had none, so a role denied a field in the drawer saw
  // it anyway by opening /<resource>/show/<id> — reachable from Material
  // Detail's usage list and from a Sample's variant links, not just by typing
  // the URL. The drawer and the show page have to agree about who sees what.
  const { perm } = usePermissions();
  const readFilter = viewableFieldFilter(perm, aclViewKeyOf(config));
  const canRead = (name: string) => (readFilter ? readFilter(name) : true);
  const sections = config.showSections!.filter(
    (sec) => sec.render || (sec.aclFields ?? sec.fields ?? []).some(canRead),
  );
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
  function toggleAll() {
    setOpenKeys(allOpen ? new Set() : new Set(sections.map((s) => s.key)));
  }

  const images = config.showGallery?.(record) ?? [];
  const tag = config.showTag?.(record);
  const topFields = (config.showTopFields ?? [])
    .filter(canRead)
    .map((name) => config.fields.find((f) => f.name === name))
    .filter((f): f is NonNullable<typeof f> => !!f);
  const hasDescriptionField = config.fields.some((f) => f.name === 'description');
  const textFieldNames = config.showTextFields ?? (hasDescriptionField ? ['description'] : []);
  const textFields = textFieldNames
    .filter(canRead)
    .map((name) => config.fields.find((f) => f.name === name))
    .filter((f): f is NonNullable<typeof f> => !!f);

  return (
    <div style={{ maxWidth: 640 }}>
      {images.length > 0 && <ImageGallery images={images} aspectRatio={config.cardImageAspectRatio} />}
      {tag && <CategoryTag label={tag.label} color={tag.color} />}

      {topFields.length > 0 && (
        <div style={{ marginBottom: 18 }}>
          {topFields.map((f) => (
            <MetaRow key={f.name} label={f.label}>{renderFieldValue(f, record)}</MetaRow>
          ))}
        </div>
      )}

      {textFields.map((f) => {
        // measurementGrid/repeatableList/imageGallery read from their own
        // relation array (e.g. record.variants), not record[f.name]
        // directly — a plain truthiness check on record[f.name] would
        // always be falsy for them.
        const isListLike = f.type === 'measurementGrid' || f.type === 'repeatableList' || f.type === 'imageGallery';
        const hasContent = isListLike
          ? (record[f.type === 'imageGallery' ? f.imageGallery!.itemsField : f.name]?.length ?? 0) > 0
          : !!record[f.name];
        if (!hasContent) return null;
        return (
          <div key={f.name} style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 11.5, fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase', color: '#9a9284', marginBottom: 6 }}>
              {f.type === 'imageGallery' ? `${f.label} (${record[f.imageGallery!.itemsField]?.length ?? 0})` : f.label}
            </div>
            {f.type === 'richtext' ? (
              <RichTextValue html={record[f.name]} />
            ) : isListLike ? (
              renderFieldValue(f, record)
            ) : (
              <div style={{ fontSize: 14, lineHeight: 1.6, color: '#211f1c', whiteSpace: 'pre-wrap' }}>
                {record[f.name]}
              </div>
            )}
          </div>
        );
      })}

      {sections.length > 0 && (
        <>
          <ExpandAllToggle allOpen={allOpen} onToggle={toggleAll} />
          {sections.map((section) => (
            <DetailSection key={section.key} label={section.label} color={section.color} open={openKeys.has(section.key)} onToggle={() => toggle(section.key)}>
              {/* Same escape hatch as the drawer's ResourceDetailBody: a
                  section with its own body renders that instead of fields. */}
              {section.render && section.render(record)}
              {!section.render && (section.fields ?? []).filter(canRead).map((name) => {
                const f = config.fields.find((x) => x.name === name);
                if (!f) return null;
                if (f.type === 'repeatableList' || f.type === 'measurementGrid' || f.type === 'imageGallery') {
                  // A table carries no name of its own (see field-value.tsx),
                  // and neither does a gallery, so both are labelled here —
                  // unless it is the section's only field,
                  // in which case the section header already names it. Same rule
                  // as ResourceDetailBody, which is the view people actually use.
                  const named = (section.fields ?? []).filter(canRead).length > 1;
                  return (
                    <div key={name} style={{ marginTop: 10, marginBottom: 8 }}>
                      {named ? (
                        <div style={{ fontSize: 11, fontWeight: 700, color: '#9a9284', marginBottom: 4 }}>{f.label}</div>
                      ) : null}
                      {renderFieldValue(f, record)}
                    </div>
                  );
                }
                // Richtext is a BLOCK here too — renderFieldValue would hand
                // back the plain-text table preview, dropping the formatting
                // and every image. Same fix as ResourceDetailBody's accordion;
                // the two section renderers have to agree or the drawer and
                // the show page disagree about the same field.
                if (f.type === 'richtext') {
                  if (!record[f.name]) return null;
                  return (
                    <div key={name} style={{ marginTop: 10, marginBottom: 8 }}>
                      <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase', color: '#9a9284', marginBottom: 6 }}>{f.label}</div>
                      <RichTextValue html={record[f.name]} />
                    </div>
                  );
                }
                return <MetaRow key={name} label={f.label}>{renderFieldValue(f, record)}</MetaRow>;
              })}
            </DetailSection>
          ))}
        </>
      )}
    </div>
  );
}
