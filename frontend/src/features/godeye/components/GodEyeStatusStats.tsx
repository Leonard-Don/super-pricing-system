// ---------------------------------------------------------------------------
// GodEyeStatusStats — command-center StatPanel presentation component
// Rebuilt from frontend/src/components/GodEyeDashboard/GodEyeStatusStats.js (92)
// Props in, no callbacks. No API calls.
// ---------------------------------------------------------------------------

import { StatPanel } from '@/components/command';
import {
  formatGodEyeSnapshotTimestamp,
  getGodEyeStalenessLabel,
} from '@/features/godeye/lib/displayLabels';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ProviderHealth {
  healthy_providers?: number;
  degraded_providers?: number;
  error_providers?: number;
}

export interface StalenessSummary {
  label?: string;
  max_snapshot_age_seconds?: number;
}

export interface SchedulerStatus {
  jobs?: unknown[];
}

export interface GodEyeStatusStatsProps {
  macroScore?: number;
  providerCount?: number;
  providerHealth?: ProviderHealth;
  refreshing?: boolean;
  schedulerStatus?: SchedulerStatus;
  snapshotTimestamp?: unknown;
  staleness?: StalenessSummary;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function GodEyeStatusStats({
  macroScore,
  providerCount = 0,
  providerHealth,
  refreshing = false,
  schedulerStatus,
  snapshotTimestamp,
  staleness,
}: GodEyeStatusStatsProps) {
  const formattedSnapshot = formatGodEyeSnapshotTimestamp(snapshotTimestamp);
  const stalenessLabel = getGodEyeStalenessLabel(staleness);
  const maxAge = staleness?.max_snapshot_age_seconds ?? '-';
  const healthyCount = providerHealth?.healthy_providers ?? 0;
  const degradedCount = providerHealth?.degraded_providers ?? 0;
  const errorCount = providerHealth?.error_providers ?? 0;
  const jobCount = schedulerStatus?.jobs?.length ?? 0;
  // Pre-format so tests can find the exact string (animate=true would start at 0 in jsdom)
  const scoreDisplay =
    macroScore !== undefined ? macroScore.toFixed(4) : '0.0000';

  return (
    <div className="flex flex-wrap gap-4">
      {/* Macro score — focus card */}
      <div className="flex-1 min-w-[160px]">
        <StatPanel
          label="宏观错价分数 · MACRO MISPRICING"
          value={scoreDisplay}
          focus
          decimals={4}
          meta={<span>调度任务 {jobCount}</span>}
        />
      </div>

      {/* Provider health — healthy count / total */}
      <div className="flex-1 min-w-[160px]">
        <StatPanel
          label="健康提供器"
          value={healthyCount}
          meta={
            <span>
              / {providerCount} · 降级 {degradedCount} / 异常 {errorCount}
            </span>
          }
        />
      </div>

      {/* Staleness */}
      <div className="flex-1 min-w-[160px]">
        <StatPanel
          label="数据新鲜度"
          value={stalenessLabel}
          meta={
            <span>
              {refreshing ? '刷新中…' : `最大快照年龄 ${maxAge} 秒`}
            </span>
          }
        />
      </div>

      {/* Snapshot timestamp */}
      <div className="flex-1 min-w-[160px]">
        <StatPanel
          label="最近刷新"
          value={formattedSnapshot.date}
          meta={formattedSnapshot.time ? <span>{formattedSnapshot.time}</span> : undefined}
        />
      </div>
    </div>
  );
}

export default GodEyeStatusStats;
