'use client';

import { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { Modal, Input, List, Alert, Spin, Button, Empty } from 'antd';
import { UserOutlined } from '@ant-design/icons';

// Admin "view as" picker. Choosing someone here rewrites the session JWT to be
// that user (src/lib/impersonation.ts) so the ACL layer can be tested against
// real data. Search is SERVER-side through /api/users' shared `q` filter — the
// same path every people-picker uses — so this stays correct however many
// logins exist, rather than loading the whole table into the browser.

interface PickUser {
  id: string;
  email: string;
  nickname: string | null;
}

function searchUrl(text: string): string {
  const trimmed = text.trim();
  if (!trimmed) return '/api/users';
  const filters = JSON.stringify([{ field: 'q', operator: 'contains', value: trimmed }]);
  return `/api/users?filters=${encodeURIComponent(filters)}`;
}

export function SwitchUserModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { data: session, update } = useSession();
  const [text, setText] = useState('');
  const [users, setUsers] = useState<PickUser[]>([]);
  const [loading, setLoading] = useState(false);
  const [switchingTo, setSwitchingTo] = useState<string | null>(null);

  const myId = session?.user?.id;

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    // Debounced so typing doesn't fire a request per keystroke.
    const timer = setTimeout(() => {
      fetch(searchUrl(text))
        .then((r) => r.json())
        .then((j) => {
          if (!cancelled) setUsers(Array.isArray(j.data) ? j.data : []);
        })
        .catch(() => {
          if (!cancelled) setUsers([]);
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [open, text]);

  async function viewAs(user: PickUser) {
    setSwitchingTo(user.id);
    await update({ impersonate: user.id });
    // A HARD reload, not router.push: use-permissions.ts caches the effective
    // permission payload at MODULE level, and Refine holds its own query cache.
    // A client-side navigation would keep both, so the new identity would run
    // the whole app behind the previous user's cached permissions.
    window.location.href = '/';
  }

  return (
    <Modal
      open={open}
      onCancel={onClose}
      footer={null}
      title="View as another user"
      destroyOnHidden
    >
      <Alert
        type="warning"
        showIcon
        style={{ marginBottom: 12 }}
        message="You will be this user until you exit"
        description="Anything you create or edit while viewing as them is saved for real, under their name."
      />
      <Input.Search
        placeholder="Search name or email"
        allowClear
        value={text}
        onChange={(e) => setText(e.target.value)}
        style={{ marginBottom: 12 }}
      />
      <Spin spinning={loading}>
        <div style={{ maxHeight: 360, overflowY: 'auto' }}>
          <List
            dataSource={users.filter((u) => u.id !== myId)}
            locale={{ emptyText: <Empty description="No users match" image={Empty.PRESENTED_IMAGE_SIMPLE} /> }}
            renderItem={(user) => (
              <List.Item
                actions={[
                  <Button
                    key="go"
                    size="small"
                    type="primary"
                    loading={switchingTo === user.id}
                    onClick={() => viewAs(user)}
                  >
                    View as
                  </Button>,
                ]}
              >
                <List.Item.Meta
                  avatar={<UserOutlined />}
                  title={user.nickname ?? user.email}
                  description={user.nickname ? user.email : null}
                />
              </List.Item>
            )}
          />
        </div>
      </Spin>
    </Modal>
  );
}
