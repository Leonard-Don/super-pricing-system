import { useCallback, useEffect } from 'react';
import {
  getQuantAlertOrchestration,
  getQuantDataQuality,
  getQuantTradingJournal,
  publishQuantAlertEvent,
  updateQuantAlertOrchestration,
  updateQuantTradingJournal,
} from '../../services/api';
import { parseJsonArrayField } from './quantLabPayloads';

function useQuantLabOperationsActions({
  alertOrchestration,
  message,
  setAlertOrchestration,
  setDataQuality,
  setOpsLoading,
  setTradingJournal,
  tradingJournal,
}) {
  const loadOperations = useCallback(async () => {
    setOpsLoading(true);
    try {
      const [journalPayload, alertPayload, qualityPayload] = await Promise.all([
        getQuantTradingJournal(),
        getQuantAlertOrchestration(),
        getQuantDataQuality(),
      ]);
      setTradingJournal(journalPayload);
      setAlertOrchestration(alertPayload);
      setDataQuality(qualityPayload);
    } catch (error) {
      message.error(`加载研究运营面板失败: ${error.userMessage || error.message}`);
    } finally {
      setOpsLoading(false);
    }
  }, [
    message,
    setAlertOrchestration,
    setDataQuality,
    setOpsLoading,
    setTradingJournal,
  ]);

  useEffect(() => {
    loadOperations();
  }, [loadOperations]);

  const handleSaveTradeNote = useCallback(async (tradeId, values) => {
    if (!tradeId) {
      message.warning('先选择一笔交易再保存备注');
      return null;
    }

    try {
      const response = await updateQuantTradingJournal({
        notes: {
          [tradeId]: values,
        },
      });
      setTradingJournal(response);
      message.success('交易日志已更新');
      return response;
    } catch (error) {
      message.error(`保存交易日志失败: ${error.userMessage || error.message}`);
      throw error;
    }
  }, [message, setTradingJournal]);

  const handleAddLifecycleEntry = useCallback(async (values) => {
    try {
      const existingEntries = Array.isArray(tradingJournal?.strategy_lifecycle)
        ? tradingJournal.strategy_lifecycle
        : [];
      const timestamp = new Date().toISOString();
      const response = await updateQuantTradingJournal({
        strategy_lifecycle: [
          {
            id: `lifecycle_${Date.now()}`,
            strategy: values.strategy,
            stage: values.stage,
            status: values.status,
            owner: values.owner,
            conviction: values.conviction,
            next_action: values.next_action,
            notes: values.notes,
            created_at: timestamp,
            updated_at: timestamp,
          },
          ...existingEntries,
        ],
      });
      setTradingJournal(response);
      message.success('策略生命周期条目已加入');
      return response;
    } catch (error) {
      message.error(`更新策略生命周期失败: ${error.userMessage || error.message}`);
      throw error;
    }
  }, [message, setTradingJournal, tradingJournal]);

  const handleAddCompositeRule = useCallback(async (values) => {
    try {
      const cascadeActions = parseJsonArrayField(values.cascade_actions_json, '规则级联动作');
      const existingRules = Array.isArray(alertOrchestration?.composite_rules)
        ? alertOrchestration.composite_rules
        : [];
      const response = await updateQuantAlertOrchestration({
        composite_rules: [
          {
            id: `rule_${Date.now()}`,
            name: values.name,
            condition_summary: values.condition_summary,
            action: values.action,
            cascade_actions: cascadeActions,
            created_at: new Date().toISOString(),
          },
          ...existingRules,
        ],
      });
      setAlertOrchestration(response);
      message.success('复合告警规则已添加');
      return response;
    } catch (error) {
      message.error(`添加复合告警失败: ${error.userMessage || error.message}`);
      throw error;
    }
  }, [alertOrchestration, message, setAlertOrchestration]);

  const handlePublishAlertEvent = useCallback(async (values) => {
    try {
      const cascadeActions = parseJsonArrayField(values.cascade_actions_json, '事件级联动作');
      const notifyChannels = String(values.notify_channels || '')
        .split(/[\s,，]+/)
        .map((item) => item.trim())
        .filter(Boolean);
      const ruleIds = String(values.rule_ids || '')
        .split(/[\s,，]+/)
        .map((item) => item.trim())
        .filter(Boolean);
      const response = await publishQuantAlertEvent({
        source_module: values.source_module,
        rule_name: values.rule_name,
        symbol: values.symbol,
        severity: values.severity,
        message: values.message,
        condition_summary: values.condition_summary,
        trigger_value: values.trigger_value,
        threshold: values.threshold,
        rule_ids: ruleIds,
        notify_channels: notifyChannels,
        create_workbench_task: values.create_workbench_task === true,
        workbench_task_type: values.workbench_task_type,
        workbench_status: values.workbench_status,
        persist_event_record: values.persist_event_record !== false,
        cascade_actions: cascadeActions,
      });
      setAlertOrchestration(response.orchestration || null);
      message.success(`告警事件已发布，级联动作 ${response.cascade_results?.length || 0} 条`);
      return response;
    } catch (error) {
      message.error(`发布告警事件失败: ${error.userMessage || error.message}`);
      throw error;
    }
  }, [message, setAlertOrchestration]);

  const handleReviewAlertHistory = useCallback(async (record, reviewStatus) => {
    if (!record?.id) {
      message.warning('无法识别要更新的告警事件');
      return;
    }

    try {
      const acknowledgedAt = reviewStatus === 'pending' ? null : new Date().toISOString();
      const response = await updateQuantAlertOrchestration({
        history_updates: [
          {
            ...record,
            review_status: reviewStatus,
            acknowledged_at: acknowledgedAt,
          },
        ],
      });
      setAlertOrchestration(response);
      message.success(reviewStatus === 'false_positive' ? '已标记为误报' : '已标记为已处理');
    } catch (error) {
      message.error(`更新告警复盘状态失败: ${error.userMessage || error.message}`);
    }
  }, [message, setAlertOrchestration]);

  return {
    handleAddCompositeRule,
    handleAddLifecycleEntry,
    handlePublishAlertEvent,
    handleReviewAlertHistory,
    handleSaveTradeNote,
    loadOperations,
  };
}

export default useQuantLabOperationsActions;
