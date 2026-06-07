// ---------------------------------------------------------------------------
// GodEyeStatusStats — shadcn/Tailwind presentation component
// Rebuilt from frontend/src/components/GodEyeDashboard/GodEyeStatusStats.js (92)
// Props in, no callbacks. No API calls.
// ---------------------------------------------------------------------------

import React from 'react';
import { Clock, Globe, RefreshCw, Target } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
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
// Sub-component: StatCard
// ---------------------------------------------------------------------------

interface StatCardProps {
  icon: React.ReactNode;
  label: string;
  value: React.ReactNode;
  sub: React.ReactNode;
}

function StatCard({ icon, label, value, sub }: StatCardProps) {
  return (
    <Card size="sm" className="flex-1 min-w-[160px]">
      <CardContent className="flex flex-col gap-2 py-3">
        <span className="text-xs text-muted-foreground">{label}</span>
        <div className="flex items-center gap-2.5 min-w-0">
          <span className="text-primary shrink-0">{icon}</span>
          <span className="text-lg font-semibold leading-tight truncate">{value}</span>
        </div>
        <span className="text-xs text-muted-foreground">{sub}</span>
      </CardContent>
    </Card>
  );
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
  const scoreDisplay =
    macroScore !== undefined
      ? macroScore.toFixed(4)
      : '0.0000';

  return (
    <div className="flex flex-wrap gap-4">
      {/* Snapshot timestamp */}
      <StatCard
        icon={<Clock size={22} />}
        label="最近刷新"
        value={
          <span className="flex flex-col">
            <span>{formattedSnapshot.date}</span>
            {formattedSnapshot.time ? (
              <span className="text-sm font-normal text-muted-foreground">
                {formattedSnapshot.time}
              </span>
            ) : null}
          </span>
        }
        sub={null}
      />

      {/* Staleness */}
      <StatCard
        icon={
          <RefreshCw
            size={22}
            className={refreshing ? 'animate-spin' : ''}
          />
        }
        label="数据新鲜度"
        value={stalenessLabel}
        sub={<span>最大快照年龄 {maxAge} 秒</span>}
      />

      {/* Provider health */}
      <StatCard
        icon={<Globe size={22} />}
        label="健康提供器"
        value={
          <span>
            {healthyCount}
            <span className="text-sm font-normal text-muted-foreground">
              {' '}/ {providerCount}
            </span>
          </span>
        }
        sub={
          <span>
            降级 {degradedCount} / 异常 {errorCount}
          </span>
        }
      />

      {/* Macro score */}
      <StatCard
        icon={<Target size={22} />}
        label="宏观错价分数"
        value={scoreDisplay}
        sub={<span>调度任务 {jobCount}</span>}
      />
    </div>
  );
}

export default GodEyeStatusStats;
