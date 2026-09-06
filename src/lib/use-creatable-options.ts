'use client';

import { useState } from 'react';
import { App } from 'antd';
import type { RelationConfig } from './resource-config';

// "Add the option you're missing, from inside the picker" — the client half of
// RelationConfig.allowCreate. Shared by the repeatable-list row picker
// (Pattern's elements) and the ordinary relation Select (KOL's tags), so the
// two can't drift.
//
// Options created here are REAL rows the moment the endpoint answers; this
// state only spares the picker a full refetch to see the one it just made.
export function useCreatableOptions(relation: RelationConfig | undefined) {
  const [extra, setExtra] = useState<{ label: string; value: string }[]>([]);
  const [busy, setBusy] = useState(false);
  // Bound instance from App.useApp() — the static antd `message` no-ops under
  // React 19, so a failure told this way would be as invisible as no message.
  const { message } = App.useApp();

  async function create(label: string): Promise<string | null> {
    const endpoint = relation?.allowCreate?.endpoint;
    if (!endpoint || !label.trim()) return null;
    setBusy(true);
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ label: label.trim() }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        // Say why. This returned null in silence until 2026-09-01, so a role
        // without permission to add (the pattern team, on the wrong ACL gate)
        // saw the button do nothing at all and had nothing to report but "it
        // doesn't work" — which is how it stayed broken.
        message.error(
          res.status === 403
            ? 'You do not have permission to add to this list.'
            : String(json?.error ?? 'Could not add that. Please try again.'),
        );
        return null;
      }
      const option = { label: String(json.label), value: String(json.id) };
      setExtra((prev) => (prev.some((o) => o.value === option.value) ? prev : [...prev, option]));
      return option.value;
    } catch {
      message.error('Could not reach the server. Please try again.');
      return null;
    } finally {
      setBusy(false);
    }
  }

  // Merge the just-created options into the picker's own list, WITHOUT
  // duplicating. The locally-added copy exists only to spare a refetch, but the
  // server starts returning the same option as soon as it reloads — and the two
  // copies then sit side by side in the dropdown, which reads as "it added my
  // element twice" (Andre, 2026-08-28). Keyed by value, server copy wins.
  function merge(serverOptions: { label: string; value: string }[] | undefined) {
    const byValue = new Map<string, { label: string; value: string }>();
    for (const o of extra) byValue.set(String(o.value), o);
    for (const o of serverOptions ?? []) byValue.set(String(o.value), o);
    return [...byValue.values()];
  }

  return { extra, busy, create, merge };
}
