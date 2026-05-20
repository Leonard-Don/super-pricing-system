import { useCallback } from 'react';
import {
  queueQuantFactorExpressionTask,
  queueQuantValuationLab,
  runQuantFactorExpression,
  runQuantValuationLab,
} from '../../services/api';
import {
  buildFactorPayload,
  buildValuationPayload,
} from './quantLabPayloads';

function useQuantLabExperimentActions({
  factorForm,
  message,
  setFactorLoading,
  setFactorResult,
  setValuationLoading,
  setValuationResult,
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

  return {
    handleFactorExpression,
    handleQueueFactorExpression,
    handleQueueValuation,
    handleValuationAnalysis,
  };
}

export default useQuantLabExperimentActions;
