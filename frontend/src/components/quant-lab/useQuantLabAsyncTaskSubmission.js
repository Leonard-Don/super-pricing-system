import { useCallback } from 'react';

import { invokeFirstDefined } from './quantLabActionUtils';

function useQuantLabAsyncTaskSubmission({
  loadInfrastructureStatusAndTasks,
  loadInfrastructure,
  message,
  setQueuedTaskLoading,
}) {
  return useCallback(async (submitter, payload, label, loadingKey) => {
    setQueuedTaskLoading((current) => ({ ...current, [loadingKey]: true }));
    try {
      const response = await submitter(payload);
      message.success(`${label} 已进入异步队列`);
      if ((response?.execution_backend || response?.task?.execution_backend) === 'celery') {
        message.info('任务已路由到 Celery worker，可在基础设施页观察 broker 状态');
      }
      await invokeFirstDefined(loadInfrastructureStatusAndTasks, loadInfrastructure);
      return response;
    } catch (error) {
      message.error(`提交${label}异步任务失败: ${error.userMessage || error.message}`);
      return null;
    } finally {
      setQueuedTaskLoading((current) => ({ ...current, [loadingKey]: false }));
    }
  }, [loadInfrastructure, loadInfrastructureStatusAndTasks, message, setQueuedTaskLoading]);
}

export default useQuantLabAsyncTaskSubmission;
