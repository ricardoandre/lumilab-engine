// Thumbnail URLs for images served by /api/files/[storageKey].
//
// That route resizes and disk-caches on demand when given ?w=<allowlisted
// width> (see the route for why the widths are fixed). Everything that renders
// an image SMALL — a card tile, a gallery thumb, a list row's 64px preview —
// should ask for a width instead of pulling the full 1600px upload, which
// averages ~410 KB. Full size stays the default for show-page galleries and
// lightboxes, where the pixels are actually used.
//
// Client-safe: deliberately NOT in storage.ts, which imports `fs` and so can't
// be pulled into a client bundle.

// Keep in sync with THUMB_WIDTHS in src/app/api/files/[storageKey]/route.ts —
// an unlisted width is ignored by the route and silently serves the original.
export type ThumbWidth = 200 | 400 | 800;

/**
 * Adds ?w=<width> to one of our own /api/files URLs. Returns the url unchanged
 * when it is external (an ig/fb CDN url, say), already carries a query string
 * (so an explicit ?w= set by a caller is never doubled, and a signed url is
 * never corrupted), or is empty.
 */
export function thumbUrl(url: string | null | undefined, width: ThumbWidth): string | undefined {
  if (!url) return undefined;
  if (!url.startsWith('/api/files/')) return url;
  if (url.includes('?')) return url;
  return `${url}?w=${width}`;
}

/** Convenience for the common `storageKey -> small image url` case. */
export function thumbForKey(storageKey: string | null | undefined, width: ThumbWidth): string | undefined {
  return storageKey ? `/api/files/${storageKey}?w=${width}` : undefined;
}

// ---- full size ----
// The route serves a 400px copy by DEFAULT (Andre, 2026-08-17: thumbnail unless
// explicitly asked), so anything that genuinely needs the original pixels has to
// ask: detail-page galleries, and the photoshoot PDF export, which redraws the
// image into a canvas at print size.

/** Adds ?full=1 to one of our own /api/files urls; leaves anything else alone. */
export function fullUrl(url: string | null | undefined): string | undefined {
  if (!url) return undefined;
  if (!url.startsWith('/api/files/')) return url;
  if (url.includes('?')) return url;
  return `${url}?full=1`;
}

/** Convenience for `storageKey -> original image url`. */
export function fullForKey(storageKey: string | null | undefined): string | undefined {
  return storageKey ? `/api/files/${storageKey}?full=1` : undefined;
}

/**
 * Re-points a url at a specific width, REPLACING any ?w=/?full=1 it already
 * carries. For a component handed full-size urls that also renders small tiles
 * off the same array — e.g. ImageGallery's 52px filmstrip under its main image.
 */
export function atWidth(url: string | null | undefined, width: ThumbWidth): string | undefined {
  if (!url) return undefined;
  if (!url.startsWith('/api/files/')) return url;
  return `${url.split('?')[0]}?w=${width}`;
}
