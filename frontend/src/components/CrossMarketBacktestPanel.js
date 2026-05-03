import React, { useMemo } from 'react';
import {
  Alert,
  Button,
  Card,
  Col,
  Form,
  Input,
  InputNumber,
  Row,
  Select,
  Space,
  Spin,
  Tag,
  Typography,
} from 'antd';
import {
  PlusOutlined,
  ReloadOutlined,
  ThunderboltOutlined,
  DeleteOutlined,
} from '@ant-design/icons';

import ResearchPlaybook from './research-playbook/ResearchPlaybook';
import CrossMarketResultsSection from './cross-market/CrossMarketResultsSection';
import {
  ASSET_CLASS_LABELS,
  ASSET_CLASS_OPTIONS,
  DEFAULT_PARAMETERS,
} from './cross-market/panelConstants';
import {
  formatConstructionMode,
  getReviewPriorityContextLine,
  getReviewPriorityTitleSuffix,
  getSelectionQualityExplanationLines,
} from './cross-market/panelHelpers';
import useCrossMarketBacktestState from '../hooks/useCrossMarketBacktestState';
import { formatCurrency, formatPercentage } from '../utils/formatting';
import {
  CROSS_MARKET_DIMENSION_LABELS,
  CROSS_MARKET_FACTOR_LABELS,
} from '../utils/crossMarketRecommendations';
import { formatResearchSource, navigateByResearchAction } from '../utils/researchContext';

const { Paragraph, Text } = Typography;

function CrossMarketBacktestPanel() {
  const {
    templates,
    loadingTemplates,
    running,
    savingTask,
    assets,
    parameters,
    quality,
    constraints,
    meta,
    results,
    researchContext,
    queueResumeHint,
    selectedTemplateId,
    savedTaskId,
    appliedBiasMeta,
    draftTemplateContext,
    macroMispricingDraft,
    setResults,
    setParameters,
    setQuality,
    setConstraints,
    setMeta,
    longAssets,
    shortAssets,
    displayRecommendedTemplates,
    selectedTemplate,
    effectiveTemplate,
    selectedTemplateSelectionQualityLines,
    playbook,
    topRecommendationSelectionQualityLines,
    topRecommendation,
    topRecommendationNeedsPriorityReview,
    selectedTemplateNeedsPriorityReview,
    canReturnToWorkbenchQueue,
    updateAsset,
    removeAsset,
    addAsset,
    applyTemplate,
    handleRun,
    handleSaveTask,
    handleSaveTradeThesis,
    handleUpdateSnapshot,
    handleReturnToWorkbenchNextTask,
  } = useCrossMarketBacktestState();

  const renderAssetSection = (title, sideAssets, side) => (
    <Card
      title={title}
      extra={
        <Button size="small" icon={<PlusOutlined />} onClick={() => addAsset(side)}>
          新增
        </Button>
      }
      variant="borderless"
      className="workspace-panel cross-market-asset-card"
    >
      <Space direction="vertical" style={{ width: '100%' }} size={12}>
        {sideAssets.map((asset) => (
          <Row gutter={12} key={asset.key}>
            <Col xs={24} md={8}>
              <Input
                value={asset.symbol}
                placeholder="资产代码"
                onChange={(event) => updateAsset(asset.key, 'symbol', event.target.value)}
              />
            </Col>
            <Col xs={24} md={8}>
              <Select
                value={asset.asset_class}
                options={ASSET_CLASS_OPTIONS}
                style={{ width: '100%' }}
                onChange={(value) => updateAsset(asset.key, 'asset_class', value)}
              />
            </Col>
            <Col xs={18} md={6}>
              <InputNumber
                value={asset.weight}
                min={0.01}
                step={0.05}
                placeholder="权重"
                style={{ width: '100%' }}
                onChange={(value) => updateAsset(asset.key, 'weight', value)}
              />
            </Col>
            <Col xs={6} md={2}>
              <Button
                icon={<DeleteOutlined />}
                danger
                onClick={() => removeAsset(asset.key)}
              />
            </Col>
          </Row>
        ))}
      </Space>
    </Card>
  );

  const hasResults = Boolean(results);
  const activeConstraintCount = Number(Boolean(constraints.max_single_weight)) + Number(Boolean(constraints.min_single_weight));
  const heroMetrics = useMemo(
    () => [
      {
        label: '当前主题',
        value: selectedTemplate?.theme || selectedTemplate?.name || '自动推荐模板',
      },
      {
        label: '篮子规模',
        value: `多 ${longAssets.length} / 空 ${shortAssets.length}`,
      },
      {
        label: '构造模式',
        value: formatConstructionMode(quality.construction_mode),
      },
      {
        label: '当前状态',
        value: running
          ? '运行中'
          : (hasResults ? '结果已生成' : '待运行'),
      },
    ],
    [hasResults, longAssets.length, quality.construction_mode, running, selectedTemplate, shortAssets.length]
  );
  const heroWorkflow = useMemo(
    () => [
      {
        label: '模板与偏置',
        value: selectedTemplate
          ? `${selectedTemplate.name}${appliedBiasMeta ? ' · 宏观偏置已启用' : ' · 原始权重'}`
          : '等待绑定模板',
        detail: selectedTemplate?.driverHeadline || '先确认主题模板，再决定长短腿篮子的构造方式。',
      },
      {
        label: '时间与成本',
        value: `${meta.start_date || '自动开始'} 至 ${meta.end_date || '自动结束'}`,
        detail: `资金 ${formatCurrency(Number(meta.initial_capital || 0))} · 手续费 ${Number(meta.commission || 0).toFixed(2)}% · 滑点 ${Number(meta.slippage || 0).toFixed(2)}%`,
      },
      {
        label: '结果理解',
        value: hasResults
          ? `${(Number(results?.total_return || 0) * 100).toFixed(2)}% 总收益 · Sharpe ${Number(results?.sharpe_ratio || 0).toFixed(2)}`
          : '运行后在主画布查看组合结论',
        detail: hasResults
          ? `样本 ${results?.price_matrix_summary?.row_count || 0} 个对齐交易日`
          : (activeConstraintCount
            ? `当前已启用 ${activeConstraintCount} 个单资产约束`
            : '当前未启用单资产约束'),
      },
    ],
    [
      activeConstraintCount,
      appliedBiasMeta,
      hasResults,
      meta.commission,
      meta.end_date,
      meta.initial_capital,
      meta.slippage,
      meta.start_date,
      results,
      selectedTemplate,
    ]
  );
  const sidebarOverviewItems = useMemo(
    () => [
      {
        label: '策略骨架',
        value: `spread_zscore · ${formatConstructionMode(quality.construction_mode)}`,
      },
      {
        label: '时间窗口',
        value: `${meta.start_date || '自动'} 至 ${meta.end_date || '自动'}`,
      },
      {
        label: '成本设置',
        value: `手续费 ${Number(meta.commission || 0).toFixed(2)}% · 滑点 ${Number(meta.slippage || 0).toFixed(2)}%`,
      },
      {
        label: '单资产约束',
        value: activeConstraintCount
          ? [
              constraints.max_single_weight ? `上限 ${Number(constraints.max_single_weight).toFixed(0)}%` : '',
              constraints.min_single_weight ? `下限 ${Number(constraints.min_single_weight).toFixed(0)}%` : '',
            ].filter(Boolean).join(' · ')
          : '未启用',
      },
    ],
    [
      activeConstraintCount,
      constraints.max_single_weight,
      constraints.min_single_weight,
      meta.commission,
      meta.end_date,
      meta.slippage,
      meta.start_date,
      quality.construction_mode,
    ]
  );
  const basketPreviewGroups = useMemo(
    () => [
      {
        key: 'long',
        title: '多头篮子',
        empty: '继续补充多头资产，形成清晰的主题暴露。',
        items: longAssets,
      },
      {
        key: 'short',
        title: '空头篮子',
        empty: '继续补充空头资产，完成对冲或相对价值表达。',
        items: shortAssets,
      },
    ],
    [longAssets, shortAssets]
  );
  const runnableAssetCount = useMemo(
    () =>
      assets.reduce((count, asset) => {
        return count + (String(asset?.symbol || '').trim() ? 1 : 0);
      }, 0),
    [assets]
  );
  const hasRunnableAssetBasket = runnableAssetCount >= 2;
  const runBacktestPendingTemplateHydration = loadingTemplates && !hasRunnableAssetBasket;
  const runBacktestButtonLabel = runBacktestPendingTemplateHydration ? '载入模板中...' : '运行回测';
  const previewHighlights = useMemo(
    () => [
      {
        label: '模板结论',
        value: selectedTemplate?.driverHeadline || topRecommendation?.driverHeadline || '当前还没有模板结论，可先从推荐模板开始。',
      },
      {
        label: '风险预算',
        value: appliedBiasMeta
          ? `${Number(appliedBiasMeta.strength || 0).toFixed(1)}pp 偏置强度 · ${appliedBiasMeta.qualityLabel || 'full'}`
          : '按模板原始权重执行',
      },
      {
        label: '资金与样本',
        value: `${formatCurrency(Number(meta.initial_capital || 0))} 初始资金 · lookback ${parameters.lookback} 天`,
      },
    ],
    [appliedBiasMeta, meta.initial_capital, parameters.lookback, selectedTemplate, topRecommendation]
  );

  return (
    <div className="workspace-tab-view app-page-shell app-page-shell--wide" style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div className="workspace-section workspace-section--accent app-page-hero app-page-hero--cross-market">
        <div className="workspace-section__header">
          <div>
            <div className="workspace-section__title">跨市场回测</div>
            <div className="workspace-section__description">围绕模板、篮子构造、质量约束和研究联动完成跨资产策略实验，保持与主回测一致的工作台体验。</div>
          </div>
        </div>
        <div className="cross-market-hero-grid">
          <div className="cross-market-hero-story">
            <Space wrap size={[8, 8]}>
              <Tag color="geekblue" style={{ width: 'fit-content', marginInlineEnd: 0 }}>
                跨市场实验版
              </Tag>
              <Tag color={hasResults ? 'green' : (running ? 'processing' : 'default')}>
                {running ? '运行中' : (hasResults ? '结果已生成' : '待运行')}
              </Tag>
              {activeConstraintCount ? (
                <Tag color="gold">{`单资产约束 ${activeConstraintCount} 个`}</Tag>
              ) : null}
            </Space>
            <Paragraph style={{ marginBottom: 0 }}>
              用一条主画布把模板选择、长短腿篮子、质量约束和回测结果串起来。
              右侧侧栏负责快选模板与参数调整，主区域专注查看篮子和实验结论。
            </Paragraph>
            <div className="cross-market-hero-lanes">
              {heroWorkflow.map((item) => (
                <div key={item.label} className="cross-market-hero-lane">
                  <span className="cross-market-hero-lane__label">{item.label}</span>
                  <span className="cross-market-hero-lane__value">{item.value}</span>
                  <span className="cross-market-hero-lane__detail">{item.detail}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="cross-market-hero-summary">
            {heroMetrics.map((item) => (
              <div key={item.label} className="app-page-metric-card">
                <span className="app-page-metric-card__label">{item.label}</span>
                <span className="app-page-metric-card__value">{item.value}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {(researchContext?.template || canReturnToWorkbenchQueue) ? (
        <Card className="app-page-context-rail" variant="borderless">
          <div className="app-page-context-rail__header">
            <div>
              <div className="app-page-context-rail__eyebrow">Execution Context</div>
              <Text strong style={{ fontSize: 18, color: 'var(--text-primary)' }}>
                当前跨市场执行上下文
              </Text>
              <Paragraph type="secondary" style={{ margin: '8px 0 0' }}>
                保留模板来源、工作台队列和快照续接信息，但让首屏重点回到模板构造、风险预算和执行结果。
              </Paragraph>
            </div>
            <div className="app-page-context-rail__actions">
              {canReturnToWorkbenchQueue ? (
                <Button type="primary" size="small" onClick={handleReturnToWorkbenchNextTask}>
                  {queueResumeHint ? '完成当前复盘并继续下一条' : '回到工作台下一条跨市场任务'}
                </Button>
              ) : null}
            </div>
          </div>
          <div className="app-page-context-rail__grid">
            {researchContext?.template ? (
              <div className="app-page-context-item">
                <span className="app-page-context-item__title">
                  {`已载入来自 ${formatResearchSource(researchContext.source)} 的跨市场模板 · ${playbook?.stageLabel || '待运行'}`}
                </span>
                <span className="app-page-context-item__detail">
                  {researchContext.note
                    ? researchContext.note
                    : `模板 ${researchContext.template} 已自动预载，可继续编辑后再运行回测。当前剧本阶段为 ${playbook?.stageLabel || '待运行'}。`}
                </span>
              </div>
            ) : null}

            {canReturnToWorkbenchQueue ? (
              <div className="app-page-context-item">
                <span className="app-page-context-item__title">当前任务来自工作台复盘队列</span>
                <span className="app-page-context-item__detail">
                  回测或更新完成后，可以直接回到工作台并切到下一条跨市场任务，保持同类型连续复盘。
                </span>
              </div>
            ) : null}

            {canReturnToWorkbenchQueue && queueResumeHint ? (
              <div className="app-page-context-item">
                <span className="app-page-context-item__title">
                  {queueResumeHint === 'snapshot' ? '当前跨市场复盘快照已更新' : '当前跨市场复盘任务已保存'}
                </span>
                <span className="app-page-context-item__detail">
                  {queueResumeHint === 'snapshot'
                    ? '这条跨市场任务的最新判断已经写回工作台，可以继续推进到同类型队列的下一条。'
                    : '这条跨市场任务已经落到工作台，可以继续推进到同类型队列的下一条。'}
                </span>
              </div>
            ) : null}
          </div>
        </Card>
      ) : null}

      {playbook ? (
        <div className="app-page-section-block">
          <div className="app-page-section-kicker">跨市场剧本</div>
          <ResearchPlaybook
            playbook={playbook}
            onAction={(action) => navigateByResearchAction(action)}
            onSaveTask={handleSaveTask}
            onSecondarySaveTask={macroMispricingDraft ? handleSaveTradeThesis : null}
            secondarySaveLabel="保存为交易 Thesis"
            onUpdateSnapshot={savedTaskId && (results || selectedTemplate || assets.length) ? handleUpdateSnapshot : null}
            saving={savingTask}
          />
        </div>
      ) : null}

      <div className="app-page-banner-stack">
      {selectedTemplate ? (
        <Alert
          type="info"
          showIcon
          message={`当前模板主题：${selectedTemplate.theme || selectedTemplate.name}${selectedTemplate.recommendationTier ? ` · ${selectedTemplate.recommendationTier}` : ''}`}
          description={(
            <Space direction="vertical" size={8} style={{ width: '100%' }}>
              <Text>{selectedTemplate.narrative || selectedTemplate.description}</Text>
              {selectedTemplate.driverHeadline ? (
                <Text type="secondary">{selectedTemplate.driverHeadline}</Text>
              ) : null}
              {selectedTemplate.resonanceReason && selectedTemplate.resonanceLabel !== 'mixed' ? (
                <Text type="secondary">{selectedTemplate.resonanceReason}</Text>
              ) : null}
              <Space wrap size={[6, 6]}>
                {(selectedTemplate.linked_factors || []).map((factor) => (
                  <Tag key={`factor-${factor}`} color="purple">
                    因子: {CROSS_MARKET_FACTOR_LABELS[factor] || factor}
                  </Tag>
                ))}
                {(selectedTemplate.linked_dimensions || []).map((dimension) => (
                  <Tag key={`dimension-${dimension}`} color="blue">
                    维度: {CROSS_MARKET_DIMENSION_LABELS[dimension] || dimension}
                  </Tag>
                ))}
                {selectedTemplate.resonanceLabel && selectedTemplate.resonanceLabel !== 'mixed' ? (
                  <Tag color="magenta">resonance {selectedTemplate.resonanceLabel}</Tag>
                ) : null}
                {selectedTemplate.policySourceHealthLabel && selectedTemplate.policySourceHealthLabel !== 'unknown' ? (
                  <Tag color={selectedTemplate.policySourceHealthLabel === 'fragile' ? 'red' : selectedTemplate.policySourceHealthLabel === 'watch' ? 'gold' : 'green'}>
                    policy source {selectedTemplate.policySourceHealthLabel}
                  </Tag>
                ) : null}
                {selectedTemplate.inputReliabilityLabel && selectedTemplate.inputReliabilityLabel !== 'unknown' ? (
                  <Tag color={selectedTemplate.inputReliabilityLabel === 'fragile' ? 'red' : selectedTemplate.inputReliabilityLabel === 'watch' ? 'gold' : 'green'}>
                    input {selectedTemplate.inputReliabilityLabel}
                  </Tag>
                ) : null}
                {selectedTemplate.sourceModeLabel && selectedTemplate.sourceModeLabel !== 'mixed' ? (
                  <Tag color={selectedTemplate.sourceModeLabel === 'official-led' ? 'green' : selectedTemplate.sourceModeLabel === 'fallback-heavy' ? 'orange' : 'blue'}>
                    来源 {selectedTemplate.sourceModeLabel}
                  </Tag>
                ) : null}
                {selectedTemplate.policyExecutionLabel && selectedTemplate.policyExecutionLabel !== 'unknown' ? (
                  <Tag color={selectedTemplate.policyExecutionLabel === 'chaotic' ? 'red' : selectedTemplate.policyExecutionLabel === 'watch' ? 'gold' : 'green'}>
                    政策执行 {selectedTemplate.policyExecutionLabel}
                  </Tag>
                ) : null}
                {selectedTemplate.executionPosture ? (
                  <Tag color="lime">{selectedTemplate.executionPosture}</Tag>
                ) : null}
              </Space>
              {(selectedTemplate.themeCore || selectedTemplate.themeSupport) ? (
                <Text type="secondary">
                  核心腿：{selectedTemplate.themeCore || '暂无'} · 辅助腿：{selectedTemplate.themeSupport || '暂无'}
                </Text>
              ) : null}
              {selectedTemplate.policySourceHealthReason ? (
                <Text type="secondary">{selectedTemplate.policySourceHealthReason}</Text>
              ) : null}
              {selectedTemplate.policyExecutionReason ? (
                <Text type="secondary">
                  政策执行：{selectedTemplate.policyExecutionReason}
                  {selectedTemplate.policyExecutionTopDepartment
                    ? ` · ${selectedTemplate.policyExecutionTopDepartment}`
                    : ''}
                  {selectedTemplate.policyExecutionRiskBudgetScale !== undefined
                    ? ` · 风险预算 ${Number(selectedTemplate.policyExecutionRiskBudgetScale || 1).toFixed(2)}x`
                    : ''}
                </Text>
              ) : null}
              {selectedTemplate.sourceModeReason ? (
                <Text type="secondary">
                  来源治理：{selectedTemplate.sourceModeReason}
                  {selectedTemplate.sourceModeRiskBudgetScale !== undefined
                    ? ` · 风险预算 ${Number(selectedTemplate.sourceModeRiskBudgetScale || 1).toFixed(2)}x`
                    : ''}
                </Text>
              ) : null}
              {selectedTemplate.inputReliabilityLead ? (
                <Text type="secondary">
                  输入可靠度：{selectedTemplate.inputReliabilityLead}
                  {selectedTemplate.inputReliabilityScore
                    ? ` · score ${Number(selectedTemplate.inputReliabilityScore || 0).toFixed(2)}`
                    : ''}
                </Text>
              ) : null}
              {selectedTemplate.inputReliabilityPosture ? (
                <Text type="secondary">使用姿势：{selectedTemplate.inputReliabilityPosture}</Text>
              ) : null}
              {selectedTemplate.refreshMeta?.inputReliabilityShift?.actionHint ? (
                <Text type="secondary">{selectedTemplate.refreshMeta.inputReliabilityShift.actionHint}</Text>
              ) : null}
              {selectedTemplateSelectionQualityLines.map((line) => (
                <Text key={line} type="secondary">
                  {line}
                </Text>
              ))}
              {selectedTemplate.biasQualityLabel && selectedTemplate.biasQualityLabel !== 'full' ? (
                <Text type="secondary">
                  偏置收缩 {selectedTemplate.biasQualityLabel} · {selectedTemplate.biasQualityReason}
                </Text>
              ) : null}
            </Space>
          )}
        />
      ) : null}

      {appliedBiasMeta ? (
        <Alert
          type="success"
          showIcon
          message={`宏观权重偏置已启用 · 强度 ${Number(appliedBiasMeta.strength || 0).toFixed(1)}pp`}
          description={(
            <Space direction="vertical" size={6} style={{ width: '100%' }}>
              <Text>{appliedBiasMeta.summary}</Text>
              {appliedBiasMeta.qualityLabel && appliedBiasMeta.qualityLabel !== 'full' ? (
                <Text type="secondary">偏置收缩 {appliedBiasMeta.qualityLabel} · {appliedBiasMeta.qualityReason}</Text>
              ) : null}
              {appliedBiasMeta.departmentChaosLabel && appliedBiasMeta.departmentChaosLabel !== 'unknown' ? (
                <Text type="secondary">
                  部门混乱 {appliedBiasMeta.departmentChaosLabel}
                  {appliedBiasMeta.departmentChaosTopDepartment ? ` · ${appliedBiasMeta.departmentChaosTopDepartment}` : ''}
                  {appliedBiasMeta.departmentChaosRiskBudgetScale !== undefined
                    ? ` · 风险预算 ${Number(appliedBiasMeta.departmentChaosRiskBudgetScale || 1).toFixed(2)}x`
                    : ''}
                </Text>
              ) : null}
              {appliedBiasMeta.peopleFragilityLabel && appliedBiasMeta.peopleFragilityLabel !== 'stable' ? (
                <Text type="secondary">
                  人的维度 {appliedBiasMeta.peopleFragilityLabel}
                  {appliedBiasMeta.peopleFragilityFocus ? ` · ${appliedBiasMeta.peopleFragilityFocus}` : ''}
                  {appliedBiasMeta.peopleFragilityRiskBudgetScale !== undefined
                    ? ` · 风险预算 ${Number(appliedBiasMeta.peopleFragilityRiskBudgetScale || 1).toFixed(2)}x`
                    : ''}
                </Text>
              ) : null}
              {appliedBiasMeta.policyExecutionLabel && appliedBiasMeta.policyExecutionLabel !== 'unknown' ? (
                <Text type="secondary">
                  政策执行 {appliedBiasMeta.policyExecutionLabel}
                  {appliedBiasMeta.policyExecutionTopDepartment ? ` · ${appliedBiasMeta.policyExecutionTopDepartment}` : ''}
                  {appliedBiasMeta.policyExecutionRiskBudgetScale !== undefined
                    ? ` · 风险预算 ${Number(appliedBiasMeta.policyExecutionRiskBudgetScale || 1).toFixed(2)}x`
                    : ''}
                </Text>
              ) : null}
              {appliedBiasMeta.sourceModeLabel && appliedBiasMeta.sourceModeLabel !== 'mixed' ? (
                <Text type="secondary">
                  来源治理 {appliedBiasMeta.sourceModeLabel}
                  {appliedBiasMeta.sourceModeReason ? ` · ${appliedBiasMeta.sourceModeReason}` : ''}
                  {appliedBiasMeta.sourceModeRiskBudgetScale !== undefined
                    ? ` · 风险预算 ${Number(appliedBiasMeta.sourceModeRiskBudgetScale || 1).toFixed(2)}x`
                    : ''}
                </Text>
              ) : null}
              {appliedBiasMeta.structuralDecayRadarLabel && appliedBiasMeta.structuralDecayRadarLabel !== 'stable' ? (
                <Text type="secondary">
                  结构衰败 {appliedBiasMeta.structuralDecayRadarDisplayLabel || appliedBiasMeta.structuralDecayRadarLabel}
                  {appliedBiasMeta.structuralDecayRadarScore !== undefined
                    ? ` · ${Math.round(Number(appliedBiasMeta.structuralDecayRadarScore || 0) * 100)}%`
                    : ''}
                  {appliedBiasMeta.structuralDecayRadarRiskBudgetScale !== undefined
                    ? ` · 风险预算 ${Number(appliedBiasMeta.structuralDecayRadarRiskBudgetScale || 1).toFixed(2)}x`
                    : ''}
                </Text>
              ) : null}
              <Space wrap size={[6, 6]}>
                {(appliedBiasMeta.highlights || []).map((item) => (
                  <Tag key={item} color="green">{item}</Tag>
                ))}
              </Space>
            </Space>
          )}
        />
      ) : null}

      {effectiveTemplate?.biasActions?.length ? (
        <Card title="建议增减仓名单" variant="borderless">
          <Space wrap size={[8, 8]}>
            {effectiveTemplate.biasActions.map((item) => (
              <Tag key={`${item.side}-${item.symbol}`} color={item.action === 'increase' ? 'green' : 'orange'}>
                {item.action === 'increase' ? '增配' : '减配'} {item.symbol} {item.delta > 0 ? '+' : ''}{(Number(item.delta || 0) * 100).toFixed(1)}pp
              </Tag>
            ))}
          </Space>
        </Card>
      ) : null}

      {effectiveTemplate?.dominantDrivers?.length ? (
        <Card title="主题结论" variant="borderless">
          <Space direction="vertical" size={8} style={{ width: '100%' }}>
            <Text>{effectiveTemplate.themeCore || '暂无主题核心腿'}</Text>
            <Text type="secondary">辅助腿：{effectiveTemplate.themeSupport || '无'}</Text>
            <Space wrap size={[6, 6]}>
              {effectiveTemplate.dominantDrivers.map((item) => (
                <Tag key={item.key} color="purple">
                  主导驱动 {item.label} {Number(item.value || 0).toFixed(2)}
                </Tag>
              ))}
            </Space>
          </Space>
        </Card>
      ) : null}

      {!researchContext?.template && topRecommendation ? (
        <Alert
          type={topRecommendationNeedsPriorityReview ? 'warning' : 'success'}
          showIcon
          message={`当前首选模板：${topRecommendation.name}${topRecommendationNeedsPriorityReview ? ` · ${getReviewPriorityTitleSuffix(topRecommendation?.refreshMeta)}` : ''}`}
          description={`${topRecommendation.driverHeadline}。${
            topRecommendation.recentComparisonLead
              ? `最近两版：${topRecommendation.recentComparisonLead}。`
              : ''
          }${
            topRecommendationNeedsPriorityReview
              ? getReviewPriorityContextLine(topRecommendation?.refreshMeta)
              : ''
          }${
            topRecommendation.rankingPenaltyReason
            || topRecommendationSelectionQualityLines[0]
            || topRecommendation.biasSummary
            || '该模板会作为默认起点，你也可以在右侧改成其他模板。'
          }`}
        />
      ) : null}
      </div>

      <div className="cross-market-layout">
        <div className="cross-market-main">
          <div className="cross-market-asset-grid">
            {renderAssetSection('多头篮子', longAssets, 'long')}
            {renderAssetSection('空头篮子', shortAssets, 'short')}
          </div>

          <Card variant="borderless" className="workspace-panel cross-market-preview-card">
            <div className="cross-market-preview-grid">
              <div className="cross-market-preview-copy">
                <Text strong className="cross-market-preview-card__title">
                  {selectedTemplate?.name || draftTemplateContext?.template_name || '当前实验还未绑定模板'}
                </Text>
                <Paragraph type="secondary" style={{ margin: '10px 0 0' }}>
                  {selectedTemplate?.narrative
                    || selectedTemplate?.description
                    || draftTemplateContext?.recommendation_reason
                    || topRecommendation?.narrative
                    || '先从侧栏模板快选开始，锁定主题、约束和时间窗口，再运行跨市场实验。'}
                </Paragraph>
                <div className="cross-market-preview-copy__list">
                  {previewHighlights.map((item) => (
                    <div key={item.label} className="cross-market-sidebar-card__item">
                      <span className="cross-market-sidebar-card__item-label">{item.label}</span>
                      <span className="cross-market-sidebar-card__item-value">{item.value}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div className="cross-market-preview-baskets">
                {basketPreviewGroups.map((group) => {
                  const filledItems = group.items.filter((asset) => asset.symbol || asset.weight);
                  return (
                    <div key={group.key} className="cross-market-preview-basket">
                      <div className="cross-market-preview-basket__title">{group.title}</div>
                      {filledItems.length ? (
                        <div className="cross-market-preview-basket__tags">
                          {filledItems.map((asset) => (
                            <Tag key={`${group.key}-${asset.key}`} color={group.key === 'long' ? 'green' : 'volcano'}>
                              {asset.symbol || '待填写'}
                              {asset.asset_class ? ` · ${ASSET_CLASS_LABELS[asset.asset_class] || asset.asset_class}` : ''}
                              {asset.weight ? ` · ${formatPercentage(Number(asset.weight || 0))}` : ''}
                            </Tag>
                          ))}
                        </div>
                      ) : (
                        <Text type="secondary">{group.empty}</Text>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </Card>
        </div>

        <aside className="cross-market-sidebar">
          <Card variant="borderless" className="workspace-panel cross-market-sidebar-card cross-market-sidebar-card--overview">
            <div className="app-page-section-kicker">控制总览</div>
            <Text strong className="cross-market-sidebar-card__title">右侧保持输入，左侧专注结果</Text>
            <Paragraph type="secondary" style={{ margin: '8px 0 0' }}>
              模板快选、参数和约束都固定在侧栏里，主画布只保留篮子和运行预览，减少宽屏下的视线往返。
            </Paragraph>
            <div className="cross-market-sidebar-card__grid">
              {sidebarOverviewItems.map((item) => (
                <div key={item.label} className="cross-market-sidebar-card__item">
                  <span className="cross-market-sidebar-card__item-label">{item.label}</span>
                  <span className="cross-market-sidebar-card__item-value">{item.value}</span>
                </div>
              ))}
            </div>
            <div className="cross-market-sidebar-card__note">
              {selectedTemplate
                ? `当前模板：${selectedTemplate.name}${selectedTemplate.theme ? ` · ${selectedTemplate.theme}` : ''}`
                : '当前未锁定模板，建议先从模板快选开始。'}
            </div>
          </Card>

          <Card title="模板快选" variant="borderless" className="workspace-panel cross-market-sidebar-card">
            <div className="cross-market-template-list">
              {displayRecommendedTemplates.slice(0, 3).map((template) => (
                <div
                  key={template.id}
                  className={`cross-market-template-card${selectedTemplate?.id === template.id ? ' cross-market-template-card--active' : ''}`}
                >
                  <div className="cross-market-template-card__header">
                    <div>
                      <div className="cross-market-template-card__title">{template.name}</div>
                      <Text type="secondary">{template.driverHeadline}</Text>
                    </div>
                    <Button size="small" type={selectedTemplate?.id === template.id ? 'default' : 'primary'} onClick={() => applyTemplate(template, { useBias: true })}>
                      {selectedTemplate?.id === template.id ? '已载入' : '载入'}
                    </Button>
                  </div>
                  <Space wrap size={[6, 6]} className="cross-market-template-card__tags">
                    <Tag color={template.recommendationTone}>{template.recommendationTier}</Tag>
                    <Tag color="cyan">score {Number(template.recommendationScore || 0).toFixed(2)}</Tag>
                    {template.executionPosture ? (
                      <Tag color="lime">{template.executionPosture}</Tag>
                    ) : null}
                    {template.refreshMeta?.selectionQualityRunState?.active ? (
                      <Tag color="gold">优先重看</Tag>
                    ) : null}
                    {template.refreshMeta?.reviewContextDriven && !template.refreshMeta?.selectionQualityRunState?.active ? (
                      <Tag color="geekblue">语境切换</Tag>
                    ) : null}
                  </Space>
                  {(template.themeCore || template.themeSupport) ? (
                    <Text type="secondary" className="cross-market-template-card__line">
                      核心腿：{template.themeCore || '暂无'} · 辅助腿：{template.themeSupport || '暂无'}
                    </Text>
                  ) : null}
                  {template.recentComparisonLead ? (
                    <Text type="secondary" className="cross-market-template-card__line">
                      最近两版：{template.recentComparisonLead}
                    </Text>
                  ) : null}
                  {(template.rankingPenaltyReason || getSelectionQualityExplanationLines(template.refreshMeta)[0]) ? (
                    <Text type="secondary" className="cross-market-template-card__line">
                      {template.rankingPenaltyReason || getSelectionQualityExplanationLines(template.refreshMeta)[0]}
                    </Text>
                  ) : null}
                </div>
              ))}
            </div>
          </Card>

          <Card title="参数与模板" variant="borderless" className="workspace-panel cross-market-sidebar-card">
            <Space direction="vertical" style={{ width: '100%' }} size={14}>
              <Select
                placeholder="载入演示模板"
                loading={loadingTemplates}
                value={selectedTemplateId || undefined}
                options={templates.map((template) => ({
                  label: template.name,
                  value: template.id,
                }))}
                onChange={(value) => applyTemplate(value, { useBias: false })}
              />

              <Form layout="vertical">
                <Form.Item label="构造模式">
                  <Select
                    value={quality.construction_mode}
                    options={[
                      { value: 'equal_weight', label: '等权配置' },
                      { value: 'ols_hedge', label: '滚动 OLS 对冲' },
                    ]}
                    onChange={(value) => setQuality((prev) => ({ ...prev, construction_mode: value }))}
                  />
                </Form.Item>
                <Form.Item label="回看窗口">
                  <InputNumber
                    min={5}
                    value={parameters.lookback}
                    style={{ width: '100%' }}
                    onChange={(value) =>
                      setParameters((prev) => ({ ...prev, lookback: value || DEFAULT_PARAMETERS.lookback }))
                    }
                  />
                </Form.Item>
                <Form.Item label="入场阈值">
                  <InputNumber
                    min={0.5}
                    step={0.1}
                    value={parameters.entry_threshold}
                    style={{ width: '100%' }}
                    onChange={(value) =>
                      setParameters((prev) => ({ ...prev, entry_threshold: value || DEFAULT_PARAMETERS.entry_threshold }))
                    }
                  />
                </Form.Item>
                <Form.Item label="离场阈值">
                  <InputNumber
                    min={0.1}
                    step={0.1}
                    value={parameters.exit_threshold}
                    style={{ width: '100%' }}
                    onChange={(value) =>
                      setParameters((prev) => ({ ...prev, exit_threshold: value || DEFAULT_PARAMETERS.exit_threshold }))
                    }
                  />
                </Form.Item>
                <Form.Item label="初始资金">
                  <InputNumber
                    min={1000}
                    step={1000}
                    value={meta.initial_capital}
                    style={{ width: '100%' }}
                    onChange={(value) => setMeta((prev) => ({ ...prev, initial_capital: value || 100000 }))}
                  />
                </Form.Item>
                <Form.Item label="最少历史天数">
                  <InputNumber
                    min={10}
                    step={5}
                    value={quality.min_history_days}
                    style={{ width: '100%' }}
                    onChange={(value) => setQuality((prev) => ({ ...prev, min_history_days: value || 60 }))}
                  />
                </Form.Item>
                <Form.Item label="最小重叠比例">
                  <InputNumber
                    min={0.1}
                    max={1}
                    step={0.05}
                    value={quality.min_overlap_ratio}
                    style={{ width: '100%' }}
                    onChange={(value) => setQuality((prev) => ({ ...prev, min_overlap_ratio: value || 0.7 }))}
                  />
                </Form.Item>
                <Form.Item label="单资产上限 (%)">
                  <InputNumber
                    min={1}
                    max={100}
                    step={1}
                    value={constraints.max_single_weight}
                    style={{ width: '100%' }}
                    placeholder="可留空"
                    onChange={(value) => setConstraints((prev) => ({ ...prev, max_single_weight: value ?? null }))}
                  />
                </Form.Item>
                <Form.Item label="单资产下限 (%)">
                  <InputNumber
                    min={1}
                    max={100}
                    step={1}
                    value={constraints.min_single_weight}
                    style={{ width: '100%' }}
                    placeholder="可留空"
                    onChange={(value) => setConstraints((prev) => ({ ...prev, min_single_weight: value ?? null }))}
                  />
                </Form.Item>
                <Form.Item label="手续费 (%)">
                  <InputNumber
                    min={0}
                    step={0.01}
                    value={meta.commission}
                    style={{ width: '100%' }}
                    onChange={(value) => setMeta((prev) => ({ ...prev, commission: value ?? 0.1 }))}
                  />
                </Form.Item>
                <Form.Item label="滑点 (%)">
                  <InputNumber
                    min={0}
                    step={0.01}
                    value={meta.slippage}
                    style={{ width: '100%' }}
                    onChange={(value) => setMeta((prev) => ({ ...prev, slippage: value ?? 0.1 }))}
                  />
                </Form.Item>
                <Form.Item label="开始日期">
                  <Input
                    value={meta.start_date}
                    placeholder="YYYY-MM-DD"
                    onChange={(event) => setMeta((prev) => ({ ...prev, start_date: event.target.value }))}
                  />
                </Form.Item>
                <Form.Item label="结束日期">
                  <Input
                    value={meta.end_date}
                    placeholder="YYYY-MM-DD"
                    onChange={(event) => setMeta((prev) => ({ ...prev, end_date: event.target.value }))}
                  />
                </Form.Item>
              </Form>

              {selectedTemplateNeedsPriorityReview ? (
                <Alert
                  type="warning"
                  showIcon
                  message={`当前模板：${selectedTemplate?.name || ''} · ${getReviewPriorityTitleSuffix(selectedTemplate?.refreshMeta) || '建议优先重看'}`}
                  description={`这次运行更适合作为复核型回测，而不是普通默认模板回测。${
                    selectedTemplate?.recentComparisonLead
                      ? `最近两版：${selectedTemplate.recentComparisonLead} · `
                      : ''
                  }${
                    selectedTemplate?.refreshMeta?.selectionQualityRunState?.active
                      ? `当前保存结果已按 ${selectedTemplate?.refreshMeta?.selectionQualityRunState?.label || 'degraded'} 强度运行`
                      : selectedTemplate?.refreshMeta?.reviewContextDriven
                        ? '最近两版已发生复核语境切换'
                        : selectedTemplate?.refreshMeta?.inputReliabilityDriven
                          ? '当前整体输入可靠度已经发生明显变化'
                          : '当前主题已进入优先重看语境'
                  }${
                    selectedTemplate?.refreshMeta?.selectionQualityRunState?.baseScore || selectedTemplate?.refreshMeta?.selectionQualityRunState?.effectiveScore
                      ? ` · ${Number(selectedTemplate?.refreshMeta?.selectionQualityRunState?.baseScore || 0).toFixed(2)}→${Number(selectedTemplate?.refreshMeta?.selectionQualityRunState?.effectiveScore || 0).toFixed(2)}`
                      : ''
                  }${
                    selectedTemplate?.refreshMeta?.selectionQualityRunState?.reason
                      ? ` · ${selectedTemplate.refreshMeta.selectionQualityRunState.reason}`
                      : selectedTemplate?.refreshMeta?.reviewContextShift?.actionHint
                        ? ` · ${selectedTemplate.refreshMeta.reviewContextShift.actionHint}`
                        : selectedTemplate?.refreshMeta?.inputReliabilityShift?.actionHint
                          ? ` · ${selectedTemplate.refreshMeta.inputReliabilityShift.actionHint}`
                          : selectedTemplate?.refreshMeta?.reviewContextShift?.lead
                            ? ` · ${selectedTemplate.refreshMeta.reviewContextShift.lead}`
                            : selectedTemplate?.refreshMeta?.inputReliabilityShift?.currentLead
                              ? ` · ${selectedTemplate.refreshMeta.inputReliabilityShift.currentLead}`
                              : ''
                  }`}
                />
              ) : null}

              <div className="cross-market-parameter-actions">
                <Button icon={<ReloadOutlined />} onClick={() => setResults(null)}>
                  清空结果
                </Button>
                <Button
                  type="primary"
                  icon={<ThunderboltOutlined />}
                  loading={running}
                  disabled={!hasRunnableAssetBasket}
                  data-testid="cross-market-run-backtest"
                  onClick={handleRun}
                >
                  {runBacktestButtonLabel}
                </Button>
              </div>
            </Space>
          </Card>
        </aside>
      </div>

      {running && !results ? (
        <Card variant="borderless" className="workspace-panel">
          <div style={{ minHeight: 180, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Spin size="large" />
          </div>
        </Card>
      ) : null}

      <CrossMarketResultsSection
        results={results}
        selectedTemplate={selectedTemplate}
        meta={meta}
        quality={quality}
      />
    </div>
  );
}

export default CrossMarketBacktestPanel;
