'use client';

// Show-page header actions, standardized: Edit button + a single "More"
// dropdown holding Delete (always) plus any resource-specific showActions
// (e.g. Product's Duplicate). Mirrors RowActions' split, just not
// hover-hidden — the show page has room to keep both visible.

import { useState } from 'react';
import { App, Button, Dropdown, Space } from 'antd';
import { EditOutlined, MoreOutlined, DeleteOutlined } from '@ant-design/icons';
import { useNavigation, useDelete } from '@refinedev/core';
import type { MenuProps } from 'antd';
import type { RowAction } from '../lib/resource-config';

export function ShowActions({ resource, record, moreActions }: {
  resource: string;
  record: any;
  moreActions?: RowAction[];
}) {
  // Bound instance — antd's static Modal.confirm does not mount reliably
  // under React 19, so this delete dialog could silently never appear.
  const { modal } = App.useApp();
  const { edit, list } = useNavigation();
  const { mutate: deleteOne, mutation } = useDelete();
  const [open, setOpen] = useState(false);

  function confirmDelete() {
    setOpen(false);
    modal.confirm({
      title: 'Delete this record?',
      okText: 'Delete',
      okButtonProps: { danger: true },
      onOk: () => deleteOne({ resource, id: record.id }, { onSuccess: () => list(resource) }),
    });
  }

  const items: MenuProps['items'] = [
    ...(moreActions ?? []).map((a) => ({ key: a.key, label: a.label, icon: a.icon, danger: a.danger })),
    { type: 'divider' },
    { key: '__delete', label: 'Delete', icon: <DeleteOutlined />, danger: true },
  ];

  function onMenuClick(key: string) {
    if (key === '__delete') { confirmDelete(); return; }
    moreActions?.find((a) => a.key === key)?.onClick(record);
    setOpen(false);
  }

  return (
    <Space>
      <Button icon={<EditOutlined />} onClick={() => edit(resource, record.id)}>Edit</Button>
      <Dropdown
        trigger={['click']}
        open={open}
        onOpenChange={setOpen}
        menu={{ items, onClick: ({ key }) => onMenuClick(key) }}
      >
        <Button icon={<MoreOutlined />} loading={mutation.isPending} />
      </Dropdown>
    </Space>
  );
}
