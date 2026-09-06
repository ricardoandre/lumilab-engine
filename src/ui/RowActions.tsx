'use client';

// Standardized quick-action pattern (matches the app owner's NocoBase list
// views): desktop reveals Edit + More icons on row/card hover; mobile shows
// one combined button (Edit + whatever's in More). Delete is deliberately
// NOT here — it only lives on the show page, reachable by opening the
// record first. See globals.css for the hover-reveal / breakpoint rules.

import { Dropdown, Button } from 'antd';
import { EditOutlined, MoreOutlined } from '@ant-design/icons';
import { useNavigation } from '@refinedev/core';
import type { MenuProps } from 'antd';
import type { RowAction } from '../lib/resource-config';

export function RowActions({ resource, record, moreActions }: {
  resource: string;
  record: any;
  moreActions?: RowAction[];
}) {
  const { edit } = useNavigation();
  const goEdit = () => edit(resource, record.id);

  const moreItems: MenuProps['items'] = (moreActions ?? []).map((a) => ({
    key: a.key, label: a.label, icon: a.icon, danger: a.danger,
  }));
  const allItems: MenuProps['items'] = [
    { key: '__edit', label: 'Edit', icon: <EditOutlined /> },
    ...moreItems,
  ];

  function runAction(key: string) {
    if (key === '__edit') { goEdit(); return; }
    moreActions?.find((a) => a.key === key)?.onClick(record);
  }

  return (
    <span onClick={(e) => e.stopPropagation()} style={{ display: 'inline-flex' }}>
      <span className="row-actions-desktop" style={{ display: 'inline-flex', gap: 4 }}>
        <Button size="small" type="text" icon={<EditOutlined />} onClick={goEdit} />
        {moreItems.length > 0 && (
          <Dropdown trigger={['click']} menu={{ items: moreItems, onClick: ({ key }) => runAction(key) }}>
            <Button size="small" type="text" icon={<MoreOutlined />} />
          </Dropdown>
        )}
      </span>
      <span className="row-actions-mobile">
        <Dropdown trigger={['click']} menu={{ items: allItems, onClick: ({ key }) => runAction(key) }}>
          <Button size="small" type="text" icon={<MoreOutlined />} />
        </Dropdown>
      </span>
    </span>
  );
}
