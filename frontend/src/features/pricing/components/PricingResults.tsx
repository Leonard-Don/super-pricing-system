// ---------------------------------------------------------------------------
// PricingResults — layout orchestrator for all core result cards
//
// Layout mirrors old PricingResultsSection.js (antd Row/Col 2-col lg pairs)
// but uses Tailwind grid. Skips insight cards / alt-data / playbook (P3).
// ---------------------------------------------------------------------------

import * as React from 'react';
import { FactorModelCard, type FactorModelData } from './FactorModelCard';
import { ValuationCard, type ValuationData } from './ValuationCard';
import { GapOverviewCard, type GapOverviewData } from './GapOverviewCard';
import { GapHistoryCard, type GapHistoryData } from './GapHistoryCard';
import { PeerComparisonCard, type PeerComparisonData } from './PeerComparisonCard';
import { SensitivityCard } from './SensitivityCard';
import type { SensitivityControls } from '@/features/pricing/hooks/usePricingSensitivity';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface SensitivityResult {
  sensitivity_matrix?: {
    growth?: number | string;
    cases?: { wacc?: number | string; fair_value?: number | string | null }[];
  }[];
}

export interface PricingResultsProps {
  /** Full gap-analysis API response. */
  data: Record<string, unknown>;

  // ── Gap history (from usePricingAnalysisDetails) ──
  gapHistory: GapHistoryData | null;
  gapHistoryLoading: boolean;
  gapHistoryError: string | null;

  // ── Peer comparison (from usePricingAnalysisDetails) ──
  peerComparison: PeerComparisonData | null;
  peerComparisonLoading: boolean;
  peerComparisonError: string | null;

  // ── Sensitivity (from usePricingSensitivity) ──
  sensitivity: SensitivityResult | null;
  sensitivityLoading: boolean;
  sensitivityError: string | null;
  sensitivityControls: SensitivityControls;
  setSensitivityControls: React.Dispatch<React.SetStateAction<SensitivityControls>>;
  handleRunSensitivity: () => Promise<void>;

  // ── Optional callbacks ──
  onInspectPeer?: (peer: { symbol: string }) => void;
  symbol?: string;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function PricingResults({
  data,
  gapHistory,
  gapHistoryLoading,
  gapHistoryError,
  peerComparison,
  peerComparisonLoading,
  peerComparisonError,
  sensitivity,
  sensitivityLoading,
  sensitivityError,
  sensitivityControls,
  setSensitivityControls,
  handleRunSensitivity,
  onInspectPeer,
  symbol,
}: PricingResultsProps): React.JSX.Element | null {
  if (!data) return null;

  const factorModel = data.factor_model as FactorModelData | null | undefined;
  const valuation = data.valuation as ValuationData | null | undefined;
  const gapOverviewData = data as GapOverviewData | null | undefined;

  return (
    <div className="space-y-4">
      {/* Row 1: Gap Overview (full-width) */}
      <GapOverviewCard data={gapOverviewData} />

      {/* Row 2: Factor Model + Valuation (2-col lg) */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <FactorModelCard data={factorModel} />
        <ValuationCard data={valuation} />
      </div>

      {/* Row 3: Sensitivity (full-width) */}
      <SensitivityCard
        symbol={symbol ?? (data.symbol as string | undefined)}
        loading={sensitivityLoading}
        error={sensitivityError}
        sensitivity={sensitivity as Parameters<typeof SensitivityCard>[0]['sensitivity']}
        controls={sensitivityControls}
        onControlChange={setSensitivityControls}
        onRun={() => void handleRunSensitivity()}
      />

      {/* Row 4: Gap History + Peer Comparison (2-col lg) */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <GapHistoryCard
          loading={gapHistoryLoading}
          error={gapHistoryError}
          historyData={gapHistory}
        />
        <PeerComparisonCard
          loading={peerComparisonLoading}
          error={peerComparisonError}
          peerComparison={peerComparison}
          onInspect={onInspectPeer}
        />
      </div>
    </div>
  );
}
