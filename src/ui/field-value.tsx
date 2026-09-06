'use client';

import type { FieldConfig } from '../lib/resource-config';
import { StatusPill } from './StatusPill';
import { UserBadge } from './UserBadge';
import { emitOpenEntity } from '../lib/entity-drawer-bus';
import { thumbUrl, thumbForKey } from '../lib/file-url';

// Shared "how do I turn this field into a display value" logic, used by both
// ResourceList (table cells) and ResourceShow (detail rows) so the two never
// drift apart on formatting.

function relationDisplayKey(field: FieldConfig): string {
  // Convention: "ownerId" -> "owner" (matches Prisma `include` shape from our API routes)
  return field.relation?.displayKey ?? field.name.replace(/Id$/, '');
}

// "Aug 16" — matches the approved Ledger mockup (short month + day, no year;
// this is an internal operations tool where the year is rarely ambiguous).
function shortDate(value: string | Date): string {
  return new Date(value).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function relationColumnLabel(col: { name: string; relation?: FieldConfig['relation'] }, row: any): string {
  const related = row[col.name.replace(/Id$/, '')];
  if (!related) return '—';
  const labelField = col.relation?.labelField;
  if (typeof labelField === 'function') return labelField(related);
  if (typeof labelField === 'string') return related[labelField] ?? '—';
  return '—';
}

export function renderFieldValue(field: FieldConfig, record: any, opts?: { pillSize?: 'small' | 'default' }): React.ReactNode {
  if (!record) return '-';

  // A field that draws itself wins over every built-in type below.
  if (field.render) return field.render(record);

  if (field.type === 'image') {
    const related = record[relationDisplayKey(field)];
    if (!related?.storageKey) return '-';
    return (
      // 64x96 on screen, so a 200px thumbnail rather than the full ~410 KB
      // upload (Andre, 2026-08-17 — nothing was using thumbnails).
      <img
        src={thumbForKey(related.storageKey, 200)}
        alt=""
        style={{ width: 64, height: 96, objectFit: 'cover', borderRadius: 4, border: '1px solid #e7e2d9' }}
      />
    );
  }

  if (field.type === 'imageGallery') {
    const { itemsField, urlOf, captionOf, tileSize, tileAspectRatio, linkResource } = field.imageGallery!;
    const items: any[] = record[itemsField] ?? [];
    if (!items.length) return '-';
    const size = tileSize ?? 64;
    const ratio = tileAspectRatio ?? '1 / 1';
    return (
      <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
        {items.map((item, i) => {
          // Gallery tiles are `size` px wide (default 64) — never worth the
          // full-resolution file. thumbUrl leaves external/pre-parameterised
          // urls alone.
          const src = thumbUrl(urlOf(item), size > 200 ? 400 : 200);
          const clickable = !!linkResource && item.id != null;
          return (
          <div
            key={item.id ?? i}
            style={{ width: size, cursor: clickable ? 'pointer' : undefined }}
            onClick={clickable ? () => emitOpenEntity(linkResource!, item.id) : undefined}
          >
            {src ? (
              <img
                src={src}
                alt=""
                style={{ width: size, aspectRatio: ratio, objectFit: 'cover', borderRadius: 4, border: '1px solid #e7e2d9', display: 'block' }}
              />
            ) : (
              <div
                style={{
                  width: size, aspectRatio: ratio, borderRadius: 4, border: '1px solid #e7e2d9',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: size * 0.3, background: '#f9fafb', color: '#9ca3af',
                }}
              >
                👕
              </div>
            )}
            {captionOf && (
              <div style={{ marginTop: 6, fontSize: 12, fontWeight: 700, color: '#111827', textAlign: 'center' }}>
                {captionOf(item)}
              </div>
            )}
          </div>
          );
        })}
      </div>
    );
  }

  if (field.type === 'repeatableList') {
    const rows: any[] = record[field.name] ?? [];
    const { columns, itemLabel } = field.repeatableList!;
    const cols = columns ?? [];
    const cellText = (col: NonNullable<typeof columns>[number], row: any) =>
      col.type === 'relation'
        ? relationColumnLabel(col, row)
        : col.type === 'date'
          ? (row[col.name] ? new Date(row[col.name]).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—')
          : row[col.name] != null ? row[col.name] : '—';
    // Quantities and prices read right-aligned; a name, a status or a date reads
    // left. Same split the flex layout used before, kept so nothing shifts side
    // in the screens that were already fine.
    const numericColumn = (col: NonNullable<typeof columns>[number]) => col.type !== 'relation' && col.type !== 'date';

    // No itemLabel (e.g. Collection Checkpoints): render a compact,
    // left-aligned table. The section header already names the list, so we
    // don't repeat field.label as an empty leading column — that's what made
    // the values sprawl to the far right of a wide drawer.
    if (!itemLabel) {
      return (
        <table style={{ borderCollapse: 'collapse', fontSize: 12.5 }}>
          <thead>
            <tr>
              {cols.map((col) => (
                <th
                  key={col.name}
                  style={{ textAlign: 'left', padding: '4px 28px 4px 0', color: '#9a9284', fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', whiteSpace: 'nowrap' }}
                >
                  {col.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {!rows.length && (
              <tr><td colSpan={cols.length || 1} style={{ color: '#9a9284', padding: '3px 0' }}>-</td></tr>
            )}
            {rows.map((row, i) => (
              <tr key={row.id ?? i}>
                {cols.map((col) => (
                  <td key={col.name} style={{ color: '#726c63', padding: '3px 28px 3px 0', whiteSpace: 'nowrap' }}>
                    {cellText(col, row)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      );
    }

    // itemLabel present (Materials/Variants/pattern pieces): the item's name,
    // then its value columns — the SAME compact table as above, for the same
    // two reasons (Andre, 2026-08-28: "Elements and Approval Checklist is
    // repeated twice ... qty and status is too far away").
    //
    // The name of the list is the caller's job, never drawn here: the detail
    // prints a heading above every list it shows, so a `field.label` header
    // cell could only ever repeat it — which is what put ELEMENTS on the screen
    // twice.
    //
    // And the table takes only the width it needs. The old flex row gave the
    // item name `flex: 1`, so on a wide drawer the value was flung to the far
    // edge and "PEPING" and its "1" ended up 600px apart.
    return (
      // Many columns on a narrow phone scroll the table, never the page.
      <div style={{ overflowX: 'auto' }}>
        <table style={{ borderCollapse: 'collapse', fontSize: 12.5 }}>
          <thead>
            <tr>
              {/* Deliberately empty — the heading above names this column. */}
              <th style={{ padding: '4px 28px 4px 0' }} />
              {cols.map((col) => (
                <th
                  key={col.name}
                  style={{
                    padding: '4px 28px 4px 0', color: '#9a9284', fontSize: 10.5, fontWeight: 700,
                    textTransform: 'uppercase', letterSpacing: '0.04em', whiteSpace: 'nowrap',
                    textAlign: numericColumn(col) ? 'right' : 'left',
                  }}
                >
                  {col.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {!rows.length && (
              <tr><td colSpan={cols.length + 1} style={{ color: '#9a9284', padding: '3px 0' }}>-</td></tr>
            )}
            {rows.map((row, i) => (
              <tr key={row.id ?? i}>
                {/* The only cell allowed to wrap: a piece name can be long, and
                    wrapping it beats scrolling the whole table sideways. */}
                <td style={{ fontWeight: 600, color: '#211f1c', padding: '3px 28px 3px 0' }}>{itemLabel(row)}</td>
                {cols.map((col) => (
                  <td
                    key={col.name}
                    style={{
                      color: '#726c63', padding: '3px 28px 3px 0', whiteSpace: 'nowrap',
                      textAlign: numericColumn(col) ? 'right' : 'left',
                    }}
                  >
                    {cellText(col, row)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  if (field.type === 'numberList') {
    const nums: number[] = (record[field.name] ?? []).filter((n: unknown): n is number => typeof n === 'number');
    if (!nums.length) return '-';
    const { unit } = field.numberList!;
    const total = nums.reduce((a, b) => a + b, 0);
    return (
      <span>
        {nums.map((n) => n.toLocaleString()).join(' · ')}
        <span style={{ color: '#9a9284' }}>
          {'  '}({nums.length} roll{nums.length === 1 ? '' : 's'}, total{' '}
          <strong style={{ color: '#211f1c' }}>{total.toLocaleString()}{unit ? ` ${unit}` : ''}</strong>)
        </span>
      </span>
    );
  }

  if (field.type === 'measurementGrid') {
    const rows: any[] = record[field.name] ?? [];
    if (!rows.length) return '-';
    // Read-only display only — show columns that actually have a value on
    // at least one row, so a detail view isn't 20 mostly-empty columns wide.
    // The editable form (MeasurementGridField) still shows every column,
    // since a blank column there is "not filled in yet", not "irrelevant".
    const columns = field.measurementGrid!.columns.filter((c) => rows.some((r) => r[c.name] != null));
    const { rowLabel } = field.measurementGrid!;
    return (
      <div style={{ overflowX: 'auto' }}>
        <table style={{ borderCollapse: 'collapse', fontSize: 12 }}>
          <thead>
            <tr>
              <th style={{ textAlign: 'left', padding: '4px 8px', color: '#9a9284', fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', whiteSpace: 'nowrap' }}>Size</th>
              {columns.map((c) => (
                <th key={c.name} style={{ textAlign: 'right', padding: '4px 8px', color: '#9a9284', fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', whiteSpace: 'nowrap' }}>
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={row.id ?? i}>
                <td style={{ padding: '3px 8px', fontWeight: 600, whiteSpace: 'nowrap' }}>{rowLabel(row)}</td>
                {columns.map((c) => (
                  <td key={c.name} style={{ padding: '3px 8px', textAlign: 'right', color: '#726c63', whiteSpace: 'nowrap' }}>
                    {row[c.name] != null ? row[c.name] : '—'}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  if (field.type === 'relation') {
    const displayKey = relationDisplayKey(field);
    const related = record[displayKey];
    if (!related) return '-';
    const { labelField, colorField, avatar } = field.relation!;
    // A multiSelect relation's display value is an ARRAY of related rows (the
    // API flattens the join for it, e.g. KOL's `tags`) — render one pill each
    // rather than the single-value path below, which would print "[object]".
    if (field.relation!.multiSelect && Array.isArray(related)) {
      if (!related.length) return '-';
      return (
        <span style={{ display: 'inline-flex', gap: 4, flexWrap: 'wrap' }}>
          {related.map((r: any, i: number) => {
            const text = typeof labelField === 'function' ? labelField(r) : r[labelField];
            return field.tagColored ? (
              <StatusPill key={r.id ?? i} label={text ?? '-'} color={colorField ? r[colorField] : undefined} size={opts?.pillSize} />
            ) : (
              <span key={r.id ?? i}>{text ?? '-'}{i < related.length - 1 ? ',' : ''}</span>
            );
          })}
        </span>
      );
    }
    const label = typeof labelField === 'function' ? labelField(related) : related[labelField];
    if (field.tagColored) {
      return <StatusPill label={label ?? '-'} color={colorField ? related[colorField] : undefined} size={opts?.pillSize} />;
    }
    if (avatar && label) {
      return <UserBadge name={label} />;
    }
    return label ?? '-';
  }

  const value = record[field.name];
  if (value === null || value === undefined || value === '') return '-';

  if (field.type === 'select') {
    const opt = field.options?.find((o) => o.value === value);
    const label = opt?.label ?? value;
    if (field.tagColored) return <StatusPill label={label} color={opt?.color} size={opts?.pillSize} />;
    return label;
  }

  if (field.type === 'boolean') {
    return value ? 'Yes' : 'No';
  }

  if (field.type === 'number') {
    // Group thousands for readability (e.g. 8000000 -> "8,000,000"), keeping
    // any decimals as-is. Same treatment numberList already gives its values.
    const n = typeof value === 'number' ? value : Number(value);
    return Number.isFinite(n) ? n.toLocaleString('en-US') : String(value);
  }

  if (field.type === 'date') {
    return field.showYear
      ? new Date(value).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
      : shortDate(value);
  }

  if (field.type === 'datetime') {
    return field.showYear
      ? new Date(value).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
      : shortDate(value);
  }

  if (field.type === 'richtext') {
    // Table cells/generic contexts get a plain-text preview, never raw HTML
    // tags or dangerouslySetInnerHTML — the full sanitized render lives in
    // RichTextValue, used explicitly by ResourceShow's detail layouts.
    const text = String(value).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    if (!text) return '-';
    return text.length > 140 ? `${text.slice(0, 140)}…` : text;
  }

  return String(value);
}
