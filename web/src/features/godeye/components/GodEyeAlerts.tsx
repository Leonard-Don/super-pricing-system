// ---------------------------------------------------------------------------
// GodEyeAlerts — shadcn/Tailwind presentation component
// Rebuilt from frontend/src/components/GodEyeDashboard/GodEyeAlerts.js (206)
// Props in, callbacks out. No API calls.
// ---------------------------------------------------------------------------

import { Alert, AlertTitle, AlertDescription, AlertAction } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { localizeGodEyeText } from '@/features/godeye/lib/displayLabels';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface StructuralDecayRadar {
  score?: number | string;
  label?: string;
  display_label?: string;
  action_hint?: string;
}

/** Navigate target — string or structured payload */
export type NavigateTarget =
  | string
  | {
      target: string;
      template?: string;
      source?: string;
      note?: string;
      refresh?: string;
      type?: string;
      reason?: string;
    };

export interface RefreshCounts {
  high?: number;
  medium?: number;
  resonance?: number;
  biasQualityCore?: number;
  selectionQualityActive?: number;
  reviewContext?: number;
  structuralDecay?: number;
  tradeThesis?: number;
  departmentChaos?: number;
  peopleLayer?: number;
  inputReliability?: number;
  selectionQuality?: number;
  policySource?: number;
  biasQuality?: number;
}

export interface GodEyeAlertsProps {
  macroSignal?: number;
  degradedProviderCount?: number;
  refreshCounts: RefreshCounts;
  structuralDecayRadar: StructuralDecayRadar | undefined;
  onNavigate: (target: NavigateTarget) => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function GodEyeAlerts({
  macroSignal,
  degradedProviderCount,
  refreshCounts,
  structuralDecayRadar,
  onNavigate,
}: GodEyeAlertsProps) {
  const radarScore = Number(structuralDecayRadar?.score ?? 0);
  const radarHot =
    structuralDecayRadar?.label === 'decay_alert' || radarScore >= 0.68;
  const radarActionHint = localizeGodEyeText(
    structuralDecayRadar?.action_hint ??
      '建议优先检查人的维度、政策治理与跨市场防御方案。',
  );

  const hasAny =
    macroSignal === 1 ||
    (degradedProviderCount ?? 0) > 0 ||
    radarHot ||
    (refreshCounts.high ?? 0) > 0 ||
    (refreshCounts.medium ?? 0) > 0 ||
    (refreshCounts.departmentChaos ?? 0) > 0 ||
    (refreshCounts.tradeThesis ?? 0) > 0 ||
    (refreshCounts.selectionQualityActive ?? 0) > 0 ||
    (refreshCounts.reviewContext ?? 0) > 0 ||
    (refreshCounts.inputReliability ?? 0) > 0 ||
    (refreshCounts.structuralDecay ?? 0) > 0;

  if (!hasAny) {
    return null;
  }

  return (
    <div className="flex flex-col gap-3">
      {/* 1. Macro signal warning */}
      {macroSignal === 1 ? (
        <Alert>
          <AlertTitle>战场提示</AlertTitle>
          <AlertDescription>
            当前综合因子偏向正向扭曲区间，说明市场可能处于值得重点追踪的错价窗口。
          </AlertDescription>
        </Alert>
      ) : null}

      {/* 2. Degraded provider warning */}
      {(degradedProviderCount ?? 0) > 0 ? (
        <Alert>
          <AlertTitle>数据治理提醒</AlertTitle>
          <AlertDescription>
            当前有 {degradedProviderCount} 个数据源处于退化/错误状态，页面继续使用最近成功快照。
          </AlertDescription>
        </Alert>
      ) : null}

      {/* 3. Structural decay radar alert */}
      {radarHot ? (
        <Alert variant="destructive">
          <AlertTitle>系统级结构衰败雷达进入警报区</AlertTitle>
          <AlertDescription>
            {structuralDecayRadar?.display_label ?? '结构衰败警报'}，综合分{' '}
            {Math.round(radarScore * 100)}%。{radarActionHint}
          </AlertDescription>
          <AlertAction>
            <Button
              size="xs"
              onClick={() =>
                onNavigate({
                  target: 'cross-market',
                  template: 'defensive_beta_hedge',
                  source: 'decay_radar',
                  note:
                    structuralDecayRadar?.action_hint ?? '结构衰败雷达进入警报区。',
                })
              }
            >
              查看防御方案
            </Button>
          </AlertAction>
        </Alert>
      ) : null}

      {/* 4. Research task refresh priority */}
      {((refreshCounts.high ?? 0) > 0 || (refreshCounts.medium ?? 0) > 0) ? (
        <Alert variant={(refreshCounts.high ?? 0) > 0 ? 'destructive' : 'default'}>
          <AlertTitle>研究任务更新优先级</AlertTitle>
          <AlertDescription>
            当前有 {refreshCounts.high ?? 0} 个研究任务建议立即更新，
            {refreshCounts.medium ?? 0} 个任务建议优先复核。
            默认顺序会优先看共振驱动，其次是核心腿受压、降级运行、复核语境切换，再看结构性衰败、交易论点漂移、部门混乱、人的维度和输入可靠度变化。
            当前共有 {refreshCounts.resonance ?? 0} 个共振驱动任务，
            {refreshCounts.biasQualityCore ?? 0} 个已经压到主题核心腿，
            {refreshCounts.selectionQualityActive ?? 0} 个当前结果已处于降级运行状态，
            {refreshCounts.reviewContext ?? 0} 个最近两版刚切入复核语境，
            {refreshCounts.structuralDecay ?? 0} 个结构性衰败任务继续恶化，
            {refreshCounts.tradeThesis ?? 0} 个交易论点已与最新定价证据出现漂移，
            {refreshCounts.departmentChaos ?? 0} 个部门级政策混乱明显恶化，
            {refreshCounts.peopleLayer ?? 0} 个人的维度明显走弱，
            {refreshCounts.inputReliability ?? 0} 个整体输入可靠度已经发生明显变化；
            此外还有 {refreshCounts.selectionQuality ?? 0} 个已经进入自动降级，
            {refreshCounts.policySource ?? 0} 个属于政策源驱动，
            {refreshCounts.biasQuality ?? 0} 个已经出现偏置收缩。
            你可以直接从异常猎手或工作台重新打开对应任务。
          </AlertDescription>
          <AlertAction>
            <Button size="xs" onClick={() => onNavigate('workbench-refresh')}>
              打开待更新任务
            </Button>
          </AlertAction>
        </Alert>
      ) : null}

      {/* 5. Department chaos */}
      {(refreshCounts.departmentChaos ?? 0) > 0 ? (
        <Alert>
          <AlertTitle>部门级政策混乱正在影响研究输入</AlertTitle>
          <AlertDescription>
            当前有 {refreshCounts.departmentChaos} 个任务的部门级政策混乱信号较保存快照明显恶化。
            它们通常意味着政策执行主体、朝令夕改率或长官意志强度已经改变，
            适合优先回到工作台确认跨市场方案和交易论点是否仍然成立。
          </AlertDescription>
          <AlertAction>
            <Button
              size="xs"
              variant="outline"
              onClick={() =>
                onNavigate({ target: 'workbench', refresh: 'high', reason: 'department_chaos' })
              }
            >
              打开部门混乱任务
            </Button>
          </AlertAction>
        </Alert>
      ) : null}

      {/* 6. Trade thesis drift */}
      {(refreshCounts.tradeThesis ?? 0) > 0 ? (
        <Alert>
          <AlertTitle>交易论点正在漂移</AlertTitle>
          <AlertDescription>
            当前有 {refreshCounts.tradeThesis} 个交易论点相对保存时已经发生主逻辑、主表达腿或执行周期漂移。
            这类任务往往意味着组合论点已经不再完全贴合最新定价证据，适合尽快回到工作台优先复核。
          </AlertDescription>
          <AlertAction>
            <Button
              size="xs"
              variant="outline"
              onClick={() =>
                onNavigate({
                  target: 'workbench',
                  refresh: 'high',
                  type: 'trade_thesis',
                  reason: 'trade_thesis',
                })
              }
            >
              打开交易 Thesis 任务
            </Button>
          </AlertAction>
        </Alert>
      ) : null}

      {/* 7. Selection quality active (degraded-run tasks) */}
      {(refreshCounts.selectionQualityActive ?? 0) > 0 ? (
        <Alert>
          <AlertTitle>降级运行任务应优先重看</AlertTitle>
          <AlertDescription>
            当前有 {refreshCounts.selectionQualityActive} 个跨市场任务的保存结果已经按软化/自动降级强度运行。
            它们不是普通"建议更新"，而是结果本身已经受推荐质量变化影响，建议优先进入任务页重看。
          </AlertDescription>
          <AlertAction>
            <Button
              size="xs"
              onClick={() =>
                onNavigate({
                  target: 'workbench',
                  refresh: 'high',
                  type: 'cross_market',
                  reason: 'selection_quality_active',
                })
              }
            >
              优先重看降级运行任务
            </Button>
          </AlertAction>
        </Alert>
      ) : null}

      {/* 8. Review context switch */}
      {(refreshCounts.reviewContext ?? 0) > 0 ? (
        <Alert>
          <AlertTitle>复核语境切换任务值得先看一眼</AlertTitle>
          <AlertDescription>
            当前有 {refreshCounts.reviewContext} 个跨市场任务最近两版刚从普通结果切到复核型结果，
            或从复核型结果回到普通结果。这类变化不一定都比"降级运行"更紧急，
            但通常意味着研究语境已经发生切换，适合尽快进入任务页复核。
          </AlertDescription>
          <AlertAction>
            <Button
              size="xs"
              variant="outline"
              onClick={() =>
                onNavigate({
                  target: 'workbench',
                  refresh: 'high',
                  type: 'cross_market',
                  reason: 'review_context',
                })
              }
            >
              打开复核语境切换任务
            </Button>
          </AlertAction>
        </Alert>
      ) : null}

      {/* 9. Input reliability change */}
      {(refreshCounts.inputReliability ?? 0) > 0 ? (
        <Alert>
          <AlertTitle>输入可靠度变化任务值得尽快复核</AlertTitle>
          <AlertDescription>
            当前有 {refreshCounts.inputReliability} 个跨市场任务保存时的整体输入可靠度与现在相比已经明显变化。
            即使政策源标签本身没切换，这类任务也可能意味着方案强度和研究结论需要重新确认；
            如果已经进入脆弱状态，通常更适合先复核输入质量，再决定是否继续沿用当前方案强度。
          </AlertDescription>
          <AlertAction>
            <Button
              size="xs"
              variant="outline"
              onClick={() =>
                onNavigate({
                  target: 'workbench',
                  refresh: 'high',
                  type: 'cross_market',
                  reason: 'input_reliability',
                })
              }
            >
              先复核输入可靠度任务
            </Button>
          </AlertAction>
        </Alert>
      ) : null}

      {/* 10. Structural decay tasks worsening */}
      {(refreshCounts.structuralDecay ?? 0) > 0 ? (
        <Alert variant="destructive">
          <AlertTitle>结构性衰败任务正在继续恶化</AlertTitle>
          <AlertDescription>
            当前有 {refreshCounts.structuralDecay} 个结构性衰败观察任务，相比保存快照已经进一步恶化。
            这类任务更像长期错误定价或结构性损伤，应优先回到工作台确认是否需要升级处理。
          </AlertDescription>
          <AlertAction>
            <Button
              size="xs"
              onClick={() =>
                onNavigate({
                  target: 'workbench',
                  refresh: 'high',
                  type: 'macro_mispricing',
                  reason: 'structural_decay',
                })
              }
            >
              打开衰败任务
            </Button>
          </AlertAction>
        </Alert>
      ) : null}
    </div>
  );
}

export default GodEyeAlerts;
