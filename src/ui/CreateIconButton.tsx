'use client';

// Header create action, standardized to match the app owner's NocoBase
// layout: a plain icon-only "+" button, plus the shared "More action" (⋯)
// button from header-icons for list-level actions — rendered only when a resource actually
// supplies some via `config.listActions`, so it stays out of the way
// everywhere else.

import { Button, Dropdown, Space } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import { HeaderIconButton, MoreActionsIcon } from './header-icons';
import { useNavigation } from '@refinedev/core';
import type { ResourceConfig } from '../lib/resource-config';

export function CreateIconButton({ config }: { config: ResourceConfig }) {
  const { create } = useNavigation();
  const listActions = config.listActions ?? [];

  return (
    <Space size={8}>
      <Button className="kano-toolbar-btn" type="primary" icon={<PlusOutlined />} onClick={() => create(config.name)} />
      {config.listActionsSlot ? (
        config.listActionsSlot
      ) : listActions.length > 0 ? (
        <Dropdown
          trigger={['click']}
          menu={{
            items: listActions.map((a) => ({ key: a.key, label: a.label, icon: a.icon, danger: a.danger })),
            onClick: ({ key }) => listActions.find((a) => a.key === key)?.onClick(null),
          }}
        >
          <HeaderIconButton title="More action">
            <MoreActionsIcon />
          </HeaderIconButton>
        </Dropdown>
      ) : null}
    </Space>
  );
}
