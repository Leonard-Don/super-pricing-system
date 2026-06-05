// ---------------------------------------------------------------------------
// MacroFactorPanel — shadcn/Tailwind presentation component
// Rebuilt from frontend/src/components/GodEyeDashboard/MacroFactorPanel.js (111)
// Props: factorPanelModel (from buildFactorPanelModel). No API calls.
// ---------------------------------------------------------------------------

import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { resonanceColor } from '@/features/godeye/lib/macroFactorColors';
import { getGodEyeStalenessLabel, localizeGodEyeText } from '@/features/godeye/lib/displayLabels';
import type { FactorPanelModel } from '@/features/godeye/lib/overviewViewModels';
import { FactorCard } from './FactorCard';
import { FactorTable } from './FactorTable';
import { PeopleLayerPanel, DepartmentChaosPanel, InputReliabilityPanel } from './MacroSummaryPanels';
import type { PeopleLayerSummary, DepartmentChaosSummary, InputReliabilitySummary } from './MacroSummaryPanels';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CLUSTER_LABELS: Record<string, string> = {
  positive_cluster: '正向共振',
  negative_cluster: '负向共振',
  weakening: '同步衰减',
  precursor: '反转前兆',
  reversed_factors: '已反转',
};

interface ConfidenceMetric {
  key: string;
  label: string;
}

const CONFIDENCE_METRICS: ConfidenceMetric[] = [
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

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const formatResonanceItems = (items: unknown[] = []): string =>
  (items ?? []).map((item) => localizeGodEyeText(String(item))).join('，');

const colorToVariant = (color: string): 'destructive' | 'outline' | 'secondary' | 'default' => {
  switch (color) {
    case 'red':
    case 'volcano':
      return 'destructive';
    case 'green':
      return 'outline';
    default:
      return 'secondary';
  }
};

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface MacroFactorPanelProps {
  factorPanelModel?: FactorPanelModel;
  onNavigate?: (action: unknown) => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function MacroFactorPanel({ factorPanelModel = {} as FactorPanelModel, onNavigate }: MacroFactorPanelProps) {
  const topFactors = factorPanelModel.topFactors ?? [];
  const factors = factorPanelModel.factors ?? [];
  const providerHealth = (factorPanelModel.providerHealth as Record<string, unknown>) ?? {};
  const staleness = (factorPanelModel.staleness as Record<string, unknown>) ?? {};
  const macroTrend = (factorPanelModel.macroTrend as Record<string, unknown>) ?? {};
  const resonanceSummary = (factorPanelModel.resonanceSummary as Record<string, unknown>) ?? {};
  const overallEvidence = (factorPanelModel.evidenceSummary as Record<string, unknown>) ?? {};
  const confidenceAdj = (factorPanelModel.confidenceAdjustment as Record<string, unknown>) ?? {};

  const stalenessLabel = getGodEyeStalenessLabel(staleness);
  const isStale = Boolean(staleness.is_stale);

  const macroScoreDelta = Number(macroTrend.macro_score_delta ?? 0);

  return (
    <Card className="bg-card border-border">
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-base font-semibold">宏观因子面板</CardTitle>
        <Badge variant={isStale ? 'secondary' : 'outline'}>{stalenessLabel}</Badge>
      </CardHeader>

      <CardContent className="flex flex-col gap-4">
        {factors.length ? (
          <>
            {/* Supplementary summary panels */}
            <PeopleLayerPanel
              peopleLayerSummary={factorPanelModel.peopleLayerSummary as PeopleLayerSummary}
            />
            <DepartmentChaosPanel
              departmentChaosSummary={factorPanelModel.departmentChaosSummary as DepartmentChaosSummary}
            />
            <InputReliabilityPanel
              inputReliabilitySummary={factorPanelModel.inputReliabilitySummary as InputReliabilitySummary}
            />

            {/* Top factor cards — responsive 3-column grid */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {topFactors.map((factor) => (
                <FactorCard
                  key={String(factor.name ?? factor.displayName)}
                  factor={factor}
                  onNavigate={onNavigate}
                />
              ))}
            </div>

            {/* Factor table */}
            <FactorTable factors={factors} />

            {/* Resonance + evidence metadata footer */}
            <div className="flex flex-wrap gap-x-4 gap-y-2 text-xs text-muted-foreground">
              {resonanceSummary?.label ? (
                <span className="flex items-center gap-1">
                  <Badge
                    variant={colorToVariant(resonanceColor[String(resonanceSummary.label)] ?? 'blue')}
                  >
                    共振 {localizeGodEyeText(String(resonanceSummary.label))}
                  </Badge>
                  {localizeGodEyeText(String(resonanceSummary.reason ?? ''))}
                </span>
              ) : null}

              {Object.keys(CLUSTER_LABELS).map((key) =>
                (resonanceSummary?.[key] as unknown[])?.length ? (
                  <span key={key}>
                    {CLUSTER_LABELS[key]} {formatResonanceItems(resonanceSummary[key] as unknown[])}
                  </span>
                ) : null
              )}

              <span>健康 {Number(providerHealth.healthy_providers ?? 0)}</span>
              <span>降级 {Number(providerHealth.degraded_providers ?? 0)}</span>
              <span>错误 {Number(providerHealth.error_providers ?? 0)}</span>

              <span>
                宏观分变化 {macroScoreDelta >= 0 ? '+' : ''}{macroScoreDelta.toFixed(3)}
              </span>

              {CONFIDENCE_METRICS.map(({ key, label }) =>
                Number(confidenceAdj[key] ?? 0) > 0 ? (
                  <span key={key}>
                    {label} {Number(confidenceAdj[key] ?? 0)} 因子
                  </span>
                ) : null
              )}

              <span>
                证据 {Number(overallEvidence.source_count ?? 0)} 源 / {Number(overallEvidence.record_count ?? 0)} 条
                {overallEvidence.official_source_count
                  ? ` · 官方源 ${Number(overallEvidence.official_source_count)}`
                  : ''}
                {overallEvidence.freshness_label
                  ? ` · ${localizeGodEyeText(String(overallEvidence.freshness_label))}`
                  : ''}
                {overallEvidence.conflict_level && overallEvidence.conflict_level !== 'none'
                  ? ` · 冲突 ${localizeGodEyeText(String(overallEvidence.conflict_level))}`
                  : ''}
                {overallEvidence.conflict_trend && overallEvidence.conflict_level !== 'none'
                  ? ` · ${localizeGodEyeText(String(overallEvidence.conflict_trend))}`
                  : ''}
              </span>
            </div>
          </>
        ) : (
          <div className="py-8 text-center text-muted-foreground text-sm">暂无宏观因子</div>
        )}
      </CardContent>
    </Card>
  );
}

export default MacroFactorPanel;
