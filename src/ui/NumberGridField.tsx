'use client';

// numberList in GRID mode — the Excel-like way to key in a delivery's roll
// quantities. Andre, 2026-09-04 (Fabric In): "roll pack quantity — xls format
// when user can just key in and tab".
//
// The column-of-InputNumbers version (NumberListField) needs an "Add roll"
// click per roll, and a fabric delivery is 20-40 of them. This renders the
// SAME value as a PasteGrid instead: numbered rows, one quantity cell each, a
// spare row always waiting at the bottom, Tab to move down, and a whole column
// pasted straight out of Excel.
//
// It owns a STRING grid in local state rather than deriving one from the
// numbers on every keystroke: "1." and "0.5" are both un-representable as a
// number mid-typing, and re-deriving would rewrite the cell under the cursor.
// The numbers are what leave the component; the strings are what is being typed.

import { useEffect, useRef, useState } from 'react';
import { PasteGrid, emptyGrid } from './PasteGrid';
import type { NumberListConfig } from '../lib/resource-config';

const MIN_ROWS = 8;
const MUTED = '#726c63';

function toGrid(values: (number | null)[]): string[][] {
  const rows = (values ?? []).map((v) => [v == null ? '' : String(v)]);
  return rows.length ? rows : emptyGrid(1, MIN_ROWS);
}

// A cell is a quantity or it is nothing: blank rows are the grid's own spare
// rows and are dropped, and a row that isn't a number is COUNTED (reported
// under the grid) rather than silently thrown away or saved as 0.
function readGrid(grid: string[][]): { values: number[]; bad: number } {
  const values: number[] = [];
  let bad = 0;
  for (const row of grid) {
    const text = (row[0] ?? '').trim();
    if (text === '') continue;
    const n = Number(text.replace(',', '.'));
    if (Number.isFinite(n)) values.push(n);
    else bad += 1;
  }
  return { values, bad };
}

export function NumberGridField({ value, onChange, config }: {
  value?: (number | null)[];
  onChange?: (rows: (number | null)[]) => void;
  config: NumberListConfig;
}) {
  const { unit, columnLabel, hint } = config;
  const [grid, setGrid] = useState<string[][]>(() => toGrid(value ?? []));
  // What we last handed upward, so an echo of our own onChange doesn't reseed
  // the grid (and wipe a half-typed cell) — only a value from ELSEWHERE does,
  // e.g. the record arriving when the edit drawer finishes loading.
  const emitted = useRef<string>(JSON.stringify(readGrid(toGrid(value ?? [])).values));

  useEffect(() => {
    const incoming = JSON.stringify(value ?? []);
    if (incoming === emitted.current) return;
    setGrid(toGrid(value ?? []));
    emitted.current = incoming;
  }, [value]);

  function update(next: string[][]) {
    setGrid(next);
    const { values } = readGrid(next);
    emitted.current = JSON.stringify(values);
    onChange?.(values);
  }

  const { values, bad } = readGrid(grid);
  const total = values.reduce((a, b) => a + b, 0);

  return (
    <div>
      <PasteGrid
        columns={[{ label: columnLabel ?? 'Quantity', hint: hint ?? '40', align: 'right' }]}
        value={grid}
        onChange={update}
        minRows={MIN_ROWS}
      />
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 6, fontSize: 12.5, color: MUTED }}>
        <span>
          {bad > 0 && (
            <span style={{ color: '#b45309' }}>
              {bad} row{bad === 1 ? '' : 's'} not a number — ignored
            </span>
          )}
        </span>
        <span>
          {values.length} roll{values.length === 1 ? '' : 's'} · total{' '}
          <strong style={{ color: '#211f1c' }}>
            {total.toLocaleString()}
            {unit ? ` ${unit}` : ''}
          </strong>
        </span>
      </div>
    </div>
  );
}
