'use client';

import type { ResourceConfig } from '../lib/resource-config';
import { ResourceListTable } from './ResourceListTable';
import { ResourceListCards } from './ResourceListCards';

// Dispatches to the table or card-grid renderer per config.viewMode.
// Table is the default (Task/TaskSchedule); cards is for image-heavy,
// tab/filter-driven resources like Product/Sample, modeled on the app
// owner's own already-approved ui_list_engine pattern.
export function ResourceList({ config }: { config: ResourceConfig }) {
  if (config.viewMode === 'cards') {
    return <ResourceListCards config={config} />;
  }
  return <ResourceListTable config={config} />;
}
