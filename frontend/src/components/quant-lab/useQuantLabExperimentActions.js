import { useCallback } from 'react';
import {
  compareStrategySignificance,
  getRiskCenterAnalysis,
  queueBacktestMonteCarlo,
  queueMarketImpactAnalysis,
  queueMultiPeriodBacktest,
  queueQuantFactorExpressionTask,
  queueQuantIndustryRotationLab,
  queueQuantRiskCenterTask,
  queueQuantValuationLab,
  queueStrategyOptimizerTask,
  queueStrategySignificance,
  runBacktestMonteCarlo,
  runMarketImpactAnalysis,
  runMultiPeriodBacktest,
  runQuantFactorExpression,
  runQuantIndustryRotationLab,
  runQuantValuationLab,
  runStrategyOptimizer,
} from '../../services/api';
import {
  buildFactorPayload,
  buildImpactPayload,
  buildIndustryRotationPayload,
  buildMonteCarloPayload,
  buildMultiPeriodPayload,
  buildOptimizerPayload,
  buildRiskPayload,
  buildSignificancePayload,
  buildValuationPayload,
} from './quantLabPayloads';
import { buildBacktestEnhancementResult } from './quantLabResults';

function useQuantLabExperimentActions({
  factorForm,
  impactAnalysisForm,
  message,
  monteCarloForm,
  multiPeriodForm,
  optimizerForm,
  riskForm,
  rotationForm,
  setBacktestEnhancementLoading,
  setBacktestEnhancementResult,
  setFactorLoading,
  setFactorResult,
  setOptimizerLoading,
  setOptimizerResult,
  setRiskLoading,
  setRiskResult,
  setRotationLoading,
  setRotationResult,
  setValuationLoading,
  setValuationResult,
  significanceForm,
  submitAsyncQuantTask,
  valuationForm,
}) {
  const queueQuantTask = useCallback(async ({
    buildPayload,
    form,
    queueAction,
    taskKey,
    taskLabel,
  }) => {
    const values = await form.validateFields();
    await submitAsyncQuantTask(queueAction, buildPayload(values), taskLabel, taskKey);
  }, [submitAsyncQuantTask]);

  const handleOptimize = useCallback(async (values) => {
    setOptimizerLoading(true);
    try {
      const response = await runStrategyOptimizer(buildOptimizerPayload(values));
      setOptimizerResult(response);
      message.success('参数优化完成');
    } catch (error) {
      message.error(`参数优化失败: ${error.userMessage || error.message}`);
    } finally {
      setOptimizerLoading(false);
    }
  }, [message, setOptimizerLoading, setOptimizerResult]);

  const handleQueueOptimizer = useCallback(async () => {
    await queueQuantTask({
      buildPayload: buildOptimizerPayload,
      form: optimizerForm,
      queueAction: queueStrategyOptimizerTask,
      taskKey: 'optimizer',
      taskLabel: '策略优化',
    });
  }, [optimizerForm, queueQuantTask]);

  const handleRiskAnalysis = useCallback(async (values) => {
    setRiskLoading(true);
    try {
      const response = await getRiskCenterAnalysis(buildRiskPayload(values));
      setRiskResult(response);
      message.success('风险分析完成');
    } catch (error) {
      message.error(`风险分析失败: ${error.userMessage || error.message}`);
    } finally {
      setRiskLoading(false);
    }
  }, [message, setRiskLoading, setRiskResult]);

  const handleQueueRiskAnalysis = useCallback(async () => {
    await queueQuantTask({
      buildPayload: buildRiskPayload,
      form: riskForm,
      queueAction: queueQuantRiskCenterTask,
      taskKey: 'risk',
      taskLabel: '风险分析',
    });
  }, [queueQuantTask, riskForm]);

  const handleValuationAnalysis = useCallback(async (values) => {
    setValuationLoading(true);
    try {
      const response = await runQuantValuationLab(buildValuationPayload(values));
      setValuationResult(response);
      message.success('估值实验已更新并写入历史');
    } catch (error) {
      message.error(`估值实验失败: ${error.userMessage || error.message}`);
    } finally {
      setValuationLoading(false);
    }
  }, [message, setValuationLoading, setValuationResult]);

  const handleQueueValuation = useCallback(async () => {
    await queueQuantTask({
      buildPayload: buildValuationPayload,
      form: valuationForm,
      queueAction: queueQuantValuationLab,
      taskKey: 'valuation',
      taskLabel: '估值实验',
    });
  }, [queueQuantTask, valuationForm]);

  const handleIndustryRotation = useCallback(async (values) => {
    setRotationLoading(true);
    try {
      const response = await runQuantIndustryRotationLab(buildIndustryRotationPayload(values));
      setRotationResult(response);
      message.success('行业轮动策略回测完成');
    } catch (error) {
      message.error(`行业轮动策略回测失败: ${error.userMessage || error.message}`);
    } finally {
      setRotationLoading(false);
    }
  }, [message, setRotationLoading, setRotationResult]);

  const handleQueueIndustryRotation = useCallback(async () => {
    await queueQuantTask({
      buildPayload: buildIndustryRotationPayload,
      form: rotationForm,
      queueAction: queueQuantIndustryRotationLab,
      taskKey: 'industry_rotation',
      taskLabel: '行业轮动',
    });
  }, [queueQuantTask, rotationForm]);

  const handleFactorExpression = useCallback(async (values) => {
    setFactorLoading(true);
    try {
      const response = await runQuantFactorExpression(buildFactorPayload(values));
      setFactorResult(response);
      message.success('自定义因子已计算');
    } catch (error) {
      message.error(`因子表达式计算失败: ${error.userMessage || error.message}`);
    } finally {
      setFactorLoading(false);
    }
  }, [message, setFactorLoading, setFactorResult]);

  const handleQueueFactorExpression = useCallback(async () => {
    await queueQuantTask({
      buildPayload: buildFactorPayload,
      form: factorForm,
      queueAction: queueQuantFactorExpressionTask,
      taskKey: 'factor',
      taskLabel: '因子表达式',
    });
  }, [factorForm, queueQuantTask]);

  const handleBacktestMonteCarlo = useCallback(async (values) => {
    setBacktestEnhancementLoading(true);
    try {
      const response = await runBacktestMonteCarlo(buildMonteCarloPayload(values));
      setBacktestEnhancementResult(buildBacktestEnhancementResult('monte_carlo', response));
      message.success('Monte Carlo 路径模拟完成');
    } catch (error) {
      message.error(`Monte Carlo 模拟失败: ${error.userMessage || error.message}`);
    } finally {
      setBacktestEnhancementLoading(false);
    }
  }, [message, setBacktestEnhancementLoading, setBacktestEnhancementResult]);

  const handleQueueBacktestMonteCarlo = useCallback(async () => {
    await queueQuantTask({
      buildPayload: buildMonteCarloPayload,
      form: monteCarloForm,
      queueAction: queueBacktestMonteCarlo,
      taskKey: 'backtest_monte_carlo',
      taskLabel: 'Monte Carlo 回测',
    });
  }, [monteCarloForm, queueQuantTask]);

  const handleStrategySignificance = useCallback(async (values) => {
    setBacktestEnhancementLoading(true);
    try {
      const response = await compareStrategySignificance(buildSignificancePayload(values));
      setBacktestEnhancementResult(buildBacktestEnhancementResult('significance', response));
      message.success('策略显著性检验完成');
    } catch (error) {
      message.error(`显著性检验失败: ${error.userMessage || error.message}`);
    } finally {
      setBacktestEnhancementLoading(false);
    }
  }, [message, setBacktestEnhancementLoading, setBacktestEnhancementResult]);

  const handleQueueStrategySignificance = useCallback(async () => {
    await queueQuantTask({
      buildPayload: buildSignificancePayload,
      form: significanceForm,
      queueAction: queueStrategySignificance,
      taskKey: 'backtest_significance',
      taskLabel: '策略显著性检验',
    });
  }, [queueQuantTask, significanceForm]);

  const handleMultiPeriodBacktest = useCallback(async (values) => {
    setBacktestEnhancementLoading(true);
    try {
      const response = await runMultiPeriodBacktest(buildMultiPeriodPayload(values));
      setBacktestEnhancementResult(buildBacktestEnhancementResult('multi_period', response));
      message.success('多周期回测完成');
    } catch (error) {
      message.error(`多周期回测失败: ${error.userMessage || error.message}`);
    } finally {
      setBacktestEnhancementLoading(false);
    }
  }, [message, setBacktestEnhancementLoading, setBacktestEnhancementResult]);

  const handleQueueMultiPeriodBacktest = useCallback(async () => {
    await queueQuantTask({
      buildPayload: buildMultiPeriodPayload,
      form: multiPeriodForm,
      queueAction: queueMultiPeriodBacktest,
      taskKey: 'backtest_multi_period',
      taskLabel: '多周期回测',
    });
  }, [multiPeriodForm, queueQuantTask]);

  const handleMarketImpactAnalysis = useCallback(async (values) => {
    setBacktestEnhancementLoading(true);
    try {
      const response = await runMarketImpactAnalysis(buildImpactPayload(values));
      setBacktestEnhancementResult(buildBacktestEnhancementResult('impact_analysis', response));
      message.success('市场冲击敏感性分析完成');
    } catch (error) {
      message.error(`市场冲击分析失败: ${error.userMessage || error.message}`);
    } finally {
      setBacktestEnhancementLoading(false);
    }
  }, [message, setBacktestEnhancementLoading, setBacktestEnhancementResult]);

  const handleQueueMarketImpactAnalysis = useCallback(async () => {
    await queueQuantTask({
      buildPayload: buildImpactPayload,
      form: impactAnalysisForm,
      queueAction: queueMarketImpactAnalysis,
      taskKey: 'backtest_impact_analysis',
      taskLabel: '市场冲击分析',
    });
  }, [impactAnalysisForm, queueQuantTask]);

  return {
    handleBacktestMonteCarlo,
    handleFactorExpression,
    handleIndustryRotation,
    handleMarketImpactAnalysis,
    handleMultiPeriodBacktest,
    handleOptimize,
    handleQueueBacktestMonteCarlo,
    handleQueueFactorExpression,
    handleQueueIndustryRotation,
    handleQueueMarketImpactAnalysis,
    handleQueueMultiPeriodBacktest,
    handleQueueOptimizer,
    handleQueueRiskAnalysis,
    handleQueueStrategySignificance,
    handleQueueValuation,
    handleRiskAnalysis,
    handleStrategySignificance,
    handleValuationAnalysis,
  };
}

export default useQuantLabExperimentActions;
