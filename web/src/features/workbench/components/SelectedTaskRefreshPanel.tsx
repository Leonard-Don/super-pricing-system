// SelectedTaskRefreshPanel — priority-meta alert + recommendation for the
// selected task. Ported from
// frontend/src/components/research-workbench/SelectedTaskRefreshPanel.js (279 lines).
//
// Presentation-only: props-in / callbacks-out.
// Props: priorityMeta (from useSelectedTaskIntelligence / lib).
// Empty state when priorityMeta is null.

import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Partial refresh-signal shape consumed by the panel. */
export interface RefreshSignalPriorityMeta {
  refreshLabel?: string;
  refreshTone?: string;
  recommendation?: string;
  summary?: string;
  resonanceDriven?: boolean;
  biasCompressionShift?: { coreLegAffected?: boolean; [key: string]: unknown } | null;
  selectionQualityDriven?: boolean;
  selectionQualityRunState?: { active?: boolean; [key: string]: unknown } | null;
  reviewContextDriven?: boolean;
  structuralDecayRadarDriven?: boolean;
  structuralDecayDriven?: boolean;
  tradeThesisDriven?: boolean;
  peopleLayerDriven?: boolean;
  departmentChaosDriven?: boolean;
  inputReliabilityDriven?: boolean;
  policySourceDriven?: boolean;
  biasCompressionDriven?: boolean;
  macroShift?: {
    currentScore?: number;
    savedScore?: number;
    scoreGap?: number;
    signalShift?: boolean;
    savedSignal?: string;
    currentSignal?: string;
  } | null;
  policySourceShift?: {
    savedLabel?: string;
    currentLabel?: string;
    fullTextRatioGap?: number;
    currentReason?: string;
  } | null;
  inputReliabilityShift?: {
    savedLabel?: string;
    currentLabel?: string;
    scoreGap?: number;
    currentLead?: string;
    actionHint?: string;
  } | null;
  departmentChaosShift?: {
    savedLabel?: string;
    currentLabel?: string;
    scoreGap?: number;
    topDepartmentLabel?: string;
    topDepartmentReason?: string;
    actionHint?: string;
  } | null;
  structuralDecayRadarShift?: {
    savedLabel?: string;
    currentLabel?: string;
    scoreGap?: number;
    criticalAxisGap?: number;
    topSignalSummary?: string;
    currentSummary?: string;
    actionHint?: string;
  } | null;
  structuralDecayShift?: {
    savedAction?: string;
    currentAction?: string;
    scoreGap?: number;
    currentFailure?: string;
    currentSummary?: string;
    evidenceSummary?: string;
    actionHint?: string;
  } | null;
  tradeThesisShift?: {
    savedStance?: string;
    currentStance?: string;
    savedLeadLeg?: string;
    currentLeadLeg?: string;
    currentSummary?: string;
    evidenceSummary?: string;
    actionHint?: string;
  } | null;
  peopleLayerShift?: {
    savedRiskLevel?: string;
    currentRiskLevel?: string;
    savedStance?: string;
    currentStance?: string;
    fragilityGap?: number;
    currentSummary?: string;
    evidenceSummary?: string;
    actionHint?: string;
  } | null;
  selectionQualityShift?: {
    savedLabel?: string;
    currentLabel?: string;
    penaltyGap?: number;
    currentReason?: string;
  } | null;
  altShift?: {
    changedCategories?: Array<{
      category: string;
      previousMomentum: string;
      currentMomentum: string;
    }>;
    emergentCategories?: Array<{
      category: string;
      momentum: string;
      delta: number;
    }>;
  } | null;
  factorShift?: Array<{
    label: string;
    zScoreDelta: number;
    signalChanged?: boolean;
  }> | null;
  [key: string]: unknown;
}

export interface SelectedTaskRefreshPanelProps {
  priorityMeta: RefreshSignalPriorityMeta | null;
}

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------

function fmt(value: number | undefined | null, decimals = 2): string {
  const n = Number(value ?? 0);
  return `${n >= 0 ? '+' : ''}${n.toFixed(decimals)}`;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function SelectedTaskRefreshPanel({
  priorityMeta,
}: SelectedTaskRefreshPanelProps) {
  return (
    <Card size="sm" data-testid="refresh-panel">
      <CardHeader className="pb-1">
        <CardTitle className="text-sm flex flex-wrap items-center gap-1.5">
          <span>输入变化与更新建议</span>

          {/* Badge row — driven-by signals */}
          {priorityMeta && (
            <div className="flex flex-wrap gap-1 ml-1">
              {priorityMeta.refreshLabel && (
                <Badge
                  data-testid="refresh-label-badge"
                  variant="outline"
                  className="text-xs"
                >
                  {priorityMeta.refreshLabel}
                </Badge>
              )}
              {priorityMeta.resonanceDriven && (
                <Badge
                  data-testid="refresh-badge-resonance"
                  variant="outline"
                  className="text-xs bg-fuchsia-500/10 text-fuchsia-400 border-fuchsia-500/30"
                >
                  共振驱动
                </Badge>
              )}
              {priorityMeta.biasCompressionShift?.coreLegAffected && (
                <Badge
                  data-testid="refresh-badge-core-leg"
                  variant="outline"
                  className="text-xs bg-orange-500/10 text-orange-400 border-orange-500/30"
                >
                  核心腿受压
                </Badge>
              )}
              {priorityMeta.selectionQualityDriven && (
                <Badge
                  data-testid="refresh-badge-selection-quality"
                  variant="outline"
                  className="text-xs bg-amber-500/10 text-amber-400 border-amber-500/30"
                >
                  自动降级
                </Badge>
              )}
              {priorityMeta.selectionQualityRunState?.active && (
                <Badge
                  data-testid="refresh-badge-selection-quality-run"
                  variant="outline"
                  className="text-xs bg-yellow-500/10 text-yellow-400 border-yellow-500/30"
                >
                  降级运行
                </Badge>
              )}
              {priorityMeta.reviewContextDriven && (
                <Badge
                  data-testid="refresh-badge-review-context"
                  variant="outline"
                  className="text-xs bg-indigo-500/10 text-indigo-400 border-indigo-500/30"
                >
                  复核语境切换
                </Badge>
              )}
              {priorityMeta.structuralDecayRadarDriven && (
                <Badge
                  data-testid="refresh-badge-structural-decay-radar"
                  variant="outline"
                  className="text-xs text-destructive border-destructive/30"
                >
                  系统衰败雷达
                </Badge>
              )}
              {priorityMeta.structuralDecayDriven && (
                <Badge
                  data-testid="refresh-badge-structural-decay"
                  variant="outline"
                  className="text-xs text-destructive border-destructive/30"
                >
                  结构性衰败
                </Badge>
              )}
              {priorityMeta.tradeThesisDriven && (
                <Badge
                  data-testid="refresh-badge-trade-thesis"
                  variant="outline"
                  className="text-xs bg-cyan-500/10 text-cyan-400 border-cyan-500/30"
                >
                  交易 Thesis 漂移
                </Badge>
              )}
              {priorityMeta.peopleLayerDriven && (
                <Badge
                  data-testid="refresh-badge-people-layer"
                  variant="outline"
                  className="text-xs bg-purple-500/10 text-purple-400 border-purple-500/30"
                >
                  人的维度
                </Badge>
              )}
              {priorityMeta.departmentChaosDriven && (
                <Badge
                  data-testid="refresh-badge-department-chaos"
                  variant="outline"
                  className="text-xs text-destructive border-destructive/30"
                >
                  部门混乱
                </Badge>
              )}
              {priorityMeta.inputReliabilityDriven && (
                <Badge
                  data-testid="refresh-badge-input-reliability"
                  variant="outline"
                  className="text-xs bg-blue-500/10 text-blue-400 border-blue-500/30"
                >
                  输入可靠度
                </Badge>
              )}
              {priorityMeta.policySourceDriven && (
                <Badge
                  data-testid="refresh-badge-policy-source"
                  variant="outline"
                  className="text-xs bg-red-500/10 text-red-400 border-red-500/30"
                >
                  政策源驱动
                </Badge>
              )}
              {priorityMeta.biasCompressionDriven && (
                <Badge
                  data-testid="refresh-badge-bias-compression"
                  variant="outline"
                  className="text-xs bg-amber-500/10 text-amber-400 border-amber-500/30"
                >
                  偏置收缩
                </Badge>
              )}
            </div>
          )}
        </CardTitle>
      </CardHeader>

      <CardContent>
        {!priorityMeta ? (
          <p className="text-sm text-muted-foreground">
            当前任务还没有足够的输入快照，先继续积累研究记录。
          </p>
        ) : (
          <div className="space-y-2">
            {/* Main recommendation */}
            {priorityMeta.recommendation && (
              <p className="text-sm font-semibold">{priorityMeta.recommendation}</p>
            )}
            {priorityMeta.summary && (
              <p className="text-sm text-muted-foreground">{priorityMeta.summary}</p>
            )}

            {/* Macro shift */}
            {priorityMeta.macroShift && (
              <p className="text-sm text-muted-foreground">
                当前宏观分数{' '}
                {Number(priorityMeta.macroShift.currentScore ?? 0).toFixed(2)}
                {' · '}
                保存时{' '}
                {Number(priorityMeta.macroShift.savedScore ?? 0).toFixed(2)}
                {' · '}
                Δ{fmt(priorityMeta.macroShift.scoreGap, 2)}
                {priorityMeta.macroShift.signalShift
                  ? ` · 信号 ${priorityMeta.macroShift.savedSignal}→${priorityMeta.macroShift.currentSignal}`
                  : ''}
              </p>
            )}

            {/* Policy source shift */}
            {priorityMeta.policySourceShift && (
              <p className="text-sm text-muted-foreground">
                政策源{' '}
                {priorityMeta.policySourceShift.savedLabel}→
                {priorityMeta.policySourceShift.currentLabel}
                {priorityMeta.policySourceShift.fullTextRatioGap != null
                  ? ` · 正文覆盖 ${fmt(priorityMeta.policySourceShift.fullTextRatioGap, 2)}`
                  : ''}
                {priorityMeta.policySourceShift.currentReason
                  ? ` · ${priorityMeta.policySourceShift.currentReason}`
                  : ''}
              </p>
            )}

            {/* Input reliability shift */}
            {priorityMeta.inputReliabilityShift && (
              <>
                <p className="text-sm text-muted-foreground">
                  输入可靠度{' '}
                  {priorityMeta.inputReliabilityShift.savedLabel}→
                  {priorityMeta.inputReliabilityShift.currentLabel}
                  {priorityMeta.inputReliabilityShift.scoreGap != null
                    ? ` · score ${fmt(priorityMeta.inputReliabilityShift.scoreGap, 2)}`
                    : ''}
                  {priorityMeta.inputReliabilityShift.currentLead
                    ? ` · ${priorityMeta.inputReliabilityShift.currentLead}`
                    : ''}
                </p>
                {priorityMeta.inputReliabilityShift.actionHint && (
                  <p className="text-sm font-semibold text-pos">
                    {priorityMeta.inputReliabilityShift.actionHint}
                  </p>
                )}
              </>
            )}

            {/* Department chaos shift */}
            {priorityMeta.departmentChaosShift && (
              <>
                <p className="text-sm text-muted-foreground">
                  部门混乱{' '}
                  {priorityMeta.departmentChaosShift.savedLabel}→
                  {priorityMeta.departmentChaosShift.currentLabel}
                  {priorityMeta.departmentChaosShift.scoreGap != null
                    ? ` · score ${fmt(priorityMeta.departmentChaosShift.scoreGap, 2)}`
                    : ''}
                  {priorityMeta.departmentChaosShift.topDepartmentLabel
                    ? ` · 焦点 ${priorityMeta.departmentChaosShift.topDepartmentLabel}`
                    : ''}
                  {priorityMeta.departmentChaosShift.topDepartmentReason
                    ? ` · ${priorityMeta.departmentChaosShift.topDepartmentReason}`
                    : ''}
                </p>
                {priorityMeta.departmentChaosShift.actionHint && (
                  <p className="text-sm font-semibold text-neg">
                    {priorityMeta.departmentChaosShift.actionHint}
                  </p>
                )}
              </>
            )}

            {/* Selection quality */}
            {priorityMeta.selectionQualityShift && (
              <p className="text-sm text-muted-foreground">
                自动降级{' '}
                {priorityMeta.selectionQualityShift.savedLabel}→
                {priorityMeta.selectionQualityShift.currentLabel}
                {priorityMeta.selectionQualityShift.penaltyGap != null
                  ? ` · 惩罚 ${fmt(priorityMeta.selectionQualityShift.penaltyGap, 2)}`
                  : ''}
                {priorityMeta.selectionQualityShift.currentReason
                  ? ` · ${priorityMeta.selectionQualityShift.currentReason}`
                  : ''}
              </p>
            )}

            {priorityMeta.selectionQualityRunState?.active && (
              <p className="text-sm font-semibold text-amber-400">
                当前保存结果已经在降级强度下运行，建议优先重看研究页而不是只做被动观察。
              </p>
            )}

            {/* Structural decay radar */}
            {priorityMeta.structuralDecayRadarShift && (
              <>
                <p className="text-sm text-muted-foreground">
                  系统衰败雷达{' '}
                  {priorityMeta.structuralDecayRadarShift.savedLabel}→
                  {priorityMeta.structuralDecayRadarShift.currentLabel}
                  {priorityMeta.structuralDecayRadarShift.scoreGap != null
                    ? ` · score ${fmt(priorityMeta.structuralDecayRadarShift.scoreGap, 2)}`
                    : ''}
                  {priorityMeta.structuralDecayRadarShift.criticalAxisGap != null
                    ? ` · 关键轴 ${fmt(priorityMeta.structuralDecayRadarShift.criticalAxisGap, 0)}`
                    : ''}
                  {priorityMeta.structuralDecayRadarShift.topSignalSummary
                    ? ` · ${priorityMeta.structuralDecayRadarShift.topSignalSummary}`
                    : ''}
                  {priorityMeta.structuralDecayRadarShift.currentSummary
                    ? ` · ${priorityMeta.structuralDecayRadarShift.currentSummary}`
                    : ''}
                </p>
                {priorityMeta.structuralDecayRadarShift.actionHint && (
                  <p className="text-sm font-semibold text-neg">
                    {priorityMeta.structuralDecayRadarShift.actionHint}
                  </p>
                )}
              </>
            )}

            {/* Structural decay */}
            {priorityMeta.structuralDecayShift && (
              <>
                <p className="text-sm text-muted-foreground">
                  衰败判断{' '}
                  {priorityMeta.structuralDecayShift.savedAction}→
                  {priorityMeta.structuralDecayShift.currentAction}
                  {priorityMeta.structuralDecayShift.scoreGap != null
                    ? ` · score ${fmt(priorityMeta.structuralDecayShift.scoreGap, 2)}`
                    : ''}
                  {priorityMeta.structuralDecayShift.currentFailure
                    ? ` · ${priorityMeta.structuralDecayShift.currentFailure}`
                    : ''}
                  {priorityMeta.structuralDecayShift.currentSummary
                    ? ` · ${priorityMeta.structuralDecayShift.currentSummary}`
                    : ''}
                </p>
                {priorityMeta.structuralDecayShift.evidenceSummary && (
                  <p className="text-sm text-muted-foreground">
                    衰败证据 {priorityMeta.structuralDecayShift.evidenceSummary}
                  </p>
                )}
                {priorityMeta.structuralDecayShift.actionHint && (
                  <p className="text-sm font-semibold text-neg">
                    {priorityMeta.structuralDecayShift.actionHint}
                  </p>
                )}
              </>
            )}

            {/* Trade thesis */}
            {priorityMeta.tradeThesisShift && (
              <>
                <p className="text-sm text-muted-foreground">
                  交易 Thesis
                  {priorityMeta.tradeThesisShift.savedStance
                    ? ` ${priorityMeta.tradeThesisShift.savedStance}→${priorityMeta.tradeThesisShift.currentStance}`
                    : ''}
                  {priorityMeta.tradeThesisShift.savedLeadLeg &&
                  priorityMeta.tradeThesisShift.currentLeadLeg
                    ? ` · 主腿 ${priorityMeta.tradeThesisShift.savedLeadLeg}→${priorityMeta.tradeThesisShift.currentLeadLeg}`
                    : ''}
                  {priorityMeta.tradeThesisShift.currentSummary
                    ? ` · ${priorityMeta.tradeThesisShift.currentSummary}`
                    : ''}
                </p>
                {priorityMeta.tradeThesisShift.evidenceSummary && (
                  <p className="text-sm text-muted-foreground">
                    Thesis 证据 {priorityMeta.tradeThesisShift.evidenceSummary}
                  </p>
                )}
                {priorityMeta.tradeThesisShift.actionHint && (
                  <p className="text-sm font-semibold text-cyan-400">
                    {priorityMeta.tradeThesisShift.actionHint}
                  </p>
                )}
              </>
            )}

            {/* People layer */}
            {priorityMeta.peopleLayerShift && (
              <>
                <p className="text-sm text-muted-foreground">
                  人的维度{' '}
                  {priorityMeta.peopleLayerShift.savedRiskLevel}→
                  {priorityMeta.peopleLayerShift.currentRiskLevel}
                  {' · '}
                  stance{' '}
                  {priorityMeta.peopleLayerShift.savedStance}→
                  {priorityMeta.peopleLayerShift.currentStance}
                  {priorityMeta.peopleLayerShift.fragilityGap != null
                    ? ` · fragility ${fmt(priorityMeta.peopleLayerShift.fragilityGap, 2)}`
                    : ''}
                  {priorityMeta.peopleLayerShift.currentSummary
                    ? ` · ${priorityMeta.peopleLayerShift.currentSummary}`
                    : ''}
                </p>
                {priorityMeta.peopleLayerShift.evidenceSummary && (
                  <p className="text-sm text-muted-foreground">
                    人事证据 {priorityMeta.peopleLayerShift.evidenceSummary}
                  </p>
                )}
                {priorityMeta.peopleLayerShift.actionHint && (
                  <p className="text-sm font-semibold text-purple-400">
                    {priorityMeta.peopleLayerShift.actionHint}
                  </p>
                )}
              </>
            )}

            {/* Alt data shift */}
            {priorityMeta.altShift?.changedCategories?.length ? (
              <p className="text-sm text-muted-foreground">
                另类变化{' '}
                {priorityMeta.altShift.changedCategories
                  .slice(0, 2)
                  .map(
                    (item) =>
                      `${item.category} ${
                        item.previousMomentum === 'strengthening'
                          ? '增强'
                          : item.previousMomentum === 'weakening'
                          ? '走弱'
                          : '稳定'
                      }→${
                        item.currentMomentum === 'strengthening'
                          ? '增强'
                          : item.currentMomentum === 'weakening'
                          ? '走弱'
                          : '稳定'
                      }`,
                  )
                  .join('，')}
              </p>
            ) : null}

            {priorityMeta.altShift?.emergentCategories?.length ? (
              <p className="text-sm text-muted-foreground">
                新热点{' '}
                {priorityMeta.altShift.emergentCategories
                  .map(
                    (item) =>
                      `${item.category} ${
                        item.momentum === 'strengthening'
                          ? '增强'
                          : item.momentum === 'weakening'
                          ? '走弱'
                          : '稳定'
                      } ${fmt(item.delta, 2)}`,
                  )
                  .join('，')}
              </p>
            ) : null}

            {/* Factor shift */}
            {priorityMeta.factorShift?.length ? (
              <p className="text-sm text-muted-foreground">
                因子变化{' '}
                {priorityMeta.factorShift
                  .map(
                    (item) =>
                      `${item.label} ${fmt(item.zScoreDelta, 2)}${item.signalChanged ? ' shift' : ''}`,
                  )
                  .join('，')}
              </p>
            ) : null}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
