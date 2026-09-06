'use client';

// "You have pending naming work" banner — shown on Product's own list page
// and on My Dashboard, not globally (a per-page opt-in, not layout-level).
// Checks Product's naming queue (namingStatusOptionId = pending, and the
// product's BRAND naming user = me — see Brand.namingUserId), the same set
// Product's "My Naming Task" saved filter matches. Links straight into that filtered view via ?sf= (see
// ListEngine's initialSavedFilterKey). Generalize the count logic (a list
// of {resource, savedFilterKey, ...} checks) if a second module needs the
// same treatment — one hardcoded check isn't worth an abstraction yet.

import { useEffect, useState } from 'react';
import { useGetIdentity } from '@refinedev/core';
import { findFieldOptionId } from '../lib/field-options-client';

export function usePendingNamingCount(): number {
  const { data: identity } = useGetIdentity<{ id?: string }>();
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (!identity?.id) return;
    let cancelled = false;
    findFieldOptionId('product.naming_status', 'pending').then((pendingId) => {
      if (!pendingId || cancelled) return undefined;
      const filters = [
        { field: 'namingStatusOptionId', operator: 'eq', value: pendingId },
        { field: 'namingUserId', operator: 'eq', value: identity.id },
      ];
      return fetch(`/api/products?pageSize=1&filters=${encodeURIComponent(JSON.stringify(filters))}`)
        .then((r) => (r.ok ? r.json() : null))
        .then((json) => { if (!cancelled && json) setCount(json.total ?? 0); });
    });
    return () => { cancelled = true; };
  }, [identity?.id]);

  return count;
}

export function PendingNamingBanner() {
  const count = usePendingNamingCount();
  if (!count) return null;

  return (
    <a
      href="/products?sf=my-naming-task"
      style={{
        display: 'block',
        background: '#e2e6ee',
        color: '#26344b',
        border: '1px solid #c9d3e0',
        borderRadius: 10,
        padding: '10px 16px',
        margin: '12px',
        fontSize: 13,
        fontWeight: 600,
        textDecoration: 'none',
        cursor: 'pointer',
      }}
    >
      You have {count} pending naming task{count === 1 ? '' : 's'} — click here to view.
    </a>
  );
}
