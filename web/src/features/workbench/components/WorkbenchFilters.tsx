// WorkbenchFilters — type/source/status/refresh/keyword filter controls
// + refresh-signal stat counts + morning-preset apply button.
// Ported from the filter/refresh-stats portions of
// frontend/src/components/research-workbench/WorkbenchBoardSection.js (toolbar section)
// and WorkbenchOverviewPanels.js (refresh-signal stat blocks).
// Props-in / callbacks-out; no internal state.
//
// NOT ported (P3.5): daily-briefing controls, alt-data candidate queue.

import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  TYPE_OPTIONS,
  REFRESH_OPTIONS,
} from '@/features/workbench/lib/workbenchUtils';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface SelectOption {
  label: string;
  value: string;
}

interface WorkbenchFilters {
  type: string;
  source: string;
  refresh: string;
  reason: string;
  snapshotView: string;
  snapshotFingerprint: string;
  snapshotSummary: string;
  keyword: string;
}

type SetFilters = React.Dispatch<React.SetStateAction<WorkbenchFilters>>;

interface RefreshStats {
  high: number;
  medium: number;
  low: number;
  resonance: number;
  biasQualityCore: number;
  selectionQualityActive: number;
  reviewContext: number;
  structuralDecayRadar: number;
  priorityNew: number;
  priorityEscalated: number;
  peopleLayer: number;
  departmentChaos: number;
  selectionQuality: number;
  snapshotViewFiltered: number;
  snapshotViewScoped: number;
  [key: string]: number;
}

interface MorningPresetCandidate {
  label: string;
  filters: Partial<WorkbenchFilters>;
}

export interface WorkbenchFiltersProps {
  filters: WorkbenchFilters;
  setFilters: SetFilters;
  sourceOptions: SelectOption[];
  refreshStats: RefreshStats;
  morningPresetActive: boolean;
  morningPresetCandidate: MorningPresetCandidate | null;
  onApplyMorningPreset: () => void;
}

// ---------------------------------------------------------------------------
// Sub-component: a refresh-signal stat badge
// ---------------------------------------------------------------------------

interface StatBadgeProps {
  testId: string;
  label: string;
  value: number;
  /** Tailwind text-color class e.g. "text-pos" or "text-neg" */
  tone?: 'pos' | 'neg' | 'neutral';
}

function StatBadge({ testId, label, value, tone = 'neutral' }: StatBadgeProps) {
  const valueClass =
    tone === 'neg'
      ? 'text-neg'
      : tone === 'pos'
        ? 'text-pos'
        : 'text-foreground';
  return (
    <div className="flex flex-col items-center gap-0.5 rounded-lg border border-border bg-muted/30 px-3 py-1.5 min-w-[64px]">
      <span
        data-testid={testId}
        className={`text-base font-semibold tabular-nums ${valueClass}`}
      >
        {value}
      </span>
      <span className="text-[11px] text-muted-foreground whitespace-nowrap">{label}</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function WorkbenchFilters({
  filters,
  setFilters,
  sourceOptions,
  refreshStats,
  morningPresetActive,
  morningPresetCandidate,
  onApplyMorningPreset,
}: WorkbenchFiltersProps) {
  const handleTypeChange = (value: string | null) => {
    if (value === null) return;
    setFilters((prev) => ({ ...prev, type: value }));
  };

  const handleSourceChange = (value: string | null) => {
    if (value === null) return;
    setFilters((prev) => ({ ...prev, source: value }));
  };

  const handleRefreshChange = (value: string | null) => {
    if (value === null) return;
    setFilters((prev) => ({ ...prev, refresh: value }));
  };

  const handleKeywordChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setFilters((prev) => ({ ...prev, keyword: event.target.value }));
  };

  return (
    <div className="flex flex-col gap-3" data-testid="workbench-filters">
      {/* ── Filter controls row ── */}
      <div className="flex flex-wrap items-center gap-2">
        {/* Type */}
        <Select value={filters.type || ''} onValueChange={handleTypeChange}>
          <SelectTrigger className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {TYPE_OPTIONS.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Source */}
        <Select value={filters.source || ''} onValueChange={handleSourceChange}>
          <SelectTrigger className="w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {sourceOptions.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Refresh */}
        <Select value={filters.refresh || ''} onValueChange={handleRefreshChange}>
          <SelectTrigger className="w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {REFRESH_OPTIONS.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Keyword */}
        <Input
          className="w-64"
          placeholder="关键词搜索标题、symbol"
          value={filters.keyword}
          onChange={handleKeywordChange}
        />

        {/* Morning preset */}
        {morningPresetCandidate ? (
          <Button
            size="sm"
            variant="outline"
            disabled={morningPresetActive}
            onClick={onApplyMorningPreset}
          >
            {morningPresetActive ? '晨间默认视图已生效' : '切回晨间默认视图'}
          </Button>
        ) : null}
      </div>

      {/* ── Refresh-signal stat strip ── */}
      <div className="flex flex-wrap gap-2">
        <StatBadge
          testId="refresh-stat-high"
          label="建议更新"
          value={refreshStats.high}
          tone="neg"
        />
        <StatBadge
          testId="refresh-stat-medium"
          label="建议复核"
          value={refreshStats.medium}
          tone="neutral"
        />
        <StatBadge
          testId="refresh-stat-low"
          label="继续观察"
          value={refreshStats.low}
          tone="pos"
        />
        <StatBadge
          testId="refresh-stat-resonance"
          label="共振驱动"
          value={refreshStats.resonance}
          tone="neg"
        />
        <StatBadge
          testId="refresh-stat-review-context"
          label="复核语境切换"
          value={refreshStats.reviewContext}
          tone="neutral"
        />
        <StatBadge
          testId="refresh-stat-structural-decay-radar"
          label="系统衰败雷达"
          value={refreshStats.structuralDecayRadar}
          tone="neg"
        />
        <StatBadge
          testId="refresh-stat-priority-escalated"
          label="自动排序升档"
          value={refreshStats.priorityEscalated}
          tone="neg"
        />
        <StatBadge
          testId="refresh-stat-priority-new"
          label="首次入列"
          value={refreshStats.priorityNew}
          tone="neutral"
        />
      </div>

      {/* Active filter active-count badge (convenience) */}
      {(filters.type ||
        filters.source ||
        filters.refresh ||
        filters.keyword.trim()) ? (
        <div className="flex items-center gap-2">
          <Badge variant="secondary" className="text-xs">
            筛选已生效
          </Badge>
          <Button
            size="sm"
            variant="ghost"
            className="h-6 px-2 text-xs"
            onClick={() =>
              setFilters((prev) => ({
                ...prev,
                type: '',
                source: '',
                refresh: '',
                reason: '',
                snapshotView: '',
                snapshotFingerprint: '',
                snapshotSummary: '',
                keyword: '',
              }))
            }
          >
            清空筛选
          </Button>
        </div>
      ) : null}
    </div>
  );
}
