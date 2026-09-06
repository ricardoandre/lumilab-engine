'use client';

import { useTable } from '@refinedev/antd';
import { List } from '@refinedev/antd';
import { useNavigation } from '@refinedev/core';
import { Card, Row, Col, Image, Space, Pagination, Empty, Spin } from 'antd';
import type { ResourceConfig } from '../lib/resource-config';
import { listFields } from '../lib/resource-config';
import { renderFieldValue } from './field-value';
import { MainTabsBar } from './MainTabsBar';
import { ListToolbar } from './ListToolbar';
import { RowActions } from './RowActions';
import { CreateIconButton } from './CreateIconButton';
import { StatusPill } from './StatusPill';

const PLACEHOLDER_IMG =
  'data:image/svg+xml;utf8,' +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="150"><rect width="100%" height="100%" fill="#f0f0f0"/></svg>',
  );

export function ResourceListCards({ config }: { config: ResourceConfig }) {
  const { tableQuery, filters, setFilters, sorters, setSorters, currentPage, setCurrentPage, pageSize } = useTable({
    resource: config.name,
    syncWithLocation: true,
  });

  const records = tableQuery?.data?.data ?? [];
  const total = tableQuery?.data?.total ?? 0;

  const titleField = config.fields.find((f) => f.type === 'text');
  const titleOf = (record: any) => {
    if (config.cardTitle) return config.cardTitle(record);
    return titleField ? record[titleField.name] : `#${record.id}`;
  };
  const { show } = useNavigation();

  return (
    <List
      title={config.label}
      headerButtons={<CreateIconButton config={config} />}
    >
      <ListToolbar
        config={config}
        filters={filters}
        setFilters={setFilters}
        setCurrentPage={setCurrentPage}
        sorters={sorters}
        setSorters={setSorters}
      />

      <MainTabsBar config={config} filters={filters} setFilters={setFilters} setCurrentPage={setCurrentPage} />

      {tableQuery?.isFetching ? (
        <Spin />
      ) : records.length === 0 ? (
        <Empty />
      ) : config.cardLayout === 'row' ? (
        <>
          <Space direction="vertical" size={8} style={{ width: '100%' }}>
            {records.map((record: any) => (
              <RowCard key={record.id} config={config} record={record} titleOf={titleOf} onClick={() => show(config.name, record.id)} />
            ))}
          </Space>
          <div style={{ marginTop: 16, textAlign: 'right' }}>
            <Pagination current={currentPage} pageSize={pageSize} total={total} onChange={setCurrentPage} showSizeChanger={false} />
          </div>
        </>
      ) : (
        <>
          <Row gutter={[8, 8]}>
            {records.map((record: any) => (
              <Col key={record.id} xs={12} sm={8} md={6} lg={4}>
                <Card
                  hoverable
                  className="kano-product-card"
                  onClick={() => show(config.name, record.id)}
                  style={{ cursor: 'pointer' }}
                  styles={{ body: { padding: '8px 10px 4px' } }}
                  cover={
                    <div style={{ width: '100%', aspectRatio: config.cardImageAspectRatio || '4 / 3', overflow: 'hidden', cursor: 'pointer' }}>
                      <Image
                        src={config.cardImage?.(record) || PLACEHOLDER_IMG}
                        alt={titleOf(record)}
                        width="100%"
                        height="100%"
                        style={{ objectFit: 'cover' }}
                        fallback={PLACEHOLDER_IMG}
                        preview={false}
                        loading="lazy"
                      />
                    </div>
                  }
                  actions={[
                    <RowActions key="actions" resource={config.name} record={record} moreActions={config.rowActions?.(record)} />,
                  ]}
                >
                  <Card.Meta
                    title={<span style={{ fontSize: 13.5 }}>{titleOf(record)}</span>}
                    description={
                      <Space direction="vertical" size={2} style={{ width: '100%' }}>
                        {(config.cardFields
                          ? config.cardFields.map((name) => config.fields.find((f) => f.name === name)!).filter(Boolean)
                          : listFields(config)
                              .filter((f) => f.name !== config.mainTabsField && f.name !== titleField?.name)
                              .slice(0, 4)
                        ).map((f) => (
                          <div key={f.name} style={{ fontSize: 11.5 }}>
                            {!config.cardFieldsHideLabel && <span style={{ color: '#8c8c8c' }}>{f.label}: </span>}
                            {renderFieldValue(f, record)}
                          </div>
                        ))}
                      </Space>
                    }
                  />
                </Card>
              </Col>
            ))}
          </Row>
          <div style={{ marginTop: 16, textAlign: 'right' }}>
            <Pagination
              current={currentPage}
              pageSize={pageSize}
              total={total}
              onChange={setCurrentPage}
              showSizeChanger={false}
            />
          </div>
        </>
      )}
    </List>
  );
}

// Single-column horizontal row card — matches NocoBase's own Product
// Measurement list exactly (small image left, title/subtitle/size-tags
// right), same layout on mobile and desktop rather than switching to a
// grid at wider widths.
function RowCard({ config, record, titleOf, onClick }: {
  config: ResourceConfig;
  record: any;
  titleOf: (record: any) => string;
  onClick: () => void;
}) {
  const subtitle = config.cardSubtitle?.(record);
  const tags = config.cardTags?.(record) ?? [];

  return (
    <div
      onClick={onClick}
      style={{
        display: 'flex', alignItems: 'center', gap: 12, padding: 10,
        border: '1px solid #e7e2d9', borderRadius: 12, background: '#fff', cursor: 'pointer',
      }}
    >
      <div style={{ width: 56, aspectRatio: config.cardImageAspectRatio || '2 / 3', flexShrink: 0, borderRadius: 8, overflow: 'hidden', background: '#f0f0f0' }}>
        <Image
          src={config.cardImage?.(record) || PLACEHOLDER_IMG}
          alt={titleOf(record)}
          width="100%"
          height="100%"
          style={{ objectFit: 'cover' }}
          fallback={PLACEHOLDER_IMG}
          preview={false}
          loading="lazy"
        />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: '#211f1c' }}>{titleOf(record)}</div>
        {subtitle && (
          <div style={{ fontSize: 12.5, color: '#726c63', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {subtitle}
          </div>
        )}
        {tags.length > 0 && (
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 6 }}>
            {tags.map((t, i) => (
              <StatusPill key={i} label={t.label} color={t.color} />
            ))}
          </div>
        )}
      </div>
      <div onClick={(e) => e.stopPropagation()}>
        <RowActions resource={config.name} record={record} moreActions={config.rowActions?.(record)} />
      </div>
    </div>
  );
}
