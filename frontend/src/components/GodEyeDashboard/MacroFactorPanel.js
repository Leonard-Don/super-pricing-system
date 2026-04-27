import React from 'react';
import { Card, Col, Empty, Row, Tag, Typography } from 'antd';
import { resonanceColor } from './macroFactorColors';
import { PeopleLayerPanel, DepartmentChaosPanel, InputReliabilityPanel } from './MacroSummaryPanels';
import FactorCard from './FactorCard';
import FactorTable from './FactorTable';

const { Text } = Typography;

const CLUSTER_LABELS = {
  positive_cluster: '正向共振',
  negative_cluster: '负向共振',
  weakening: '同步衰减',
  precursor: '反转前兆',
  reversed_factors: '已反转',
};

const CONFIDENCE_METRICS = [
  { key: 'penalized_factor_count', label: '置信惩罚' },
  { key: 'boosted_factor_count', label: '置信加分' },
  { key: 'blind_spot_factor_count', label: '盲区' },
  { key: 'unstable_factor_count', label: '不稳定' },
  { key: 'lagging_factor_count', label: '滞后' },
  { key: 'concentrated_factor_count', label: '过度集中' },
  { key: 'drifting_factor_count', label: '漂移' },
  { key: 'broken_flow_factor_count', label: '链路断裂' },
  { key: 'confirmed_factor_count', label: '已确认' },
  { key: 'dominance_shift_factor_count', label: '主导权切换' },
  { key: 'inconsistent_factor_count', label: '不一致' },
  { key: 'reversing_factor_count', label: '反转' },
  { key: 'precursor_factor_count', label: '前兆' },
];

function MacroFactorPanel({ model = {}, onNavigate }) {
  const topFactors = model.topFactors || [];
  const factors = model.factors || [];
  const providerHealth = model.providerHealth || {};
  const staleness = model.staleness || {};
  const macroTrend = model.macroTrend || {};
  const resonanceSummary = model.resonanceSummary || {};
  const overallEvidence = model.evidenceSummary || {};
  const confidenceAdj = model.confidenceAdjustment || {};

  return (
    <Card
      title="宏观因子面板"
      variant="borderless"
      extra={<Tag color={staleness.is_stale ? 'orange' : 'green'}>{staleness.label || '新鲜'}</Tag>}
      styles={{ body: { display: 'flex', flexDirection: 'column', gap: 16 } }}
    >
      {factors.length ? (
        <>
          <PeopleLayerPanel peopleLayerSummary={model.peopleLayerSummary} />
          <DepartmentChaosPanel departmentChaosSummary={model.departmentChaosSummary} />
          <InputReliabilityPanel inputReliabilitySummary={model.inputReliabilitySummary} />

          <Row gutter={[12, 12]}>
            {topFactors.map((factor) => (
              <Col xs={24} md={8} key={factor.name}>
                <FactorCard factor={factor} onNavigate={onNavigate} />
              </Col>
            ))}
          </Row>

          <FactorTable factors={factors} />

          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
            {resonanceSummary?.label ? (
              <Text type="secondary">
                <Tag color={resonanceColor[resonanceSummary.label] || 'blue'}>共振 {resonanceSummary.label}</Tag>
                {resonanceSummary.reason}
              </Text>
            ) : null}
            {Object.keys(CLUSTER_LABELS).map((key) =>
              resonanceSummary?.[key]?.length ? (
                <Text key={key} type="secondary">{CLUSTER_LABELS[key]} {resonanceSummary[key].join('，')}</Text>
              ) : null
            )}
            <Text type="secondary">健康 {providerHealth.healthy_providers || 0}</Text>
            <Text type="secondary">降级 {providerHealth.degraded_providers || 0}</Text>
            <Text type="secondary">错误 {providerHealth.error_providers || 0}</Text>
            <Text type="secondary">
              宏观分变化 {Number(macroTrend.macro_score_delta || 0) >= 0 ? '+' : ''}{Number(macroTrend.macro_score_delta || 0).toFixed(3)}
            </Text>
            {CONFIDENCE_METRICS.map(({ key, label }) =>
              Number(confidenceAdj[key] || 0) > 0 ? (
                <Text key={key} type="secondary">{label} {Number(confidenceAdj[key] || 0)} 因子</Text>
              ) : null
            )}
            <Text type="secondary">
              证据 {overallEvidence.source_count || 0} 源 / {overallEvidence.record_count || 0} 条
              {overallEvidence.official_source_count ? ` · 官方源 ${overallEvidence.official_source_count}` : ''}
              {overallEvidence.freshness_label ? ` · ${overallEvidence.freshness_label}` : ''}
              {overallEvidence.conflict_level && overallEvidence.conflict_level !== 'none' ? ` · 冲突 ${overallEvidence.conflict_level}` : ''}
              {overallEvidence.conflict_trend && overallEvidence.conflict_level !== 'none' ? ` · ${overallEvidence.conflict_trend}` : ''}
            </Text>
          </div>
        </>
      ) : (
        <Empty description="暂无宏观因子" />
      )}
    </Card>
  );
}

export default MacroFactorPanel;
