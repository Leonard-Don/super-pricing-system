const BACKTEST_ENHANCEMENT_TYPE_BY_TASK = {
  backtest_monte_carlo: 'monte_carlo',
  backtest_significance: 'significance',
  backtest_multi_period: 'multi_period',
  backtest_impact_analysis: 'impact_analysis',
};

const DIRECT_TASK_RESULT_TARGETS = {
  quant_strategy_optimizer: {
    setterKey: 'optimizerResult',
    tab: 'optimizer',
  },
  quant_risk_center: {
    setterKey: 'riskResult',
    tab: 'risk',
  },
  quant_valuation_lab: {
    setterKey: 'valuationResult',
    tab: 'valuation',
  },
  quant_industry_rotation: {
    setterKey: 'rotationResult',
    tab: 'industry',
  },
  quant_factor_expression: {
    setterKey: 'factorResult',
    tab: 'factor',
  },
};

export const buildBacktestEnhancementResult = (type, response) => ({
  type,
  payload: response?.data || response,
});

export const resolveQuantLabTaskResult = (record) => {
  if (!record?.result) {
    return { status: 'missing' };
  }

  const taskName = String(record.name || '').trim();
  const directTarget = DIRECT_TASK_RESULT_TARGETS[taskName];
  if (directTarget) {
    return {
      status: 'ok',
      setterKey: directTarget.setterKey,
      tab: directTarget.tab,
      value: record.result,
    };
  }

  const backtestType = BACKTEST_ENHANCEMENT_TYPE_BY_TASK[taskName];
  if (backtestType) {
    return {
      status: 'ok',
      setterKey: 'backtestEnhancementResult',
      tab: 'backtest-enhance',
      value: buildBacktestEnhancementResult(backtestType, record.result),
    };
  }

  return { status: 'unsupported' };
};
