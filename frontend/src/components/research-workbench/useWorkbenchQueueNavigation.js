import { useEffect } from 'react';

import { consumeWorkbenchQueueHandoff, readResearchContext } from '../../utils/researchContext';
import { filterWorkbenchTasks } from './workbenchSelectors';

const getTaskLaunchMode = (task) => {
  if (!task) return '';
  if (task.type === 'pricing' && task.symbol) return 'pricing';
  if (task.type === 'cross_market' && task.template) return 'cross_market';
  if (task.type === 'macro_mispricing' && task.symbol) return 'cross_market';
  if (task.type === 'trade_thesis') return 'cross_market';
  return '';
};

export default function useWorkbenchQueueNavigation({
  tasks,
  filters,
  filteredTasks,
  refreshSignals,
  selectedTaskId,
  setSelectedTaskId,
  workbenchQueueMode,
  workbenchQueueAction,
  setWorkbenchQueueAction,
  message,
}) {
  useEffect(() => {
    if (workbenchQueueAction !== 'next_same_type' && (!selectedTaskId || !filteredTasks.length)) {
      return;
    }

    const queueContext = readResearchContext();
    const handoffContext = workbenchQueueAction === 'next_same_type'
      ? null
      : consumeWorkbenchQueueHandoff();
    const effectiveQueueAction = workbenchQueueAction || handoffContext?.workbenchQueueAction || '';
    const effectiveQueueMode = workbenchQueueMode || handoffContext?.workbenchQueueMode || '';

    if (effectiveQueueAction !== 'next_same_type' || !effectiveQueueMode || !selectedTaskId || !filteredTasks.length) {
      return;
    }

    const effectiveQueueFilters = {
      type: queueContext.workbenchType || handoffContext?.workbenchType || filters.type,
      source: queueContext.workbenchSource || handoffContext?.workbenchSource || filters.source,
      refresh: queueContext.workbenchRefresh || handoffContext?.workbenchRefresh || filters.refresh,
      reason: queueContext.workbenchReason || handoffContext?.workbenchReason || filters.reason,
      snapshotView: queueContext.workbenchSnapshotView || handoffContext?.workbenchSnapshotView || filters.snapshotView,
      snapshotFingerprint: queueContext.workbenchSnapshotFingerprint || handoffContext?.workbenchSnapshotFingerprint || filters.snapshotFingerprint,
      snapshotSummary: queueContext.workbenchSnapshotSummary || handoffContext?.workbenchSnapshotSummary || filters.snapshotSummary,
      keyword: queueContext.workbenchKeyword || handoffContext?.workbenchKeyword || filters.keyword,
    };
    const queueTasks = filterWorkbenchTasks(tasks, effectiveQueueFilters, refreshSignals.byTaskId);
    const currentTaskId = queueContext.task || handoffContext?.task || selectedTaskId;

    if (!queueTasks.length || !currentTaskId) {
      setWorkbenchQueueAction('');
      return;
    }

    const currentIndex = queueTasks.findIndex((task) => task.id === currentTaskId);
    if (currentIndex < 0) {
      const fallbackTaskId = queueTasks[0]?.id || '';
      if (fallbackTaskId && selectedTaskId !== fallbackTaskId) {
        setSelectedTaskId(fallbackTaskId);
        return;
      }
      setWorkbenchQueueAction('');
      return;
    }

    const nextTask = queueTasks
      .slice(currentIndex + 1)
      .find((task) => getTaskLaunchMode(task) === effectiveQueueMode);

    if (nextTask?.id) {
      setSelectedTaskId(nextTask.id);
    } else {
      if (selectedTaskId !== currentTaskId) {
        setSelectedTaskId(currentTaskId);
        return;
      }
      message.info(
        effectiveQueueMode === 'pricing'
          ? '当前已经是 Pricing 执行队列最后一条'
          : '当前已经是跨市场执行队列最后一条'
      );
    }
    setWorkbenchQueueAction('');
  }, [
    filteredTasks.length,
    filters.keyword,
    filters.reason,
    filters.refresh,
    filters.snapshotFingerprint,
    filters.snapshotSummary,
    filters.snapshotView,
    filters.source,
    filters.type,
    refreshSignals.byTaskId,
    selectedTaskId,
    tasks,
    message,
    workbenchQueueAction,
    workbenchQueueMode,
    setSelectedTaskId,
    setWorkbenchQueueAction,
  ]);
}
