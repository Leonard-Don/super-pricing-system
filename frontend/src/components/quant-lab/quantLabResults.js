const DIRECT_TASK_RESULT_TARGETS = {
  quant_valuation_lab: {
    setterKey: 'valuationResult',
    tab: 'valuation',
  },
  quant_factor_expression: {
    setterKey: 'factorResult',
    tab: 'factor',
  },
};

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

  return { status: 'unsupported' };
};
