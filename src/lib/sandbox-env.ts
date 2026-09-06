'use client';

import { useEffect, useState } from 'react';

// Sandbox visual tell — a distinct header/sidebar color so it's unmistakable
// which environment you're looking at (Andre kept editing roles on sandbox by
// mistake, 2026-08-14).
//
// Detection is RUNTIME (browser hostname), deliberately NOT a build-time
// NEXT_PUBLIC_* env var. A value baked in at build time would be wrong on one
// of the two hosts; reading window.location at render time is correct on both.
//
// NB: an earlier version of this comment said the production artifact is "built
// on sandbox and promoted to prod unchanged". That is NOT what happens —
// scripts/go-live.sh runs its own `next build` into prod's slot (.next-prod-*),
// so sandbox and prod are separate builds of the same commit. Promoting the
// artifact instead was investigated on 2026-08-16 and rejected: `distDir` is
// compiled into ~213 server route files, so a copied artifact would disagree
// with the NEXT_DIST_DIR it is served under. Don't rely on a promote guarantee
// that doesn't exist — but runtime detection is still the right call here,
// since it holds however the artifact is produced.
export function isSandboxHost(): boolean {
  if (typeof window === 'undefined') return false;
  return window.location.hostname.includes('sandbox');
}

// SSR renders with window undefined, so this returns false on the server and
// on the first client paint (matching SSR — no hydration mismatch), then flips
// to the real value after mount.
export function useIsSandbox(): boolean {
  const [sandbox, setSandbox] = useState(false);
  useEffect(() => {
    setSandbox(isSandboxHost());
  }, []);
  return sandbox;
}

// The one place to change the sandbox colors. Header stays dark enough that its
// white icons/label remain legible; the sider tint is a warm wash of the same
// amber replacing the normal cream (#faf9f6).
export const SANDBOX_HEADER_BG = '#8a4b0f';
export const SANDBOX_SIDER_BG = '#fbf1e4';
