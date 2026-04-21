import { QUANT_LAB_TAB_META } from './quantLabShared';

const buildQuantLabShellViewModel = ({
  activeTabMeta,
  alertOrchestration,
  dataQuality,
  infrastructureStatus,
  strategies,
  tradingJournal,
}) => {
  const pendingAlerts = alertOrchestration.history_stats?.pending_queue?.length || 0;
  const runningTasks = infrastructureStatus.task_queue?.queued_or_running || 0;
  const failedTasks = infrastructureStatus.task_queue?.failed || 0;
  const executionBackends = (infrastructureStatus.task_queue?.execution_backends || []).join(' / ') || '--';
  const totalTrades = tradingJournal.summary?.total_trades || 0;
  const degradedProviders = (dataQuality?.summary?.degraded || 0) + (dataQuality?.summary?.down || 0);
  const workspaceCount = QUANT_LAB_TAB_META.length;
  const strategyCount = strategies.length;

  return {
    heroMetrics: [
      {
        label: '工作区',
        value: `${workspaceCount} 个`,
      },
      {
        label: '策略模板',
        value: `${strategyCount} 个`,
      },
      {
        label: '运行中任务',
        value: `${runningTasks}`,
      },
      {
        label: '待复盘告警',
        value: `${pendingAlerts}`,
      },
    ],
    focusItems: [
      {
        title: '当前实验台',
        detail: `${activeTabMeta.title} · ${activeTabMeta.summary}`,
      },
      {
        title: '执行覆盖',
        detail: `已加载 ${strategyCount} 个策略模板，覆盖 ${workspaceCount} 个实验与运营工作区。`,
      },
      {
        title: '异步执行',
        detail: `运行中 ${runningTasks}，失败 ${failedTasks}，后端 ${executionBackends}。`,
      },
      {
        title: '运营闭环',
        detail: `交易 ${totalTrades} 条，待复盘告警 ${pendingAlerts} 条，退化数据源 ${degradedProviders} 个。`,
      },
    ],
  };
};

export default buildQuantLabShellViewModel;
