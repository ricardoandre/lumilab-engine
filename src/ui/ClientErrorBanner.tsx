'use client';

// The "can we know?" half of client-error reporting.
//
// Recording a problem is useless if nobody looks at the table, so the count
// comes to the top of the dashboard instead. Admin-only, and invisible when
// there is nothing wrong — a banner that is always there stops being read.

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useSession } from 'next-auth/react';

export function ClientErrorBanner() {
  const { data: session } = useSession();
  const isAdmin = !!session?.user?.isAdmin;
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (!isAdmin) return;
    let alive = true;
    fetch('/api/client-errors/count')
      .then((r) => (r.ok ? r.json() : { count: 0 }))
      .then((d) => { if (alive) setCount(Number(d?.count) || 0); })
      .catch(() => {});
    return () => { alive = false; };
  }, [isAdmin]);

  if (!isAdmin || count < 1) return null;

  return (
    <Link
      href="/client-errors"
      style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
        border: '1px solid #fecaca', background: '#fef2f2', borderRadius: 10,
        padding: '10px 14px', marginBottom: 12, textDecoration: 'none',
      }}
    >
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: '#b91c1c' }}>
          {count === 1 ? '1 problem hit a real user' : `${count} problems hit real users`}
        </div>
        <div style={{ fontSize: 12, color: '#7f1d1d' }}>In the last 24 hours. Tap to see what broke.</div>
      </div>
      <span style={{ flexShrink: 0, fontSize: 18, color: '#b91c1c' }}>›</span>
    </Link>
  );
}
