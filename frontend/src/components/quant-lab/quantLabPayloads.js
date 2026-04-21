const splitList = (value) => String(value || '')
  .split(/[\s,，]+/)
  .map((item) => item.trim())
  .filter(Boolean);

export const buildOptimizerPayload = (values) => ({
  ...values,
  parameters: values.parameters || {},
});

export const buildValuationPayload = (values) => ({
  ...values,
  peer_symbols: splitList(values.peer_symbols).map((item) => item.toUpperCase()),
});

export const buildIndustryRotationPayload = (values) => ({
  ...values,
});

export const buildRiskPayload = (values) => {
  const symbols = splitList(values.symbols).map((item) => item.toUpperCase());
  const weights = splitList(values.weights)
    .map((item) => Number(item))
    .filter((item) => Number.isFinite(item));

  return {
    symbols,
    weights: weights.length ? weights : undefined,
    period: values.period,
  };
};

export const buildFactorPayload = (values) => ({
  ...values,
});

export const buildMonteCarloPayload = (values) => ({
  ...values,
});

export const buildSignificancePayload = (values) => ({
  ...values,
  strategies: splitList(values.strategies),
  bootstrap_samples: values.bootstrap_samples,
});

export const buildMultiPeriodPayload = (values) => ({
  ...values,
  intervals: splitList(values.intervals || '1d,1wk,1mo'),
});

export const buildImpactPayload = (values) => ({
  ...values,
  sample_trade_values: splitList(values.sample_trade_values || '10000,50000,100000,250000')
    .map((item) => Number(item))
    .filter((item) => Number.isFinite(item) && item > 0),
});

export const parseJsonArrayField = (value, label) => {
  if (!String(value || '').trim()) {
    return [];
  }

  const parsed = JSON.parse(value);
  if (!Array.isArray(parsed)) {
    throw new Error(`${label}必须是 JSON 数组`);
  }
  return parsed;
};
