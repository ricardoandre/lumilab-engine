'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card, Table, Tag, Typography, Space, Button, Drawer, Form, Input, Switch, Grid, App } from 'antd';
import { PlusOutlined } from '@ant-design/icons';

export interface EngineUserRow {
  key: string; email: string; nickname: string | null; isAdmin: boolean; createdAt: string;
}

/**
 * User list with a create form. Lives in the ENGINE so every app has it from day
 * one — the first app on this engine had no way to add a user, and accounts had
 * to be created by hand on the server.
 */
export function UsersManager({ rows }: { rows: EngineUserRow[] }) {
  const { message } = App.useApp();
  const router = useRouter();
  const screens = Grid.useBreakpoint();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form] = Form.useForm();

  async function onFinish(v: { email: string; nickname?: string; password: string; isAdmin?: boolean }) {
    setSaving(true);
    const res = await fetch('/api/users', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(v),
    });
    setSaving(false);
    const body = await res.json().catch(() => ({}));
    if (!res.ok) { message.error(body.error ?? 'Could not create the user.'); return; }
    message.success(`${body.email} created.`);
    form.resetFields();
    setOpen(false);
    router.refresh();
  }

  return (
    <Space direction="vertical" size="large" style={{ width: '100%' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
        <Typography.Title level={3} style={{ margin: 0 }}>Users</Typography.Title>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => setOpen(true)}>
          {screens.sm ? 'New user' : 'New'}
        </Button>
      </div>

      <Card styles={{ body: { padding: 0 } }}>
        <Table
          dataSource={rows}
          pagination={false}
          scroll={{ x: true }}
          columns={[
            { title: 'Email', dataIndex: 'email' },
            { title: 'Name', dataIndex: 'nickname' },
            {
              title: 'Role', dataIndex: 'isAdmin',
              render: (v: boolean) => (v ? <Tag color="blue">Admin</Tag> : <Tag>User</Tag>),
            },
            { title: 'Created', dataIndex: 'createdAt' },
          ]}
        />
      </Card>

      <Drawer
        title="New user"
        open={open}
        onClose={() => setOpen(false)}
        placement={screens.lg ? 'right' : 'bottom'}
        width={screens.lg ? 460 : undefined}
        height={screens.lg ? undefined : '80%'}
      >
        <Form form={form} layout="vertical" onFinish={onFinish} requiredMark={false}>
          <Form.Item name="email" label="Email" rules={[{ required: true, type: 'email', message: 'A valid email, please.' }]}>
            <Input size="large" autoComplete="off" />
          </Form.Item>
          <Form.Item name="nickname" label="Name" extra="Optional — defaults to the part before the @.">
            <Input size="large" autoComplete="off" />
          </Form.Item>
          <Form.Item name="password" label="Password"
                     rules={[{ required: true }, { min: 8, message: 'At least 8 characters.' }]}
                     extra="They can change it themselves from My Account.">
            <Input.Password size="large" autoComplete="new-password" />
          </Form.Item>
          <Form.Item name="isAdmin" label="Administrator" valuePropName="checked"
                     extra="Admins can create users and see every screen.">
            <Switch />
          </Form.Item>
          <Button type="primary" htmlType="submit" loading={saving} block size="large">Create user</Button>
        </Form>
      </Drawer>
    </Space>
  );
}
