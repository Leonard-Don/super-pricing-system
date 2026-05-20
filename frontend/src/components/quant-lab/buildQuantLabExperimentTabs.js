import React from 'react';
import {
  ApartmentOutlined,
  BarChartOutlined,
  CodeOutlined,
  ClusterOutlined,
  FundOutlined,
  LineChartOutlined,
  RadarChartOutlined,
} from '@ant-design/icons';
import QuantLabBacktestEnhancePanel from './QuantLabBacktestEnhancePanel';
import QuantLabFactorPanel from './QuantLabFactorPanel';
import QuantLabIndustryIntelPanel from './QuantLabIndustryIntelPanel';
import QuantLabIndustryRotationPanel from './QuantLabIndustryRotationPanel';
import QuantLabOptimizerPanel from './QuantLabOptimizerPanel';
import QuantLabRiskPanel from './QuantLabRiskPanel';
import QuantLabSignalValidationPanel from './QuantLabSignalValidationPanel';
import QuantLabValuationPanel from './QuantLabValuationPanel';
import { QUANT_LAB_TAB_META_MAP, getQuantLabBoundaryMeta } from './quantLabShared';

const QuantLabTabLabel = ({ icon: Icon, metaKey }) => {
  const meta = QUANT_LAB_TAB_META_MAP[metaKey];
  const boundary = getQuantLabBoundaryMeta(meta.boundary);
  return (
    <span className="quantlab-tab-label">
      <Icon />
      <span>{meta.title}</span>
      <span className={`quantlab-tab-label__boundary quantlab-tab-label__boundary--${boundary.tone}`}>
        {boundary.label}
      </span>
    </span>
  );
};

const buildQuantLabExperimentTabs = ({
  actionBundles,
  experimentState,
  forms,
  helpers,
  researchState,
  strategyState,
}) => {
  const {
    handleBacktestMonteCarlo,
    handleFactorExpression,
    handleIndustryRotation,
    handleMarketImpactAnalysis,
    handleMultiPeriodBacktest,
    handleOptimize,
    handleQueueBacktestMonteCarlo,
    handleQueueFactorExpression,
    handleQueueIndustryRotation,
    handleQueueMarketImpactAnalysis,
    handleQueueMultiPeriodBacktest,
    handleQueueOptimizer,
    handleQueueRiskAnalysis,
    handleQueueStrategySignificance,
    handleQueueValuation,
    handleRiskAnalysis,
    handleStrategySignificance,
    handleValuationAnalysis,
  } = actionBundles.experimentActions;
  const {
    handleIndustryIntelligence,
    handleMarketProbe,
    handleSignalValidation,
  } = actionBundles.researchActions;
  const {
    backtestEnhancementLoading,
    backtestEnhancementResult,
    factorLoading,
    factorResult,
    optimizerLoading,
    optimizerResult,
    queuedTaskLoading,
    riskLoading,
    riskResult,
    rotationLoading,
    rotationResult,
    valuationLoading,
    valuationResult,
  } = experimentState;
  const {
    altSignalDiagnostics,
    anomalyDiagnostics,
    industryIntelLoading,
    industryIntelResult,
    industryNetworkResult,
    linkedReplayResult,
    macroValidationResult,
    marketProbeLoading,
    orderbookResult,
    replayResult,
    signalValidationLoading,
  } = researchState;
  const { strategies } = strategyState;
  const {
    HeatmapGridComponent,
    describeExecution,
    executionAlertType,
    formatMoney,
    formatPct,
    formatSignedPct,
    periodOptions,
  } = helpers;

  return [
    {
      key: 'optimizer',
      label: <QuantLabTabLabel icon={ClusterOutlined} metaKey="optimizer" />,
      children: (
        <QuantLabOptimizerPanel
          HeatmapGridComponent={HeatmapGridComponent}
          formatPct={formatPct}
          handleOptimize={handleOptimize}
          handleQueueOptimizer={handleQueueOptimizer}
          optimizerForm={forms.optimizerForm}
          optimizerLoading={optimizerLoading}
          optimizerQueueLoading={Boolean(queuedTaskLoading.optimizer)}
          optimizerResult={optimizerResult}
          strategies={strategies}
        />
      ),
    },
    {
      key: 'backtest-enhance',
      label: <QuantLabTabLabel icon={BarChartOutlined} metaKey="backtest-enhance" />,
      children: (
        <QuantLabBacktestEnhancePanel
          backtestEnhancementLoading={backtestEnhancementLoading}
          backtestEnhancementResult={backtestEnhancementResult}
          formatMoney={formatMoney}
          formatPct={formatPct}
          handleBacktestMonteCarlo={handleBacktestMonteCarlo}
          handleMarketImpactAnalysis={handleMarketImpactAnalysis}
          handleMultiPeriodBacktest={handleMultiPeriodBacktest}
          handleQueueBacktestMonteCarlo={handleQueueBacktestMonteCarlo}
          handleQueueMarketImpactAnalysis={handleQueueMarketImpactAnalysis}
          handleQueueMultiPeriodBacktest={handleQueueMultiPeriodBacktest}
          handleQueueStrategySignificance={handleQueueStrategySignificance}
          handleStrategySignificance={handleStrategySignificance}
          impactAnalysisForm={forms.impactAnalysisForm}
          monteCarloForm={forms.monteCarloForm}
          multiPeriodForm={forms.multiPeriodForm}
          queuedTaskLoading={queuedTaskLoading}
          significanceForm={forms.significanceForm}
          strategies={strategies}
        />
      ),
    },
    {
      key: 'risk',
      label: <QuantLabTabLabel icon={RadarChartOutlined} metaKey="risk" />,
      children: (
        <QuantLabRiskPanel
          HeatmapGridComponent={HeatmapGridComponent}
          formatPct={formatPct}
          handleQueueRiskAnalysis={handleQueueRiskAnalysis}
          handleRiskAnalysis={handleRiskAnalysis}
          periodOptions={periodOptions}
          queueLoading={Boolean(queuedTaskLoading.risk)}
          riskForm={forms.riskForm}
          riskLoading={riskLoading}
          riskResult={riskResult}
        />
      ),
    },
    {
      key: 'valuation',
      label: <QuantLabTabLabel icon={FundOutlined} metaKey="valuation" />,
      children: (
        <QuantLabValuationPanel
          formatMoney={formatMoney}
          formatPct={formatPct}
          formatSignedPct={formatSignedPct}
          handleQueueValuation={handleQueueValuation}
          handleValuationAnalysis={handleValuationAnalysis}
          periodOptions={periodOptions}
          queueLoading={Boolean(queuedTaskLoading.valuation)}
          valuationForm={forms.valuationForm}
          valuationLoading={valuationLoading}
          valuationResult={valuationResult}
        />
      ),
    },
    {
      key: 'industry',
      label: <QuantLabTabLabel icon={ClusterOutlined} metaKey="industry" />,
      children: (
        <QuantLabIndustryRotationPanel
          describeExecution={describeExecution}
          executionAlertType={executionAlertType}
          formatMoney={formatMoney}
          formatPct={formatPct}
          handleIndustryRotation={handleIndustryRotation}
          handleQueueIndustryRotation={handleQueueIndustryRotation}
          industryRotationQueueLoading={Boolean(queuedTaskLoading.industry_rotation)}
          rotationForm={forms.rotationForm}
          rotationLoading={rotationLoading}
          rotationResult={rotationResult}
        />
      ),
    },
    {
      key: 'industry-intel',
      label: <QuantLabTabLabel icon={ApartmentOutlined} metaKey="industry-intel" />,
      children: (
        <QuantLabIndustryIntelPanel
          describeExecution={describeExecution}
          executionAlertType={executionAlertType}
          formatPct={formatPct}
          handleIndustryIntelligence={handleIndustryIntelligence}
          industryIntelForm={forms.industryIntelForm}
          industryIntelLoading={industryIntelLoading}
          industryIntelResult={industryIntelResult}
          industryNetworkResult={industryNetworkResult}
        />
      ),
    },
    {
      key: 'signal-validation',
      label: <QuantLabTabLabel icon={LineChartOutlined} metaKey="signal-validation" />,
      children: (
        <QuantLabSignalValidationPanel
          altSignalDiagnostics={altSignalDiagnostics}
          anomalyDiagnostics={anomalyDiagnostics}
          describeExecution={describeExecution}
          executionAlertType={executionAlertType}
          formatMoney={formatMoney}
          formatPct={formatPct}
          handleMarketProbe={handleMarketProbe}
          handleSignalValidation={handleSignalValidation}
          linkedReplayResult={linkedReplayResult}
          macroValidationResult={macroValidationResult}
          marketProbeForm={forms.marketProbeForm}
          marketProbeLoading={marketProbeLoading}
          orderbookResult={orderbookResult}
          periodOptions={periodOptions}
          replayResult={replayResult}
          signalValidationForm={forms.signalValidationForm}
          signalValidationLoading={signalValidationLoading}
        />
      ),
    },
    {
      key: 'factor',
      label: <QuantLabTabLabel icon={CodeOutlined} metaKey="factor" />,
      children: (
        <QuantLabFactorPanel
          factorForm={forms.factorForm}
          factorLoading={factorLoading}
          factorQueueLoading={Boolean(queuedTaskLoading.factor)}
          factorResult={factorResult}
          handleFactorExpression={handleFactorExpression}
          handleQueueFactorExpression={handleQueueFactorExpression}
          periodOptions={periodOptions}
        />
      ),
    },
  ];
};

export default buildQuantLabExperimentTabs;
