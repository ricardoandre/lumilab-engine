'use client';

// The browser half of client-error reporting. Everything that notices a
// problem — the ErrorBoundary, the window listeners, the fetch wrapper — comes
// through here.
//
// Two rules this file exists to enforce:
//   1. Reporting must never make things worse. Every path is fire-and-forget
//      and swallows its own failures; a user already looking at a broken screen
//      must not also get a failed report throwing on top of it.
//   2. It must never storm. A render loop can throw hundreds of times a second,
//      and a page of broken images fires one event per image.

export type ClientErrorKind = 'render' | 'promise' | 'api' | 'image' | 'chunk';

// Sent once per fingerprint per page load. The server dedupes across users and
// time; this stops one broken screen posting a thousand times before it does.
const sentThisPageLoad = new Set<string>();
// Hard ceiling regardless of distinctness, for a loop that generates unique
// messages (a counter in the text, say).
const MAX_REPORTS_PER_PAGE_LOAD = 20;
let reportsSent = 0;

const RELEASE_SHA = process.env.NEXT_PUBLIC_RELEASE_SHA || null;

export function reportClientError(input: {
  kind: ClientErrorKind;
  message: string;
  stack?: string | null;
  componentStack?: string | null;
  route?: string | null;
}): void {
  try {
    if (typeof window === 'undefined') return;
    if (reportsSent >= MAX_REPORTS_PER_PAGE_LOAD) return;

    const route = input.route || window.location.pathname;
    const message = String(input.message || '').slice(0, 500);
    if (!message) return;

    const key = `${input.kind}|${message}|${route}`;
    if (sentThisPageLoad.has(key)) return;
    sentThisPageLoad.add(key);
    reportsSent++;

    const payload = JSON.stringify({
      kind: input.kind,
      message,
      route,
      stack: input.stack ? String(input.stack).slice(0, 8000) : null,
      componentStack: input.componentStack ? String(input.componentStack).slice(0, 8000) : null,
      releaseSha: RELEASE_SHA,
    });

    // sendBeacon survives the page being navigated away or closed, which is
    // exactly what a user does when a screen breaks. fetch(keepalive) is the
    // fallback where it is unavailable or refuses (payload too large).
    const beacon = navigator.sendBeacon?.bind(navigator);
    if (beacon && beacon('/api/client-errors', new Blob([payload], { type: 'application/json' }))) return;

    void fetch('/api/client-errors', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: payload,
      keepalive: true,
    }).catch(() => {});
  } catch {
    // Reporting failed. That is not the user's problem.
  }
}

// A chunk that fails to load is what a tab left open across a deploy actually
// suffers from: the build it was served is gone, so clicks die and nothing in
// the console explains why. Worth telling apart from a real bug.
export function isChunkLoadError(text: string): boolean {
  return /ChunkLoadError|Loading chunk \S+ failed|Failed to fetch dynamically imported module|error loading dynamically imported module/i.test(text);
}
