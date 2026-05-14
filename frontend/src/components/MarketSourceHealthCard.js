import React from 'react';
import { Card, Empty, Space, Table, Tag, Typography } from 'antd';

const { Text } = Typography;

const AGGREGATE_TONE_COLOR = {
  healthy: 'green',
  degraded: 'gold',
  down: 'red',
  unknown: 'default',
};

const SOURCE_TONE_COLOR = {
  ok: 'green',
  warn: 'gold',
  bad: 'red',
  unknown: 'default',
};

const AGGREGATE_TONE_LABEL = {
  healthy: '全部就绪',
  degraded: '部分降级',
  down: '主链路故障',
  unknown: '未知',
};

const renderStatusCell = (model) => (
  <Space size={6}>
    <Tag color={SOURCE_TONE_COLOR[model.tone] || 'default'}>{model.statusLabel}</Tag>
    {model.required ? <Tag color="blue">必需</Tag> : null}
    {model.isFallback ? <Tag color="purple">fallback</Tag> : null}
    {model.requiresKey ? <Tag color="geekblue">需 API key</Tag> : null}
  </Space>
);

const renderCapabilitiesCell = (tags) => {
  if (!Array.isArray(tags) || tags.length === 0) return <Text type="secondary">--</Text>;
  return (
    <Space size={4} wrap>
      {tags.map((tag) => (
        <Tag key={tag}>{tag}</Tag>
      ))}
    </Space>
  );
};

const renderLastFetch = (lastFetch) => {
  if (!lastFetch) return null;
  return (
    <Card
      size="small"
      type="inner"
      title={(
        <Space size={8} wrap>
          <Tag color={SOURCE_TONE_COLOR[lastFetch.tone] || 'default'}>最近取数</Tag>
          <Text strong>{lastFetch.headline}</Text>
          <Text type="secondary">{lastFetch.freshnessLabel}</Text>
        </Space>
      )}
      data-testid="market-source-health-last-fetch"
    >
      <Space direction="vertical" size={4} style={{ width: '100%' }}>
        {lastFetch.attempts.map((attempt, index) => (
          <Space key={`${attempt.id}-${index}`} size={6} wrap>
            <Tag color={SOURCE_TONE_COLOR[attempt.tone] || 'default'}>{attempt.statusLabel}</Tag>
            <Text strong>{attempt.label || attempt.id}</Text>
            {attempt.isFallback ? <Tag color="purple">fallback</Tag> : null}
            {typeof attempt.rowCount === 'number' ? (
              <Text type="secondary">{attempt.rowCount} 行</Text>
            ) : null}
            {attempt.reason ? (
              <Text type="secondary">· {attempt.reason}</Text>
            ) : null}
          </Space>
        ))}
      </Space>
    </Card>
  );
};

const MarketSourceHealthCard = ({ model, title = '数据源就绪状况', extra = null }) => {
  if (!model) {
    return (
      <Card size="small" title={title} extra={extra}>
        <Empty description="暂无数据源健康信息" image={Empty.PRESENTED_IMAGE_SIMPLE} />
      </Card>
    );
  }

  const aggregateColor = AGGREGATE_TONE_COLOR[model.tone] || 'default';
  const aggregateLabel = AGGREGATE_TONE_LABEL[model.tone] || model.tone;

  return (
    <Card
      size="small"
      title={(
        <Space size={8} wrap>
          <Tag color={aggregateColor} data-testid="market-source-health-tone">{aggregateLabel}</Tag>
          <Text strong>{title}</Text>
          <Text type="secondary">{model.freshnessLabel}</Text>
        </Space>
      )}
      extra={extra}
      data-testid="market-source-health-card"
    >
      <Space direction="vertical" size="middle" style={{ width: '100%' }}>
        <Text>{model.summary}</Text>
        {model.headline.defaultLabel ? (
          <Text type="secondary">
            主源：{model.headline.defaultLabel}
            {model.headline.fallbackEnabled ? '（已启用 fallback 链）' : '（未启用 fallback）'}
          </Text>
        ) : null}
        {model.sources.length === 0 ? (
          <Empty description="未配置任何数据源" image={Empty.PRESENTED_IMAGE_SIMPLE} />
        ) : (
          <Table
            size="small"
            pagination={false}
            rowKey="id"
            dataSource={model.sources}
            columns={[
              {
                title: '数据源',
                dataIndex: 'label',
                render: (label, record) => (
                  <Space size={4}>
                    <Text strong>{label}</Text>
                    {record.priority !== null && record.priority !== undefined ? (
                      <Text type="secondary">#{record.priority}</Text>
                    ) : null}
                  </Space>
                ),
              },
              {
                title: '状态',
                dataIndex: 'statusLabel',
                render: (_, record) => renderStatusCell(record),
              },
              {
                title: '能力',
                dataIndex: 'capabilityTags',
                render: (tags) => renderCapabilitiesCell(tags),
              },
              {
                title: '更新',
                dataIndex: 'freshnessLabel',
                render: (label, record) => (
                  <Space size={6}>
                    <Text type="secondary">{label}</Text>
                    {record.rateLimit ? <Tag>{record.rateLimit}</Tag> : null}
                  </Space>
                ),
              },
              {
                title: '原因',
                dataIndex: 'reason',
                render: (reason) => reason
                  ? <Text type="secondary">{reason}</Text>
                  : <Text type="secondary">--</Text>,
              },
            ]}
          />
        )}
        {renderLastFetch(model.lastFetch)}
      </Space>
    </Card>
  );
};

export default MarketSourceHealthCard;
