'use client';

// The Excel-like paste grid: a labelled header, an italic example row, numbered
// rows, and cells you can type into or paste a whole Excel selection across.
//
// Andre asked for this shape twice — first for the Production Result import
// ("v5", 2026-08-15: a grid instead of one big textarea, so it is obvious which
// column is which when copy-pasting), then for Set Stock (2026-09-01: "can you
// make the ui like the xls just like production result import"). So the second
// ask is served by extracting the SHAPE here rather than copying 90 lines of
// table markup into a second drawer.
//
// It owns the grid mechanics only — paste distribution, auto-grow, the row
// numbers — and knows nothing about what the columns MEAN. The caller declares
// its columns and receives the cell matrix back; serializing, validating and
// importing stay with the caller.
//
// ResultPasteImportPanel still has its own copy of this markup, including the
// dropdown columns this supports. Moving it over is a follow-up: it is heavily
// tuned (v3-v7, all Andre's), it works, and rewriting a live import to prove a
// point about duplication is a bad trade until someone is touching it anyway.

import type { ClipboardEvent } from 'react';

export interface PasteGridColumn {
  label: string;
  /** Italic example under the header — this is what makes the columns obvious. */
  hint?: string;
  width?: number;
  align?: 'left' | 'right';
  optional?: boolean;
  /** Renders a <select> instead of an input. Unknown pasted values are kept and tinted. */
  options?: string[];
  /** Monospace cell text — right for codes, wrong for prose. */
  mono?: boolean;
}

export interface PasteGridProps {
  columns: PasteGridColumn[];
  value: string[][];
  onChange: (grid: string[][]) => void;
  /** Rows kept blank at the bottom so there is always somewhere to type. */
  minRows?: number;
  // A pasted row whose cell count does not match the grid's. Excel sheets carry
  // columns this grid does not (a colour name between the code and the qty), and
  // dropping them positionally would silently put text in a number column. The
  // caller decides what its own sheet means; without one, cells land positionally.
  normalizeRow?: (cells: string[]) => string[];
}

export function emptyGrid(cols: number, rows: number): string[][] {
  return Array.from({ length: rows }, () => Array(cols).fill(''));
}

// Blank rows are dropped on the way out (the grid always carries spare rows), so
// emitted line N is NOT grid row N — `gridRows` keeps that mapping, which is what
// lets a result report say "grid row 12" instead of a line number nobody can find.
export function serializeGrid(grid: string[][]): { text: string; gridRows: number[] } {
  const gridRows: number[] = [];
  const lines: string[] = [];
  grid.forEach((row, i) => {
    if (!row.some((c) => c.trim() !== '')) return;
    gridRows.push(i + 1);
    lines.push(row.map((c) => c.trim()).join('\t'));
  });
  return { text: lines.join('\n'), gridRows };
}

export function gridIsEmpty(grid: string[][]): boolean {
  return !grid.some((row) => row.some((c) => c.trim() !== ''));
}

export function PasteGrid({ columns, value, onChange, minRows = 8, normalizeRow }: PasteGridProps) {
  const nCols = columns.length;
  const emptyRow = () => Array(nCols).fill('');

  function setCell(r: number, c: number, v: string) {
    const next = value.map((row) => row.slice());
    while (r >= next.length) next.push(emptyRow());
    next[r][c] = v;
    // Always keep one spare row at the bottom.
    if (next[next.length - 1].some((cell) => cell.trim() !== '')) next.push(emptyRow());
    onChange(next);
  }

  function handlePaste(e: ClipboardEvent, startR: number, startC: number) {
    const text = e.clipboardData.getData('text/plain');
    // A single value is an ordinary paste — let onChange handle it.
    if (!text || (!text.includes('\t') && !text.includes('\n'))) return;
    e.preventDefault();
    const pasted = text
      .replace(/\r\n?/g, '\n')
      .replace(/\n$/, '')
      .split('\n')
      .map((l) => l.split('\t'));
    const next = value.map((row) => row.slice());
    pasted.forEach((rawRow, ri) => {
      const r = startR + ri;
      while (r >= next.length) next.push(emptyRow());
      // Only normalize a paste that starts in the first column: a paste into the
      // middle of the grid is a positional patch of those cells, not a sheet.
      const cells = normalizeRow && startC === 0 ? normalizeRow(rawRow) : rawRow;
      cells.forEach((val, ci) => {
        const c = startC + ci;
        if (c < nCols) next[r][c] = val;
      });
    });
    if (next[next.length - 1].some((c) => c.trim() !== '')) next.push(emptyRow());
    onChange(next);
  }

  const rows = value.length >= minRows ? value : [...value, ...emptyGrid(nCols, minRows - value.length)];

  return (
    <div style={{ overflowX: 'auto', border: '1px solid #e8e8e8', borderRadius: 6 }}>
      <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 12, tableLayout: 'fixed' }}>
        <colgroup>
          <col style={{ width: 34 }} />
          {columns.map((c) => (
            <col key={c.label} style={{ width: c.width }} />
          ))}
        </colgroup>
        <thead>
          <tr>
            <th style={{ background: '#f1f5f9', borderBottom: '2px solid #cbd5e1', borderRight: '1px solid #e2e8f0', padding: '6px 4px' }} />
            {columns.map((c) => (
              <th
                key={c.label}
                style={{ background: '#f1f5f9', borderBottom: '2px solid #cbd5e1', borderRight: '1px solid #e2e8f0', padding: '7px 8px', textAlign: 'left', fontWeight: 600, fontSize: 11, color: '#334155', whiteSpace: 'nowrap' }}
              >
                {c.label}
                {c.optional && <span style={{ color: '#94a3b8', fontWeight: 400 }}> (opt)</span>}
              </th>
            ))}
          </tr>
          <tr>
            <th style={{ background: '#fafafa', borderBottom: '1px solid #e2e8f0', borderRight: '1px solid #e2e8f0' }} />
            {columns.map((c) => (
              <th
                key={c.label}
                style={{ background: '#fafafa', borderBottom: '1px solid #e2e8f0', borderRight: '1px solid #e2e8f0', padding: '3px 8px', textAlign: 'left', fontWeight: 400, fontSize: 10, color: '#b0b6be', fontStyle: 'italic', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}
              >
                {c.hint ? `e.g. ${c.hint}` : ''}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, r) => (
            <tr key={r}>
              <td style={{ background: '#f8fafc', borderBottom: '1px solid #f0f0f0', borderRight: '1px solid #e2e8f0', textAlign: 'center', color: '#b0b6be', fontSize: 10, userSelect: 'none' }}>
                {r + 1}
              </td>
              {columns.map((c, ci) => {
                const raw = row[ci] ?? '';
                const unknown = !!c.options && raw.trim() !== '' && !c.options.some((o) => o.toLowerCase() === raw.trim().toLowerCase());
                return (
                  <td key={ci} style={{ borderBottom: '1px solid #f0f0f0', borderRight: '1px solid #f0f0f0', padding: 0 }}>
                    {c.options ? (
                      <select
                        value={c.options.find((o) => o.toLowerCase() === raw.trim().toLowerCase()) ?? raw}
                        onChange={(e) => setCell(r, ci, e.target.value)}
                        title={unknown ? `"${raw}" isn't a known ${c.label} — pick the right one` : undefined}
                        style={{ width: '100%', border: 'none', outline: 'none', padding: '6px 8px', fontSize: 12, background: unknown ? '#fffbeb' : 'transparent', color: unknown ? '#b45309' : 'inherit', cursor: 'pointer' }}
                      >
                        <option value="">—</option>
                        {c.options.map((o) => (
                          <option key={o} value={o}>{o}</option>
                        ))}
                        {unknown && <option value={raw}>{raw} (not in list)</option>}
                      </select>
                    ) : (
                      <input
                        value={raw}
                        onChange={(e) => setCell(r, ci, e.target.value)}
                        onPaste={(e) => handlePaste(e, r, ci)}
                        style={{
                          width: '100%', border: 'none', outline: 'none', padding: '6px 8px', fontSize: 12,
                          background: 'transparent', textAlign: c.align ?? 'left',
                          fontFamily: c.mono ? 'ui-monospace, SFMono-Regular, Menlo, monospace' : 'inherit',
                        }}
                      />
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
