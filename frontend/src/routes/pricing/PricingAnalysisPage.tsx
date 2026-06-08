// ---------------------------------------------------------------------------
// PricingAnalysisPage — 分析 sub-page
//
// Wires usePricingResearchData hook →
//   hero strip + PricingSearchPanel + PricingScreenerCard + states
//   (Skeleton loading | Alert error | PricingResults | empty state)
//
// Deferred items (not in this page, per plan §1 / T6 trimming):
//   - Playbook / ResearchPlaybook
//   - Context rail (workbench source / canReturnToWorkbenchQueue)
//   - handleOpenMacroMispricingDraft
//   - handleSaveTask / handleUpdateSnapshot / workbench-save
//   - AltDataContextPanel
// ---------------------------------------------------------------------------

import * as React from 'react';

import usePricingResearchData from '@/features/pricing/hooks/usePricingResearchData';
import usePricingWorkbenchActions from '@/features/pricing/hooks/usePricingWorkbenchActions';
import { PricingSearchPanel } from '@/features/pricing/components/PricingSearchPanel';
import { PricingScreenerCard } from '@/features/pricing/components/PricingScreenerCard';
import { PricingResults } from '@/features/pricing/components/PricingResults';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { Reveal } from '@/components/command';
import type { ScreeningFilterValue } from '@/features/pricing/hooks/usePricingScreening';
import {
  buildPricingResearchReportHtml,
  buildPricingResearchAuditPayload,
  openPricingResearchPrintWindow,
} from '@/features/pricing/lib/report';
import { exportToJSON } from '@/lib/export';
import { CredibilityPanel } from '@/features/credibility/components/CredibilityPanel';
import { CredibilityBadge } from '@/features/credibility/components/CredibilityBadge';
import {
  fetchPricingCredibility,
  fetchScreenerCredibility,
} from '@/features/credibility/api';
import type { CredibilityResponse } from '@/features/credibility/types';

// ---------------------------------------------------------------------------
// Loading skeleton
// ---------------------------------------------------------------------------

function AnalysisLoadingSkeleton({ symbol }: { symbol: string }) {
  return (
    <div className="space-y-4 mt-4" aria-label="加载中">
      <Skeleton className="h-8 w-48" />
      <Skeleton className="h-40 w-full" />
      <Skeleton className="h-40 w-full" />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Skeleton className="h-64" />
        <Skeleton className="h-64" />
      </div>
      {symbol && (
        <p className="text-xs text-center text-muted-foreground mt-2">
          正在分析 {symbol.toUpperCase()} 的定价模型，首次加载因子数据可能需要 10–20 秒…
        </p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function PricingAnalysisPage(): React.JSX.Element {
  const {
    // Core state
    data,
    error,
    loading,
    period,
    setPeriod,
    setSymbol,
    symbol,
    handleAnalyze,
    HOT_PRICING_SYMBOLS: hotSymbols,
    suggestions,
    // Screening
    filteredScreeningResults,
    handleApplyPreset,
    handleExportScreening,
    handleInspectScreeningResult,
    handleRunScreener,
    screeningError,
    screeningFilter,
    screeningLoading,
    screeningMeta,
    screeningMinScore,
    screeningSector,
    screeningSectors,
    screeningUniverse,
    setScreeningFilter,
    setScreeningMinScore,
    setScreeningSector,
    setScreeningUniverse,
    // Analysis details
    gapHistory,
    gapHistoryError,
    gapHistoryLoading,
    peerComparison,
    peerComparisonError,
    peerComparisonLoading,
    // Sensitivity
    handleRunSensitivity,
    sensitivity,
    sensitivityControls,
    sensitivityError,
    sensitivityLoading,
    setSensitivityControls,
  } = usePricingResearchData();

  // ── Credibility state ───────────────────────────────────────────────────────
  const [pricingCred, setPricingCred] = React.useState<CredibilityResponse | undefined>(undefined);
  const [screenerCred, setScreenerCred] = React.useState<CredibilityResponse | undefined>(undefined);

  // Fetch per-stock credibility whenever a result is available for a symbol.
  // We don't call setPricingCred synchronously in the effect body to satisfy
  // the react-hooks/set-state-in-effect lint rule; instead we guard with the
  // cancelled flag so only async callbacks update state.
  React.useEffect(() => {
    if (!data || !symbol) return;
    let cancelled = false;
    void (async () => {
      try {
        const resp = await fetchPricingCredibility(symbol);
        if (!cancelled) setPricingCred(resp);
      } catch {
        // Silently ignore — panel stays in skeleton/empty state
      }
    })();
    return () => { cancelled = true; };
  }, [data, symbol]);

  // Fetch screener credibility once on mount (static endpoint)
  React.useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const resp = await fetchScreenerCredibility();
        if (!cancelled) setScreenerCred(resp);
      } catch {
        // Silently ignore
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // ── Export handlers ─────────────────────────────────────────────────────────
  // Primary: open the HTML research report in a new print window.
  // Secondary (audit JSON): PricingSearchPanel.onExport is a single-action slot;
  // wire audit JSON via a separate mechanism if a dedicated button is added later.
  const handleExportReport = React.useCallback(() => {
    if (!data) return;
    const reportHtml = buildPricingResearchReportHtml({
      symbol,
      period,
      analysis: data,
    });
    const opened = openPricingResearchPrintWindow(reportHtml);
    // Fallback: if popup was blocked, export audit JSON instead.
    if (!opened) {
      const auditPayload = buildPricingResearchAuditPayload({ symbol, period, analysis: data });
      exportToJSON(auditPayload, `pricing_${symbol}`);
    }
  }, [data, period, symbol]);

  // ── Workbench save ──────────────────────────────────────────────────────────
  // Context passed to buildPricingWorkbenchPayload.  The pricing page does not
  // maintain a full "mergedContext" object (that was a P1 deferred item); we
  // synthesise one here from the available state.
  const mergedContext = React.useMemo(
    () => ({ symbol, period, source: 'manual' } as Record<string, unknown>),
    [symbol, period],
  );

  const {
    saveTask,
    updateSnapshot,
    savedTaskId,
    savingTask,
    updatingSnapshot,
  } = usePricingWorkbenchActions({
    data: data ?? null,
    mergedContext,
    period,
  });

  return (
    <div className="space-y-6">
      {/* ── Hero strip ── */}
      <Reveal delay={0}>
      <section className="flex flex-col gap-1">
        <p className="text-xs text-muted-foreground uppercase tracking-wider font-medium">
          资产定价研究
        </p>
        <h2 className="text-2xl font-bold text-foreground leading-tight">
          定价差异分析
        </h2>
        <p className="text-sm text-muted-foreground max-w-2xl">
          打通 DCF / 可比估值与因子定价（CAPM / Fama-French），把偏差、治理折价和宏观错配放进同一张研究桌面。
        </p>
        <div className="flex flex-wrap gap-1 mt-2">
          {(['CAPM / FF3 / FF5', 'DCF / Monte Carlo', '治理折价 / 人的维度'] as const).map(
            (tag) => (
              <span
                key={tag}
                className="inline-flex items-center rounded border border-border px-2 py-0.5 text-xs text-muted-foreground"
              >
                {tag}
              </span>
            ),
          )}
          {period && (
            <span className="inline-flex items-center rounded border border-primary/40 bg-primary/10 px-2 py-0.5 text-xs text-primary font-mono">
              研究窗口 {period}
            </span>
          )}
        </div>
      </section>
      </Reveal>

      {/* ── Search panel ── */}
      <Reveal delay={60}>
      <section>
        <p className="text-xs uppercase tracking-wider text-muted-foreground font-medium mb-2">
          研究入口
        </p>
        <PricingSearchPanel
          symbol={symbol}
          onSymbolChange={setSymbol}
          period={period}
          onPeriodChange={setPeriod}
          onAnalyze={() => void handleAnalyze()}
          loading={loading}
          hotSymbols={hotSymbols}
          suggestions={suggestions}
          data={data}
          onExport={data ? handleExportReport : undefined}
        />
      </section>
      </Reveal>

      {/* ── Screener card ── */}
      <Reveal delay={120}>
      <section>
        <p className="text-xs uppercase tracking-wider text-muted-foreground font-medium mb-2">
          候选池筛选
        </p>
        <PricingScreenerCard
          universe={screeningUniverse}
          onUniverseChange={setScreeningUniverse}
          period={period}
          filter={screeningFilter}
          onFilterChange={(v) => setScreeningFilter(v as ScreeningFilterValue)}
          sectorFilter={screeningSector}
          onSectorFilterChange={setScreeningSector}
          sectorOptions={screeningSectors}
          minScore={screeningMinScore}
          onMinScoreChange={setScreeningMinScore}
          results={filteredScreeningResults}
          loading={screeningLoading}
          onRun={() => void handleRunScreener()}
          onApplyPreset={handleApplyPreset}
          onInspect={handleInspectScreeningResult}
          onExport={handleExportScreening}
          error={screeningError ?? undefined}
          meta={screeningMeta ?? undefined}
        />
        {/* Screener credibility — honest accumulating state from the ranking store */}
        {screenerCred && (
          <div className="mt-3">
            {(screenerCred.horizons?.length ?? 0) > 0 ? (
              <CredibilityBadge
                status={screenerCred.horizons?.[0]?.status ?? 'insufficient_data'}
                sampleSize={screenerCred.horizons?.[0]?.sample_size ?? 0}
                sinceDate={screenerCred.since_date}
              />
            ) : screenerCred.status ? (
              <CredibilityBadge
                status={screenerCred.status}
                sampleSize={screenerCred.sample_size ?? 0}
                sinceDate={screenerCred.since_date}
              />
            ) : null}
          </div>
        )}
      </section>
      </Reveal>

      {/* ── Error state ── */}
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* ── Loading state ── */}
      {loading && <AnalysisLoadingSkeleton symbol={symbol} />}

      {/* ── Workbench save buttons ── */}
      {data && !loading && (
        <section className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={savingTask}
            onClick={() => void saveTask()}
            aria-label="保存到工作台"
          >
            {savingTask ? '保存中…' : '保存到工作台'}
          </Button>
          {savedTaskId && (
            <Button
              variant="outline"
              size="sm"
              disabled={updatingSnapshot}
              onClick={() => void updateSnapshot()}
              aria-label="更新快照"
            >
              {updatingSnapshot ? '更新中…' : '更新快照'}
            </Button>
          )}
        </section>
      )}

      {/* ── Results ── */}
      {data && !loading && (
        <section>
          <p className="text-xs uppercase tracking-wider text-muted-foreground font-medium mb-2">
            分析结果
          </p>
          <PricingResults
            data={data}
            gapHistory={gapHistory as Parameters<typeof PricingResults>[0]['gapHistory']}
            gapHistoryLoading={gapHistoryLoading}
            gapHistoryError={gapHistoryError}
            peerComparison={peerComparison as Parameters<typeof PricingResults>[0]['peerComparison']}
            peerComparisonLoading={peerComparisonLoading}
            peerComparisonError={peerComparisonError}
            sensitivity={sensitivity as Parameters<typeof PricingResults>[0]['sensitivity']}
            sensitivityLoading={sensitivityLoading}
            sensitivityError={sensitivityError}
            sensitivityControls={sensitivityControls}
            setSensitivityControls={setSensitivityControls}
            handleRunSensitivity={handleRunSensitivity}
            onInspectPeer={(peer) => handleInspectScreeningResult({ ...peer } as unknown as Parameters<typeof handleInspectScreeningResult>[0])}
            symbol={symbol}
          />
        </section>
      )}

      {/* ── Signal credibility (per-stock) — only after a result exists ── */}
      {data && !loading && symbol && (
        <Reveal delay={0}>
          <section>
            <CredibilityPanel
              data={pricingCred}
              title="◢ 信号可信度 · SIGNAL CREDIBILITY"
            />
          </section>
        </Reveal>
      )}

      {/* ── Empty state ── */}
      {!data && !loading && !error && (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <p className="text-4xl mb-4">📈</p>
          <p className="text-muted-foreground">输入股票代码开始定价研究分析</p>
          <p className="text-xs text-muted-foreground mt-1">
            支持 A 股 / 港股 / 美股，例如 AAPL、600519、0700.HK
          </p>
        </div>
      )}
    </div>
  );
}
