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

import dayjs from '../../utils/dayjs';
import { formatRelativeRefresh as sharedFormatRelativeRefresh } from '../../utils/relativeTime';
import { getAltDataHealth } from '../../services/api';
import { COMPONENT_LABELS_ZH } from '../../utils/altDataLabels';

const { Text } = Typography;

const VERDICT_COLOR = {
  PRODUCTION: 'green',
  'WORKING-PROTOTYPE': 'gold',
  'SCAFFOLDING-ONLY': 'orange',
  DEAD: 'red',
};

const VERDICT_LABELS = {
  PRODUCTION: '生产可用',
  'WORKING-PROTOTYPE': '可用原型',
  'SCAFFOLDING-ONLY': '仅脚手架',
  DEAD: '停用',
  UNKNOWN: '未知',
};

const HEALTH_COMPONENT_LABELS = {
  ...COMPONENT_LABELS_ZH,
  people: '人的维度',
  people_layer: '人的维度',
  lme_inventory: 'LME 库存',
  shfe_inventory: '上期所库存',
  policy_execution: '政策执行',
};

const SUMMARY_CARDS = [
  { key: 'production_count', label: VERDICT_LABELS.PRODUCTION, bg: 'rgba(82, 196, 26, 0.18)', accent: '#52c41a' },
  { key: 'working_prototype_count', label: VERDICT_LABELS['WORKING-PROTOTYPE'], bg: 'rgba(250, 219, 20, 0.18)', accent: '#faad14' },
  { key: 'scaffolding_only_count', label: VERDICT_LABELS['SCAFFOLDING-ONLY'], bg: 'rgba(250, 140, 22, 0.18)', accent: '#fa8c16' },
  { key: 'dead_count', label: VERDICT_LABELS.DEAD, bg: 'rgba(255, 77, 79, 0.18)', accent: '#ff4d4f' },
];

/**
 * Backwards-compatible wrapper around the shared ``formatRelativeRefresh``
 * util. Kept here so the existing ``import { formatRelativeRefresh }``
 * call sites and tests keep working without churn; new code should import
 * the shared util directly from ``utils/relativeTime``.
 */
export function formatRelativeRefresh(value, now = new Date()) {
  return sharedFormatRelativeRefresh(value, { now });
}

const TONE_STYLE = {
  fresh: { color: '#52c41a' },
  warn: { color: '#faad14' },
  stale: { color: '#ff4d4f' },
  placeholder: { color: 'rgba(245, 248, 252, 0.55)' },
};

const formatHealthToken = (value) => {
  const raw = String(value || '').trim();
  if (!raw) {
    return '—';
  }
  return raw
    .split('/')
    .map((part) => {
      const token = String(part || '').trim();
      return HEALTH_COMPONENT_LABELS[token] || token.replace(/_/g, ' ');
    })
    .join(' / ');
};

function buildColumns() {
  return [
    {
      title: '组件',
      dataIndex: 'name',
      key: 'name',
      render: (value, record) => <Text strong>{record?.name_zh || formatHealthToken(value)}</Text>,
    },
    {
      title: '子模块',
      dataIndex: 'sub_package',
      key: 'sub_package',
      render: (value, record) => <Text type="secondary">{record?.sub_package_zh || formatHealthToken(value)}</Text>,
    },
    {
      title: '判定',
      dataIndex: 'verdict',
      key: 'verdict',
      render: (value) => (
        <Tag color={VERDICT_COLOR[value] || 'default'} data-testid={`alt-data-health-verdict-${value || 'unknown'}`}>
          {VERDICT_LABELS[value] || value || VERDICT_LABELS.UNKNOWN}
        </Tag>
      ),
    },
    {
      title: '最近刷新',
      dataIndex: 'last_refresh_at',
      key: 'last_refresh_at',
      render: (value) => {
        const { label, tone } = formatRelativeRefresh(value);
        return (
          <Text style={TONE_STYLE[tone]} data-testid={`alt-data-health-refresh-${tone}`}>
            {label}
          </Text>
        );
      },
    },
    {
      title: '审计章节',
      dataIndex: 'audit_section_ref',
      key: 'audit_section_ref',
      render: (value) =>
        value ? (
          <a href={value} target="_blank" rel="noreferrer noopener">
            查看
          </a>
        ) : (
          <Text type="secondary">—</Text>
        ),
    },
  ];
}

export default function AltDataHealthTile() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchHealth = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const payload = await getAltDataHealth();
      setData(payload || null);
    } catch (err) {
      setError(err?.userMessage || err?.message || '加载另类数据健康清单失败');
      setData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchHealth();
  }, [fetchHealth]);

  const columns = useMemo(buildColumns, []);
  const rows = useMemo(
    () =>
      (data?.manifest || []).map((row, idx) => ({
        key: row?.name || `row-${idx}`,
        ...row,
      })),
    [data]
  );

  const auditDocUrl = data?.audit_doc_url || 'docs/alt_data_audit.md';

  return (
    <Card
      title="另类数据健康"
      data-testid="alt-data-health-tile"
      extra={(
        <Button
          icon={<ReloadOutlined />}
          size="small"
          onClick={fetchHealth}
          loading={loading}
          data-testid="alt-data-health-refresh"
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
          message="无法加载另类数据健康清单"
          description={error}
          data-testid="alt-data-health-error"
        />
      ) : loading && !data ? (
        <div style={{ minHeight: 240, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Spin size="large" />
        </div>
      ) : !data ? (
        <Empty description="暂无另类数据健康清单" image={Empty.PRESENTED_IMAGE_SIMPLE} />
      ) : (
        <>
          <Row gutter={[12, 12]} style={{ marginBottom: 12 }} data-testid="alt-data-health-summary">
            {SUMMARY_CARDS.map((item) => (
              <Col key={item.key} xs={12} md={6}>
                <div
                  style={{
                    padding: '12px 14px',
                    borderRadius: 10,
                    background: item.bg,
                    borderLeft: `4px solid ${item.accent}`,
                  }}
                  data-testid={`alt-data-health-stat-${item.key}`}
                >
                  <Statistic
                    title={<Text style={{ color: '#f5f8fc' }}>{item.label}</Text>}
                    value={Number(data?.[item.key] || 0)}
                    valueStyle={{ color: item.accent, fontWeight: 600 }}
                  />
                </div>
              </Col>
            ))}
          </Row>
          <Table
            size="small"
            columns={columns}
            dataSource={rows}
            pagination={false}
            data-testid="alt-data-health-table"
          />
          <Space style={{ marginTop: 12, width: '100%', justifyContent: 'space-between' }} wrap>
            <Text type="secondary">
              共 {Number(data?.total_components || rows.length || 0)} 个组件；快照生成于{' '}
              {data?.generated_at ? dayjs(data.generated_at).format('YYYY-MM-DD HH:mm') : '—'}
            </Text>
            <Text type="secondary">
              完整审计见{' '}
              <a href={auditDocUrl} target="_blank" rel="noreferrer noopener">
                {auditDocUrl}
              </a>
            </Text>
          </Space>
        </>
      )}
    </Card>
  );
}
