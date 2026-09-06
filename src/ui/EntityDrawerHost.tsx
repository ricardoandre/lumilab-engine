'use client';

// Global host for entity-link drawers. Mounted once in the protected layout so
// ANY page — a ListEngine list, a custom dashboard (Sample Dashboard/Workload),
// a report — that emits `emitOpenEntity(resource, id)` opens the target's own
// detail drawer. "One change everywhere": a link in the shared SampleDetailBody
// works the same whether it's shown from the Samples list or the dashboard.
// Chained entity→entity links replace the open drawer (the same setter).

import { useEffect, useState } from 'react';
import { onOpenEntity } from '../lib/entity-drawer-bus';
import { resolveEntityConfig } from '../lib/entity-registry';
import { EntityDrawer } from './EntityDrawer';
import type { ResourceConfig } from '../lib/resource-config';

export function EntityDrawerHost() {
  const [drawer, setDrawer] = useState<{ config: ResourceConfig; id: string } | null>(null);
  useEffect(
    () =>
      onOpenEntity((t) => {
        resolveEntityConfig(t.resource).then((config) => {
          if (config) setDrawer({ config, id: t.id });
        });
      }),
    [],
  );
  if (!drawer) return null;
  return <EntityDrawer config={drawer.config} id={drawer.id} open onClose={() => setDrawer(null)} />;
}
