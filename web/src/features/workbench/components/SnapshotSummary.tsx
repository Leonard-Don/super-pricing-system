// SnapshotSummary — compact core-field display for a task snapshot.
// Ported from frontend/src/components/research-workbench/SnapshotSummary.js (890 lines),
// keeping only the CORE fields per plan instructions (no full 890-line breadth).
//
// Simplified to three focused sub-renderers:
//   PricingSnapshotSummary  — fair_value / gap / implications / primary driver
//   CrossMarketSnapshotSummary — trade_thesis / backtest / theme / selection quality
//   (macro_mispricing falls through to PricingSnapshotSummary — same payload shape)
//
// Dropped (vs reference): CAPM/FF3/FF5 alpha rows, Monte Carlo, audit trail,
//   governance overlay details, policy execution, source mode, execution diagnostics,
//   execution plan, data alignment, allocation overlay, constraint overlay.
//   Those can be restored in a later pass if needed.

import { getPriceSourceLabel } from '@/features/pricing/lib/pricingResearch';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface SnapshotData {
  headline?: string;
  summary?: string;
  highlights?: string[];
  payload?: Record<string, unknown>;
}

export interface SnapshotTask {
  id: string;
  type?: string;
  snapshot?: SnapshotData;
  [key: string]: unknown;
}

export interface SnapshotSummaryProps {
  task: SnapshotTask;
}

// ---------------------------------------------------------------------------
// Utility helpers
// ---------------------------------------------------------------------------

const safeNum = (v: unknown, digits = 2): string => {
  if (v === null || v === undefined || v === '') return '-';
  const n = Number(v);
  if (!Number.isFinite(n)) return '-';
  return n.toFixed(digits);
};

const safeStr = (v: unknown): string => {
  const s = String(v ?? '').trim();
  return s || '-';
};

// ---------------------------------------------------------------------------
// PricingSnapshotSummary (also handles macro_mispricing — same payload shape)
// ---------------------------------------------------------------------------

function PricingSnapshotSummary({
  snapshot,
}: {
  snapshot: SnapshotData;
}) {
  const payload = (snapshot.payload ?? {}) as Record<string, unknown>;
  const fairValue = (payload.fair_value ?? {}) as Record<string, unknown>;
  const gapAnalysis = (payload.gap_analysis ?? {}) as Record<string, unknown>;
  const implications = (payload.implications ?? {}) as Record<string, unknown>;
  const factorAlignment = (implications.factor_alignment ?? {}) as Record<string, unknown>;
  const primaryDriver = (payload.primary_driver ?? (payload.drivers as unknown[])?.[0] ?? {}) as Record<string, unknown>;

  const fairValueMid = fairValue.mid ?? gapAnalysis.fair_value_mid;
  const currentPrice = gapAnalysis.current_price;
  const gapPct = gapAnalysis.gap_pct;
  const priceSource = payload.current_price_source;

  return (
    <div className="flex flex-col gap-2 text-sm">
      {/* Headline */}
      <p className="font-semibold text-foreground">{safeStr(snapshot.headline)}</p>

      {/* Summary */}
      {snapshot.summary ? (
        <p className="text-muted-foreground">{snapshot.summary}</p>
      ) : null}

      {/* Price / fair value core */}
      {(currentPrice || fairValueMid) ? (
        <p className="text-muted-foreground">
          {currentPrice ? `现价 ${safeNum(currentPrice)}` : null}
          {currentPrice && fairValueMid ? ' / ' : null}
          {fairValueMid ? `公允价值 ${safeNum(fairValueMid)}` : null}
          {fairValue.low && fairValue.high
            ? ` (${safeNum(fairValue.low)} ~ ${safeNum(fairValue.high)})`
            : null}
        </p>
      ) : null}

      {/* Gap */}
      {gapPct !== undefined && gapPct !== null ? (
        <p className="text-muted-foreground">
          价格偏差 {safeNum(gapPct)}%
        </p>
      ) : null}

      {/* Implications */}
      {implications.primary_view ? (
        <div className="flex flex-wrap gap-1">
          <span className="px-2 py-0.5 rounded-full text-xs bg-muted text-foreground">
            {safeStr(implications.primary_view)}
          </span>
          {implications.confidence ? (
            <span className="px-2 py-0.5 rounded-full text-xs bg-muted text-muted-foreground">
              置信度 {safeStr(implications.confidence)}
            </span>
          ) : null}
          {implications.confidence_score !== undefined && implications.confidence_score !== null ? (
            <span className="px-2 py-0.5 rounded-full text-xs bg-muted text-muted-foreground">
              评分 {safeNum(implications.confidence_score)}
            </span>
          ) : null}
          {factorAlignment.label ? (
            <span className="px-2 py-0.5 rounded-full text-xs bg-muted text-muted-foreground">
              证据 {safeStr(factorAlignment.label)}
            </span>
          ) : null}
        </div>
      ) : null}

      {/* Factor alignment summary */}
      {factorAlignment.summary ? (
        <p className="text-muted-foreground">证据共振 {safeStr(factorAlignment.summary)}</p>
      ) : null}

      {/* Primary driver */}
      {primaryDriver.factor ? (
        <p className="text-muted-foreground">
          主驱动 {safeStr(primaryDriver.factor)}
          {primaryDriver.impact ? ` · ${safeStr(primaryDriver.impact)}` : ''}
        </p>
      ) : null}

      {/* Analysis period + price source */}
      {(payload.period || priceSource) ? (
        <p className="text-muted-foreground">
          {payload.period ? `分析窗口 ${safeStr(payload.period)}` : null}
          {payload.period && priceSource ? ' · ' : null}
          {priceSource ? `现价来源 ${getPriceSourceLabel(String(priceSource))}` : null}
        </p>
      ) : null}

      {/* Highlights */}
      {(snapshot.highlights ?? []).map((item) => (
        <p key={item} className="text-muted-foreground">
          {item}
        </p>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// CrossMarketSnapshotSummary — core fields only
// ---------------------------------------------------------------------------

function CrossMarketSnapshotSummary({
  snapshot,
}: {
  snapshot: SnapshotData;
}) {
  const payload = (snapshot.payload ?? {}) as Record<string, unknown>;
  const tradeThesis = (payload.trade_thesis ?? {}) as Record<string, unknown>;
  const thesis = (tradeThesis.thesis ?? {}) as Record<string, unknown>;
  const resultsSummary = (tradeThesis.results_summary ?? {}) as Record<string, unknown>;
  const assets = (tradeThesis.assets as Array<Record<string, unknown>>) ?? [];
  const templateMeta = (payload.template_meta ?? {}) as Record<string, unknown>;
  const selectionQuality = (templateMeta.selection_quality ?? {}) as Record<string, unknown>;

  const totalReturn = resultsSummary.total_return;
  const sharpe = resultsSummary.sharpe_ratio;
  const coverage = resultsSummary.coverage;

  return (
    <div className="flex flex-col gap-2 text-sm">
      {/* Headline */}
      <p className="font-semibold text-foreground">{safeStr(snapshot.headline)}</p>

      {/* Summary */}
      {snapshot.summary ? (
        <p className="text-muted-foreground">{snapshot.summary}</p>
      ) : null}

      {/* Trade thesis */}
      {thesis.stance ? (
        <p className="text-muted-foreground">
          Thesis {safeStr(thesis.stance)}
          {tradeThesis.symbol ? ` · ${safeStr(tradeThesis.symbol)}` : ''}
          {thesis.horizon ? ` · ${safeStr(thesis.horizon)}` : ''}
        </p>
      ) : null}

      {/* Backtest results */}
      {totalReturn !== undefined && totalReturn !== null ? (
        <p className="text-muted-foreground">
          回测 {(Number(totalReturn) * 100).toFixed(2)}%
          {sharpe !== undefined && sharpe !== null
            ? ` · Sharpe ${safeNum(sharpe)}`
            : ''}
          {coverage !== undefined && coverage !== null
            ? ` · 覆盖率 ${(Number(coverage) * 100).toFixed(2)}%`
            : ''}
        </p>
      ) : null}

      {/* Asset legs */}
      {assets.length > 0 ? (
        <p className="text-muted-foreground">
          组合腿{' '}
          {assets
            .slice(0, 3)
            .map((a) => `${safeStr(a.symbol)} ${safeStr(a.side)}`)
            .join(' / ')}
        </p>
      ) : null}

      {/* Theme */}
      {templateMeta.theme ? (
        <p className="text-muted-foreground">主题 {safeStr(templateMeta.theme)}</p>
      ) : null}

      {/* Selection quality badge */}
      {selectionQuality.label && selectionQuality.label !== 'original' ? (
        <span className="self-start px-2 py-0.5 rounded-full text-xs bg-muted text-muted-foreground">
          自动降级 {safeStr(selectionQuality.label)}
        </span>
      ) : null}

      {/* Highlights */}
      {(snapshot.highlights ?? []).map((item) => (
        <p key={item} className="text-muted-foreground">
          {item}
        </p>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// SnapshotSummary (public export)
// ---------------------------------------------------------------------------

export default function SnapshotSummary({ task }: SnapshotSummaryProps) {
  if (!task?.snapshot) {
    return <p className="text-sm text-muted-foreground">暂无保存快照</p>;
  }

  const snapshot = task.snapshot;

  if (task.type === 'pricing' || task.type === 'macro_mispricing') {
    return <PricingSnapshotSummary snapshot={snapshot} />;
  }

  return <CrossMarketSnapshotSummary snapshot={snapshot} />;
}
