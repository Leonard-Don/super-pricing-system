import { useCallback } from 'react';
import { resolveQuantLabTaskResult } from './quantLabResults';

function useQuantLabTaskResultLoader({
  activateTab,
  message,
  setFactorResult,
  setValuationResult,
}) {
  return useCallback((record) => {
    const resolved = resolveQuantLabTaskResult(record);
    if (resolved.status === 'missing') {
      message.warning('该任务还没有可载入的结果');
      return;
    }
    if (resolved.status === 'unsupported') {
      message.warning('该任务结果暂不支持自动载入');
      return;
    }

    const setters = {
      valuationResult: setValuationResult,
      factorResult: setFactorResult,
    };
    setters[resolved.setterKey]?.(resolved.value);
    activateTab(resolved.tab);
    message.success('任务结果已载入对应研究面板');
  }, [
    activateTab,
    message,
    setFactorResult,
    setValuationResult,
  ]);
}

export default useQuantLabTaskResultLoader;
