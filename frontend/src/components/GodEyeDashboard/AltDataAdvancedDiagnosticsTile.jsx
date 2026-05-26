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
  Table,
  Tag,
  Typography,
} from 'antd';
import { ReloadOutlined } from '@ant-design/icons';

import {
  getAltDataProviderCorrelation,
  getAltDataThemesWithDiversity,
  getCompositeSignalsClusterAware,
  getCompositeSignalComparison,
} from '../../services/api';
import {
  ARCHIVE_LABELS_ZH,
  PROVIDER_LABELS_ZH,
} from '../../utils/altDataLabels';
import { localizeGodEyeText } from './displayLabels';

const { Text } = Typography;

const PROVIDER_CORRELATION_PARAMS = Object.freeze({ days_window: 45 });
const THEME_DIVERSITY_PARAMS = Object.freeze({
  days_window: 14,
  min_conviction: 'low',
  min_providers: 2,
  cluster_threshold: 0.9,
});
const CLUSTER_AWARE_PARAMS = Object.freeze({
  days_window: 14,
  min_conviction: 'low',
  cluster_threshold: 0.9,
  limit: 12,
});
const COMPARISON_PARAMS = Object.freeze({ days_window: 14, cluster_threshold: 0.9 });

const DIRECTION_TAG_COLOR = {
  bullish: 'green',
  bearish: 'red',
  mixed: 'gold',
  neutral: 'default',
};

const CONVICTION_TAG_COLOR = {
  high: 'green',
  medium: 'gold',
  low: 'orange',
  HIGH: 'green',
  MEDIUM: 'gold',
  LOW: 'orange',
};

const DIVERSITY_TAG_COLOR = {
  HIGH: 'green',
  MEDIUM: 'gold',
  LOW: 'orange',
};

const formatNumber = (value, digits = 2) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return '—';
  return numeric.toFixed(digits).replace(/\.0+$/, '').replace(/(\.\d*?)0+$/, '$1');
};

const providerLabel = (value) => {
  const raw = String(value || '').trim();
  return PROVIDER_LABELS_ZH[raw] || raw || '—';
};

const archiveLabel = (value) => {
  const raw = String(value || '').trim();
  return ARCHIVE_LABELS_ZH[raw] || raw || '—';
};

const directionLabel = (value) => {
  const direction = String(value || '').trim();
  if (direction === 'bullish') return '看多';
  if (direction === 'bearish') return '看空';
  if (direction === 'mixed') return '多空互现';
  if (direction === 'neutral') return '中性';
  return direction || '—';
};

const convictionLabel = (value) => String(value || '—').toUpperCase();

const pairLabel = (pair) => {
  if (!Array.isArray(pair) || pair.length < 3) return '—';
  return `${providerLabel(pair[0])} ↔ ${providerLabel(pair[1])} ${formatNumber(pair[2], 2)}`;
};

const clusterLabel = (cluster) => {
  if (!Array.isArray(cluster) || cluster.length === 0) return '—';
  return cluster.map(providerLabel).join(' + ');
};

const getSupportingClustersCount = (signal) => {
  if (typeof signal?.supporting_clusters_count === 'number') {
    return signal.supporting_clusters_count;
  }
  if (Array.isArray(signal?.supporting_clusters)) {
    return signal.supporting_clusters.length;
  }
  return 0;
};

function buildThemeColumns() {
  return [
    {
      title: '主题',
      dataIndex: 'industry',
      key: 'industry',
      render: (value) => <Text strong>{value || '—'}</Text>,
    },
    {
      title: '归档置信',
      dataIndex: 'conviction',
      key: 'conviction',
      render: (value) => (
        <Tag color={CONVICTION_TAG_COLOR[value] || 'default'}>{convictionLabel(value)}</Tag>
      ),
    },
    {
      title: '来源多样性',
      key: 'diversity',
      render: (_, record) => {
        const diversity = record?.cluster_diversity || {};
        const tier = diversity.diversity_tier || '—';
        return <Tag color={DIVERSITY_TAG_COLOR[tier] || 'default'}>{tier}</Tag>;
      },
    },
    {
      title: '来源 / 簇',
      key: 'providers_clusters',
      render: (_, record) => {
        const diversity = record?.cluster_diversity || {};
        return `${Number(diversity.providers_count || 0)} 来源 / ${Number(diversity.clusters_count || 0)} 簇`;
      },
    },
    {
      title: '支撑档案',
      dataIndex: 'supporting_archives',
      key: 'supporting_archives',
      render: (archives) => (
        <Space size={4} wrap>
          {(Array.isArray(archives) ? archives : []).slice(0, 4).map((archive) => (
            <Tag key={archive} style={{ marginInlineEnd: 0 }}>
              {archiveLabel(archive)}
            </Tag>
          ))}
        </Space>
      ),
    },
  ];
}

function buildClusterAwareColumns() {
  return [
    {
      title: '标的/行业',
      dataIndex: 'target',
      key: 'target',
      render: (value) => <Text strong>{value || '—'}</Text>,
    },
    {
      title: '方向',
      dataIndex: 'direction',
      key: 'direction',
      render: (value) => <Tag color={DIRECTION_TAG_COLOR[value] || 'default'}>{directionLabel(value)}</Tag>,
    },
    {
      title: 'cluster-aware 置信',
      dataIndex: 'conviction',
      key: 'conviction',
      render: (value) => <Tag color={CONVICTION_TAG_COLOR[value] || 'default'}>{convictionLabel(value)}</Tag>,
    },
    {
      title: '独立支撑簇',
      key: 'supporting_clusters_count',
      render: (_, record) => `${getSupportingClustersCount(record)} 个独立簇`,
    },
    {
      title: '强度',
      dataIndex: 'aggregate_strength',
      key: 'aggregate_strength',
      align: 'right',
      render: (value) => formatNumber(value, 2),
    },
  ];
}

function buildComparisonColumns() {
  return [
    {
      title: '行业',
      dataIndex: 'industry',
      key: 'industry',
      render: (value) => <Text strong>{value || '—'}</Text>,
    },
    {
      title: '方向',
      dataIndex: 'direction',
      key: 'direction',
      render: (value) => <Tag color={DIRECTION_TAG_COLOR[value] || 'default'}>{directionLabel(value)}</Tag>,
    },
    {
      title: 'Legacy → Cluster-aware',
      key: 'tier_shift',
      render: (_, record) => (
        <Text strong>
          {convictionLabel(record?.legacy_conviction)} → {convictionLabel(record?.cluster_aware_conviction)}
        </Text>
      ),
    },
    {
      title: '支撑口径变化',
      key: 'support_shift',
      render: (_, record) => `${Number(record?.legacy_supporting_components_count || 0)} 组件 → ${Number(record?.cluster_aware_supporting_clusters_count || 0)} 簇`,
    },
  ];
}

export default function AltDataAdvancedDiagnosticsTile() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchDiagnostics = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [correlation, themes, clusterAware, comparison] = await Promise.all([
        getAltDataProviderCorrelation(PROVIDER_CORRELATION_PARAMS),
        getAltDataThemesWithDiversity(THEME_DIVERSITY_PARAMS),
        getCompositeSignalsClusterAware(CLUSTER_AWARE_PARAMS),
        getCompositeSignalComparison(COMPARISON_PARAMS),
      ]);
      setData({
        correlation: correlation || {},
        themes: themes || {},
        clusterAware: clusterAware || {},
        comparison: comparison || {},
      });
    } catch (err) {
      setError(err?.userMessage || err?.message || '加载 alt-data 高级诊断失败');
      setData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchDiagnostics();
  }, [fetchDiagnostics]);

  const publicSummary = data?.correlation?.public_summary || {};
  const redundancyClusters = Array.isArray(data?.correlation?.redundancy_clusters)
    ? data.correlation.redundancy_clusters
    : Array.isArray(publicSummary.redundancy_clusters)
      ? publicSummary.redundancy_clusters
      : [];
  const redundantPair = publicSummary.most_redundant_pair || data?.correlation?.most_redundant_pair;
  const independentPair = publicSummary.most_independent_pair || data?.correlation?.most_independent_pair;
  const averageCorrelation = publicSummary.average_pairwise_correlation ?? data?.correlation?.average_pairwise_correlation;

  const themeRows = useMemo(
    () => (Array.isArray(data?.themes?.themes) ? data.themes.themes.map((row, index) => ({ ...row, key: `${row.industry || 'theme'}-${index}` })) : []),
    [data]
  );
  const clusterAwareRows = useMemo(
    () => (
      Array.isArray(data?.clusterAware?.composite_signals)
        ? data.clusterAware.composite_signals.slice(0, 8).map((row, index) => ({ ...row, key: `${row.target || 'cluster-aware'}-${row.direction || 'direction'}-${index}` }))
        : []
    ),
    [data]
  );
  const comparisonRows = useMemo(
    () => (
      Array.isArray(data?.comparison?.tier_changes)
        ? data.comparison.tier_changes.slice(0, 8).map((row, index) => ({ ...row, key: `${row.industry || 'comparison'}-${row.direction || 'direction'}-${index}` }))
        : []
    ),
    [data]
  );

  const themeColumns = useMemo(buildThemeColumns, []);
  const clusterAwareColumns = useMemo(buildClusterAwareColumns, []);
  const comparisonColumns = useMemo(buildComparisonColumns, []);
  const comparisonSummary = data?.comparison?.summary || {};
  const hasAnyContent = themeRows.length > 0 || clusterAwareRows.length > 0 || comparisonRows.length > 0 || redundancyClusters.length > 0;
  const auditDocUrl = data?.correlation?.audit_doc_url || data?.themes?.audit_doc_url || 'docs/alt_data_audit.md';

  return (
    <Card
      title="冗余与 cluster-aware 诊断"
      data-testid="alt-data-advanced-diagnostics-tile"
      extra={(
        <Space>
          <Button
            icon={<ReloadOutlined />}
            size="small"
            onClick={fetchDiagnostics}
            loading={loading}
            data-testid="alt-data-advanced-diagnostics-refresh"
          >
            刷新
          </Button>
          <a href={auditDocUrl} target="_blank" rel="noreferrer">
            审计文档
          </a>
        </Space>
      )}
      styles={{ body: { paddingTop: 10 } }}
    >
      {error ? (
        <Alert
          type="error"
          message="加载 alt-data 高级诊断失败"
          description={error}
          showIcon
          data-testid="alt-data-advanced-diagnostics-error"
        />
      ) : null}

      {loading && !data ? (
        <div style={{ textAlign: 'center', padding: 24 }}>
          <Spin data-testid="alt-data-advanced-diagnostics-spinner" />
        </div>
      ) : null}

      {!loading && !error && !hasAnyContent ? (
        <Empty description="暂无 provider 冗余、主题多样性或 cluster-aware 诊断结果" />
      ) : null}

      {data ? (
        <Space direction="vertical" size="middle" style={{ width: '100%' }}>
          <div data-testid="advanced-diagnostics-provider-summary">
            <Row gutter={[12, 12]}>
              <Col xs={24} md={8}>
                <Card size="small" variant="borderless">
                  <Space direction="vertical" size={2}>
                    <Text type="secondary">来源独立性</Text>
                    <Text strong>{`有效来源 ${Number(publicSummary.effective_provider_count || 0)}`}</Text>
                    <Text type="secondary">{`冗余簇 ${Number(publicSummary.redundant_cluster_count || 0)}`}</Text>
                    <Text type="secondary">{`平均相关 ${formatNumber(averageCorrelation, 2)}`}</Text>
                  </Space>
                </Card>
              </Col>
              <Col xs={24} md={8}>
                <Card size="small" variant="borderless">
                  <Space direction="vertical" size={2}>
                    <Text type="secondary">最冗余组合</Text>
                    <Text strong>{pairLabel(redundantPair)}</Text>
                    <Text type="secondary">{`最独立 ${pairLabel(independentPair)}`}</Text>
                  </Space>
                </Card>
              </Col>
              <Col xs={24} md={8}>
                <Card size="small" variant="borderless">
                  <Space direction="vertical" size={2}>
                    <Text type="secondary">Conviction shift</Text>
                    <Text strong>{`层级变化 ${Number(comparisonSummary.tier_changes_count || 0)}`}</Text>
                    <Text type="secondary">{`下调 ${Number(comparisonSummary.downgrades || 0)} · 上调 ${Number(comparisonSummary.upgrades || 0)}`}</Text>
                    <Text type="secondary">{`总比较 ${Number(comparisonSummary.total_comparisons || 0)}`}</Text>
                  </Space>
                </Card>
              </Col>
            </Row>
            {redundancyClusters.length ? (
              <Space size={6} wrap style={{ marginTop: 10 }}>
                <Text type="secondary">冗余簇:</Text>
                {redundancyClusters.slice(0, 6).map((cluster, index) => (
                  <Tag key={`cluster-${index}`} color={Array.isArray(cluster) && cluster.length > 1 ? 'orange' : 'blue'}>
                    {clusterLabel(cluster)}
                  </Tag>
                ))}
              </Space>
            ) : null}
          </div>

          <Row gutter={[16, 16]}>
            <Col xs={24} xl={12}>
              <Card size="small" title="长期主题来源多样性" variant="borderless">
                <Table
                  size="small"
                  data-testid="advanced-diagnostics-theme-table"
                  columns={themeColumns}
                  dataSource={themeRows}
                  pagination={false}
                  locale={{ emptyText: '暂无多样性主题' }}
                />
              </Card>
            </Col>
            <Col xs={24} xl={12}>
              <Card size="small" title="独立簇复合信号" variant="borderless">
                <Table
                  size="small"
                  data-testid="advanced-diagnostics-cluster-aware-table"
                  columns={clusterAwareColumns}
                  dataSource={clusterAwareRows}
                  pagination={false}
                  locale={{ emptyText: '暂无 cluster-aware 复合信号' }}
                />
              </Card>
            </Col>
            <Col xs={24}>
              <Card
                size="small"
                title="Legacy provider-vote 与 cluster-aware 层级变化"
                variant="borderless"
                extra={<Text type="secondary">{localizeGodEyeText('用于识别重复来源导致的置信度虚高。')}</Text>}
              >
                <Table
                  size="small"
                  data-testid="advanced-diagnostics-comparison-table"
                  columns={comparisonColumns}
                  dataSource={comparisonRows}
                  pagination={false}
                  locale={{ emptyText: '暂无层级变化' }}
                />
              </Card>
            </Col>
          </Row>
        </Space>
      ) : null}
    </Card>
  );
}
