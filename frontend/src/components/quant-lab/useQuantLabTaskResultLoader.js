import { useCallback } from 'react';
import { resolveQuantLabTaskResult } from './quantLabResults';

function useQuantLabTaskResultLoader({
  activateTab,
  message,
  setBacktestEnhancementResult,
  setFactorResult,
  setOptimizerResult,
  setRiskResult,
  setRotationResult,
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
      optimizerResult: setOptimizerResult,
      riskResult: setRiskResult,
      valuationResult: setValuationResult,
      rotationResult: setRotationResult,
      factorResult: setFactorResult,
      backtestEnhancementResult: setBacktestEnhancementResult,
    };
    setters[resolved.setterKey]?.(resolved.value);
    activateTab(resolved.tab);
    message.success('任务结果已载入对应研究面板');
  }, [
    activateTab,
    message,
    setBacktestEnhancementResult,
    setFactorResult,
    setOptimizerResult,
    setRiskResult,
    setRotationResult,
    setValuationResult,
  ]);
}

export default useQuantLabTaskResultLoader;
