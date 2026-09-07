'use client';

import { useState } from 'react';
import { Card, Form, Input, Button, Typography, Space, App } from 'antd';

export function ChangePasswordForm({ email }: { email: string }) {
  const { message } = App.useApp(); // antd's STATIC message no-ops under React 19
  const [form] = Form.useForm();
  const [saving, setSaving] = useState(false);

  async function onFinish(v: { currentPassword: string; newPassword: string; confirm: string }) {
    setSaving(true);
    const res = await fetch('/api/account/password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ currentPassword: v.currentPassword, newPassword: v.newPassword }),
    });
    setSaving(false);
    const body = await res.json().catch(() => ({}));
    if (res.ok) { message.success('Password changed.'); form.resetFields(); }
    else message.error(body.error ?? 'Could not change the password.');
  }

  return (
    <Space direction="vertical" size="large" style={{ width: '100%', maxWidth: 520 }}>
      <Typography.Title level={3} style={{ margin: 0 }}>My Account</Typography.Title>
      <Card title="Change password">
        <Typography.Paragraph type="secondary">Signed in as {email}</Typography.Paragraph>
        <Form form={form} layout="vertical" onFinish={onFinish} requiredMark={false}>
          <Form.Item name="currentPassword" label="Current password" rules={[{ required: true }]}>
            <Input.Password autoComplete="current-password" />
          </Form.Item>
          <Form.Item
            name="newPassword"
            label="New password"
            rules={[{ required: true }, { min: 8, message: 'At least 8 characters.' }]}
          >
            <Input.Password autoComplete="new-password" />
          </Form.Item>
          <Form.Item
            name="confirm"
            label="Confirm new password"
            dependencies={['newPassword']}
            rules={[
              { required: true },
              ({ getFieldValue }) => ({
                validator: (_, value) =>
                  !value || getFieldValue('newPassword') === value
                    ? Promise.resolve()
                    : Promise.reject(new Error('The two passwords do not match.')),
              }),
            ]}
          >
            <Input.Password autoComplete="new-password" />
          </Form.Item>
          <Button type="primary" htmlType="submit" loading={saving}>Change password</Button>
        </Form>
      </Card>
    </Space>
  );
}
