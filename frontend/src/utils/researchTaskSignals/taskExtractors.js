export const extractTaskPayload = (task = {}) =>
  task?.snapshot?.payload
  || task?.snapshot_history?.[0]?.payload
  || {};

export const extractTaskResearchInput = (task = {}) =>
  extractTaskPayload(task)?.research_input || {};

export const extractTaskTemplateMeta = (task = {}) =>
  extractTaskPayload(task)?.template_meta || {};

export const extractLinkedPricingTask = (task = {}, researchTasks = []) => {
  const payload = extractTaskPayload(task);
  const sourceTaskId = String(
    payload?.source_task_id
    || payload?.trade_thesis?.source_task_id
    || task?.context?.pricing_task_id
    || task?.context?.source_task_id
    || ''
  ).trim();
  const symbol = String(
    task?.symbol
    || payload?.symbol
    || payload?.trade_thesis?.symbol
    || ''
  ).trim().toUpperCase();

  return (researchTasks || []).find((item) => {
    if (item?.type !== 'pricing' || item?.status === 'archived') {
      return false;
    }
    if (sourceTaskId && item?.id === sourceTaskId) {
      return true;
    }
    return String(item?.symbol || '').trim().toUpperCase() === symbol;
  }) || null;
};
