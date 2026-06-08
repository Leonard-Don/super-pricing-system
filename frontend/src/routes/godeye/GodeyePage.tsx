// ---------------------------------------------------------------------------
// GodeyePage — Task 12 (P2 plan): GodEye page assembly
//
// Wires useGodEyeDashboardData → hero strip + 6 sections:
//   §1 宏观态势     — GodEyeHeader + GodEyeStatusStats + GodEyeAlerts
//   §2 战场扫描     — SupplyChainHeatmap + RiskPremiumRadar (2-col lg)
//   §3 宏观因子&政策 — MacroFactorPanel + PolicyTimelineBar + MacroSummaryPanels
//   §4 猎杀信号&跨市场— AlertHunterPanel + CrossMarketOverview
//   §5 衰败&战术    — StructuralDecayRadarPanel + DecayWatchPanel + TradeThesisWatchPanel
//                    (+ 3 insight cards if data available from overview)
//   §6 基础另类数据  — PeopleLayerWatchlistPanel + DepartmentChaosBoard + PhysicalWorldTrackerPanel
//
// Deferred (P2.5): 7 self-fetching alt-data diagnostic tiles — NOT imported here.
// Deferred (P3):  workbench-save / draft CTAs — TODO left in child components.
// ---------------------------------------------------------------------------

import { useCallback, type ReactNode } from 'react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import { Reveal, SectionFrame } from '@/components/command';
import useGodEyeDashboardData from '@/features/godeye/hooks/useGodEyeDashboardData';
import { formatGodEyeSnapshotTimestamp } from '@/features/godeye/lib/displayLabels';

// §1 Macro posture
import { GodEyeHeader } from '@/features/godeye/components/GodEyeHeader';
import { GodEyeStatusStats } from '@/features/godeye/components/GodEyeStatusStats';
import { GodEyeAlerts } from '@/features/godeye/components/GodEyeAlerts';

// §2 Battlefield scan
import { SupplyChainHeatmap } from '@/features/godeye/components/SupplyChainHeatmap';
import { RiskPremiumRadar } from '@/features/godeye/components/RiskPremiumRadar';

// §3 Macro factors & policy
import { MacroFactorPanel } from '@/features/godeye/components/MacroFactorPanel';
import { PolicyTimelineBar } from '@/features/godeye/components/PolicyTimelineBar';
import {
  PeopleLayerPanel,
  DepartmentChaosPanel,
  InputReliabilityPanel,
} from '@/features/godeye/components/MacroSummaryPanels';
import type { PeopleLayerSummary, DepartmentChaosSummary, InputReliabilitySummary } from '@/features/godeye/components/MacroSummaryPanels';

// §4 Hunter alerts & cross-market
import { AlertHunterPanel } from '@/features/godeye/components/AlertHunterPanel';
import { CrossMarketOverview } from '@/features/godeye/components/CrossMarketOverview';
import type { CrossMarketCard } from '@/features/godeye/components/CrossMarketOverview';

// §5 Decay & tactical
import { StructuralDecayRadarPanel } from '@/features/godeye/components/StructuralDecayRadarPanel';
import { DecayWatchPanel } from '@/features/godeye/components/DecayWatchPanel';
import { TradeThesisWatchPanel } from '@/features/godeye/components/TradeThesisWatchPanel';
// 3 insight cards — rendered only when their data paths exist on overview
import { PeopleLayerCard } from '@/features/godeye/components/PeopleLayerCard';
import { StructuralDecayCard } from '@/features/godeye/components/StructuralDecayCard';
import { MacroMispricingThesisCard } from '@/features/godeye/components/MacroMispricingThesisCard';
import type { PeopleLayerData, PeopleLayerOverlay } from '@/features/godeye/components/PeopleLayerCard';
import type { StructuralDecayData } from '@/features/godeye/components/StructuralDecayCard';
import type { MacroMispricingThesisData } from '@/features/godeye/components/MacroMispricingThesisCard';
import type { HunterAlert } from '@/features/godeye/lib/taskIntelligenceViewModels';
import type { DecayWatchItem, TradeThesisWatchItem } from '@/features/godeye/lib/taskIntelligenceViewModels';

// §6 Alt-data basics
import { PeopleLayerWatchlistPanel } from '@/features/godeye/components/PeopleLayerWatchlistPanel';
import type { PeopleLayerWatchlistPanelProps } from '@/features/godeye/components/PeopleLayerWatchlistPanel';
import { DepartmentChaosBoard } from '@/features/godeye/components/DepartmentChaosBoard';
import type { DepartmentChaosBoardProps } from '@/features/godeye/components/DepartmentChaosBoard';
import { PhysicalWorldTrackerPanel } from '@/features/godeye/components/PhysicalWorldTrackerPanel';
import type { PhysicalWorldTrackerPanelProps } from '@/features/godeye/components/PhysicalWorldTrackerPanel';

// §7 Deep diagnostics (P2.5) — self-fetching tiles, no data props needed
import AltDataHealthTile from '@/features/godeye/components/AltDataHealthTile';
import AltDataNarrativeTile from '@/features/godeye/components/AltDataNarrativeTile';
import CrossArchiveThemesTile from '@/features/godeye/components/CrossArchiveThemesTile';
import CompositeSignalTile from '@/features/godeye/components/CompositeSignalTile';
import AltSignalDiagnosticsTile from '@/features/godeye/components/AltSignalDiagnosticsTile';
import AltDataAdvancedDiagnosticsTile from '@/features/godeye/components/AltDataAdvancedDiagnosticsTile';
import MacroBriefingTile from '@/features/godeye/components/MacroBriefingTile';

import { navigateDashboardAction } from '@/features/godeye/lib/navigationHelpers';

// ---------------------------------------------------------------------------
// Loading skeleton
// ---------------------------------------------------------------------------

function GodeyePageSkeleton() {
  return (
    <div className="flex flex-col gap-6 p-6">
      {/* Header skeleton */}
      <Skeleton className="h-32 w-full rounded-xl" />
      {/* Stats row skeleton */}
      <div className="flex flex-wrap gap-4">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-24 flex-1 min-w-[160px] rounded-lg" />
        ))}
      </div>
      {/* Section skeletons */}
      {[0, 1, 2].map((i) => (
        <div key={i} className="flex flex-col gap-3">
          <Skeleton className="h-5 w-32 rounded" />
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Skeleton className="h-48 rounded-xl" />
            <Skeleton className="h-48 rounded-xl" />
          </div>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Section wrapper
// ---------------------------------------------------------------------------

interface SectionBlockProps {
  kicker: string;
  latin?: string;
  children: ReactNode;
}

function SectionBlock({ kicker, latin, children }: SectionBlockProps) {
  return (
    <div className="flex flex-col gap-3">
      <SectionFrame title={kicker} latin={latin} />
      {children}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page component
// ---------------------------------------------------------------------------

export default function GodeyePage() {
  const {
    crossMarketCards,
    decayWatchModel,
    dashboardStatus,
    factorPanelModel,
    handleManualRefresh,
    heatmapModel,
    hunterAlerts,
    loading,
    overview,
    radarData,
    refreshCounts,
    refreshSignals,
    refreshing,
    snapshot,
    tradeThesisWatchModel,
    timelineItems,
  } = useGodEyeDashboardData();

  // Stable navigate callback — wraps navigateDashboardAction with cross-market
  // context AND the real refresh signals (so workbench-refresh picks the
  // highest-priority task target, not just cross-market cards).
  const navigateTo = useCallback(
    (actionOrTarget: unknown) => {
      navigateDashboardAction(
        actionOrTarget as Parameters<typeof navigateDashboardAction>[0],
        { crossMarketCards, refreshSignals },
      );
    },
    [crossMarketCards, refreshSignals],
  );

  // Destructure dashboardStatus fields
  const {
    degradedProviders,
    providerCount,
    providerHealth,
    schedulerStatus,
    snapshotTimestamp,
    staleness,
  } = dashboardStatus;

  // ---------------------------------------------------------------------------
  // Loading state — no data yet
  // ---------------------------------------------------------------------------
  if (loading && !Object.keys(overview).length) {
    return <GodeyePageSkeleton />;
  }

  // ---------------------------------------------------------------------------
  // Error state — loading failed (overview still empty after load attempt)
  // ---------------------------------------------------------------------------
  if (!loading && !Object.keys(overview).length) {
    return (
      <div className="p-6">
        <Alert variant="destructive">
          <AlertTitle>宏观数据加载失败</AlertTitle>
          <AlertDescription>
            GodEye 数据加载失败，请点击刷新按钮重试。若问题持续，请联系运维检查 API 服务状态。
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // Derived values for insight cards (graceful — only render if data exists)
  // ---------------------------------------------------------------------------
  const peopleLayerData = overview.people_layer as PeopleLayerData | undefined;
  const peopleLayerOverlay = overview.people_layer_overlay as PeopleLayerOverlay | undefined;
  const structuralDecayData = overview.structural_decay as StructuralDecayData | undefined;
  const macroMispricingThesisData = overview.macro_mispricing_thesis as MacroMispricingThesisData | undefined;

  const hasPeopleLayerCard =
    peopleLayerData != null && Object.keys(peopleLayerData).length > 0;
  const hasStructuralDecayCard =
    structuralDecayData != null && Object.keys(structuralDecayData).length > 0;
  const hasMacroMispricingCard =
    macroMispricingThesisData != null && Object.keys(macroMispricingThesisData).length > 0;

  // Formatted snapshot for LiveStatus display
  const formattedSnapshot = formatGodEyeSnapshotTimestamp(snapshotTimestamp);
  const liveStatusTs = formattedSnapshot.time || formattedSnapshot.date;

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------
  return (
    <div className="flex flex-col gap-6 p-6">
      {/* ------------------------------------------------------------------- */}
      {/* Hero strip / §1: 宏观态势                                            */}
      {/* ------------------------------------------------------------------- */}
      <Reveal delay={0}>
      <SectionBlock kicker="宏观态势" latin="MACRO POSTURE">
        <GodEyeHeader
          macroSignal={overview.macro_signal as number | undefined}
          refreshing={refreshing}
          onRefresh={handleManualRefresh}
          navigateTo={(target) => navigateTo(target)}
          online={Number(providerHealth?.healthy_providers ?? 0)}
          total={providerCount}
          ts={liveStatusTs}
        />
        <GodEyeStatusStats
          macroScore={overview.macro_score as number | undefined}
          providerCount={providerCount}
          providerHealth={providerHealth}
          refreshing={refreshing}
          schedulerStatus={schedulerStatus}
          snapshotTimestamp={snapshotTimestamp}
          staleness={staleness}
        />
        <GodEyeAlerts
          macroSignal={overview.macro_signal as number | undefined}
          degradedProviderCount={degradedProviders.length}
          refreshCounts={refreshCounts}
          structuralDecayRadar={
            overview.structural_decay_radar as
              | { score?: number; label?: string; display_label?: string; action_hint?: string }
              | undefined
          }
          onNavigate={navigateTo}
        />
      </SectionBlock>
      </Reveal>

      {/* ------------------------------------------------------------------- */}
      {/* §2: 战场扫描                                                         */}
      {/* ------------------------------------------------------------------- */}
      <Reveal delay={60}>
      <SectionBlock kicker="战场扫描" latin="BATTLEFIELD SCAN">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <SupplyChainHeatmap heatmapModel={heatmapModel} />
          <RiskPremiumRadar
            radarData={radarData}
            macroScore={Number(overview.macro_score ?? 0)}
            confidence={Number(overview.confidence ?? 0)}
            macroSignal={Number(overview.macro_signal ?? 0)}
            primaryAction={
              factorPanelModel.primaryAction as
                | { label: string; target: string }
                | null
                | undefined
            }
            onNavigate={(action) => navigateTo(action)}
          />
        </div>
      </SectionBlock>
      </Reveal>

      {/* ------------------------------------------------------------------- */}
      {/* §3: 宏观因子 & 政策                                                  */}
      {/* ------------------------------------------------------------------- */}
      <Reveal delay={120}>
      <SectionBlock kicker="宏观因子 & 政策" latin="MACRO FACTORS">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <MacroFactorPanel factorPanelModel={factorPanelModel} onNavigate={navigateTo} />
          <div className="flex flex-col gap-4">
            <PolicyTimelineBar timelineItems={timelineItems} onNavigate={navigateTo} />
            <PeopleLayerPanel
              peopleLayerSummary={factorPanelModel.peopleLayerSummary as PeopleLayerSummary}
            />
            <DepartmentChaosPanel
              departmentChaosSummary={factorPanelModel.departmentChaosSummary as DepartmentChaosSummary}
            />
            <InputReliabilityPanel
              inputReliabilitySummary={factorPanelModel.inputReliabilitySummary as InputReliabilitySummary}
            />
          </div>
        </div>
      </SectionBlock>
      </Reveal>

      {/* ------------------------------------------------------------------- */}
      {/* §4: 猎杀信号 & 跨市场                                                */}
      {/* ------------------------------------------------------------------- */}
      <Reveal delay={180}>
      <SectionBlock kicker="猎杀信号 & 跨市场" latin="HUNT SIGNALS">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <AlertHunterPanel
            hunterAlerts={hunterAlerts as HunterAlert[]}
            onNavigate={navigateTo}
          />
          <CrossMarketOverview
            crossMarketCards={crossMarketCards as unknown as CrossMarketCard[]}
            onNavigate={navigateTo}
          />
        </div>
      </SectionBlock>
      </Reveal>

      {/* ------------------------------------------------------------------- */}
      {/* §5: 衰败 & 战术                                                      */}
      {/* ------------------------------------------------------------------- */}
      <Reveal delay={240}>
      <SectionBlock kicker="衰败 & 战术" latin="DECAY & TACTICS">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <StructuralDecayRadarPanel
            model={
              overview.structural_decay_radar as
                | { score?: number; label?: string; display_label?: string; action_hint?: string }
                | undefined
            }
            onNavigate={navigateTo}
          />
          <DecayWatchPanel
            items={decayWatchModel as DecayWatchItem[]}
            onNavigate={navigateTo}
            onOpenDraft={() => {
              // TODO (P3): wire to cross-market draft dialog
            }}
            onSaveTask={() => {
              // TODO (P3): wire to createResearchTask
            }}
          />
          <TradeThesisWatchPanel
            items={tradeThesisWatchModel as TradeThesisWatchItem[]}
            onNavigate={navigateTo}
          />
        </div>

        {/* 3 insight cards — rendered only if data paths exist in overview */}
        {(hasPeopleLayerCard || hasStructuralDecayCard || hasMacroMispricingCard) && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mt-4">
            {hasPeopleLayerCard && (
              <PeopleLayerCard
                data={peopleLayerData!}
                overlay={peopleLayerOverlay ?? null}
              />
            )}
            {hasStructuralDecayCard && (
              <StructuralDecayCard data={structuralDecayData!} />
            )}
            {hasMacroMispricingCard && (
              <MacroMispricingThesisCard
                data={macroMispricingThesisData!}
                onOpenDraft={() => {
                  // TODO (P3): wire to cross-market draft
                }}
              />
            )}
          </div>
        )}
      </SectionBlock>
      </Reveal>

      {/* ------------------------------------------------------------------- */}
      {/* §6: 基础另类数据                                                     */}
      {/* ------------------------------------------------------------------- */}
      <Reveal delay={300}>
      <SectionBlock kicker="基础另类数据" latin="ALT DATA">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <PeopleLayerWatchlistPanel
            overview={overview as unknown as PeopleLayerWatchlistPanelProps['overview']}
            onNavigate={navigateTo as PeopleLayerWatchlistPanelProps['onNavigate']}
          />
          <DepartmentChaosBoard
            overview={overview as unknown as DepartmentChaosBoardProps['overview']}
            onNavigate={navigateTo as DepartmentChaosBoardProps['onNavigate']}
          />
          <PhysicalWorldTrackerPanel
            snapshot={snapshot as unknown as PhysicalWorldTrackerPanelProps['snapshot']}
          />
        </div>
      </SectionBlock>
      </Reveal>

      {/* ------------------------------------------------------------------- */}
      {/* §7: 深度诊断 (P2.5) — 7 self-fetching alt-data diagnostic tiles     */}
      {/* Tiles manage their own loading/error/data state; no data props.     */}
      {/* ------------------------------------------------------------------- */}
      <Reveal delay={360}>
      <SectionBlock kicker="深度诊断" latin="DEEP DIAGNOSTICS">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <AltDataHealthTile />
          <AltDataNarrativeTile />
          <CrossArchiveThemesTile />
          <CompositeSignalTile />
          <AltSignalDiagnosticsTile />
          <AltDataAdvancedDiagnosticsTile />
          <MacroBriefingTile />
        </div>
      </SectionBlock>
      </Reveal>
    </div>
  );
}
