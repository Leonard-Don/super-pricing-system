import React from 'react';
import {
  Card, Spin, Alert, Typography, Empty, Button,
  Skeleton, Space, Tag
} from 'antd';
import { FundOutlined } from '@ant-design/icons';
import ResearchPlaybook from './research-playbook/ResearchPlaybook';
import {
  GapHistoryCard,
  GapOverview,
  PeerComparisonCard,
  PricingScreenerCard,
  SensitivityAnalysisCard,
} from './pricing/PricingOverviewSections';
import { DriversCard, ImplicationsCard, PeopleLayerCard, StructuralDecayCard } from './pricing/PricingInsightCards';
import { FactorModelCard, ValuationCard } from './pricing/PricingModelCards';
import PricingResultsSection from './pricing/PricingResultsSection';
import PricingSearchPanel from './pricing/PricingSearchPanel';
import { formatResearchSource, navigateByResearchAction } from '../utils/researchContext';
import usePricingResearchData from './pricing/usePricingResearchData';

const { Title, Paragraph } = Typography;

/**
 * 定价研究面板
 * 整合因子模型分析、内在价值估值和定价差异分析
 */
const PricingResearch = () => {
  const {
    data,
    error,
    filteredScreeningResults,
    gapHistory,
    gapHistoryError,
    gapHistoryLoading,
    handleAnalyze,
    handleApplyPreset,
    handleExportAudit,
    handleExportReport,
    handleExportScreening,
    handleInspectScreeningResult,
    handleKeyPress,
    handleOpenMacroMispricingDraft,
    handleOpenRecentResearchTask,
    handleReturnToWorkbenchNextTask,
    handleRunScreener,
    handleRunSensitivity,
    handleSaveTask,
    handleSuggestionSelect,
    handleUpdateSnapshot,
    HOT_PRICING_SYMBOLS: hotSymbols,
    loading,
    peerComparison,
    peerComparisonError,
    peerComparisonLoading,
    period,
    playbook,
    recentResearchShortcutCards,
    researchContext,
    canReturnToWorkbenchQueue,
    queueResumeHint,
    savedTaskId,
    savingTask,
    updatingSnapshot,
    screeningError,
    screeningFilter,
    screeningLoading,
    screeningMeta,
    screeningMinScore,
    screeningProgress,
    screeningSector,
    screeningSectors,
    screeningUniverse,
    searchHistory,
    sensitivity,
    sensitivityControls,
    sensitivityError,
    sensitivityLoading,
    setPeriod,
    setScreeningFilter,
    setScreeningMinScore,
    setScreeningSector,
    setScreeningUniverse,
    setSensitivityControls,
    setSymbol,
    suggestions,
    suggestionTagColors,
    symbol,
  } = usePricingResearchData({ navigateByResearchAction });

  return (
    <div className="app-page-shell app-page-shell--research" data-testid="pricing-research-page">
      <section className="app-page-hero app-page-hero--pricing">
        <div className="app-page-hero__header">
          <div className="app-page-hero__content">
            <div className="app-page-eyebrow">Pricing Research</div>
            <div className="app-page-heading">
              <FundOutlined className="app-page-heading__icon" />
              <div>
                <Title level={3} style={{ margin: 0 }}>
                  资产定价研究
                </Title>
                <Paragraph type="secondary" style={{ margin: '10px 0 0' }}>
                  打通一级市场估值逻辑（DCF / 可比估值）与二级市场因子定价（CAPM / Fama-French），把偏差、治理折价和宏观错配放进同一张研究桌面。
                </Paragraph>
              </div>
            </div>
          </div>
          <div className="app-page-hero__aside">
            <div className="app-page-metric-strip">
              <div className="app-page-metric-card">
                <span className="app-page-metric-card__label">研究窗口</span>
                <span className="app-page-metric-card__value">{period}</span>
              </div>
              <div className="app-page-metric-card">
                <span className="app-page-metric-card__label">工作流状态</span>
                <span className="app-page-metric-card__value">{playbook?.stageLabel || '待分析'}</span>
              </div>
            </div>
          </div>
        </div>
        <Space wrap size={[8, 8]} style={{ marginTop: 14 }}>
          <Tag color="blue">CAPM / FF3 / FF5</Tag>
          <Tag color="green">DCF / Monte Carlo</Tag>
          <Tag color="purple">治理折价 / 人的维度</Tag>
          <Tag color="orange">连续复盘已接入</Tag>
          {researchContext?.source ? (
            <Tag color="gold">{`来源 ${formatResearchSource(researchContext.source)}`}</Tag>
          ) : null}
        </Space>
      </section>

      {(researchContext?.source && researchContext?.symbol) || canReturnToWorkbenchQueue ? (
        <Card className="app-page-context-rail" variant="borderless">
          <div className="app-page-context-rail__header">
            <div>
              <div className="app-page-context-rail__eyebrow">Research Context</div>
              <Title level={5} style={{ margin: 0 }}>
                当前研究上下文
              </Title>
              <Paragraph type="secondary" style={{ margin: '8px 0 0' }}>
                保留来源、复盘队列和快照续接语义，但把提示压缩到一条上下文栏里，让首屏把注意力留给研究结果本身。
              </Paragraph>
            </div>
            <div className="app-page-context-rail__actions">
              {canReturnToWorkbenchQueue ? (
                <Button type="primary" size="small" onClick={handleReturnToWorkbenchNextTask}>
                  {queueResumeHint ? '完成当前复盘并继续下一条' : '回到工作台下一条 Pricing 任务'}
                </Button>
              ) : null}
            </div>
          </div>
          <div className="app-page-context-rail__grid">
            {researchContext?.source && researchContext?.symbol ? (
              <div className="app-page-context-item">
                <span className="app-page-context-item__title">
                  {`来自 ${formatResearchSource(researchContext.source)} 的定价研究建议 · ${playbook?.stageLabel || '待分析'}`}
                </span>
                <span className="app-page-context-item__detail">
                  {researchContext.note
                    ? `${researchContext.symbol} · ${researchContext.note}`
                    : `${researchContext.symbol} 已自动带入研究页，当前剧本阶段为 ${playbook?.stageLabel || '待分析'}`}
                </span>
              </div>
            ) : null}

            {canReturnToWorkbenchQueue ? (
              <div className="app-page-context-item">
                <span className="app-page-context-item__title">当前任务来自工作台复盘队列</span>
                <span className="app-page-context-item__detail">
                  分析完成后，可以直接回到工作台并切到下一条 Pricing 任务，保持同类型连续复盘节奏。
                </span>
              </div>
            ) : null}

            {canReturnToWorkbenchQueue && queueResumeHint ? (
              <div className="app-page-context-item">
                <span className="app-page-context-item__title">
                  {queueResumeHint === 'snapshot' ? '当前复盘快照已更新' : '当前复盘任务已保存'}
                </span>
                <span className="app-page-context-item__detail">
                  {queueResumeHint === 'snapshot'
                    ? '这条 Pricing 任务的最新判断已经写回工作台，可以继续推进到同类型队列的下一条。'
                    : '这条 Pricing 任务已经落到工作台，可以继续推进到同类型队列的下一条。'}
                </span>
              </div>
            ) : null}
          </div>
        </Card>
      ) : null}

      {playbook ? (
        <div className="app-page-section-block">
          <div className="app-page-section-kicker">研究剧本</div>
          <ResearchPlaybook
            playbook={playbook}
            onAction={(action) => navigateByResearchAction(action)}
            onSaveTask={handleSaveTask}
            onUpdateSnapshot={data && savedTaskId ? handleUpdateSnapshot : null}
            saveLoading={savingTask}
            updateLoading={updatingSnapshot}
          />
        </div>
      ) : null}

      <div className="app-page-section-block">
        <div className="app-page-section-kicker">研究入口</div>
        <PricingSearchPanel
          data={data}
          handleAnalyze={handleAnalyze}
          handleExportAudit={handleExportAudit}
          handleExportReport={handleExportReport}
          handleKeyPress={handleKeyPress}
          handleOpenRecentResearchTask={handleOpenRecentResearchTask}
          handleSuggestionSelect={handleSuggestionSelect}
          hotSymbols={hotSymbols}
          loading={loading}
          period={period}
          recentResearchShortcutCards={recentResearchShortcutCards}
          savingTask={savingTask}
          searchHistory={searchHistory}
          setPeriod={setPeriod}
          setSymbol={setSymbol}
          suggestions={suggestions}
          suggestionTagColors={suggestionTagColors}
          symbol={symbol}
        />
      </div>

      <div className="app-page-section-block">
        <div className="app-page-section-kicker">候选池筛选</div>
        <PricingScreenerCard
          value={screeningUniverse}
          onChange={setScreeningUniverse}
          onRun={handleRunScreener}
          onInspect={handleInspectScreeningResult}
          loading={screeningLoading}
          error={screeningError}
          period={period}
          results={filteredScreeningResults}
          meta={screeningMeta}
          progress={screeningProgress}
          filter={screeningFilter}
          onFilterChange={setScreeningFilter}
          sectorFilter={screeningSector}
          onSectorFilterChange={setScreeningSector}
          minScore={screeningMinScore}
          onMinScoreChange={setScreeningMinScore}
          sectorOptions={screeningSectors}
          onApplyPreset={handleApplyPreset}
          onExport={handleExportScreening}
        />
      </div>

      {error && <Alert message={error} type="error" showIcon closable style={{ marginBottom: 16 }} />}

      {loading && (
        <Card style={{ marginBottom: 16 }}>
          <Skeleton active paragraph={{ rows: 8 }} />
          <div style={{ textAlign: 'center', marginTop: 12 }}>
            <Spin size="large" />
            <div style={{ marginTop: 16, color: '#8c8c8c' }}>
              正在分析 {symbol.toUpperCase()} 的定价模型，首次加载因子数据可能需要10-20秒...
            </div>
          </div>
        </Card>
      )}

      {data && !loading && (
        <div className="app-page-section-block">
          <div className="app-page-section-kicker">分析结果</div>
          <PricingResultsSection
            data={data}
            gapHistory={gapHistory}
            gapHistoryError={gapHistoryError}
            gapHistoryLoading={gapHistoryLoading}
            handleAnalyze={handleAnalyze}
            handleInspectScreeningResult={handleInspectScreeningResult}
            handleOpenMacroMispricingDraft={handleOpenMacroMispricingDraft}
            handleRunSensitivity={handleRunSensitivity}
            peerComparison={peerComparison}
            peerComparisonError={peerComparisonError}
            peerComparisonLoading={peerComparisonLoading}
            sensitivity={sensitivity}
            sensitivityControls={sensitivityControls}
            sensitivityError={sensitivityError}
            sensitivityLoading={sensitivityLoading}
            setSensitivityControls={setSensitivityControls}
            symbol={symbol}
          />
        </div>
      )}

      {!data && !loading && !error && (
        <Empty
          description="输入股票代码开始定价研究分析"
          style={{ padding: 80 }}
        />
      )}
    </div>
  );
};

export {
  FactorModelCard,
  ValuationCard,
  GapHistoryCard,
  GapOverview,
  DriversCard,
  ImplicationsCard,
  PeopleLayerCard,
  StructuralDecayCard,
  PeerComparisonCard,
  PricingScreenerCard,
  SensitivityAnalysisCard,
};

export default PricingResearch;
