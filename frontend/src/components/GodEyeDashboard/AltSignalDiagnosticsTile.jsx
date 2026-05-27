import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Button,
  Card,
  Col,
  Empty,
  Row,
  Space,
  Spin,
  Statistic,
  Table,
  Tag,
  Typography,
} from 'antd';
import { ReloadOutlined } from '@ant-design/icons';

import { getAltSignalDiagnostics } from '../../services/api';
import { PROVIDER_LABELS_ZH } from '../../utils/altDataLabels';

const { Text } = Typography;

const DEFAULT_PARAMS = Object.freeze({ timeframe: '90d', limit: 300, half_life_days: 14 });

const HIT_RATE_TYPE_LABELS = {
  realized: '真实命中',
  proxy: 'proxy',
  none: '无样本',
};

const formatPercent = (value) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return '—';
  return `${(numeric * 100).toFixed(1)}%`;
};

const formatNumber = (value, digits = 3) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return '—';
  return numeric.toFixed(digits).replace(/\.0+$/, '').replace(/(\.\d*?)0+$/, '$1');
};

const DIAGNOSTIC_LABELS_ZH = {
  ...PROVIDER_LABELS_ZH,
  people: '人的维度',
  people_layer: '人的维度',
  policy: '政策',
};

const providerLabel = (value) => {
  const raw = String(value || '').trim();
  return DIAGNOSTIC_LABELS_ZH[raw] || raw || '—';
};

const buildProviderColumns = () => [
  {
    title: '来源/类别',
    dataIndex: 'label',
    key: 'label',
    render: (_, record) => <Text strong>{record.label}</Text>,
  },
  {
    title: '样本',
    dataIndex: 'count',
    key: 'count',
    align: 'right',
  },
  {
    title: '命中率',
    dataIndex: 'hit_rate',
    key: 'hit_rate',
    align: 'right',
    render: (value, record) => (
      <Space size={6}>
        <Text>{formatPercent(value)}</Text>
        <Tag>{HIT_RATE_TYPE_LABELS[record?.hit_rate_type] || record?.hit_rate_type || '—'}</Tag>
      </Space>
    ),
  },
  {
    title: '平均强度',
    dataIndex: 'avg_strength',
    key: 'avg_strength',
    align: 'right',
    render: (value) => formatNumber(value),
  },
  {
    title: '平均置信',
    dataIndex: 'avg_confidence',
    key: 'avg_confidence',
    align: 'right',
    render: (value) => formatNumber(value),
  },
];

const buildDecayColumns = () => [
  {
    title: '信号年龄',
    dataIndex: 'age_days',
    key: 'age_days',
    render: (value) => `${formatNumber(value, 0)} 天`,
  },
  {
    title: '衰减权重',
    dataIndex: 'decay_weight',
    key: 'decay_weight',
    align: 'right',
    render: (value) => formatNumber(value, 3),
  },
  {
    title: '平均衰减后信号',
    dataIndex: 'avg_decayed_signal',
    key: 'avg_decayed_signal',
    align: 'right',
    render: (value) => formatNumber(value, 3),
  },
];

const buildRecentRecordColumns = () => [
  {
    title: '记录',
    dataIndex: 'record_id',
    key: 'record_id',
    render: (value) => <Text code>{value || '—'}</Text>,
  },
  {
    title: '来源',
    dataIndex: 'source',
    key: 'source',
    render: (value) => providerLabel(value),
  },
  {
    title: '类别',
    dataIndex: 'category',
    key: 'category',
  },
  {
    title: '年龄',
    dataIndex: 'age_days',
    key: 'age_days',
    align: 'right',
    render: (value) => `${formatNumber(value, 1)} 天`,
  },
  {
    title: '衰减后强度',
    dataIndex: 'decayed_strength',
    key: 'decayed_strength',
    align: 'right',
    render: (value) => formatNumber(value, 3),
  },
];

export default function AltSignalDiagnosticsTile() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchDiagnostics = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const payload = await getAltSignalDiagnostics(DEFAULT_PARAMS);
      setData(payload || null);
    } catch (err) {
      setError(err?.userMessage || err?.message || '加载另类数据信号诊断失败');
      setData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchDiagnostics();
  }, [fetchDiagnostics]);

  const providerRows = useMemo(() => {
    const providers = Array.isArray(data?.providers) ? data.providers : [];
    const categories = Array.isArray(data?.categories) ? data.categories : [];
    return [
      ...providers.map((row, index) => ({
        ...row,
        key: `provider-${row.provider || 'unknown'}-${index}`,
        label: providerLabel(row.provider),
      })),
      ...categories.map((row, index) => ({
        ...row,
        key: `category-${row.category || 'unknown'}-${index}`,
        label: providerLabel(row.category),
      })),
    ];
  }, [data]);

  const decayRows = useMemo(
    () => (Array.isArray(data?.decay_curve) ? data.decay_curve.map((row, index) => ({ ...row, key: `decay-${row.age_days ?? 'unknown'}-${index}` })) : []),
    [data]
  );

  const recentRows = useMemo(
    () => (Array.isArray(data?.recent_records) ? data.recent_records.map((row, index) => ({ ...row, key: `${row.record_id || 'record'}-${index}` })) : []),
    [data]
  );

  const providerColumns = useMemo(buildProviderColumns, []);
  const decayColumns = useMemo(buildDecayColumns, []);
  const recentColumns = useMemo(buildRecentRecordColumns, []);
  const overall = data?.overall || {};
  const hitRateType = overall.hit_rate_type || 'none';

  return (
    <Card
      title="信号命中率与衰减诊断"
      data-testid="alt-signal-diagnostics-tile"
      extra={(
        <Button
          icon={<ReloadOutlined />}
          size="small"
          onClick={fetchDiagnostics}
          loading={loading}
          data-testid="alt-signal-diagnostics-refresh"
        >
          刷新
        </Button>
      )}
      styles={{ body: { minHeight: 320 } }}
    >
      {error ? (
        <Alert
          type="error"
          showIcon
          message="无法加载信号诊断"
          description={error}
          data-testid="alt-signal-diagnostics-error"
        />
      ) : loading && !data ? (
        <div style={{ minHeight: 240, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Spin size="large" />
        </div>
      ) : !data ? (
        <Empty description="暂无信号诊断" image={Empty.PRESENTED_IMAGE_SIMPLE} />
      ) : (
        <Space direction="vertical" size={16} style={{ width: '100%' }}>
          <Row gutter={[12, 12]}>
            <Col xs={12} md={6}>
              <div data-testid="alt-signal-diagnostics-record-count">
                <Statistic title="样本数" value={Number(data.record_count || 0)} />
              </div>
            </Col>
            <Col xs={12} md={6}>
              <Statistic title="总体命中率" value={formatPercent(overall.hit_rate)} />
            </Col>
            <Col xs={12} md={6}>
              <Statistic title="平均置信" value={formatNumber(overall.avg_confidence)} />
            </Col>
            <Col xs={12} md={6}>
              <Statistic title="半衰期" value={`${formatNumber(data.half_life_days, 0)} 天`} />
            </Col>
          </Row>

          <Space wrap>
            <Tag color={hitRateType === 'realized' ? 'green' : 'gold'}>
              {HIT_RATE_TYPE_LABELS[hitRateType] || hitRateType}
            </Tag>
            <Text type="secondary">{Number(data.realized_outcome_count || 0)} 条真实 outcome</Text>
            <Text type="secondary">窗口 {data.timeframe || DEFAULT_PARAMS.timeframe}</Text>
            {data.snapshot_timestamp ? <Text type="secondary">快照 {data.snapshot_timestamp}</Text> : null}
          </Space>
          {data.hit_rate_note ? (
            <Alert type="info" showIcon message="口径说明" description={data.hit_rate_note} />
          ) : null}

          {providerRows.length ? (
            <Table
              size="small"
              columns={providerColumns}
              dataSource={providerRows}
              pagination={false}
              data-testid="alt-signal-diagnostics-provider-table"
            />
          ) : (
            <Empty description="暂无来源/类别分组" image={Empty.PRESENTED_IMAGE_SIMPLE} />
          )}

          <Row gutter={[16, 16]}>
            <Col xs={24} xl={10}>
              <Table
                size="small"
                columns={decayColumns}
                dataSource={decayRows}
                pagination={false}
                data-testid="alt-signal-diagnostics-decay-table"
              />
            </Col>
            <Col xs={24} xl={14}>
              <Table
                size="small"
                columns={recentColumns}
                dataSource={recentRows}
                pagination={false}
                data-testid="alt-signal-diagnostics-recent-table"
              />
            </Col>
          </Row>
        </Space>
      )}
    </Card>
  );
}
