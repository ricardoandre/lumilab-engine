'use client';

import { useEffect, useState } from 'react';

// Client-side FieldOption lookup by fieldKey — THE shared way every dropdown,
// status picker, tab, and saved-filter across the app should read its options.
//
// Modelled on use-permissions.ts: a module-level cache + in-flight dedupe keyed
// by fieldKey. FieldOptions are near-static reference data (statuses, designers,
// sewing/pola PICs — edited a few times a year), so:
//   • many callers asking for the same key in one page load share ONE request
//     (the Production list alone used to fire ~16 field-options requests — every
//     saved filter re-fetched production.status uncached; now it's one per key);
//   • the result stays cached across client-side navigation, so revisiting a
//     list re-uses it with no network at all.
// The old per-file `fetch('/api/field-options?...')` copies (field-options-client,
// the production/*.tsx resources, the sample *-data loaders) all delegate here —
// so new code gets caching for free by calling getFieldOptions instead of fetch.

export interface FieldOption {
  id: string;
  fieldKey: string;
  value: string;
  label: string;
  color: string | null;
  sortOrder: number;
  isActive: boolean;
  userId: string | null;
}

const cache = new Map<string, FieldOption[]>();
const inflight = new Map<string, Promise<FieldOption[]>>();

// Options for one fieldKey. Resolves from the module cache when present, dedupes
// concurrent callers onto one request, and caches the result for the session.
export function getFieldOptions(fieldKey: string): Promise<FieldOption[]> {
  const hit = cache.get(fieldKey);
  if (hit) return Promise.resolve(hit);
  const pending = inflight.get(fieldKey);
  if (pending) return pending;

  const filters = encodeURIComponent(JSON.stringify([{ field: 'fieldKey', operator: 'eq', value: fieldKey }]));
  const p = fetch(`/api/field-options?filters=${filters}&pageSize=200`)
    .then((r) => (r.ok ? r.json() : { data: [] }))
    .then((j) => {
      const data: FieldOption[] = j.data ?? [];
      cache.set(fieldKey, data);
      inflight.delete(fieldKey);
      return data;
    })
    .catch(() => {
      // Don't poison the cache on a transient failure — let the next caller retry.
      inflight.delete(fieldKey);
      return [] as FieldOption[];
    });
  inflight.set(fieldKey, p);
  return p;
}

// Resolve a single option's id from its stable `value` code (for saved filters
// that compare against an id but only know the code). Supersedes the old
// findFieldOptionId in field-options-client.ts.
export async function findFieldOptionId(fieldKey: string, value: string): Promise<string | undefined> {
  return (await getFieldOptions(fieldKey)).find((o) => o.value === value)?.id;
}

// Reset the cache so the next read refetches — call on auth transitions (a new
// user may have a different active-option set) and after an admin edits options.
export function clearFieldOptionsCache(): void {
  cache.clear();
  inflight.clear();
}

// Hook form: load one or several fieldKeys at once, sharing the module cache.
// Returns options keyed by fieldKey and a `loaded` flag once all are resolved.
export function useFieldOptions(fieldKeys: string | string[]): {
  loaded: boolean;
  options: Record<string, FieldOption[]>;
} {
  const keys = Array.isArray(fieldKeys) ? fieldKeys : [fieldKeys];
  const keyStr = keys.join(',');
  const [options, setOptions] = useState<Record<string, FieldOption[]>>(() => {
    const seed: Record<string, FieldOption[]> = {};
    keys.forEach((k) => {
      const c = cache.get(k);
      if (c) seed[k] = c;
    });
    return seed;
  });

  useEffect(() => {
    let cancelled = false;
    Promise.all(keys.map((k) => getFieldOptions(k).then((d) => [k, d] as const))).then((pairs) => {
      if (cancelled) return;
      const next: Record<string, FieldOption[]> = {};
      pairs.forEach(([k, d]) => {
        next[k] = d;
      });
      setOptions(next);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [keyStr]);

  const loaded = keys.every((k) => options[k] !== undefined);
  return { loaded, options };
}
