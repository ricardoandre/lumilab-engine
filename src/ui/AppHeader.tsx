'use client';

import { useState } from 'react';
import { useLogout, useGetIdentity } from '@refinedev/core';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { Layout, Space, Avatar, Dropdown, Grid, Button } from 'antd';
import { useThemedLayoutContext } from '@refinedev/antd';
import { UserOutlined, LockOutlined, LogoutOutlined, DownOutlined, BarsOutlined, TeamOutlined } from '@ant-design/icons';
import type { MenuProps } from 'antd';
import { useIsSandbox, SANDBOX_HEADER_BG } from '../lib/sandbox-env';
import { SwitchUserModal } from './SwitchUserModal';

// Impersonation tell — a deep red that reads as "not you", deliberately
// unrelated to the sandbox amber, and overriding it: on sandbox the more
// important fact is WHO you are, not which environment you're on.
const IMPERSONATION_HEADER_BG = '#7f1d1d';

// Shared app header — one place to keep account/logout controls consistent
// across every page, instead of each resource re-implementing its own. Just
// the avatar trigger (no name label — the header's dark navy background
// makes long identity text noisy, and the dropdown already confirms who's
// logged in via Change Password/Logout); icon colors are light to stay
// visible against that same navy background.
//
// On mobile, the sidebar's open trigger renders here too (left side, same
// row as the avatar on the right) via the shared themed-layout context —
// rather than AppSider positioning its own independently-floating button,
// which could never guarantee pixel alignment with this row.
export function AppHeader() {
  const { mutate: logout } = useLogout();
  const { data: identity } = useGetIdentity<{ name?: string; email?: string }>();
  const router = useRouter();
  const screens = Grid.useBreakpoint();
  const isMobile = !screens.lg;
  const { setMobileSiderOpen } = useThemedLayoutContext();
  const isSandbox = useIsSandbox();
  const { data: session, update } = useSession();
  const [switchOpen, setSwitchOpen] = useState(false);

  const displayName = identity?.name ?? identity?.email;
  // Non-null only while an admin is viewing as someone else. Note `isAdmin` is
  // the IMPERSONATED user's by then, so the two are read separately.
  const impersonatedBy = session?.user?.impersonatedBy ?? null;
  const canSwitchUser = !!session?.user?.isAdmin && !impersonatedBy;

  async function exitImpersonation() {
    await update({ impersonate: null });
    // Hard reload for the same reason as entering — see SwitchUserModal.
    window.location.href = '/';
  }

  const items: MenuProps['items'] = [
    ...(displayName
      ? [
          {
            key: 'identity',
            label: displayName,
            disabled: true,
            style: { cursor: 'default', color: 'rgba(0,0,0,0.85)', fontWeight: 600 },
          } as const,
          { type: 'divider' as const },
        ]
      : []),
    { key: 'account', label: 'Change Password', icon: <LockOutlined /> },
    ...(canSwitchUser
      ? [{ key: 'switch-user', label: 'View as user…', icon: <TeamOutlined /> } as const]
      : []),
    { type: 'divider' },
    { key: 'logout', label: 'Logout', icon: <LogoutOutlined />, danger: true },
  ];

  function onMenuClick({ key }: { key: string }) {
    if (key === 'account') router.push('/account');
    else if (key === 'switch-user') setSwitchOpen(true);
    else logout();
  }

  const headerBg = impersonatedBy ? IMPERSONATION_HEADER_BG : isSandbox ? SANDBOX_HEADER_BG : null;

  return (
    <Layout.Header
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 16px',
        ...(headerBg ? { background: headerBg } : null),
      }}
    >
      <Space size={10}>
        {isMobile && (
          <Button
            type="text"
            size="large"
            icon={<BarsOutlined style={{ fontSize: 20, color: '#fff' }} />}
            onClick={() => setMobileSiderOpen(true)}
            style={{ background: 'none', border: 'none', boxShadow: 'none', padding: 0 }}
          />
        )}
        {isSandbox && (
          <span
            style={{
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: '0.12em',
              color: '#fff',
              border: '1px solid rgba(255,255,255,0.55)',
              borderRadius: 4,
              padding: '2px 8px',
            }}
          >
            SANDBOX
          </span>
        )}
        {impersonatedBy && (
          // Deliberately loud and always on screen: writes made here are saved
          // under the impersonated user's name, so there must be no moment where
          // you can forget whose account you are in.
          <Space size={8}>
            <span
              style={{
                fontSize: 11,
                fontWeight: 700,
                letterSpacing: '0.08em',
                color: '#fff',
                border: '1px solid rgba(255,255,255,0.55)',
                borderRadius: 4,
                padding: '2px 8px',
                whiteSpace: 'nowrap',
              }}
            >
              VIEWING AS {(displayName ?? '').toUpperCase()}
            </span>
            <Button size="small" onClick={exitImpersonation}>
              Exit
            </Button>
          </Space>
        )}
      </Space>
      <Dropdown trigger={['click']} menu={{ items, onClick: onMenuClick }}>
        <Space size={6} style={{ cursor: 'pointer' }}>
          <Avatar size="small" icon={<UserOutlined />} style={{ background: 'rgba(255,255,255,0.15)', color: '#fff' }} />
          <DownOutlined style={{ fontSize: 10, color: 'rgba(255,255,255,0.7)' }} />
        </Space>
      </Dropdown>
      <SwitchUserModal open={switchOpen} onClose={() => setSwitchOpen(false)} />
    </Layout.Header>
  );
}
