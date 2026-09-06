// Syncs an ImageGalleryField's submitted array against a real join table
// (parentId, attachmentId — no extra columns, unlike product-sync.ts's
// row-based syncs). The diff itself is the generic join-table sync in
// link-sync.ts; this just unwraps the gallery items to attachment ids.

import { syncLinkTable } from './link-sync';

export async function syncImageGallery(
  delegate: { findMany: (...args: any[]) => Promise<any[]>; deleteMany: (...args: any[]) => Promise<any>; create: (...args: any[]) => Promise<any> },
  parentIdField: string,
  parentId: bigint,
  items: any[] | undefined,
) {
  if (items === undefined) return;
  await syncLinkTable(delegate, parentIdField, parentId, 'attachmentId', items.map((i) => i?.attachmentId ?? i));
}
