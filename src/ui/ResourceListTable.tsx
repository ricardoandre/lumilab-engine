'use client';

import { useState } from 'react';
import { List, useTable } from '@refinedev/antd';
import { useNavigation } from '@refinedev/core';
import { Table, Tooltip } from 'antd';
import type { ResourceConfig } from '../lib/resource-config';
import { listFields } from '../lib/resource-config';
import { renderFieldValue } from './field-value';
import { ListToolbar } from './ListToolbar';
import { MainTabsBar } from './MainTabsBar';
import { RowActions } from './RowActions';
import { CreateIconButton } from './CreateIconButton';
import { QuickStatusCell } from './QuickStatusCell';
import { BulkStatusBar } from './BulkStatusBar';

export function ResourceListTable({ config }: { config: ResourceConfig }) {
  const { tableProps, filters, setFilters, sorters, setSorters, setCurrentPage } = useTable({
    resource: config.name,
    syncWithLocation: true,
  });
  const { show } = useNavigation();
  const titleField = config.fields.find((f) => f.type === 'text');
  const hoverField = config.fields.find((f) => f.name === config.hoverPreviewField);
  const bulkStatusField = config.fields.find((f) => f.name === config.quickStatusField);
  const [selectedRowKeys, setSelectedRowKeys] = useState<(string | number)[]>([]);

  return (
    <List title={config.label} headerButtons={<CreateIconButton config={config} />}>
      <ListToolbar
        config={config}
        filters={filters}
        setFilters={setFilters}
        setCurrentPage={setCurrentPage}
        sorters={sorters}
        setSorters={setSorters}
      />
      <MainTabsBar config={config} filters={filters} setFilters={setFilters} setCurrentPage={setCurrentPage} />
      {bulkStatusField && selectedRowKeys.length > 0 && (
        <BulkStatusBar
          resource={config.name}
          field={bulkStatusField}
          selectedIds={selectedRowKeys}
          onClear={() => setSelectedRowKeys([])}
          onApplied={() => setSelectedRowKeys([])}
        />
      )}
      {/* scroll.x keeps the table usable on narrow/mobile viewports instead of squashing columns */}
      <div style={{ background: '#fff', border: '1px solid #e7e2d9', borderRadius: 12, overflow: 'hidden' }}>
        <Table
          {...tableProps}
          rowKey="id"
          scroll={{ x: 'max-content' }}
          pagination={{ ...tableProps.pagination, style: { paddingRight: 16 } }}
          rowSelection={
            bulkStatusField
              ? { selectedRowKeys, onChange: (keys) => setSelectedRowKeys(keys as (string | number)[]) }
              : undefined
          }
          onRow={(record: any) => ({ onClick: () => show(config.name, record.id), style: { cursor: 'pointer' } })}
        >
          {listFields(config).map((field) => (
            <Table.Column
              key={field.name}
              dataIndex={field.name}
              title={field.label}
              width={field.listWidth}
              render={(_: unknown, record: any) => {
                const content =
                  field.name === config.quickStatusField ? (
                    <QuickStatusCell resource={config.name} record={record} field={field} />
                  ) : (
                    renderFieldValue(field, record)
                  );
                if (hoverField && field.name === titleField?.name) {
                  const preview = renderFieldValue(hoverField, record);
                  if (preview && preview !== '-') {
                    return (
                      <Tooltip title={<div style={{ maxWidth: 280 }}>{preview}</div>} placement="topLeft" mouseEnterDelay={0.3}>
                        <span>{content}</span>
                      </Tooltip>
                    );
                  }
                }
                return content;
              }}
            />
          ))}
          <Table.Column
            title=""
            dataIndex="actions"
            fixed="right"
            width={72}
            render={(_, record: any) => (
              <RowActions resource={config.name} record={record} moreActions={config.rowActions?.(record)} />
            )}
          />
        </Table>
      </div>
    </List>
  );
}
