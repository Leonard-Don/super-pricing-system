import { useEffect } from 'react';
import { formatPct } from './quantLabShared';

const MIN_SIGNAL_HIT_RATE = 0.6;

const getStrongestMacroHorizon = (macroValidationResult) => {
  const horizonResults = Array.isArray(macroValidationResult?.horizon_results)
    ? macroValidationResult.horizon_results
    : [];

  return horizonResults
    .filter((item) => Number(item?.samples || 0) >= 5 && Number.isFinite(Number(item?.hit_rate)))
    .sort((left, right) => Number(right?.hit_rate || 0) - Number(left?.hit_rate || 0))[0];
};

function useQuantLabSignalBus({
  altSignalDiagnostics,
  macroValidationResult,
  publishAlertEvent,
  signalValidationLoading,
}) {
  useEffect(() => {
    if (typeof window === 'undefined' || !macroValidationResult || signalValidationLoading) {
      return;
    }

    const strongestHorizon = getStrongestMacroHorizon(macroValidationResult);
    if (!strongestHorizon || Number(strongestHorizon.hit_rate || 0) < MIN_SIGNAL_HIT_RATE) {
      return;
    }

    const publishKey = `quant-signal-bus-published:macro:${macroValidationResult.status}:${strongestHorizon.horizon_days}:${Number(strongestHorizon.hit_rate || 0).toFixed(3)}`;
    if (window.sessionStorage.getItem(publishKey)) {
      return;
    }
    window.sessionStorage.setItem(publishKey, 'true');

    void publishAlertEvent({
      source_module: 'macro',
      rule_name: '宏观因子历史验证命中率偏强',
      symbol: '',
      severity: Number(strongestHorizon.hit_rate || 0) >= 0.7 ? 'critical' : 'warning',
      message: `${strongestHorizon.horizon_days}D horizon 命中率 ${formatPct(strongestHorizon.hit_rate)}，方向收益 ${formatPct(strongestHorizon.avg_signed_return || 0)}。`,
      condition_summary: 'macro:forward_return_validation',
      trigger_value: Number(strongestHorizon.hit_rate || 0),
      notify_channels: [],
      create_workbench_task: Number(strongestHorizon.hit_rate || 0) >= 0.7,
      workbench_task_type: 'cross_market',
      persist_event_record: true,
      cascade_actions: [
        { type: 'persist_record', record_type: 'macro_validation_signal_hit' },
        {
          type: 'persist_timeseries',
          series_name: 'macro.validation.hit_rate',
          value: Number(strongestHorizon.hit_rate || 0),
          payload: {
            horizon_days: strongestHorizon.horizon_days,
            samples: strongestHorizon.samples,
          },
        },
      ],
    }).catch((error) => {
      console.warn('Failed to publish macro validation signal to unified bus:', error);
      window.sessionStorage.removeItem(publishKey);
    });
  }, [macroValidationResult, publishAlertEvent, signalValidationLoading]);

  useEffect(() => {
    if (typeof window === 'undefined' || !altSignalDiagnostics || signalValidationLoading) {
      return;
    }

    const overallHitRate = Number(altSignalDiagnostics?.overall?.hit_rate);
    const recordCount = Number(altSignalDiagnostics?.record_count || 0);
    if (!Number.isFinite(overallHitRate) || recordCount < 10 || overallHitRate < MIN_SIGNAL_HIT_RATE) {
      return;
    }

    const hitRateType = altSignalDiagnostics?.overall?.hit_rate_type || 'proxy';
    const publishKey = `quant-signal-bus-published:alt:${hitRateType}:${recordCount}:${overallHitRate.toFixed(3)}`;
    if (window.sessionStorage.getItem(publishKey)) {
      return;
    }
    window.sessionStorage.setItem(publishKey, 'true');

    void publishAlertEvent({
      source_module: 'alt_data',
      rule_name: '另类数据信号命中率偏强',
      symbol: '',
      severity: overallHitRate >= 0.7 && hitRateType === 'realized' ? 'critical' : 'warning',
      message: `${recordCount} 条记录的整体命中率为 ${formatPct(overallHitRate)}，口径为 ${hitRateType}。`,
      condition_summary: 'alt_data:signal_diagnostics',
      trigger_value: overallHitRate,
      notify_channels: [],
      create_workbench_task: overallHitRate >= 0.7 && hitRateType === 'realized',
      workbench_task_type: 'cross_market',
      persist_event_record: true,
      cascade_actions: [
        { type: 'persist_record', record_type: 'alt_signal_diagnostic_hit' },
        {
          type: 'persist_timeseries',
          series_name: 'alt_data.signal.hit_rate',
          value: overallHitRate,
          payload: {
            hit_rate_type: hitRateType,
            record_count: recordCount,
          },
        },
      ],
    }).catch((error) => {
      console.warn('Failed to publish alt-data diagnostics to unified bus:', error);
      window.sessionStorage.removeItem(publishKey);
    });
  }, [altSignalDiagnostics, publishAlertEvent, signalValidationLoading]);
}

export default useQuantLabSignalBus;
