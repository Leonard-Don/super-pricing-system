import {
  QUANT_LAB_TAB_META,
  buildQuantLabBoundarySummary,
  getQuantLabBoundaryMeta,
} from './quantLabShared';

const buildQuantLabShellViewModel = ({
  activeTabMeta,
  alertOrchestration,
  dataQuality,
  infraHydrated,
  infrastructureStatus,
  opsHydrated,
  tradingJournal,
}) => {
  const pendingAlerts = alertOrchestration.history_stats?.pending_queue?.length || 0;
  const runningTasks = infrastructureStatus.task_queue?.queued_or_running || 0;
  const failedTasks = infrastructureStatus.task_queue?.failed || 0;
  const executionBackends = (infrastructureStatus.task_queue?.execution_backends || []).join(' / ') || '--';
  const totalTrades = tradingJournal.summary?.total_trades || 0;
  const degradedProviders = (dataQuality?.summary?.degraded || 0) + (dataQuality?.summary?.down || 0);
  const boundarySummary = buildQuantLabBoundarySummary(QUANT_LAB_TAB_META);
  const boundaryCounts = boundarySummary.reduce((accumulator, item) => {
    accumulator[item.key] = item.count;
    return accumulator;
  }, {});
  const activeBoundary = getQuantLabBoundaryMeta(activeTabMeta.boundary);
  const runningTasksLabel = infraHydrated ? `${runningTasks}` : '--';
  const executionCoverage = infraHydrated
    ? `运行中 ${runningTasks}，失败 ${failedTasks}，后端 ${executionBackends}。`
    : '访问基础设施标签后再加载任务队列、认证与持久化状态。';
  const operationsCoverage = opsHydrated
    ? `交易 ${totalTrades} 条，待复盘告警 ${pendingAlerts} 条，退化数据源 ${degradedProviders} 个。`
    : '访问运营标签后再加载交易日志、告警编排与数据质量观测。';

  return {
    activeBoundary,
    boundarySummary,
    heroMetrics: [
      {
        label: '定价内核',
        value: `${boundaryCounts.pricing || 0} 个`,
      },
      {
        label: '已迁移',
        value: `${boundaryCounts.migrated || 0} 个`,
      },
      {
        label: '内部支撑',
        value: `${boundaryCounts.support || 0} 个`,
      },
      {
        label: '运行中任务',
        value: runningTasksLabel,
      },
    ],
    focusItems: [
      {
        title: '当前工作区',
        detail: `${activeTabMeta.title} · ${activeBoundary.label} · ${activeTabMeta.boundarySummary || activeTabMeta.summary}`,
      },
      {
        title: '边界规则',
        detail: '本页只沉淀定价实验和内部运行支撑；交易、回测、行业、实时信号类能力已迁移到 quant-trading-system。',
      },
      {
        title: '运行状态',
        detail: executionCoverage,
      },
      {
        title: '运营回看',
        detail: operationsCoverage,
      },
    ],
  };
};

export default buildQuantLabShellViewModel;
