// ---------------------------------------------------------------------------
// playbookViewModels — ported from
// frontend/src/components/research-playbook/playbookViewModels.js
//
// REUSE: buildPricingRefreshPriorityEvent / buildCrossMarketRefreshPriorityEvent /
//        buildTradeThesisRefreshPriorityEvent from @/features/godeye/lib/workbenchPriorityEvents
// ---------------------------------------------------------------------------

import {
  STATUS_LABELS,
  buildCrossMarketAction,
  buildGodEyeAction,
  buildHighlights,
  buildPricingAction,
  buildWorkbenchViewContext,
  compactText,
  deriveCrossMarketSignal,
  describeConfidence,
  formatResearchSource,
  recommendTemplateForSymbol,
  toPercent,
  toSignedPercent,
  toSignedPercentPoints,
} from './helpers';
import {
  buildPricingRefreshPriorityEvent,
  buildCrossMarketRefreshPriorityEvent,
  buildTradeThesisRefreshPriorityEvent,
} from '@/features/godeye/lib/workbenchPriorityEvents';

export { STATUS_LABELS };

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface PlaybookTask {
  id: string;
  title: string;
  description: string;
  status: string;
  cta: unknown;
}

interface Playbook {
  playbook_type: string;
  stageLabel: string;
  headline: string;
  thesis: string;
  context: string[];
  warnings: string[];
  next_actions: unknown[];
  tasks: PlaybookTask[];
}

// ---------------------------------------------------------------------------
// buildPricingPlaybook
// ---------------------------------------------------------------------------

export const buildPricingPlaybook = (
  context: Record<string, unknown> = {},
  pricingResult: Record<string, unknown> | null = null,
): Playbook | null => {
  const symbol = String(context.symbol ?? pricingResult?.symbol ?? '').trim().toUpperCase();
  const source = String(context.source ?? '');
  const stageLabel = pricingResult ? '结果已生成' : symbol ? '待分析' : '待选择标的';

  if (!symbol && !source && !pricingResult) {
    return null;
  }

  const baseContext = [
    symbol ? `标的 ${symbol}` : null,
    `阶段 ${stageLabel}`,
    source ? `来源 ${formatResearchSource(source)}` : null,
  ].filter(Boolean) as string[];

  if (!pricingResult) {
    return {
      playbook_type: 'pricing',
      stageLabel,
      headline: symbol ? `${symbol} 的定价研究剧本已建立` : '定价研究剧本待建立',
      thesis: symbol
        ? '先运行定价分析，确认价格偏差、驱动因素和估值锚点，再决定是否需要切换到跨市场对冲。'
        : '当前缺少可研究标的，请先从 GodEye 或手动输入一个 symbol。',
      context: baseContext,
      warnings: symbol ? [] : ['当前没有 symbol，暂时无法生成完整研究剧本。'],
      next_actions: symbol ? [buildGodEyeAction()] : [],
      tasks: [
        {
          id: 'pricing-gap',
          title: '定价差异确认',
          description: symbol ? `等待 ${symbol} 的 gap analysis 结果。` : '先指定一个单标的。',
          status: symbol ? 'ready' : 'blocked',
          cta: null,
        },
        {
          id: 'pricing-drivers',
          title: '驱动因素核对',
          description: '结果返回后，优先核对前 2-3 个主要驱动因素是否能被基本面或宏观叙事解释。',
          status: 'blocked',
          cta: null,
        },
        {
          id: 'pricing-valuation',
          title: '估值锚点复核',
          description: '结果返回后，检查公允价值区间、DCF 假设和可比估值是否一致。',
          status: 'blocked',
          cta: null,
        },
        {
          id: 'pricing-action',
          title: '行动建议',
          description: '待分析完成后，系统会给出继续观察、切换跨市场或回到 GodEye 的建议。',
          status: 'blocked',
          cta: null,
        },
      ],
    };
  }

  const gap = (pricingResult?.gap_analysis ?? {}) as Record<string, unknown>;
  const drivers = ((pricingResult?.deviation_drivers as Record<string, unknown>)?.drivers as Array<Record<string, unknown>>) ?? [];
  const valuation = (pricingResult?.valuation ?? {}) as Record<string, unknown>;
  const fairValue = (valuation?.fair_value ?? {}) as Record<string, unknown>;
  const implications = (pricingResult?.implications ?? {}) as Record<string, unknown>;
  const insights = (implications?.insights as string[]) ?? [];
  const crossMarketSignal = deriveCrossMarketSignal(symbol, pricingResult);
  const shouldCrossMarket = crossMarketSignal.shouldCrossMarket;
  const recommendedTemplate = shouldCrossMarket
    ? recommendTemplateForSymbol(symbol, insights)
    : null;
  const crossMarketReasonText = crossMarketSignal.reasons.slice(0, 2).join('，');
  const primaryAction = shouldCrossMarket
    ? buildCrossMarketAction(
        recommendedTemplate ?? '',
        'pricing_playbook',
        `${symbol} 的单标的结论受跨资产变量干扰较大，${crossMarketReasonText || '建议切换到跨市场模板继续验证'}。`,
      )
    : null;
  const nextActions = [primaryAction, buildGodEyeAction()].filter(Boolean);
  const warnings: string[] = [];

  if (!drivers.length) {
    warnings.push('当前没有显著驱动因素，结论更依赖估值区间本身。');
  }
  if (!fairValue.mid) {
    warnings.push('当前缺少完整的综合公允价值锚点，需要谨慎解释价格偏差。');
  }
  if (implications.confidence === 'low') {
    warnings.push('分析置信度偏低，建议把结论当作研究线索而不是最终判断。');
  }
  if (implications.risk_level === 'high') {
    warnings.push('风险等级偏高，先控制结论强度，再决定是否继续放大仓位假设。');
  }

  const primaryView = String(implications.primary_view ?? gap.direction ?? '合理');
  const thesis = `${symbol} 当前偏向 ${primaryView}，价格偏差 ${toSignedPercentPoints(gap.gap_pct)}。${
    shouldCrossMarket
      ? `由于${crossMarketReasonText || '跨资产变量干扰较强'}，下一步更适合用跨市场模板继续验证。`
      : '当前更适合继续留在单标的定价研究框架内。'
  }`;

  return {
    playbook_type: 'pricing',
    stageLabel,
    headline: `${symbol} 定价研究剧本`,
    thesis,
    context: [
      ...baseContext,
      fairValue.mid ? `公允价值 ${fairValue.mid}` : null,
      implications.confidence ? `置信度 ${describeConfidence(String(implications.confidence))}` : null,
    ].filter(Boolean) as string[],
    warnings,
    next_actions: nextActions,
    tasks: [
      {
        id: 'pricing-gap',
        title: '定价差异确认',
        description: gap.fair_value_mid
          ? `当前价格 ${gap.current_price || '-'}，公允价值 ${gap.fair_value_mid}，偏差 ${toSignedPercentPoints(gap.gap_pct)}，结论为 ${gap.severity_label || primaryView}。`
          : '已有结果，但缺少明确的价格偏差区间。',
        status: gap.fair_value_mid ? 'complete' : 'warning',
        cta: null,
      },
      {
        id: 'pricing-drivers',
        title: '驱动因素核对',
        description: drivers.length
          ? drivers
              .slice(0, 3)
              .map((item) => `${item.factor}: ${compactText(String(item.description ?? ''))}`)
              .join('；')
          : '未检测到足够强的驱动因素，请人工复核行业、政策或风格暴露。',
        status: drivers.length ? 'complete' : 'warning',
        cta: null,
      },
      {
        id: 'pricing-valuation',
        title: '估值锚点复核',
        description: fairValue.mid
          ? `综合公允价值区间 ${fairValue.low} ~ ${fairValue.high}，估值方法 ${fairValue.method || '未标注'}。`
          : '当前没有完整的 fair value 区间，建议先检查 DCF 与可比估值输出。',
        status: fairValue.mid ? 'complete' : 'warning',
        cta: null,
      },
      {
        id: 'pricing-action',
        title: '行动建议',
        description: shouldCrossMarket
          ? `单标的结论受跨市场变量影响较大，${crossMarketReasonText || '建议进入跨市场剧本继续确认对冲结构'}。`
          : '当前更适合继续观察单标的定价偏差，必要时回到 GodEye 寻找新的宏观线索。',
        status: shouldCrossMarket ? 'warning' : 'complete',
        cta: primaryAction || buildGodEyeAction(),
      },
    ],
  };
};

// ---------------------------------------------------------------------------
// buildCrossMarketPlaybook
// ---------------------------------------------------------------------------

export const buildCrossMarketPlaybook = (
  context: Record<string, unknown> = {},
  template: Record<string, unknown> | null = null,
  backtestResult: Record<string, unknown> | null = null,
): Playbook | null => {
  const templateId = String(context.template ?? template?.id ?? '');
  const source = String(context.source ?? '');
  const stageLabel = backtestResult ? '结果已生成' : templateId ? '待运行' : '待选择模板';

  if (!templateId && !template && !backtestResult && !source) {
    return null;
  }

  const templateName = String(template?.name ?? templateId ?? '当前篮子');
  const templateAssets = (template?.assets as Array<Record<string, unknown>>) ?? [];
  const longCount = templateAssets.filter((asset) => asset.side === 'long').length;
  const shortCount = templateAssets.filter((asset) => asset.side === 'short').length;
  const returnToGodEye = source ? buildGodEyeAction('返回 GodEye 继续筛选宏观模板') : null;

  if (!backtestResult) {
    return {
      playbook_type: 'cross_market',
      stageLabel,
      headline: `${templateName} 跨市场研究剧本`,
      thesis: template
        ? '先确认模板假设和构造模式，再运行回测检查数据覆盖率、执行成本和结论强度。'
        : '当前模板还没有命中，先确认 URL 或从模板列表重新选择一个篮子。',
      context: [
        templateName ? `模板 ${templateName}` : null,
        template?.construction_mode ? `构造 ${template.construction_mode}` : null,
        template?.theme ? `主题 ${template.theme}` : null,
        template?.recommendationTier ? `推荐 ${template.recommendationTier}` : null,
        longCount || shortCount ? `${longCount}L / ${shortCount}S` : null,
        `阶段 ${stageLabel}`,
        source ? `来源 ${formatResearchSource(source)}` : null,
      ].filter(Boolean) as string[],
      warnings: template
        ? (template?.driverHeadline ? [`当前推荐依据：${template.driverHeadline}`] : [])
        : ['当前 URL 中的 template 未命中现有模板，请重新选择。'],
      next_actions: [returnToGodEye].filter(Boolean),
      tasks: [
        {
          id: 'cross-template',
          title: '模板假设确认',
          description: template
            ? `${template.description || '已载入模板'}；当前结构为 ${longCount} 个多头、${shortCount} 个空头。${template.driverHeadline ? ` 推荐理由：${template.driverHeadline}。` : ''}`
            : '等待模板命中后再确认叙事和篮子结构。',
          status: template ? 'complete' : 'warning',
          cta: null,
        },
        {
          id: 'cross-data',
          title: '数据质量检查',
          description: '运行回测后检查可交易日占比、丢弃日期数和每个 symbol 的覆盖率。',
          status: 'blocked',
          cta: null,
        },
        {
          id: 'cross-execution',
          title: '执行质量检查',
          description: '运行回测后检查 turnover、cost drag 和平均持有期是否过高。',
          status: 'blocked',
          cta: null,
        },
        {
          id: 'cross-conclusion',
          title: '结论与下一步',
          description: '回测完成后，系统会判断是继续优化、回到 GodEye，还是转去单标的定价剧本。',
          status: 'blocked',
          cta: returnToGodEye,
        },
      ],
    };
  }

  const dataAlignment = (backtestResult?.data_alignment ?? {}) as Record<string, unknown>;
  const execution = (backtestResult?.execution_diagnostics ?? {}) as Record<string, unknown>;
  const constraintOverlay = (backtestResult?.constraint_overlay ?? {}) as Record<string, unknown>;
  const longLeg = ((backtestResult?.leg_performance as Record<string, unknown>)?.long ?? {}) as Record<string, unknown>;
  const shortLeg = ((backtestResult?.leg_performance as Record<string, unknown>)?.short ?? {}) as Record<string, unknown>;
  const coverage = Number(dataAlignment.tradable_day_ratio || 0);
  const totalReturn = Number(backtestResult.total_return || 0);
  const sharpe = Number(backtestResult.sharpe_ratio || 0);
  const longReturn = Number(longLeg.cumulative_return || 0);
  const shortReturn = Number(shortLeg.cumulative_return || 0);
  const lowCoverage = coverage < 0.8;
  const weakResult = totalReturn < 0.03 || sharpe < 0.5;
  const legDivergence = Math.abs(longReturn - shortReturn) > 0.08;
  const weakerLegKey = longReturn <= shortReturn ? 'long' : 'short';
  const legPerformance = (backtestResult?.leg_performance as Record<string, unknown>) ?? {};
  const weakerLegAssets = ((legPerformance[weakerLegKey] as Record<string, unknown>)?.assets as Array<Record<string, unknown>>) ?? [];
  const candidateSymbol = String(weakerLegAssets[0]?.symbol ?? '')
    || String(templateAssets.find((asset) => asset.side === weakerLegKey)?.symbol ?? '');
  const pricingAction = weakResult && legDivergence && candidateSymbol
    ? buildPricingAction(
        candidateSymbol,
        'cross_market_playbook',
        `当前跨市场结果较弱，建议先回到 ${candidateSymbol} 的单标的定价剧本复核问题来源。`,
      )
    : null;
  const warnings: string[] = [];

  if (lowCoverage) {
    warnings.push(`可交易日覆盖率仅 ${toPercent(coverage, 1)}，当前结论更适合当作线索而不是成型结论。`);
  }
  if (Number(execution.cost_drag || 0) > 0.02) {
    warnings.push(`成本拖累达到 ${toPercent(execution.cost_drag || 0, 2)}，需要复核换手和交易频率。`);
  }
  if (Number(execution.turnover || 0) > 8) {
    warnings.push('换手率偏高，说明当前阈值或 lookback 可能过于激进。');
  }
  if (execution.concentration_level === 'high') {
    warnings.push(`执行集中度偏高，${execution.concentration_reason || '建议分散 provider 或 venue 暴露。'}`);
  }
  if (Number(execution.lot_efficiency || 1) < 0.97) {
    warnings.push(`最小交易单位效率仅 ${toPercent(execution.lot_efficiency || 0, 2)}，当前篮子可能存在较明显的 sizing 偏差。`);
  }
  if (execution.stress_test_flag === 'high') {
    warnings.push(`资金放大压力测试提示高集中，${execution.stress_test_reason || '继续放大资金前应先拆分批次或分散 venue。'}`);
  }
  if (execution.liquidity_level === 'stretched') {
    warnings.push(`当前最大 ADV 使用率达到 ${toPercent(execution.max_adv_usage || 0, 2)}，流动性偏紧，继续放大资金前应复核容量。`);
  }
  if (execution.margin_level === 'aggressive') {
    warnings.push(`保证金占用达到 ${toPercent(execution.margin_utilization || 0, 2)}，Gross Leverage ${Number(execution.gross_leverage || 0).toFixed(2)}x，当前配置偏激进。`);
  }
  if (execution.beta_level === 'stretched') {
    warnings.push(`当前长短腿 beta 偏离较大，${execution.beta_reason || '建议复核对冲比和长短腿结构。'}`);
  }
  if (execution.calendar_level === 'stretched') {
    warnings.push(`多市场日历错位明显，${execution.calendar_reason || '当前可交易日可能被不同 venue 的休市错配压缩。'}`);
  }
  if (Number(constraintOverlay.binding_count || 0) > 0) {
    warnings.push(`当前有 ${constraintOverlay.binding_count} 个资产触发权重约束，结论需结合约束偏移一起解释。`);
  }

  const thesis = weakResult
    ? `${templateName} 当前结果偏弱，总收益 ${toSignedPercent(totalReturn, 2)}，Sharpe ${sharpe.toFixed(2)}。更适合先做诊断，再决定是否继续扩展。`
    : `${templateName} 当前结果可用，总收益 ${toSignedPercent(totalReturn, 2)}，Sharpe ${sharpe.toFixed(2)}。接下来应重点核对覆盖率和执行成本。`;

  return {
    playbook_type: 'cross_market',
    stageLabel,
    headline: `${templateName} 跨市场研究剧本`,
    thesis,
    context: [
      `阶段 ${stageLabel}`,
      source ? `来源 ${formatResearchSource(source)}` : null,
      template?.construction_mode || execution.construction_mode
        ? `构造 ${template?.construction_mode || execution.construction_mode}`
        : null,
      template?.theme ? `主题 ${template.theme}` : null,
      template?.recommendationTier ? `推荐 ${template.recommendationTier}` : null,
      template?.biasSummary ? `偏置 ${template.biasSummary}` : null,
      coverage ? `覆盖率 ${toPercent(coverage, 1)}` : null,
      `${(longLeg.assets as unknown[])?.length || 0}L / ${(shortLeg.assets as unknown[])?.length || 0}S`,
    ].filter(Boolean) as string[],
    warnings: [
      ...(template?.driverHeadline ? [`当前推荐依据：${template.driverHeadline}`] : []),
      ...(template?.biasSummary ? [`当前权重偏置：${template.biasSummary}`] : []),
      ...warnings,
    ],
    next_actions: [pricingAction, returnToGodEye].filter(Boolean),
    tasks: [
      {
        id: 'cross-template',
        title: '模板假设确认',
        description: template
          ? `${template.description || '已载入模板'}；当前采用 ${template.construction_mode || execution.construction_mode} 构造模式。${template.driverHeadline ? ` 推荐理由：${template.driverHeadline}。` : ''}`
          : `当前篮子包含 ${(longLeg.assets as unknown[])?.length || 0} 个多头、${(shortLeg.assets as unknown[])?.length || 0} 个空头。`,
        status: 'complete',
        cta: null,
      },
      {
        id: 'cross-data',
        title: '数据质量检查',
        description: `可交易日占比 ${toPercent(coverage, 1)}，丢弃日期 ${dataAlignment.dropped_dates_count || 0} 个，对齐后 ${dataAlignment.aligned_row_count || 0} 行。`,
        status: lowCoverage ? 'warning' : 'complete',
        cta: null,
      },
      {
        id: 'cross-execution',
        title: '执行质量检查',
        description: `Turnover ${Number(execution.turnover || 0).toFixed(2)}，Cost Drag ${toPercent(execution.cost_drag || 0, 2)}，平均持有 ${Number(execution.avg_holding_period || 0).toFixed(1)} 天，Lot 效率 ${toPercent(execution.lot_efficiency || 0, 2)}，Max ADV ${toPercent(execution.max_adv_usage || 0, 2)}，保证金 ${toPercent(execution.margin_utilization || 0, 2)}，Gross ${Number(execution.gross_leverage || 0).toFixed(2)}x，Beta ${execution.beta_level || 'balanced'}，日历 ${execution.calendar_level || 'aligned'}，建议调仓 ${execution.suggested_rebalance || 'biweekly'}，压力测试 ${execution.stress_test_flag || 'balanced'}。`,
        status:
          Number(execution.cost_drag || 0) > 0.02
          || Number(execution.turnover || 0) > 8
          || execution.concentration_level === 'high'
          || execution.liquidity_level === 'stretched'
          || execution.margin_level === 'aggressive'
          || execution.beta_level === 'stretched'
          || execution.calendar_level === 'stretched'
          || execution.stress_test_flag === 'high'
          || Number(execution.lot_efficiency || 1) < 0.97
            ? 'warning'
            : 'complete',
        cta: null,
      },
      {
        id: 'cross-conclusion',
        title: '结论与下一步',
        description: pricingAction
          ? `当前结果偏弱，且长短腿表现分化明显，建议先回到 ${candidateSymbol} 做单标的定价复核。`
          : lowCoverage
            ? '当前结果受覆盖率限制，先谨慎保留结论，再回到 GodEye 寻找更干净的模板。'
            : '当前结果可继续优化参数或扩展样本窗；如需要换叙事，再回到 GodEye。',
        status: pricingAction || lowCoverage || weakResult ? 'warning' : 'complete',
        cta: pricingAction || returnToGodEye,
      },
    ],
  };
};

// ---------------------------------------------------------------------------
// buildPricingWorkbenchPayload
// ---------------------------------------------------------------------------

export const buildPricingWorkbenchPayload = (
  context: Record<string, unknown> = {},
  pricingResult: Record<string, unknown> | null = null,
  playbook: Playbook | null = null,
): Record<string, unknown> | null => {
  const symbol = String(context.symbol ?? pricingResult?.symbol ?? '').trim().toUpperCase();
  if (!symbol) {
    return null;
  }

  const gap = (pricingResult?.gap_analysis ?? {}) as Record<string, unknown>;
  const valuation = (pricingResult?.valuation ?? {}) as Record<string, unknown>;
  const implications = (pricingResult?.implications ?? {}) as Record<string, unknown>;
  const drivers = ((pricingResult?.deviation_drivers as Record<string, unknown>)?.drivers as Array<Record<string, unknown>>) ?? [];
  const primaryDriver = (pricingResult?.deviation_drivers as Record<string, unknown>)?.primary_driver as Record<string, unknown> ?? drivers[0] ?? null;
  const factorModel = (pricingResult?.factor_model ?? {}) as Record<string, unknown>;
  const peopleGovernanceOverlay = (pricingResult?.people_governance_overlay ?? {}) as Record<string, unknown>;
  const title = `[Pricing] ${symbol} mispricing review`;
  const analysisPeriod = String(context.period ?? '1y');
  const workbenchViewContext = buildWorkbenchViewContext(context);
  const researchInput = {
    macro: {
      people_layer: pricingResult?.people_layer ?? {},
      policy_execution: (peopleGovernanceOverlay?.policy_execution_context ?? {}),
      source_mode_summary: (peopleGovernanceOverlay?.source_mode_summary ?? {}),
    },
  };

  const payload: Record<string, unknown> = {
    type: 'pricing',
    title,
    source: String(context.source ?? 'manual'),
    symbol,
    template: '',
    note: String(context.note ?? ''),
    context: {
      view: 'pricing',
      period: analysisPeriod,
      source: String(context.source ?? 'manual'),
      stage: playbook?.stageLabel ?? (pricingResult ? '结果已生成' : '待分析'),
      playbook_context: playbook?.context ?? [],
      workbench_view_context: workbenchViewContext ?? {},
    },
    snapshot: {
      headline: playbook?.headline ?? `${symbol} 定价研究任务`,
      summary: playbook?.thesis ?? `${symbol} 的定价研究任务已保存。`,
      highlights: buildHighlights(playbook as Record<string, unknown> | null, ((implications.insights as string[]) ?? []).slice(0, 2)),
      payload: {
        gap_analysis: gap,
        fair_value: (valuation?.fair_value ?? {}) as Record<string, unknown>,
        dcf_scenarios: ((valuation?.dcf as Record<string, unknown>)?.scenarios as Array<Record<string, unknown>> ?? []).map((item) => ({
          name: String(item?.name ?? ''),
          label: String(item?.label ?? ''),
          intrinsic_value: item?.intrinsic_value ?? null,
          premium_discount: item?.premium_discount ?? null,
          assumptions: {
            wacc: (item?.assumptions as Record<string, unknown>)?.wacc ?? null,
            initial_growth: (item?.assumptions as Record<string, unknown>)?.initial_growth ?? null,
            terminal_growth: (item?.assumptions as Record<string, unknown>)?.terminal_growth ?? null,
            fcf_margin: (item?.assumptions as Record<string, unknown>)?.fcf_margin ?? null,
          },
        })),
        current_price_source: String(valuation?.current_price_source ?? ''),
        factor_model: {
          period: String(factorModel?.period ?? analysisPeriod),
          data_points: factorModel?.data_points ?? null,
          capm_alpha_pct: (factorModel?.capm as Record<string, unknown>)?.alpha_pct ?? null,
          capm_beta: (factorModel?.capm as Record<string, unknown>)?.beta ?? null,
          capm_r_squared: (factorModel?.capm as Record<string, unknown>)?.r_squared ?? null,
          ff3_alpha_pct: (factorModel?.fama_french as Record<string, unknown>)?.alpha_pct ?? null,
          ff3_r_squared: (factorModel?.fama_french as Record<string, unknown>)?.r_squared ?? null,
          ff5_alpha_pct: (factorModel?.fama_french_five_factor as Record<string, unknown>)?.alpha_pct ?? null,
          ff5_profitability: ((factorModel?.fama_french_five_factor as Record<string, unknown>)?.factor_loadings as Record<string, unknown>)?.profitability ?? null,
          ff5_investment: ((factorModel?.fama_french_five_factor as Record<string, unknown>)?.factor_loadings as Record<string, unknown>)?.investment ?? null,
        },
        monte_carlo: valuation?.monte_carlo ?? {},
        audit_trail: {
          generated_at: new Date().toISOString(),
          price_source: String(valuation?.current_price_source ?? ''),
          factor_source: factorModel?.factor_source ?? {},
          five_factor_source: factorModel?.five_factor_source ?? {},
          comparable_benchmark_source: String((valuation?.comparable as Record<string, unknown>)?.benchmark_source ?? ''),
          comparable_peer_symbols: (valuation?.comparable as Record<string, unknown>)?.benchmark_peer_symbols ?? [],
          analysis_overrides: valuation?.analysis_overrides ?? {},
        },
        implications,
        period: analysisPeriod,
        people_layer: pricingResult?.people_layer ?? {},
        people_governance_overlay: peopleGovernanceOverlay,
        structural_decay: pricingResult?.structural_decay ?? (implications?.structural_decay as unknown) ?? {},
        macro_mispricing_thesis:
          pricingResult?.macro_mispricing_thesis
          ?? (implications?.macro_mispricing_thesis as unknown)
          ?? {},
        primary_driver: primaryDriver,
        drivers: drivers.slice(0, 3),
        research_input: researchInput,
        view_context: workbenchViewContext ?? {},
      },
    },
  };

  const refreshPriorityEvent = buildPricingRefreshPriorityEvent(
    pricingResult ?? {},
    context,
  );
  return refreshPriorityEvent
    ? { ...payload, refresh_priority_event: refreshPriorityEvent }
    : payload;
};

// ---------------------------------------------------------------------------
// buildCrossMarketWorkbenchPayload
// ---------------------------------------------------------------------------

export const buildCrossMarketWorkbenchPayload = (
  context: Record<string, unknown> = {},
  template: Record<string, unknown> | null = null,
  backtestResult: Record<string, unknown> | null = null,
  assets: Array<Record<string, unknown>> = [],
  researchInputs: Record<string, unknown> = {},
): Record<string, unknown> | null => {
  const templateId = String(context.template ?? template?.id ?? '');
  const taskLabel = String(template?.name ?? templateId ?? 'custom basket');
  const title = `[CrossMarket] ${taskLabel} thesis`;
  const safeAssets = (assets || []).map((asset) => ({
    symbol: asset.symbol,
    asset_class: asset.asset_class,
    side: asset.side,
    weight: asset.weight,
  }));

  if (!templateId && !safeAssets.length && !backtestResult) {
    return null;
  }

  const macroOverview = (researchInputs?.macroOverview ?? {}) as Record<string, unknown>;
  const altSnapshot = (researchInputs?.altSnapshot ?? {}) as Record<string, unknown>;
  const factorDeltas = ((macroOverview?.trend as Record<string, unknown>)?.factor_deltas ?? {}) as Record<string, Record<string, unknown>>;
  const topFactorShifts = Object.entries(factorDeltas)
    .sort((left, right) => Math.abs(Number(right[1]?.z_score_delta || 0)) - Math.abs(Number(left[1]?.z_score_delta || 0)))
    .slice(0, 3)
    .map(([name, item]) => ({
      name,
      z_score_delta: Number(item?.z_score_delta || 0),
      signal_changed: Boolean(item?.signal_changed),
    }));
  const topAltCategories = Object.entries((altSnapshot?.category_summary as Record<string, Record<string, unknown>>) ?? {})
    .sort((left, right) => Math.abs(Number(right[1]?.delta_score || 0)) - Math.abs(Number(left[1]?.delta_score || 0)))
    .slice(0, 4)
    .map(([category, item]) => ({
      category,
      avg_score: Number(item?.avg_score || 0),
      delta_score: Number(item?.delta_score || 0),
      momentum: String(item?.momentum ?? 'stable'),
      count: Number(item?.count || 0),
    }));
  const allocationOverlay = (backtestResult?.allocation_overlay ?? {}) as Record<string, unknown>;
  const selectionQuality = (allocationOverlay.selection_quality ?? {}) as Record<string, unknown>;
  const baseRecommendationScore = selectionQuality.base_recommendation_score
    ?? template?.baseRecommendationScore
    ?? template?.recommendationScore
    ?? null;
  const effectiveRecommendationScore = selectionQuality.effective_recommendation_score
    ?? template?.recommendationScore
    ?? null;
  const baseRecommendationTier = String(selectionQuality.base_recommendation_tier
    ?? template?.baseRecommendationTier
    ?? template?.recommendationTier
    ?? '');
  const effectiveRecommendationTier = String(selectionQuality.effective_recommendation_tier
    ?? template?.recommendationTier
    ?? '');
  const rankingPenalty = selectionQuality.ranking_penalty
    ?? template?.rankingPenalty
    ?? 0;
  const rankingPenaltyReason = String(selectionQuality.reason
    ?? template?.rankingPenaltyReason
    ?? '');
  const selectionQualityLabel = String(selectionQuality.label ?? (rankingPenalty ? 'softened' : 'original'));
  const selectionQualityReason = String(selectionQuality.reason ?? rankingPenaltyReason ?? '');
  const isReviewRunResult = Boolean(backtestResult && selectionQualityLabel && selectionQualityLabel !== 'original');
  const workbenchViewContext = buildWorkbenchViewContext(context);

  const coreLegSymbols = new Set(
    ((template?.coreLegs as Array<Record<string, unknown>>) ?? [])
      .map((item) => String(item?.symbol ?? '').trim().toUpperCase())
      .filter(Boolean),
  );
  const themeCoreText = String(template?.themeCore ?? '').toUpperCase();
  const overlayRows = (allocationOverlay.rows as Array<Record<string, unknown>>) ?? [];
  const topCompressedRow = overlayRows
    .slice()
    .sort((left, right) => Math.abs(Number(right?.compression_delta || 0)) - Math.abs(Number(left?.compression_delta || 0)))
    .find((item) => Math.abs(Number(item?.compression_delta || 0)) >= 0.005);
  const topCompressedSymbol = String(topCompressedRow?.symbol ?? '').trim().toUpperCase();
  const coreLegPressure = {
    affected: Boolean(
      topCompressedSymbol
      && (coreLegSymbols.has(topCompressedSymbol) || (themeCoreText && themeCoreText.includes(topCompressedSymbol))),
    ),
    symbol: String(topCompressedRow?.symbol ?? ''),
    compression_delta: Number(topCompressedRow?.compression_delta || 0),
    summary: topCompressedRow?.symbol
      ? `${topCompressedRow.symbol} ${(Math.abs(Number(topCompressedRow.compression_delta || 0)) * 100).toFixed(2)}pp`
      : '',
  };

  const resonanceSummary = (macroOverview?.resonance_summary as Record<string, unknown>) ?? {};
  const evidenceSummary = (macroOverview?.evidence_summary as Record<string, unknown>) ?? {};
  const policySourceHealthSummary = (evidenceSummary.policy_source_health_summary as Record<string, unknown>) ?? {};
  const departmentChaosSummary = (macroOverview?.department_chaos_summary as Record<string, unknown>) ?? {};
  const inputReliabilitySummary = (macroOverview?.input_reliability_summary as Record<string, unknown>) ?? {};
  const altSignals = (altSnapshot?.signals as Record<string, unknown>) ?? {};

  const researchInput: Record<string, unknown> = {
    macro: {
      macro_score: Number(macroOverview?.macro_score || 0),
      macro_signal: Number(macroOverview?.macro_signal || 0),
      confidence: Number(macroOverview?.confidence || 0),
      macro_score_delta: Number((macroOverview?.trend as Record<string, unknown>)?.macro_score_delta || 0),
      macro_signal_changed: Boolean((macroOverview?.trend as Record<string, unknown>)?.macro_signal_changed),
      snapshot_timestamp: String(macroOverview?.snapshot_timestamp ?? ''),
      resonance: {
        label: String(resonanceSummary?.label ?? 'mixed'),
        reason: String(resonanceSummary?.reason ?? ''),
        positive_cluster: (resonanceSummary?.positive_cluster as unknown[]) ?? [],
        negative_cluster: (resonanceSummary?.negative_cluster as unknown[]) ?? [],
        weakening: (resonanceSummary?.weakening as unknown[]) ?? [],
        precursor: (resonanceSummary?.precursor as unknown[]) ?? [],
        reversed_factors: (resonanceSummary?.reversed_factors as unknown[]) ?? [],
      },
      policy_source_health: {
        label: String(policySourceHealthSummary?.label ?? 'unknown'),
        reason: String(policySourceHealthSummary?.reason ?? ''),
        fragile_sources: (policySourceHealthSummary?.fragile_sources as unknown[]) ?? [],
        watch_sources: (policySourceHealthSummary?.watch_sources as unknown[]) ?? [],
        healthy_sources: (policySourceHealthSummary?.healthy_sources as unknown[]) ?? [],
        avg_full_text_ratio: Number(policySourceHealthSummary?.avg_full_text_ratio || 0),
      },
      department_chaos: {
        label: String(departmentChaosSummary?.label ?? 'unknown'),
        summary: String(departmentChaosSummary?.summary ?? ''),
        avg_chaos_score: Number(departmentChaosSummary?.avg_chaos_score || 0),
        department_count: Number(departmentChaosSummary?.department_count || 0),
        chaotic_department_count: Number(departmentChaosSummary?.chaotic_department_count || 0),
        top_departments: ((departmentChaosSummary?.top_departments as Array<Record<string, unknown>>) ?? [])
          .slice(0, 5)
          .map((item) => ({
            department: String(item?.department ?? ''),
            department_label: String(item?.department_label ?? ''),
            label: String(item?.label ?? ''),
            chaos_score: Number(item?.chaos_score || 0),
            policy_reversal_count: Number(item?.policy_reversal_count || 0),
            avg_will_intensity: Number(item?.avg_will_intensity || 0),
            reason: String(item?.reason ?? ''),
          })),
      },
      people_layer: altSignals.people_layer ?? macroOverview?.people_layer_summary ?? {},
      policy_execution: altSignals.policy_execution ?? {},
      source_mode_summary: macroOverview?.source_mode_summary ?? altSnapshot?.source_mode_summary ?? {},
      structural_decay_radar: {
        label: String((macroOverview?.structural_decay_radar as Record<string, unknown>)?.label ?? 'stable'),
        display_label: String((macroOverview?.structural_decay_radar as Record<string, unknown>)?.display_label ?? ''),
        score: Number((macroOverview?.structural_decay_radar as Record<string, unknown>)?.score || 0),
        critical_axis_count: Number((macroOverview?.structural_decay_radar as Record<string, unknown>)?.critical_axis_count || 0),
        top_signals: ((macroOverview?.structural_decay_radar as Record<string, unknown>)?.top_signals as unknown[]) ?? [],
        action_hint: String((macroOverview?.structural_decay_radar as Record<string, unknown>)?.action_hint ?? ''),
      },
      input_reliability: {
        label: String(inputReliabilitySummary?.label ?? 'unknown'),
        score: Number(inputReliabilitySummary?.score || 0),
        lead: String(inputReliabilitySummary?.lead ?? ''),
        posture: String(inputReliabilitySummary?.posture ?? ''),
        reason: String(inputReliabilitySummary?.reason ?? ''),
        dominant_issue_labels: (inputReliabilitySummary?.dominant_issue_labels as unknown[]) ?? [],
        dominant_support_labels: (inputReliabilitySummary?.dominant_support_labels as unknown[]) ?? [],
      },
      top_factor_shifts: topFactorShifts,
    },
    alt_data: {
      snapshot_timestamp: String(altSnapshot?.snapshot_timestamp ?? ''),
      freshness_label: String((altSnapshot?.staleness as Record<string, unknown>)?.label ?? ''),
      max_snapshot_age_seconds: Number((altSnapshot?.staleness as Record<string, unknown>)?.max_snapshot_age_seconds || 0),
      top_categories: topAltCategories,
    },
  };

  const buildTemplateMeta = () => ({
    theme: String(template?.theme ?? ''),
    allocation_mode: template?.biasSummary ? 'macro_bias' : 'template_base',
    bias_summary: String(template?.biasSummary ?? ''),
    bias_strength_raw: Number(template?.rawBiasStrength ?? 0),
    bias_strength: Number(template?.biasStrength ?? 0),
    bias_scale: Number(template?.biasScale ?? 1),
    bias_quality_label: String(template?.biasQualityLabel ?? 'full'),
    bias_quality_reason: String(template?.biasQualityReason ?? ''),
    department_chaos_label: String(template?.departmentChaosLabel ?? 'unknown'),
    department_chaos_score: template?.departmentChaosScore ?? null,
    department_chaos_top_department: String(template?.departmentChaosTopDepartment ?? ''),
    department_chaos_reason: String(template?.departmentChaosReason ?? ''),
    department_chaos_risk_budget_scale: template?.departmentChaosRiskBudgetScale ?? 1,
    people_fragility_label: String(template?.peopleFragilityLabel ?? 'stable'),
    people_fragility_score: template?.peopleFragilityScore ?? null,
    people_fragility_focus: String(template?.peopleFragilityFocus ?? ''),
    people_fragility_reason: String(template?.peopleFragilityReason ?? ''),
    people_fragility_risk_budget_scale: template?.peopleFragilityRiskBudgetScale ?? 1,
    structural_decay_radar_label: String(template?.structuralDecayRadarLabel ?? 'stable'),
    structural_decay_radar_display_label: String(template?.structuralDecayRadarDisplayLabel ?? ''),
    structural_decay_radar_score: template?.structuralDecayRadarScore ?? null,
    structural_decay_radar_action_hint: String(template?.structuralDecayRadarActionHint ?? ''),
    structural_decay_radar_risk_budget_scale: template?.structuralDecayRadarRiskBudgetScale ?? 1,
    structural_decay_radar_top_signals: (template?.structuralDecayRadarTopSignals as unknown[]) ?? [],
    policy_execution_label: String(template?.policyExecutionLabel ?? 'unknown'),
    policy_execution_score: template?.policyExecutionScore ?? null,
    policy_execution_top_department: String(template?.policyExecutionTopDepartment ?? ''),
    policy_execution_reason: String(template?.policyExecutionReason ?? ''),
    policy_execution_risk_budget_scale: template?.policyExecutionRiskBudgetScale ?? 1,
    source_mode_label: String(template?.sourceModeLabel ?? 'mixed'),
    source_mode_dominant: String(template?.sourceModeDominant ?? ''),
    source_mode_reason: String(template?.sourceModeReason ?? ''),
    source_mode_risk_budget_scale: template?.sourceModeRiskBudgetScale ?? 1,
    bias_highlights: (template?.biasHighlights as unknown[]) ?? [],
    bias_actions: (template?.biasActions as unknown[]) ?? [],
    driver_summary: (template?.driverSummary as unknown[]) ?? [],
    dominant_drivers: (template?.dominantDrivers as unknown[]) ?? [],
    core_legs: (template?.coreLegs as unknown[]) ?? [],
    support_legs: (template?.supportLegs as unknown[]) ?? [],
    theme_core: String(template?.themeCore ?? ''),
    theme_support: String(template?.themeSupport ?? ''),
    execution_posture: String(template?.executionPosture ?? template?.execution_posture ?? ''),
    core_leg_pressure: coreLegPressure,
    resonance_label: String(template?.resonanceLabel ?? resonanceSummary?.label ?? 'mixed'),
    resonance_reason: String(template?.resonanceReason ?? resonanceSummary?.reason ?? ''),
    resonance_factors: (template?.resonanceFactors as Record<string, unknown>) ?? {},
    base_recommendation_tier: baseRecommendationTier,
    recommendation_tier: effectiveRecommendationTier,
    base_recommendation_score: baseRecommendationScore,
    recommendation_score: effectiveRecommendationScore,
    ranking_penalty: rankingPenalty,
    ranking_penalty_reason: rankingPenaltyReason,
    selection_quality: {
      label: selectionQualityLabel,
      reason: selectionQualityReason,
    },
    input_reliability: {
      label: String(inputReliabilitySummary?.label ?? 'unknown'),
      score: Number(inputReliabilitySummary?.score || 0),
      lead: String(inputReliabilitySummary?.lead ?? ''),
      posture: String(inputReliabilitySummary?.posture ?? ''),
      reason: String(inputReliabilitySummary?.reason ?? ''),
      action_hint: String(((template?.refreshMeta as Record<string, unknown>)?.inputReliabilityShift as Record<string, unknown>)?.actionHint ?? ''),
    },
    recommendation_reason: String(template?.driverHeadline ?? ''),
  });

  const sharedContextFields = {
    view: 'backtest',
    tab: 'cross-market',
    source: String(context.source ?? 'manual'),
    stage: backtestResult ? '结果已生成' : '待运行',
    construction_mode: String(template?.construction_mode ?? (backtestResult?.execution_diagnostics as Record<string, unknown>)?.construction_mode ?? ''),
    template_name: String(template?.name ?? ''),
    ...buildTemplateMeta(),
    research_input: researchInput,
    assets: safeAssets,
    workbench_view_context: workbenchViewContext ?? {},
  };

  const payload: Record<string, unknown> = {
    type: 'cross_market',
    title,
    source: String(context.source ?? 'manual'),
    symbol: '',
    template: templateId,
    note: String(context.note ?? ''),
    context: sharedContextFields,
    snapshot: {
      headline: isReviewRunResult
        ? `${taskLabel} 跨市场复核型结果`
        : `${taskLabel} 跨市场研究任务`,
      summary: backtestResult
        ? isReviewRunResult
          ? `${taskLabel} 已生成复核型回测结果，当前结果按 ${selectionQualityLabel} 强度运行，可继续在工作台里优先重看。`
          : `${taskLabel} 已生成回测结果，可继续在工作台里跟踪。`
        : `${taskLabel} 已保存为跨市场模板任务，等待进一步运行回测。`,
      highlights: buildHighlights(
        null,
        backtestResult
          ? [
              template?.recommendationTier ? `recommendation ${template.recommendationTier}` : '',
              `total return ${toSignedPercent(backtestResult.total_return || 0, 2)}`,
              `sharpe ${Number(backtestResult.sharpe_ratio || 0).toFixed(2)}`,
              `coverage ${toPercent((backtestResult.data_alignment as Record<string, unknown>)?.tradable_day_ratio || 0, 1)}`,
            ]
          : [
              template?.recommendationTier ? `recommendation ${template.recommendationTier}` : '',
              String(template?.driverHeadline ?? ''),
              String(template?.description ?? ''),
              template?.construction_mode ? `construction ${template.construction_mode}` : '',
            ],
      ),
      payload: backtestResult
        ? {
            template_meta: buildTemplateMeta(),
            price_matrix_summary: (backtestResult.price_matrix_summary as Record<string, unknown>) ?? {},
            data_alignment: (backtestResult.data_alignment as Record<string, unknown>) ?? {},
            execution_diagnostics: (backtestResult.execution_diagnostics as Record<string, unknown>) ?? {},
            execution_plan: (backtestResult.execution_plan as Record<string, unknown>) ?? {},
            allocation_overlay: (backtestResult.allocation_overlay as Record<string, unknown>) ?? {},
            constraint_overlay: (backtestResult.constraint_overlay as Record<string, unknown>) ?? {},
            hedge_portfolio: (backtestResult.hedge_portfolio as Record<string, unknown>) ?? {},
            research_input: researchInput,
            view_context: workbenchViewContext ?? {},
            total_return: Number(backtestResult.total_return || 0),
            sharpe_ratio: Number(backtestResult.sharpe_ratio || 0),
            leg_performance: (backtestResult.leg_performance as Record<string, unknown>) ?? {},
          }
        : {
            template: template ?? {},
            template_meta: buildTemplateMeta(),
            research_input: researchInput,
            assets: safeAssets,
            view_context: workbenchViewContext ?? {},
          },
    },
  };

  const refreshPriorityEvent = buildCrossMarketRefreshPriorityEvent(template ?? {}, backtestResult, researchInputs);
  return refreshPriorityEvent
    ? { ...payload, refresh_priority_event: refreshPriorityEvent }
    : payload;
};

// ---------------------------------------------------------------------------
// normalizeTradeThesisTemplate (internal)
// ---------------------------------------------------------------------------

const normalizeTradeThesisTemplate = (
  template: Record<string, unknown> = {},
  draft: Record<string, unknown> = {},
): Record<string, unknown> => ({
  ...template,
  id: String(template?.id ?? template?.template_id ?? (draft?.templateId as string) ?? ''),
  name: String(template?.name ?? template?.template_name ?? draft?.title ?? ''),
  theme: String(template?.theme ?? template?.stance ?? (draft?.thesis as Record<string, unknown>)?.stance ?? ''),
  construction_mode: String(template?.construction_mode ?? (draft?.quality as Record<string, unknown>)?.construction_mode ?? ''),
  driverHeadline: String(template?.driverHeadline ?? template?.recommendation_reason ?? (draft?.thesis as Record<string, unknown>)?.summary ?? draft?.note ?? ''),
  coreLegs: (template?.coreLegs ?? template?.core_legs ?? (draft?.templateContext as Record<string, unknown>)?.core_legs ?? []) as unknown[],
  supportLegs: (template?.supportLegs ?? template?.support_legs ?? (draft?.templateContext as Record<string, unknown>)?.support_legs ?? []) as unknown[],
  themeCore: String(template?.themeCore ?? template?.theme_core ?? (draft?.templateContext as Record<string, unknown>)?.theme_core ?? ''),
  themeSupport: String(template?.themeSupport ?? template?.theme_support ?? (draft?.templateContext as Record<string, unknown>)?.theme_support ?? ''),
  recommendationTier: String(template?.recommendationTier ?? (draft?.thesis as Record<string, unknown>)?.stance ?? ''),
  recommendationReason: String(template?.recommendation_reason ?? (draft?.thesis as Record<string, unknown>)?.summary ?? draft?.note ?? ''),
  signalAttribution: (template?.signalAttribution ?? template?.signal_attribution ?? (draft?.templateContext as Record<string, unknown>)?.signal_attribution ?? []) as unknown[],
});

// ---------------------------------------------------------------------------
// buildTradeThesisWorkbenchPayload
// ---------------------------------------------------------------------------

export const buildTradeThesisWorkbenchPayload = (
  context: Record<string, unknown> = {},
  draft: Record<string, unknown> | null = null,
  template: Record<string, unknown> | null = null,
  backtestResult: Record<string, unknown> | null = null,
  assets: Array<Record<string, unknown>> = [],
  researchInputs: Record<string, unknown> = {},
): Record<string, unknown> | null => {
  const normalizedTemplate = normalizeTradeThesisTemplate(
    template ?? (draft?.templateContext as Record<string, unknown>) ?? {},
    draft ?? {},
  );
  const basePayload = buildCrossMarketWorkbenchPayload(
    {
      ...context,
      template: String(context.template ?? draft?.templateId ?? normalizedTemplate.id ?? ''),
    },
    normalizedTemplate,
    backtestResult,
    assets,
    researchInputs,
  );

  if (!basePayload) {
    return null;
  }

  const symbol = String(draft?.symbol ?? context.symbol ?? '').trim().toUpperCase();
  const taskLabel = String(draft?.title ?? normalizedTemplate.name ?? normalizedTemplate.id ?? 'Macro Mispricing Trade Thesis');
  const tradeAssets = ((draft?.assets as Array<Record<string, unknown>>) ?? assets ?? []).map((asset) => ({
    symbol: String(asset?.symbol ?? ''),
    asset_class: String(asset?.asset_class ?? ''),
    side: String(asset?.side ?? ''),
    weight: asset?.weight ?? null,
    role: String(asset?.role ?? ''),
    thesis: String(asset?.thesis ?? ''),
  }));
  const tradeThesis = {
    draft_id: String(draft?.id ?? ''),
    source: String(draft?.source ?? context.source ?? ''),
    source_task_id: String(draft?.sourceTaskId ?? ''),
    source_task_type: String(draft?.sourceTaskType ?? ''),
    title: taskLabel,
    note: String(draft?.note ?? ''),
    symbol,
    thesis: (draft?.thesis as Record<string, unknown>) ?? {},
    structural_decay: (draft?.structuralDecay as Record<string, unknown>) ?? {},
    people_layer: (draft?.peopleLayer as Record<string, unknown>) ?? {},
    quality: (draft?.quality as Record<string, unknown>) ?? {},
    constraints: (draft?.constraints as Record<string, unknown>) ?? {},
    meta: (draft?.meta as Record<string, unknown>) ?? {},
    parameters: (draft?.parameters as Record<string, unknown>) ?? {},
    template_context: (draft?.templateContext as Record<string, unknown>) ?? {},
    assets: tradeAssets,
    results_summary: backtestResult
      ? {
          total_return: backtestResult?.total_return ?? null,
          sharpe_ratio: backtestResult?.sharpe_ratio ?? null,
          coverage: (backtestResult?.data_alignment as Record<string, unknown>)?.tradable_day_ratio ?? null,
        }
      : {},
  };

  const baseSnapshot = (basePayload.snapshot as Record<string, unknown>) ?? {};
  const payload: Record<string, unknown> = {
    ...basePayload,
    type: 'trade_thesis',
    title: `[TradeThesis] ${taskLabel}`,
    symbol,
    template: String(normalizedTemplate.id ?? '') || String(basePayload.template ?? ''),
    context: {
      ...(basePayload.context as Record<string, unknown>),
      view: 'backtest',
      tab: 'cross-market',
      symbol,
      draft_id: String(draft?.id ?? ''),
      source_task_id: String(draft?.sourceTaskId ?? ''),
      source_task_type: String(draft?.sourceTaskType ?? ''),
      thesis_origin: String(draft?.source ?? context.source ?? ''),
      trade_thesis: true,
    },
    snapshot: {
      ...baseSnapshot,
      headline: backtestResult ? `${taskLabel} 交易 Thesis` : `${taskLabel} 交易草案`,
      summary: backtestResult
        ? `${taskLabel} 已保存为可回测的交易 Thesis，可继续在工作台里跟踪组合演化。`
        : `${taskLabel} 已保存为交易 Thesis 草案，可继续回测和迭代组合。`,
      highlights: buildHighlights(
        null,
        [
          String((draft?.thesis as Record<string, unknown>)?.stance ?? ''),
          String((draft?.structuralDecay as Record<string, unknown>)?.label ?? ''),
          (draft?.peopleLayer as Record<string, unknown>)?.risk_level ? `people ${(draft?.peopleLayer as Record<string, unknown>).risk_level}` : '',
          backtestResult ? `total return ${toSignedPercent(backtestResult.total_return || 0, 2)}` : '',
          `legs ${tradeAssets.length}`,
        ],
      ),
      payload: {
        ...(baseSnapshot.payload as Record<string, unknown>),
        draft: draft ?? {},
        trade_thesis: tradeThesis,
      },
    },
  };

  const refreshPriorityEvent = buildTradeThesisRefreshPriorityEvent(
    draft ?? {},
    normalizedTemplate,
    backtestResult,
    researchInputs,
  );
  return refreshPriorityEvent
    ? { ...payload, refresh_priority_event: refreshPriorityEvent }
    : payload;
};
