'use client';

// Everything an ErrorBoundary cannot see.
//
// Boundaries only catch throws during RENDER. These four classes never reach
// one, and all four have taken something out on this app already:
//
//   promise — an unhandled rejection. A click handler or a .then() that throws.
//   api     — a /api/* call the browser made came back 5xx. This is the
//             2026-08-21 outage exactly: /samples answered 200 while
//             /api/samples 500'd for six hours behind it, so every status-code
//             sweep said the app was healthy.
//   image   — an <img> that 404s. On 2026-08-25 files were written to storage
//             without their Attachment row and 1,164 Shopee Catalog thumbnails
//             broke silently: no error, no failed page, just blank squares.
//   chunk   — a JS chunk that will not load, which is what a tab left open
//             across a deploy actually suffers. Presents as dead clicks.

import { useEffect } from 'react';
import { reportClientError, isChunkLoadError } from '../lib/report-client-error';

// 400 from a report/search route that needs ?from=&to= is documented healthy
// (see CLAUDE.md) — reporting those would bury the real failures.
const EXPECTED_4XX = /\/api\/(reports?|search|smart-search|.*-report)\b/i;

export function ClientErrorReporter() {
  useEffect(() => {
    const onError = (e: ErrorEvent) => {
      const text = e.message || String(e.error || 'unknown error');
      reportClientError({
        kind: isChunkLoadError(text) ? 'chunk' : 'render',
        message: text,
        stack: e.error?.stack || null,
      });
    };

    const onRejection = (e: PromiseRejectionEvent) => {
      const reason = e.reason;
      const text = reason?.message || String(reason || 'unhandled rejection');
      reportClientError({
        kind: isChunkLoadError(text) ? 'chunk' : 'promise',
        message: text,
        stack: reason?.stack || null,
      });
    };

    // Image errors do not bubble, so this listens in the CAPTURE phase — the
    // reason a naive window.onerror handler never sees a broken thumbnail.
    const onCapture = (e: Event) => {
      const el = e.target as HTMLElement | null;
      if (!el || el.tagName !== 'IMG') return;
      const src = (el as HTMLImageElement).currentSrc || (el as HTMLImageElement).src || '';
      if (!src || src.startsWith('data:')) return;
      let path = src;
      try { path = new URL(src, window.location.origin).pathname; } catch { /* keep raw */ }
      reportClientError({ kind: 'image', message: `Image failed to load: ${path}` });
    };

    window.addEventListener('error', onError);
    window.addEventListener('unhandledrejection', onRejection);
    window.addEventListener('error', onCapture, true);

    // Wrap fetch to notice failed API calls. Deliberately thin: it observes and
    // hands back exactly what it got, so a bug in here cannot change what the
    // app receives.
    const originalFetch = window.fetch;
    window.fetch = async function patchedFetch(...args: Parameters<typeof fetch>) {
      const url = typeof args[0] === 'string' ? args[0] : (args[0] as Request)?.url || String(args[0]);
      try {
        const res = await originalFetch.apply(this, args);
        try {
          // Never report on the reporting endpoint: a 500 there would report
          // itself, forever.
          const isApi = url.includes('/api/') && !url.includes('/api/client-errors');
          if (isApi && (res.status >= 500 || (res.status >= 400 && res.status !== 401 && res.status !== 403 && res.status !== 404 && !EXPECTED_4XX.test(url)))) {
            let path = url;
            try { path = new URL(url, window.location.origin).pathname; } catch { /* keep raw */ }
            reportClientError({ kind: 'api', message: `${res.status} from ${path}` });
          }
        } catch { /* observation must never break the response */ }
        return res;
      } catch (err: unknown) {
        const text = (err as Error)?.message || 'network request failed';
        // A request that never left the device is a phone that lost signal,
        // not a fault in the app — reporting it opens a row nobody can fix
        // and buries the ones somebody can ("Failed to fetch —
        // /api/auth/session", 2026-08-28). Only what fails while the browser
        // believes it IS online is worth recording.
        const offline = typeof navigator !== 'undefined' && navigator.onLine === false;
        if (!offline && url.includes('/api/') && !url.includes('/api/client-errors')) {
          reportClientError({ kind: 'api', message: `${text} — ${url}` });
        }
        throw err;
      }
    };

    return () => {
      window.removeEventListener('error', onError);
      window.removeEventListener('unhandledrejection', onRejection);
      window.removeEventListener('error', onCapture, true);
      window.fetch = originalFetch;
    };
  }, []);

  return null;
}
