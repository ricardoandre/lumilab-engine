'use client';

import { useRef } from 'react';
import { useSelect } from '@refinedev/antd';
import type { CrudFilters } from '@refinedev/core';
import type { RelationConfig } from './resource-config';

// The one place a `relation`-typed field's option picker is wired to Refine's
// useSelect. Every form/filter picker in the engine goes through here so they
// all search the same way — three separate fixes over Refine's raw defaults:
//
// 1. SEARCH TEXT -> `q`. Refine's built-in search filters on the *label field*
//    name, and when `labelField` is a FUNCTION (e.g. users' `(u) => u.nickname
//    ?? u.email`) it falls back to a field literally called "title" — which no
//    route allowlists, so typing filtered nothing at all. We send the app's own
//    reserved `q` search filter instead (see filters.ts applySearch /
//    server-list.ts searchFields), which every picker route understands.
// 2. CLIENT-SIDE filterOption. Refine sets `filterOption: false` (server
//    search only), so on routes whose search can't cover a derived label the
//    typed text narrowed nothing on screen. Matching the loaded options'
//    labels locally means typing ALWAYS narrows the list, with the server
//    search bringing in matches from beyond the loaded page on top of that.
//
//    ...but it must not OVERRULE the server. Some routes match on fields that
//    never appear in the option's label — product-measurements searches its
//    linked products' codes and names, so typing a product name legitimately
//    returns a set called "A030001/02". Filtering those out locally made the
//    picker look like it had found nothing (Andre, 2026-08-19: "on the
//    measurement input -> can i search by product name?"). So the local filter
//    is skipped once the loaded options ARE the server's answer for exactly
//    this text — the server is the authority, local matching only covers the
//    keystrokes before its reply lands.
// 3. Page size. Refine asks for 10 options; a picker showing the first ten
//    rows of a table is useless. PICKER_PAGE_SIZE is the initial page — past
//    that, the `q` search is what reaches the rest of the rows, so this stays
//    modest on purpose (some picker routes, e.g. products, return heavy rows).
export const PICKER_PAGE_SIZE = 50;

function labelOf(relation: RelationConfig | undefined, item: any): string {
  if (!relation) return '';
  const { labelField } = relation;
  return typeof labelField === 'function' ? labelField(item) : item[labelField];
}

export function useRelationSelect(
  relation: RelationConfig | undefined,
  options?: {
    // Currently-selected id(s). Refine fetches these by id so a value outside
    // the loaded options page still renders as its label, not a raw id. Must
    // stay undefined (never null) when unset — useSelect still fires a
    // get-by-id for a null defaultValue, which 500s the route's BigInt(id).
    defaultValue?: any;
    // Appended to relation.filters — how a form-dependent picker narrows its
    // options (see RelationConfig.filtersFor).
    extraFilters?: { field: string; operator: 'eq' | 'in'; value: unknown }[];
    // Skip the options query entirely: the field this one depends on has no
    // value yet, so any answer would be the wrong list.
    disabled?: boolean;
  },
) {
  // The text last handed to the server (see note 2 above). Must be a ref: the
  // search reply re-renders the hook, and a plain closure variable would be
  // back to '' exactly when filterOption needs to know what was searched.
  const searched = useRef('');

  // The ids that are only in the option list because they are CURRENTLY
  // SELECTED — Refine fetches them by id for `defaultValue` so a pick outside
  // the loaded page still renders as its label. They are not part of any
  // server search answer, so the "server is the authority" bypass below must
  // not wave them through. See the filterOption note.
  const selectedIds = new Set(
    (Array.isArray(options?.defaultValue) ? options.defaultValue : [options?.defaultValue])
      .filter((v) => v !== undefined && v !== null)
      .map((v) => String(v)),
  );

  const { selectProps, query } = useSelect({
    // `relation` is optional (a plain repeatable row list has no picker at
    // all) — point at a harmless resource and disable the fetch rather than
    // calling the hook conditionally.
    resource: relation?.resource ?? 'collections',
    optionLabel: (item: any) => labelOf(relation, item),
    optionValue: (item: any) => item[relation?.valueField ?? 'id'],
    filters: [...(relation?.filters ?? []), ...(options?.extraFilters ?? [])] as CrudFilters,
    defaultValue: options?.defaultValue,
    queryOptions: { enabled: !!relation && !options?.disabled },
    pagination: { currentPage: 1, pageSize: PICKER_PAGE_SIZE },
    onSearch: (value: string): CrudFilters => {
      searched.current = value;
      return value ? [{ field: 'q', operator: 'contains', value }] : [];
    },
  });

  // Options that are shown but cannot be chosen (RelationConfig.optionDisabled).
  // Rebuilt from the RAW records, because selectProps.options carries only
  // {label,value} and the reason has to come from the record itself.
  const raw: any[] = (query?.data?.data as any[]) ?? [];
  const disabledOptions = relation?.optionDisabled
    ? (selectProps.options ?? []).map((opt: any) => {
        const record = raw.find((r) => String(r[relation.valueField ?? 'id']) === String(opt.value));
        const reason = record ? relation.optionDisabled!(record) : null;
        return reason ? { ...opt, label: `${opt.label} — ${reason}`, disabled: true } : opt;
      })
    : undefined;

  return {
    ...selectProps,
    ...(disabledOptions ? { options: disabledOptions } : {}),
    showSearch: true,
    // Order matters. A label that matches locally always shows. Otherwise the
    // server is trusted for text it has actually answered — EXCEPT for the
    // currently-selected ids, which reach the list by a separate by-id fetch
    // and were never part of that answer.
    //
    // Without that exception the bypass waved through every already-picked
    // row: searching a 628-option list for "FRILL" returned its 3 matches AND
    // every element already on the pattern, so on a pattern with a few pieces
    // the filter looked like it did nothing at all (Andre, 2026-09-01 — "it
    // doesnt show what is available, doesnt filter the list").
    filterOption: (input: string, option?: { label?: unknown; value?: unknown }) => {
      if (!input) return true;
      if (String(option?.label ?? '').toLowerCase().includes(input.toLowerCase())) return true;
      if (input !== searched.current) return false;
      return !selectedIds.has(String(option?.value));
    },
  };
}
