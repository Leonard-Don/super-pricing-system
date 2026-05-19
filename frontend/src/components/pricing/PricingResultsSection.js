import React from 'react';
import { Col, Row } from 'antd';

import {
  GapHistoryCard,
  GapOverview,
  PeerComparisonCard,
  SensitivityAnalysisCard,
} from './PricingOverviewSections';
import {
  DriversCard,
  ImplicationsCard,
  MacroMispricingThesisCard,
  PeopleLayerCard,
  StructuralDecayCard,
} from './PricingInsightCards';
import { FactorModelCard, ValuationCard } from './PricingModelCards';

// Lazy-loaded so the alt-data tile only ships once a user opens a
// Pricing Gap result -- keeps the initial pricing-page bundle lean.
const AltDataContextPanel = React.lazy(() => import('./AltDataContextPanel'));

// Map a Yahoo / static-fallback fundamentals industry/sector string onto
// the canonical alt-data label. This keeps the frontend a thin
// pass-through; the backend resolver does the same work server-side
// when no industry param is forwarded.
const FRONTEND_INDUSTRY_ALIASES = [
  { match: /auto manufacturers|electric vehicle|动力电池|新能源汽车/i, label: '新能源汽车' },
  { match: /electric utilit|utilities[-—]regulated electric|电网/i, label: '电网' },
  { match: /wind|风电/i, label: '风电' },
  {
    match:
      /internet content|interactive media|digital advertising|search engine|cloud computing|alphabet|google|^GOOGL?$|semiconductor|\bai\b|artificial intelligence|算力/i,
    label: 'AI算力',
  },
  { match: /solar|光伏/i, label: '光伏' },
  { match: /energy storage|储能/i, label: '储能' },
];

export function resolveAltDataIndustry(data, symbol) {
  if (!data) return null;
  const candidates = [
    data?.valuation?.industry,
    data?.valuation?.sector,
    data?.implications?.industry,
    data?.valuation?.company_name,
    data?.company_name,
    data?.symbol,
    symbol,
  ];
  for (const raw of candidates) {
    if (!raw) continue;
    const text = String(raw).trim();
    if (!text) continue;
    for (const entry of FRONTEND_INDUSTRY_ALIASES) {
      if (entry.match.test(text)) return entry.label;
    }
  }
  return null;
}

const PricingResultsSection = ({
  data,
  gapHistory,
  gapHistoryError,
  gapHistoryLoading,
  handleAnalyze,
  handleInspectScreeningResult,
  handleOpenMacroMispricingDraft,
  handleRunSensitivity,
  peerComparison,
  peerComparisonError,
  peerComparisonLoading,
  sensitivity,
  sensitivityControls,
  sensitivityError,
  sensitivityLoading,
  setSensitivityControls,
  symbol,
}) => {
  if (!data) return null;

  return (
    <>
      <GapOverview data={data} />

      <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
        <Col xs={24} lg={12}>
          <FactorModelCard data={data.factor_model} />
        </Col>
        <Col xs={24} lg={12}>
          <ValuationCard data={data.valuation} />
        </Col>
      </Row>

      <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
        <Col xs={24}>
          <React.Suspense fallback={null}>
            <AltDataContextPanel
              ticker={symbol}
              industry={resolveAltDataIndustry(data, symbol)}
            />
          </React.Suspense>
        </Col>
      </Row>

      <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
        <Col xs={24} lg={12}>
          <DriversCard data={data.deviation_drivers} />
        </Col>
        <Col xs={24} lg={12}>
          <ImplicationsCard
            data={data.implications}
            valuation={data.valuation}
            factorModel={data.factor_model}
            gapAnalysis={data.gap_analysis}
            onRetry={handleAnalyze}
          />
        </Col>
      </Row>

      <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
        <Col xs={24} lg={12}>
          <PeopleLayerCard
            data={data.people_layer}
            overlay={data.people_governance_overlay || data.implications?.people_governance_overlay}
          />
        </Col>
        <Col xs={24} lg={12}>
          <StructuralDecayCard data={data.structural_decay || data.implications?.structural_decay} />
        </Col>
      </Row>

      <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
        <Col xs={24}>
          <MacroMispricingThesisCard
            data={data.macro_mispricing_thesis || data.implications?.macro_mispricing_thesis}
            onOpenDraft={handleOpenMacroMispricingDraft}
          />
        </Col>
      </Row>

      <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
        <Col xs={24}>
          <SensitivityAnalysisCard
            symbol={symbol}
            loading={sensitivityLoading}
            error={sensitivityError}
            sensitivity={sensitivity}
            controls={sensitivityControls}
            onControlChange={setSensitivityControls}
            onRun={handleRunSensitivity}
          />
        </Col>
      </Row>

      <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
        <Col xs={24} lg={12}>
          <GapHistoryCard
            loading={gapHistoryLoading}
            error={gapHistoryError}
            historyData={gapHistory}
          />
        </Col>
        <Col xs={24} lg={12}>
          <PeerComparisonCard
            loading={peerComparisonLoading}
            error={peerComparisonError}
            peerComparison={peerComparison}
            onInspect={handleInspectScreeningResult}
          />
        </Col>
      </Row>
    </>
  );
};

export default PricingResultsSection;
