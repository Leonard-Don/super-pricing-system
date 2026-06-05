// ---------------------------------------------------------------------------
// CrossMarketOverview — shadcn/Tailwind presentation component
// Rebuilt from frontend/src/components/GodEyeDashboard/CrossMarketOverview.js (318)
// Props: crossMarketCards (from buildCrossMarketCards). No API calls.
// Navigation CTAs via navigateDashboardAction; workbench-coupled targets → TODO (P3).
// ---------------------------------------------------------------------------

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  getGodEyeExecutionPostureLabel,
  getGodEyeSourceModeLabel,
  getGodEyeTemplateDescription,
  getGodEyeTemplateLabel,
  getGodEyeTemplateTheme,
  localizeGodEyeText,
} from '@/features/godeye/lib/displayLabels';

// ---------------------------------------------------------------------------
// Internal lookup tables (mirrors reference JS constants)
// ---------------------------------------------------------------------------

const CONSTRUCTION_MODE_LABELS: Record<string, string> = {
  equal_weight: '等权配对',
  ols_hedge: 'OLS 对冲',
};

const RESONANCE_LABELS: Record<string, string> = {
  bullish_cluster: '正向共振',
  bearish_cluster: '逆向共振',
  precursor_cluster: '前兆共振',
  fading_cluster: '衰减共振',
  reversal_cluster: '反转共振',
  mixed: '混合',
};

const HEALTH_LABELS: Record<string, string> = {
  healthy: '健康',
  watch: '需关注',
  fragile: '脆弱',
  unknown: '未知',
};

const POLICY_EXECUTION_LABELS: Record<string, string> = {
  stable: '稳定',
  watch: '需关注',
  chaotic: '混乱',
  unknown: '未知',
};

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

const formatConstructionMode = (value = ''): string =>
  CONSTRUCTION_MODE_LABELS[String(value ?? '').trim().toLowerCase()] ??
  String(value ?? '').replace(/_/g, ' / ');

const formatResonanceLabel = (value = ''): string =>
  RESONANCE_LABELS[String(value ?? '').trim().toLowerCase()] ??
  String(value ?? '').replace(/_/g, ' / ');

const formatHealthLabel = (value = ''): string =>
  HEALTH_LABELS[String(value ?? '').trim().toLowerCase()] ?? value;

const formatPolicyExecutionLabel = (value = ''): string =>
  POLICY_EXECUTION_LABELS[String(value ?? '').trim().toLowerCase()] ?? value;

/** Derive Badge variant from a health status string. */
const healthVariant = (
  status: string,
): 'destructive' | 'secondary' | 'outline' | 'default' => {
  switch (String(status ?? '').toLowerCase()) {
    case 'fragile':
    case 'chaotic':
      return 'destructive';
    case 'watch':
      return 'secondary';
    default:
      return 'outline';
  }
};

/** Derive Badge variant for source mode label. */
const sourceModeVariant = (
  label: string,
): 'destructive' | 'secondary' | 'outline' | 'default' => {
  switch (String(label ?? '').toLowerCase()) {
    case 'official-led':
      return 'outline';
    case 'fallback-heavy':
      return 'secondary';
    default:
      return 'default';
  }
};

/** Map driver type to Badge variant. */
const driverVariant = (
  type: string,
): 'destructive' | 'secondary' | 'outline' | 'default' => {
  switch (type) {
    case 'alert':
      return 'destructive';
    case 'resonance':
    case 'factor':
      return 'secondary';
    default:
      return 'default';
  }
};

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface MatchedDriver {
  key: string;
  label: string;
  type: string;
}

interface TaskRefreshReviewContextShift {
  lead?: string;
}

interface TaskRefreshPolicySourceShift {
  currentReason?: string;
}

interface TaskRefreshInputReliabilityShift {
  currentLead?: string;
  savedLabel?: string;
  currentLabel?: string;
}

interface TaskRefreshBiasCompressionShift {
  currentReason?: string;
  savedScale?: number | string;
  currentScale?: number | string;
}

interface TaskRefreshSelectionQualityShift {
  currentReason?: string;
}

interface TaskRefreshSelectionQualityRunState {
  active?: boolean;
  label?: string;
  baseScore?: number | string;
  effectiveScore?: number | string;
  reason?: string;
}

export interface CrossMarketCard {
  id: string;
  recommendationTier?: string;
  recommendationTone?: string;
  recommendationScore?: number | string;
  construction_mode?: string;
  executionPosture?: string;
  longCount?: number | string;
  shortCount?: number | string;
  resonanceLabel?: string;
  policySourceHealthLabel?: string;
  inputReliabilityLabel?: string;
  sourceModeLabel?: string;
  policyExecutionLabel?: string;
  trendLabel?: string;
  trendTone?: string;
  trendSummary?: string;
  taskRefreshLabel?: string;
  taskRefreshTone?: string;
  taskRefreshResonanceDriven?: boolean;
  taskRefreshBiasCompressionCore?: boolean;
  taskRefreshSelectionQualityDriven?: boolean;
  taskRefreshSelectionQualityActive?: boolean;
  taskRefreshReviewContextDriven?: boolean;
  taskRefreshInputReliabilityDriven?: boolean;
  rankingPenalty?: boolean | number;
  taskRefreshPolicySourceDriven?: boolean;
  taskRefreshBiasCompressionDriven?: boolean;
  themeCore?: string;
  themeSupport?: string;
  driverHeadline?: string;
  policyExecutionReason?: string;
  policyExecutionTopDepartment?: string;
  policyExecutionRiskBudgetScale?: number | string;
  sourceModeReason?: string;
  sourceModeRiskBudgetScale?: number | string;
  resonanceReason?: string;
  taskRefreshSummary?: string;
  taskRefreshReviewContextShift?: TaskRefreshReviewContextShift;
  taskRecentComparisonLead?: string;
  taskRefreshPolicySourceShift?: TaskRefreshPolicySourceShift;
  taskRefreshInputReliabilityShift?: TaskRefreshInputReliabilityShift;
  taskRefreshBiasCompressionShift?: TaskRefreshBiasCompressionShift;
  taskRefreshSelectionQualityShift?: TaskRefreshSelectionQualityShift;
  taskRefreshSelectionQualityRunState?: TaskRefreshSelectionQualityRunState;
  taskRefreshTopCompressedAsset?: string;
  rankingPenaltyReason?: string;
  baseRecommendationScore?: number | string;
  policySourceHealthReason?: string;
  inputReliabilityLead?: string;
  inputReliabilityScore?: number | string;
  inputReliabilityPosture?: string;
  matchedDrivers?: MatchedDriver[];
  latestThemeCore?: string;
  latestThemeSupport?: string;
  latestTopCompressedAsset?: string;
  latestCompressionEffect?: number | string;
  stance?: string;
  action: {
    target?: string;
    template?: string;
    label?: string;
    source?: string;
    note?: string;
    focus?: string;
    draft?: string;
  };
  taskAction?: {
    target?: string;
    label?: string;
    taskId?: string;
    type?: string;
    refresh?: string;
    reason?: string;
    sourceFilter?: string;
  };
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface CrossMarketOverviewProps {
  crossMarketCards: CrossMarketCard[];
  onNavigate: (action: unknown) => void;
}

// ---------------------------------------------------------------------------
// Sub-component: single card
// ---------------------------------------------------------------------------

function CrossMarketCard_({ card, onNavigate }: { card: CrossMarketCard; onNavigate: (action: unknown) => void }) {
  const loc = (value = ''): string => localizeGodEyeText(value);

  return (
    <div className="rounded-[14px] p-4 bg-card border border-border flex flex-col gap-2 h-full">
      {/* --- Badge cluster --- */}
      <div className="flex flex-wrap gap-1.5">
        <Badge variant="secondary">{card.recommendationTier ?? '候选方案'}</Badge>
        <Badge variant="default">{formatConstructionMode(card.construction_mode)}</Badge>

        {card.executionPosture ? (
          <Badge variant="outline">{getGodEyeExecutionPostureLabel(card.executionPosture)}</Badge>
        ) : null}

        <Badge variant="secondary">
          {card.longCount}L / {card.shortCount}S
        </Badge>

        <Badge variant="outline">
          评分 {Number(card.recommendationScore ?? 0).toFixed(2)}
        </Badge>

        {card.resonanceLabel && card.resonanceLabel !== 'mixed' ? (
          <Badge variant="secondary">
            共振 {formatResonanceLabel(card.resonanceLabel)}
          </Badge>
        ) : null}

        {card.policySourceHealthLabel && card.policySourceHealthLabel !== 'unknown' ? (
          <Badge variant={healthVariant(card.policySourceHealthLabel)}>
            政策源 {formatHealthLabel(card.policySourceHealthLabel)}
          </Badge>
        ) : null}

        {card.inputReliabilityLabel && card.inputReliabilityLabel !== 'unknown' ? (
          <Badge variant={healthVariant(card.inputReliabilityLabel)}>
            输入 {formatHealthLabel(card.inputReliabilityLabel)}
          </Badge>
        ) : null}

        {card.sourceModeLabel && card.sourceModeLabel !== 'mixed' ? (
          <Badge variant={sourceModeVariant(card.sourceModeLabel)}>
            来源 {getGodEyeSourceModeLabel({ label: card.sourceModeLabel })}
          </Badge>
        ) : null}

        {card.policyExecutionLabel && card.policyExecutionLabel !== 'unknown' ? (
          <Badge variant={healthVariant(card.policyExecutionLabel)}>
            政策执行 {formatPolicyExecutionLabel(card.policyExecutionLabel)}
          </Badge>
        ) : null}

        {card.trendLabel ? (
          <Badge variant="secondary">{card.trendLabel}</Badge>
        ) : null}

        {card.taskRefreshLabel ? (
          <Badge variant="secondary">{card.taskRefreshLabel}</Badge>
        ) : null}

        {card.taskRefreshResonanceDriven ? (
          <Badge variant="secondary">共振驱动</Badge>
        ) : null}

        {card.taskRefreshBiasCompressionCore ? (
          <Badge variant="destructive">核心腿受压</Badge>
        ) : null}

        {card.taskRefreshSelectionQualityDriven ? (
          <Badge variant="secondary">自动降级驱动</Badge>
        ) : null}

        {card.taskRefreshSelectionQualityActive ? (
          <Badge variant="secondary">降级运行</Badge>
        ) : null}

        {card.taskRefreshReviewContextDriven ? (
          <Badge variant="default">复核语境切换</Badge>
        ) : null}

        {card.taskRefreshInputReliabilityDriven ? (
          <Badge variant="default">输入可靠度变化</Badge>
        ) : null}

        {card.rankingPenalty ? (
          <Badge variant="secondary">排序降级</Badge>
        ) : null}

        {card.taskRefreshPolicySourceDriven ? (
          <Badge variant="destructive">政策源驱动</Badge>
        ) : null}

        {card.taskRefreshBiasCompressionDriven ? (
          <Badge variant="secondary">偏置收缩</Badge>
        ) : null}
      </div>

      {/* --- Template identity --- */}
      <div className="text-base font-semibold text-foreground">
        {getGodEyeTemplateLabel(card)}
      </div>

      <p className="text-primary text-sm">
        {getGodEyeTemplateTheme(card) || '宏观主题'}
      </p>

      {(card.themeCore || card.themeSupport) ? (
        <p className="text-muted-foreground text-xs">
          核心腿：{loc(card.themeCore) || '暂无'} ｜ 辅助腿：{loc(card.themeSupport) || '暂无'}
        </p>
      ) : null}

      <p className="text-sm text-muted-foreground min-h-[48px]">
        {getGodEyeTemplateDescription(card)}
      </p>

      {card.driverHeadline ? (
        <p className="text-sm text-muted-foreground min-h-[52px]">
          {loc(card.driverHeadline)}
        </p>
      ) : null}

      {/* --- Policy execution reason --- */}
      {card.policyExecutionReason ? (
        <p className="text-xs text-pos min-h-[30px]">
          政策执行：{loc(card.policyExecutionReason)}
          {card.policyExecutionTopDepartment ? ` · ${loc(card.policyExecutionTopDepartment)}` : ''}
          {card.policyExecutionRiskBudgetScale !== undefined
            ? ` · 风险预算 ${Number(card.policyExecutionRiskBudgetScale ?? 1).toFixed(2)}x`
            : ''}
        </p>
      ) : null}

      {/* --- Source mode reason --- */}
      {card.sourceModeReason ? (
        <p className="text-xs text-muted-foreground min-h-[30px]">
          来源治理：{loc(card.sourceModeReason)}
          {card.sourceModeRiskBudgetScale !== undefined
            ? ` · 风险预算 ${Number(card.sourceModeRiskBudgetScale ?? 1).toFixed(2)}x`
            : ''}
        </p>
      ) : null}

      {/* --- Resonance reason --- */}
      {card.resonanceReason && card.resonanceLabel !== 'mixed' ? (
        <p className="text-xs text-muted-foreground min-h-[32px]">
          {loc(card.resonanceReason)}
        </p>
      ) : null}

      {/* --- Trend summary --- */}
      {card.trendSummary ? (
        <p className="text-xs text-pos min-h-[36px]">
          {loc(card.trendSummary)}
        </p>
      ) : null}

      {/* --- Task refresh summary --- */}
      {card.taskRefreshSummary ? (
        <p className="text-xs text-muted-foreground min-h-[36px]">
          {loc(card.taskRefreshSummary)}
        </p>
      ) : null}

      {/* --- Review context shift --- */}
      {card.taskRefreshReviewContextShift?.lead ? (
        <p className="text-xs text-muted-foreground min-h-[28px]">
          {loc(card.taskRefreshReviewContextShift.lead)}
        </p>
      ) : null}

      {/* --- Recent comparison --- */}
      {card.taskRecentComparisonLead ? (
        <p className="text-xs text-muted-foreground min-h-[30px]">
          最近两版：{loc(card.taskRecentComparisonLead)}
        </p>
      ) : null}

      {/* --- Policy source shift --- */}
      {card.taskRefreshPolicySourceShift?.currentReason ? (
        <p className="text-xs text-neg min-h-[30px]">
          政策源状态：{loc(card.taskRefreshPolicySourceShift.currentReason)}
        </p>
      ) : null}

      {/* --- Input reliability shift --- */}
      {card.taskRefreshInputReliabilityShift?.currentLead ? (
        <p className="text-xs text-muted-foreground min-h-[30px]">
          输入可靠度：{loc(card.taskRefreshInputReliabilityShift.currentLead)}
        </p>
      ) : null}

      {/* --- Bias compression shift --- */}
      {card.taskRefreshBiasCompressionShift?.currentReason ? (
        <p className="text-xs text-muted-foreground min-h-[30px]">
          偏置收缩：{loc(card.taskRefreshBiasCompressionShift.currentReason)}
          {' · '}
          强度 {Number(card.taskRefreshBiasCompressionShift.savedScale ?? 1).toFixed(2)}x→{Number(card.taskRefreshBiasCompressionShift.currentScale ?? 1).toFixed(2)}x
        </p>
      ) : null}

      {/* --- Selection quality shift (only if no bias compression) --- */}
      {card.taskRefreshSelectionQualityShift?.currentReason &&
      !card.taskRefreshBiasCompressionShift?.currentReason ? (
        <p className="text-xs text-muted-foreground min-h-[26px]">
          自动降级：{loc(card.taskRefreshSelectionQualityShift.currentReason)}
        </p>
      ) : null}

      {/* --- Selection quality run state --- */}
      {card.taskRefreshSelectionQualityRunState?.active ? (
        <p className="text-xs text-muted-foreground min-h-[28px]">
          降级运行：当前结果已按 {loc(card.taskRefreshSelectionQualityRunState.label ?? '')} 强度运行
          {card.taskRefreshSelectionQualityRunState.baseScore ||
          card.taskRefreshSelectionQualityRunState.effectiveScore
            ? ` · ${Number(card.taskRefreshSelectionQualityRunState.baseScore ?? 0).toFixed(2)}→${Number(card.taskRefreshSelectionQualityRunState.effectiveScore ?? 0).toFixed(2)}`
            : ''}
          {card.taskRefreshSelectionQualityRunState.reason
            ? ` · ${loc(card.taskRefreshSelectionQualityRunState.reason)}`
            : ''}
        </p>
      ) : null}

      {/* --- Top compressed asset --- */}
      {card.taskRefreshTopCompressedAsset ? (
        <p className="text-xs text-muted-foreground min-h-[24px]">
          压缩焦点：{card.taskRefreshTopCompressedAsset}
          {card.taskRefreshBiasCompressionCore ? ' · 主题核心腿已进入压缩焦点' : ''}
        </p>
      ) : null}

      {/* --- Ranking penalty reason --- */}
      {card.rankingPenaltyReason ? (
        <p className="text-xs text-muted-foreground min-h-[26px]">
          排序调整：{loc(card.rankingPenaltyReason)}
          {card.baseRecommendationScore !== undefined
            ? ` · ${Number(card.baseRecommendationScore ?? 0).toFixed(2)}→${Number(card.recommendationScore ?? 0).toFixed(2)}`
            : ''}
        </p>
      ) : null}

      {/* --- Policy source health reason --- */}
      {card.policySourceHealthReason && !card.taskRefreshPolicySourceShift?.currentReason ? (
        <p className="text-xs text-neg min-h-[30px]">
          政策源质量：{loc(card.policySourceHealthReason)}
        </p>
      ) : null}

      {/* --- Input reliability lead --- */}
      {card.inputReliabilityLead ? (
        <p className="text-xs text-muted-foreground min-h-[30px]">
          输入可靠度：{loc(card.inputReliabilityLead)}
          {card.inputReliabilityScore
            ? ` · 评分 ${Number(card.inputReliabilityScore ?? 0).toFixed(2)}`
            : ''}
        </p>
      ) : null}

      {/* --- Input reliability posture --- */}
      {card.inputReliabilityPosture ? (
        <p className="text-xs text-muted-foreground min-h-[24px]">
          使用姿势：{loc(card.inputReliabilityPosture)}
        </p>
      ) : null}

      {/* --- Matched drivers --- */}
      {(card.matchedDrivers ?? []).length > 0 ? (
        <div className="flex flex-wrap gap-1.5 mb-2">
          {(card.matchedDrivers ?? []).map((driver) => (
            <Badge key={driver.key} variant={driverVariant(driver.type)}>
              {loc(driver.label)}
            </Badge>
          ))}
        </div>
      ) : null}

      {/* --- Latest theme legs --- */}
      {(card.latestThemeCore || card.latestThemeSupport) ? (
        <p className="text-xs text-muted-foreground mb-2">
          核心腿：{loc(card.latestThemeCore) || '暂无'} ｜ 辅助腿：{loc(card.latestThemeSupport) || '暂无'}
        </p>
      ) : null}

      {/* --- Latest top compressed asset --- */}
      {card.latestTopCompressedAsset ? (
        <p className="text-xs text-pos mb-2">
          当前压缩焦点：{card.latestTopCompressedAsset}
          {card.latestCompressionEffect
            ? ` ｜ 收缩 ${Number(card.latestCompressionEffect ?? 0).toFixed(1)}pp`
            : ''}
        </p>
      ) : null}

      {/* --- Stance --- */}
      <p className="text-sm text-muted-foreground mb-3">{card.stance}</p>

      {/* --- CTA buttons --- */}
      <div className="flex flex-wrap gap-2">
        <Button size="sm" onClick={() => onNavigate(card.action)}>
          {card.action.label ?? '查看方案'}
        </Button>

        {card.taskAction ? (
          <Button
            size="sm"
            variant="secondary"
            onClick={() => onNavigate(card.taskAction)}
          >
            {card.taskAction.label ?? '打开任务'}
          </Button>
        ) : null}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function CrossMarketOverview({ crossMarketCards, onNavigate }: CrossMarketOverviewProps) {
  return (
    <Card className="bg-card border-border">
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-foreground">跨市场方案总览</CardTitle>
        <Badge variant="secondary">{crossMarketCards.length} 个方案</Badge>
      </CardHeader>

      <CardContent className="min-h-[320px]">
        {crossMarketCards.length === 0 ? (
          <p className="text-muted-foreground text-sm py-8 text-center">暂无跨市场方案</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {crossMarketCards.map((card) => (
              <CrossMarketCard_ key={card.id} card={card} onNavigate={onNavigate} />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default CrossMarketOverview;
