'use client';

import { useRouter } from 'next/navigation';
import { useThemedLayoutContext } from '@refinedev/antd';

// Replaces Refine's default "Refine Project" placeholder branding. Clicking
// it collapses the sidebar (desktop) / closes it (mobile) and goes to My
// Dashboard — the app's "home" action, same as clicking a logo anywhere else.
export function AppTitle({ collapsed }: { collapsed?: boolean }) {
  const router = useRouter();
  const { setSiderCollapsed, setMobileSiderOpen } = useThemedLayoutContext();

  function goHome() {
    setSiderCollapsed(true);
    setMobileSiderOpen(false);
    router.push('/dashboard');
  }

  return (
    <div
      onClick={goHome}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') goHome(); }}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '4px 8px',
        cursor: 'pointer',
      }}
    >
      <span
        style={{
          width: 22,
          height: 22,
          borderRadius: 6,
          background: '#26344b',
          flexShrink: 0,
        }}
      />
      {!collapsed && (
        <span style={{ fontSize: 14, fontWeight: 700, color: '#211f1c', letterSpacing: '-0.01em' }}>
          kanoapp
        </span>
      )}
    </div>
  );
}
