// ---------------------------------------------------------------------------
// MarketIndicatorHealthPanel — shows per-indicator source_health/checked_at
// for the yfinance market indicators (VIX, DXY, 10Y, gold, oil, S&P 500).
//
// Reads from the `/api/v1/macro/overview` response fields:
//   overview.indicator_health — per-indicator health map
//   overview.indicator_meta   — batch metadata (fetched_at, ok_count, …)
//
// Defensive: renders nothing when both fields are absent (older API payloads).
// No API calls — props only.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type IndicatorSourceHealth = 'ok' | 'stale' | 'failed';

export interface IndicatorHealthEntry {
  value?: number | null;
  source_health?: IndicatorSourceHealth | string;
  checked_at?: string | null;
}

export interface IndicatorHealthMap {
  [name: string]: IndicatorHealthEntry;
}

export interface IndicatorMeta {
  fetched_at?: string | null;
  ok_count?: number;
  failed_count?: number;
  cache_status?: 'fresh' | 'stale' | string;
}

export interface MarketIndicatorHealthPanelProps {
  indicatorHealth?: IndicatorHealthMap | null;
  indicatorMeta?: IndicatorMeta | null;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const INDICATOR_LABEL: Record<string, string> = {
  vix: 'VIX',
  dxy: 'DXY',
  '10y_yield': '10Y Yield',
  gold: '黄金',
  oil: '原油',
  sp500: 'S&P 500',
};

const HEALTH_LABEL: Record<string, string> = {
  ok: '正常',
  stale: '陈旧',
  failed: '失败',
};

const HEALTH_CLASS: Record<string, string> = {
  ok: 'border-green-500 text-green-400 bg-green-500/10',
  stale: 'border-yellow-500 text-yellow-400 bg-yellow-500/10',
  failed: 'border-destructive text-destructive bg-destructive/10',
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatTs(value: string | null | undefined): string {
  if (!value) return '—';
  try {
    return new Date(value).toLocaleString('zh-CN', {
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return value;
  }
}

function healthClass(health: string | undefined): string {
  return HEALTH_CLASS[health ?? ''] ?? 'border-border text-muted-foreground';
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

interface HealthBadgeProps {
  health: string | undefined;
}

function HealthBadge({ health }: HealthBadgeProps) {
  const cls = healthClass(health);
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${cls}`}
      data-testid={`market-indicator-health-badge-${health ?? 'unknown'}`}
    >
      {HEALTH_LABEL[health ?? ''] ?? health ?? '未知'}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function MarketIndicatorHealthPanel({
  indicatorHealth,
  indicatorMeta,
}: MarketIndicatorHealthPanelProps) {
  // Defensive: if neither field exists, skip rendering (older API payloads).
  if (!indicatorHealth && !indicatorMeta) return null;

  const entries = Object.entries(indicatorHealth ?? {});
  if (entries.length === 0 && !indicatorMeta) return null;

  const cacheStatus = indicatorMeta?.cache_status;
  const okCount = indicatorMeta?.ok_count ?? 0;
  const failedCount = indicatorMeta?.failed_count ?? 0;
  const fetchedAt = indicatorMeta?.fetched_at;

  return (
    <div
      className="rounded-xl p-3 bg-card border border-border"
      data-testid="market-indicator-health-panel"
    >
      {/* Header row */}
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
        <span className="text-sm font-semibold text-foreground">
          市场指标数据源健康 · MARKET INDICATORS
        </span>
        <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
          {cacheStatus && (
            <span
              className={
                cacheStatus === 'stale'
                  ? 'text-yellow-400'
                  : cacheStatus === 'fresh'
                    ? 'text-green-400'
                    : ''
              }
              data-testid="market-indicator-cache-status"
            >
              缓存: {cacheStatus === 'fresh' ? '新鲜' : cacheStatus === 'stale' ? '陈旧' : cacheStatus}
            </span>
          )}
          <span data-testid="market-indicator-ok-count">正常 {okCount}</span>
          {failedCount > 0 && (
            <span className="text-destructive" data-testid="market-indicator-failed-count">
              失败 {failedCount}
            </span>
          )}
          {fetchedAt && (
            <span data-testid="market-indicator-fetched-at">
              采集于 {formatTs(fetchedAt)}
            </span>
          )}
        </div>
      </div>

      {/* Per-indicator grid */}
      {entries.length > 0 && (
        <div
          className="grid grid-cols-2 gap-2 sm:grid-cols-3"
          data-testid="market-indicator-health-grid"
        >
          {entries.map(([name, entry]) => {
            const label = INDICATOR_LABEL[name] ?? name.replace(/_/g, ' ').toUpperCase();
            const health = entry?.source_health;
            const value = entry?.value;
            const checkedAt = entry?.checked_at;

            return (
              <div
                key={name}
                className={`rounded-lg border p-2 text-xs ${healthClass(health)}`}
                data-testid={`market-indicator-entry-${name}`}
              >
                <div className="flex items-center justify-between gap-1 mb-1">
                  <span className="font-medium">{label}</span>
                  <HealthBadge health={health} />
                </div>
                <div className="text-foreground/80">
                  {value != null ? value.toFixed(2) : '—'}
                </div>
                <div className="text-muted-foreground mt-0.5">
                  {formatTs(checkedAt)}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default MarketIndicatorHealthPanel;
