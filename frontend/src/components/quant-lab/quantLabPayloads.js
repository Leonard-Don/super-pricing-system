const splitList = (value) => String(value || '')
  .split(/[\s,，]+/)
  .map((item) => item.trim())
  .filter(Boolean);

export const buildValuationPayload = (values) => ({
  ...values,
  peer_symbols: splitList(values.peer_symbols).map((item) => item.toUpperCase()),
});

export const buildFactorPayload = (values) => ({
  ...values,
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
