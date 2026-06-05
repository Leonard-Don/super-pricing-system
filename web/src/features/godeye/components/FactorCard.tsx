// ---------------------------------------------------------------------------
// FactorCard — shadcn/Tailwind presentation component
// Rebuilt from frontend/src/components/GodEyeDashboard/FactorCard.js (201)
// Props in, callbacks out. No API calls.
// ---------------------------------------------------------------------------

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  signalColor,
  coverageColor,
  blindSpotColor,
  stabilityColor,
  concentrationColor,
  driftColor,
  flowColor,
  confirmationColor,
  dominanceColor,
  consistencyColor,
  reversalColor,
  precursorColor,
  policySourceColor,
} from '@/features/godeye/lib/macroFactorColors';
import { localizeGodEyeText } from '@/features/godeye/lib/displayLabels';
import { navigateDashboardAction } from '@/features/godeye/lib/navigationHelpers';
import type { FactorPanelFactor } from '@/features/godeye/lib/overviewViewModels';

// ---------------------------------------------------------------------------
// Internal types
// ---------------------------------------------------------------------------

interface EvidenceTagSpec {
  path: string;
  colorMap: Record<string, string>;
  prefix?: string;
  hide?: string;
}

interface EvidenceDetailSpec {
  path: string;
  label: string;
}

interface WarningSpec {
  flag: string;
  reason: string;
  label: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const EVIDENCE_TAG_SPECS: EvidenceTagSpec[] = [
  { path: 'coverage_summary.coverage_label', colorMap: coverageColor, prefix: '覆盖' },
  { path: 'stability_summary.label', colorMap: stabilityColor },
  { path: 'source_drift_summary.label', colorMap: driftColor, prefix: '来源漂移', hide: 'stable' },
  { path: 'source_gap_summary.label', colorMap: flowColor, prefix: '更新链路', hide: 'stable' },
  { path: 'cross_confirmation_summary.label', colorMap: confirmationColor, prefix: '跨源确认', hide: 'none' },
  { path: 'source_dominance_summary.label', colorMap: dominanceColor, prefix: '主导权', hide: 'stable' },
  { path: 'consistency_summary.label', colorMap: consistencyColor, prefix: '一致度', hide: 'unknown' },
  { path: 'reversal_summary.label', colorMap: reversalColor, prefix: '反转', hide: 'stable' },
  { path: 'reversal_precursor_summary.label', colorMap: precursorColor, prefix: '前兆', hide: 'none' },
  { path: 'policy_source_health_summary.label', colorMap: policySourceColor, prefix: '政策源', hide: 'unknown' },
];

const EVIDENCE_DETAIL_SPECS: EvidenceDetailSpec[] = [
  { path: 'stability_summary.reason', label: '稳定性' },
  { path: 'lag_summary.reason', label: '时效性' },
  { path: 'concentration_summary.reason', label: '集中度' },
  { path: 'source_drift_summary.reason', label: '来源漂移' },
  { path: 'source_gap_summary.reason', label: '更新节奏' },
  { path: 'cross_confirmation_summary.reason', label: '跨源确认' },
  { path: 'source_dominance_summary.reason', label: '主导权' },
  { path: 'consistency_summary.reason', label: '一致度' },
  { path: 'reversal_summary.reason', label: '反转' },
  { path: 'reversal_precursor_summary.reason', label: '前兆' },
  { path: 'policy_source_health_summary.reason', label: '政策源' },
];

const WARNING_SPECS: WarningSpec[] = [
  { flag: 'blind_spot_warning', reason: 'blind_spot_reason', label: '输入盲区' },
  { flag: 'lag_warning', reason: 'lag_reason', label: '证据滞后' },
  { flag: 'concentration_warning', reason: 'concentration_reason', label: '证据集中' },
  { flag: 'source_drift_warning', reason: 'source_drift_reason', label: '来源退化' },
  { flag: 'source_gap_warning', reason: 'source_gap_reason', label: '证据断流' },
  { flag: 'policy_source_warning', reason: 'policy_source_reason', label: '政策源退化' },
  { flag: 'source_dominance_warning', reason: 'source_dominance_reason', label: '主导权切换' },
  { flag: 'consistency_warning', reason: 'consistency_reason', label: '强弱分歧' },
  { flag: 'reversal_warning', reason: 'reversal_reason', label: '方向反转' },
  { flag: 'reversal_precursor_warning', reason: 'reversal_precursor_reason', label: '反转前兆' },
  { flag: 'stability_warning', reason: 'stability_reason', label: '锚点不稳' },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const getNestedValue = (obj: Record<string, unknown>, path: string): unknown => {
  const keys = path.split('.');
  let current: unknown = obj;
  for (const key of keys) {
    if (current == null || typeof current !== 'object') return undefined;
    current = (current as Record<string, unknown>)[key];
  }
  return current;
};

// Map color token string to Tailwind/semantic variant for Badge
const colorToVariant = (color: string): string => {
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

export interface FactorCardProps {
  factor: FactorPanelFactor;
  onNavigate?: (action: unknown) => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function FactorCard({ factor, onNavigate }: FactorCardProps) {
  const ev = (factor.evidenceSummary as Record<string, unknown>) ?? {};
  const meta = (factor.metadata as Record<string, unknown>) ?? {};

  const handleNavigate = (action: unknown) => {
    if (onNavigate) {
      onNavigate(action);
    } else {
      navigateDashboardAction(action as Parameters<typeof navigateDashboardAction>[0]);
    }
  };

  const signalVariant = colorToVariant(signalColor[String(factor.signal)] ?? 'secondary');

  return (
    <Card className="bg-card border-border">
      <CardContent className="flex flex-col gap-2 py-4">
        {/* Header row: name + signal */}
        <div className="flex items-center justify-between gap-2">
          <span className="font-semibold text-foreground truncate">{factor.displayName}</span>
          <Badge variant={signalVariant as 'destructive' | 'outline' | 'secondary' | 'default'}>
            {String(factor.signal)}
          </Badge>
        </div>

        {/* Z score */}
        <div>
          <span className="text-xs text-muted-foreground">Z 分数 </span>
          <span className="text-2xl font-semibold">{Number(factor.z_score ?? 0).toFixed(3)}</span>
        </div>

        {/* Confidence */}
        <div className="text-xs text-muted-foreground">
          置信度 {Number(factor.confidence ?? 0).toFixed(2)}
          {Number(meta.confidence_support_bonus ?? 0) > 0 ? (
            <span> · 加分 +{Number(meta.confidence_support_bonus ?? 0).toFixed(2)}</span>
          ) : null}
          {Number(meta.confidence_penalty ?? 0) > 0 ? (
            <span> · 折扣 -{Number(meta.confidence_penalty ?? 0).toFixed(2)}</span>
          ) : null}
        </div>

        {/* Evidence counts */}
        {(ev.source_count as number) ? (
          <div className="text-xs text-muted-foreground">
            证据 {ev.source_count as number} 源 / {(ev.record_count as number) || 0} 条
            {ev.official_source_count ? ` · 官方源 ${ev.official_source_count as number}` : ''}
            {ev.weighted_evidence_score !== undefined
              ? ` · 证据分 ${Number(ev.weighted_evidence_score ?? 0).toFixed(2)}`
              : ''}
            {(ev.coverage_summary as Record<string, unknown>)?.coverage_label
              ? ` · 覆盖 ${localizeGodEyeText(String((ev.coverage_summary as Record<string, unknown>).coverage_label ?? ''))}`
              : ''}
          </div>
        ) : null}

        {/* Signal tags row */}
        <div className="flex flex-wrap gap-1">
          <Badge
            variant={factor.trendDelta >= 0 ? 'outline' : 'secondary'}
            className={factor.trendDelta >= 0 ? 'text-pos' : 'text-neg'}
          >
            ΔZ {factor.trendDelta >= 0 ? '+' : ''}{Number(factor.trendDelta ?? 0).toFixed(3)}
          </Badge>

          {factor.signalChanged ? (
            <Badge variant="destructive">信号切换 {factor.previousSignal}→{String(factor.signal)}</Badge>
          ) : null}

          {(ev.conflict_level as string) && (ev.conflict_level as string) !== 'none' ? (
            <Badge variant="secondary">
              冲突 {localizeGodEyeText(ev.conflict_level as string)}
            </Badge>
          ) : null}

          {(ev.conflict_trend as string) && (ev.conflict_level as string) !== 'none' ? (
            <Badge variant="secondary">
              {localizeGodEyeText(ev.conflict_trend as string)}
            </Badge>
          ) : null}

          {meta.blind_spot_warning ? (
            <Badge variant={colorToVariant(blindSpotColor[meta.blind_spot_level as string] ?? 'orange') as 'destructive' | 'outline' | 'secondary' | 'default'}>
              输入盲区
            </Badge>
          ) : null}

          {meta.lag_warning ? (
            <Badge variant="secondary">证据滞后</Badge>
          ) : null}

          {meta.concentration_warning ? (
            <Badge variant={colorToVariant(concentrationColor[meta.concentration_level as string] ?? 'orange') as 'destructive' | 'outline' | 'secondary' | 'default'}>
              证据集中
            </Badge>
          ) : null}

          {EVIDENCE_TAG_SPECS.map(({ path, colorMap, prefix, hide }) => {
            const value = getNestedValue(ev, path);
            if (!value || value === hide) return null;
            const colorKey = String(value);
            return (
              <Badge
                key={path}
                variant={colorToVariant(colorMap[colorKey] ?? 'blue') as 'destructive' | 'outline' | 'secondary' | 'default'}
              >
                {prefix ? `${prefix} ` : ''}{localizeGodEyeText(colorKey)}
              </Badge>
            );
          })}
        </div>

        {/* Navigation CTA */}
        {factor.action ? (
          <Button
            size="sm"
            variant="outline"
            className="mt-1 self-start"
            onClick={() => handleNavigate(factor.action)}
          >
            {(factor.action as { label?: string }).label}
          </Button>
        ) : null}

        {/* Recent evidence */}
        {(ev.recent_evidence as Array<Record<string, unknown>>)?.[0] ? (
          <div className="mt-1 flex flex-col gap-1 text-xs text-muted-foreground">
            <span>最近证据 {String((ev.recent_evidence as Array<Record<string, unknown>>)[0].headline ?? '')}</span>
            {(ev.recent_evidence as Array<Record<string, unknown>>)[0].excerpt ? (
              <span>{String((ev.recent_evidence as Array<Record<string, unknown>>)[0].excerpt ?? '')}</span>
            ) : null}
            {(ev.recent_evidence as Array<Record<string, unknown>>)[0].canonical_entity ? (
              <span>实体 {String((ev.recent_evidence as Array<Record<string, unknown>>)[0].canonical_entity ?? '')}</span>
            ) : null}
            <span>
              {localizeGodEyeText(String((ev.recent_evidence as Array<Record<string, unknown>>)[0].source_tier ?? 'derived'))}
              {' · '}
              {localizeGodEyeText(String((ev.recent_evidence as Array<Record<string, unknown>>)[0].freshness_label ?? 'stale'))}
            </span>
          </div>
        ) : null}

        {/* Top entities */}
        {(ev.top_entities as Array<{ entity: string }>)?.length ? (
          <div className="text-xs text-muted-foreground">
            重点实体 {(ev.top_entities as Array<{ entity: string }>).map((item) => item.entity).join('，')}
          </div>
        ) : null}

        {/* Missing categories */}
        {(ev.coverage_summary as Record<string, unknown>)?.missing_categories
          && ((ev.coverage_summary as Record<string, unknown>).missing_categories as unknown[])?.length ? (
          <div className="text-xs text-muted-foreground">
            缺失维度{' '}
            {((ev.coverage_summary as Record<string, unknown>).missing_categories as string[])
              .map((item) => localizeGodEyeText(item))
              .join('，')}
          </div>
        ) : null}

        {/* Evidence detail lines */}
        {EVIDENCE_DETAIL_SPECS.map(({ path, label }) => {
          const value = getNestedValue(ev, path);
          if (!value) return null;
          return (
            <div key={path} className="text-xs text-muted-foreground">
              {label} {localizeGodEyeText(String(value))}
            </div>
          );
        })}

        {/* Warning lines */}
        {WARNING_SPECS.map(({ flag, reason, label }) => {
          if (!meta[flag]) return null;
          return (
            <div key={flag} className="text-xs text-destructive">
              {label} {localizeGodEyeText(String(meta[reason] ?? ''))}
            </div>
          );
        })}

        {/* Conflict details */}
        {(ev.conflicts as Array<Record<string, unknown>>)?.[0] ? (
          <div className="text-xs flex flex-col gap-0.5">
            <span className="text-destructive">
              证据分裂 {String((ev.conflicts as Array<Record<string, unknown>>)[0].summary ?? '')}
            </span>
            {(ev.conflicts as Array<Record<string, unknown>>)[0].source_pattern_label ? (
              <span className="text-muted-foreground">
                {String((ev.conflicts as Array<Record<string, unknown>>)[0].source_pattern_label ?? '')}
              </span>
            ) : null}
            {ev.conflict_trend_reason ? (
              <span className="text-muted-foreground">{String(ev.conflict_trend_reason)}</span>
            ) : null}
            {meta.confidence_penalty_reason && Number(meta.confidence_penalty ?? 0) > 0 ? (
              <span className="text-muted-foreground">置信度折扣 {String(meta.confidence_penalty_reason)}</span>
            ) : null}
            {meta.confidence_support_reason && Number(meta.confidence_support_bonus ?? 0) > 0 ? (
              <span className="text-muted-foreground">置信度加成 {String(meta.confidence_support_reason)}</span>
            ) : null}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

export default FactorCard;
