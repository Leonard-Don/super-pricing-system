import React, { useState, useMemo, lazy, Suspense } from 'react';
import {
    Input,
    Tabs,
    Tag,
    Typography,
    Radio,
    Spin,
    Tooltip,
} from 'antd';
import {
    RadarChartOutlined,
    BarChartOutlined,
    RobotOutlined,
    SolutionOutlined,
    ExperimentOutlined,
    LineChartOutlined,
    BankOutlined,
    DashboardOutlined,
    ReloadOutlined,
} from '@ant-design/icons';
import { useMarketAnalysisData } from './market-analysis/useMarketAnalysisData';
import {
    DISPLAY_EMPTY,
    formatMetaTime,
} from './market-analysis/helpers';
import OverviewTab from './market-analysis/OverviewTab';
import TrendTab from './market-analysis/TrendTab';
import VolumeTab from './market-analysis/VolumeTab';
import SentimentTab from './market-analysis/SentimentTab';
import PatternTab from './market-analysis/PatternTab';
import FundamentalTab from './market-analysis/FundamentalTab';
import IndustryTab from './market-analysis/IndustryTab';
import RiskTab from './market-analysis/RiskTab';
import CorrelationTab from './market-analysis/CorrelationTab';

const { Title } = Typography;
const { Search } = Input;
const AIPredictionPanel = lazy(() => import('./AIPredictionPanel'));
const TAB_LABELS = {
    overview: '总览',
    trend: '趋势分析',
    volume: '量价分析',
    sentiment: '情绪分析',
    pattern: '形态识别',
    fundamental: '基本面分析',
    industry: '行业对比',
    risk: '风险评估',
    correlation: '相关性',
    prediction: 'AI 预测',
};

const MarketAnalysis = ({ symbol: propSymbol, embedMode = false }) => {
    const [symbol, setSymbol] = useState(propSymbol || 'AAPL');
    const [interval, setInterval] = useState('1d');
    const [activeTab, setActiveTab] = useState('overview');

    const {
        overviewData,
        trendData,
        volumeData,
        sentimentData,
        patternData,
        fundamentalData,
        klinesData,
        technicalData,
        sentimentHistoryData,
        industryData,
        riskData,
        correlationData,
        eventData,
        loadingTab,
        errorTab,
        tabMeta,
        beginAnalysis,
        fetchTabIfNeeded,
        refreshAnalysis,
    } = useMarketAnalysisData({ symbol, interval, propSymbol, embedMode, setSymbol, setActiveTab });

    const handleSearch = (value) => {
        if (value) {
            setSymbol(value.toUpperCase());
            beginAnalysis(value.toUpperCase(), interval);
        }
    };

    const handleIntervalChange = (e) => {
        const newInterval = e.target.value;
        setInterval(newInterval);
        beginAnalysis(symbol, newInterval);
    };

    const handleTabChange = (key) => {
        setActiveTab(key);
        fetchTabIfNeeded(key, symbol, interval);
    };

    const handleRefreshAnalysis = () => {
        refreshAnalysis(activeTab);
    };
    const activeMetaKey = activeTab === 'prediction' ? 'overview' : activeTab;
    const activeTabMeta = tabMeta[activeMetaKey];
    const activeTabLabel = TAB_LABELS[activeTab] || activeTab;
    const activeMetaSourceLabel = activeTabMeta?.source === 'cache' ? '缓存命中' : activeTabMeta?.source === 'live' ? '实时拉取' : '等待加载';
    const activeMetaTone = activeTabMeta?.source === 'cache' ? { color: '#d97706', background: 'rgba(217, 119, 6, 0.12)' } : { color: '#2563eb', background: 'rgba(37, 99, 235, 0.12)' };
    const activeMetaTimeLabel = activeTabMeta?.updatedAt ? formatMetaTime(activeTabMeta.updatedAt) : DISPLAY_EMPTY;

    // --- Tab Contents (Memoized) ---

    // 1. Overview Content
    const overviewContent = useMemo(() => (
        <OverviewTab
            loadingTab={loadingTab}
            errorTab={errorTab}
            overviewData={overviewData}
            technicalData={technicalData}
            eventData={eventData}
            symbol={symbol}
        />
    ), [loadingTab.overview, loadingTab.technical, loadingTab.events, errorTab.overview, overviewData, technicalData, eventData, symbol]); // eslint-disable-line react-hooks/exhaustive-deps

    // 2. Trend Content
    const trendContent = useMemo(() => (
        <TrendTab loadingTab={loadingTab} errorTab={errorTab} trendData={trendData} />
    ), [loadingTab.trend, errorTab.trend, trendData]); // eslint-disable-line react-hooks/exhaustive-deps

    // 3. Volume Content
    const volumeContent = useMemo(() => (
        <VolumeTab loadingTab={loadingTab} errorTab={errorTab} volumeData={volumeData} />
    ), [loadingTab.volume, errorTab.volume, volumeData]); // eslint-disable-line react-hooks/exhaustive-deps

    // 4. Sentiment Content
    const sentimentContent = useMemo(() => (
        <SentimentTab
            loadingTab={loadingTab}
            errorTab={errorTab}
            sentimentData={sentimentData}
            sentimentHistoryData={sentimentHistoryData}
        />
    ), [loadingTab.sentiment, loadingTab.sentimentHistory, errorTab.sentiment, sentimentData, sentimentHistoryData]); // eslint-disable-line react-hooks/exhaustive-deps

    // 5. Pattern Content
    const patternContent = useMemo(() => (
        <PatternTab
            loadingTab={loadingTab}
            errorTab={errorTab}
            patternData={patternData}
            klinesData={klinesData}
        />
    ), [loadingTab.pattern, errorTab.pattern, patternData, klinesData]); // eslint-disable-line react-hooks/exhaustive-deps

    // 6. Fundamental Content
    const fundamentalContent = useMemo(() => (
        <FundamentalTab loadingTab={loadingTab} errorTab={errorTab} fundamentalData={fundamentalData} />
    ), [loadingTab.fundamental, errorTab.fundamental, fundamentalData]); // eslint-disable-line react-hooks/exhaustive-deps

    // 7. Industry Comparison Content
    const industryContent = useMemo(() => (
        <IndustryTab loadingTab={loadingTab} errorTab={errorTab} industryData={industryData} />
    ), [loadingTab.industry, errorTab.industry, industryData]); // eslint-disable-line react-hooks/exhaustive-deps

    // 8. Risk Metrics Content
    const riskContent = useMemo(() => (
        <RiskTab loadingTab={loadingTab} errorTab={errorTab} riskData={riskData} />
    ), [loadingTab.risk, errorTab.risk, riskData]); // eslint-disable-line react-hooks/exhaustive-deps

    // 9. Correlation Content
    const correlationContent = useMemo(() => (
        <CorrelationTab loadingTab={loadingTab} errorTab={errorTab} correlationData={correlationData} />
    ), [loadingTab.correlation, errorTab.correlation, correlationData]); // eslint-disable-line react-hooks/exhaustive-deps

    // 资产类型识别与 Tab 可用性控制
    const getAssetType = (sym) => {
        if (!sym) return 'STOCK';
        if (sym.includes('-USD') || sym.includes('-USDT')) return 'CRYPTO';
        if (sym.includes('=F')) return 'FUTURE';
        if (sym.startsWith('^')) return 'INDEX';
        return 'STOCK';
    };

    const assetType = getAssetType(symbol);

    const isTabAvailable = (key) => {
        if (assetType === 'STOCK') return true;
        // 指数、加密货币和期货没有基本面和行业数据
        if (['fundamental', 'industry'].includes(key)) return false;
        return true;
    };

    const getTabTooltip = (key) => {
        if (isTabAvailable(key)) return '';
        if (assetType === 'CRYPTO') return '加密货币暂无此数据';
        if (assetType === 'FUTURE') return '期货暂无此数据';
        if (assetType === 'INDEX') return '指数类资产暂无此数据';
        return '暂无数据';
    };

    const tabItems = [
        {
            key: 'overview',
            label: <span><DashboardOutlined />总览</span>,
            children: overviewContent
        },
        {
            key: 'trend',
            label: <span><LineChartOutlined />趋势分析</span>,
            children: trendContent
        },
        {
            key: 'volume',
            label: <span><BarChartOutlined />量价分析</span>,
            children: volumeContent
        },
        {
            key: 'sentiment',
            label: <span><ExperimentOutlined />情绪分析</span>,
            children: sentimentContent
        },
        {
            key: 'pattern',
            label: <span><RadarChartOutlined />形态识别</span>,
            children: patternContent
        },
        {
            key: 'fundamental',
            label: (
                <Tooltip title={getTabTooltip('fundamental')}>
                    <span style={{ color: !isTabAvailable('fundamental') ? '#999' : undefined }}>
                        <SolutionOutlined />基本面分析
                    </span>
                </Tooltip>
            ),
            disabled: !isTabAvailable('fundamental'),
            children: fundamentalContent
        },
        {
            key: 'industry',
            label: (
                <Tooltip title={getTabTooltip('industry')}>
                    <span style={{ color: !isTabAvailable('industry') ? '#999' : undefined }}>
                        <BankOutlined />行业对比
                    </span>
                </Tooltip>
            ),
            disabled: !isTabAvailable('industry'),
            children: industryContent
        },
        {
            key: 'risk',
            label: <span><DashboardOutlined />风险评估</span>,
            children: riskContent
        },
        {
            key: 'correlation',
            label: <span><LineChartOutlined />相关性</span>,
            children: correlationContent
        },
        {
            key: 'prediction',
            label: <span><RobotOutlined />AI 预测</span>,
            children: (
                <Suspense fallback={<div style={{ padding: 24, textAlign: 'center' }}><Spin /></div>}>
                    <AIPredictionPanel symbol={symbol} />
                </Suspense>
            )
        }
    ];

    return (
        <div className={embedMode ? 'market-analysis market-analysis--embed' : 'market-analysis'} style={{ maxWidth: '100%', overflow: 'hidden' }}>
            <div
                style={{
                    marginBottom: embedMode ? 16 : 20,
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: embedMode ? 'flex-start' : 'center',
                    flexWrap: 'wrap',
                    gap: 12,
                }}
            >
                {embedMode ? (
                    <div className="market-analysis__embed-hero">
                        <div className="market-analysis__embed-eyebrow">Analysis Workspace</div>
                        <div className="market-analysis__embed-title-row">
                            <div className="market-analysis__embed-title">{symbol} 全维分析</div>
                            <Tag color="blue" style={{ borderRadius: 999, margin: 0, paddingInline: 10 }}>
                                {interval === '1d' ? '日线' : interval === '1wk' ? '周线' : interval === '1mo' ? '月线' : '4小时'}
                            </Tag>
                        </div>
                        <div className="market-analysis__embed-subtitle">
                            保留趋势、量价、情绪、形态、风险、相关性和 AI 预测分析，适合在实时详情弹窗内快速切换。
                        </div>
                        <div className="market-analysis__embed-meta">
                            <div className="market-analysis__embed-chip">当前标签 {activeTabLabel}</div>
                            {overviewData?.summary?.score !== undefined && (
                                <div className="market-analysis__embed-chip">综合评分 {overviewData.summary.score}</div>
                            )}
                            <div
                                className="market-analysis__embed-chip"
                                style={{
                                    color: activeMetaTone.color,
                                    background: activeMetaTone.background,
                                }}
                            >
                                数据来源 {activeMetaSourceLabel}
                            </div>
                            <div className="market-analysis__embed-chip">最近刷新 {activeMetaTimeLabel}</div>
                        </div>
                    </div>
                ) : (
                    <Title level={3}>全维市场分析</Title>
                )}

                <div className={embedMode ? 'market-analysis__controls market-analysis__controls--embed' : 'market-analysis__controls'}>
                    {!embedMode && (
                        <Search
                            placeholder="输入股票代码 (如: AAPL)"
                            allowClear
                            enterButton="分析"
                            size="large"
                            onSearch={handleSearch}
                            style={{ width: 300 }}
                            loading={!!loadingTab.overview}
                            defaultValue={symbol}
                        />
                    )}
                    <Radio.Group value={interval} onChange={handleIntervalChange} buttonStyle="solid" size={embedMode ? 'small' : 'middle'}>
                        <Radio.Button value="1d">日线</Radio.Button>
                        <Radio.Button value="1wk">周线</Radio.Button>
                        <Radio.Button value="1mo">月线</Radio.Button>
                        <Radio.Button value="4h">4小时</Radio.Button>
                    </Radio.Group>
                    <button
                        type="button"
                        onClick={handleRefreshAnalysis}
                        style={{
                            border: '1px solid var(--border-color)',
                            background: 'var(--bg-secondary)',
                            color: 'var(--text-primary)',
                            borderRadius: 999,
                            padding: embedMode ? '6px 12px' : '8px 14px',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 8,
                            cursor: 'pointer',
                            fontWeight: 600,
                        }}
                    >
                        <ReloadOutlined />
                        刷新分析
                    </button>
                </div>
            </div>
            <div
                style={{
                    display: 'flex',
                    flexWrap: 'wrap',
                    gap: 10,
                    marginBottom: 14,
                    color: 'var(--text-secondary)',
                    fontSize: 13,
                }}
            >
                <span>当前分析：{activeTabLabel}</span>
                <span>数据来源：{activeMetaSourceLabel}</span>
                <span>最近刷新：{activeMetaTimeLabel}</span>
            </div>

            <div className={embedMode ? 'market-analysis__tabs-shell market-analysis__tabs-shell--embed' : 'market-analysis__tabs-shell'}>
                <Tabs
                    activeKey={activeTab}
                    onChange={handleTabChange}
                    type="card"
                    size={embedMode ? 'small' : 'middle'}
                    destroyOnHidden
                    items={tabItems}
                />
            </div>

            <style>{`
                .market-analysis__controls {
                    display: flex;
                    align-items: center;
                    margin-left: auto;
                    gap: 12px;
                    flex-wrap: wrap;
                }

                .market-analysis__embed-hero {
                    display: grid;
                    gap: 8px;
                    padding: 16px 18px;
                    border-radius: 20px;
                    background: linear-gradient(135deg, rgba(14, 165, 233, 0.10), rgba(59, 130, 246, 0.05));
                    border: 1px solid color-mix(in srgb, var(--accent-primary) 16%, var(--border-color) 84%);
                    max-width: min(100%, 720px);
                }

                .market-analysis__embed-eyebrow {
                    font-size: 11px;
                    letter-spacing: 0.16em;
                    text-transform: uppercase;
                    font-weight: 700;
                    color: var(--text-secondary);
                }

                .market-analysis__embed-title-row {
                    display: flex;
                    align-items: center;
                    gap: 10px;
                    flex-wrap: wrap;
                }

                .market-analysis__embed-title {
                    font-size: 20px;
                    font-weight: 800;
                    color: var(--text-primary);
                }

                .market-analysis__embed-subtitle {
                    font-size: 13px;
                    line-height: 1.7;
                    color: var(--text-secondary);
                }

                .market-analysis__embed-meta {
                    display: flex;
                    gap: 10px;
                    flex-wrap: wrap;
                }

                .market-analysis__embed-chip {
                    padding: 7px 12px;
                    border-radius: 999px;
                    font-size: 12px;
                    color: var(--text-secondary);
                    background: color-mix(in srgb, var(--bg-secondary) 86%, white 14%);
                    border: 1px solid var(--border-color);
                }

                .market-analysis__tabs-shell--embed .ant-tabs-nav {
                    margin-bottom: 18px;
                }

                .market-analysis__tabs-shell--embed .ant-tabs-tab {
                    border-radius: 999px !important;
                    padding-inline: 14px !important;
                }

                .market-analysis__tabs-shell--embed .ant-tabs-content-holder {
                    padding-top: 2px;
                }

                .market-analysis--embed .ant-card,
                .market-analysis--embed .analysis-card,
                .market-analysis--embed .glass-card {
                    border-radius: 22px;
                    border: 1px solid color-mix(in srgb, var(--border-color) 82%, white 18%);
                    box-shadow: 0 14px 34px rgba(15, 23, 42, 0.06);
                    background: linear-gradient(180deg, color-mix(in srgb, var(--bg-secondary) 92%, white 8%) 0%, var(--bg-secondary) 100%);
                }

                .market-analysis--embed .ant-card-head {
                    border-bottom: 1px solid color-mix(in srgb, var(--border-color) 84%, white 16%);
                    min-height: 54px;
                }

                .market-analysis--embed .ant-card-head-title {
                    font-weight: 700;
                    color: var(--text-primary);
                }

                .market-analysis--embed .ant-card-body {
                    padding: 18px;
                }

                .market-analysis--embed .ant-alert {
                    border-radius: 18px;
                    border: 1px solid color-mix(in srgb, var(--border-color) 82%, white 18%);
                    box-shadow: 0 10px 24px rgba(15, 23, 42, 0.05);
                }

                .market-analysis--embed .ant-statistic {
                    padding: 14px 16px;
                    border-radius: 18px;
                    background: color-mix(in srgb, var(--bg-primary) 88%, white 12%);
                    border: 1px solid color-mix(in srgb, var(--border-color) 84%, white 16%);
                }

                .market-analysis--embed .ant-statistic-title {
                    color: var(--text-secondary);
                    font-size: 12px;
                }

                .market-analysis--embed .ant-statistic-content {
                    color: var(--text-primary);
                }

                .market-analysis--embed .ant-list-item {
                    border-color: color-mix(in srgb, var(--border-color) 84%, white 16%) !important;
                }

                .market-analysis--embed .ant-tag {
                    border-radius: 999px;
                }

                .market-analysis--embed .ant-table-wrapper {
                    border-radius: 18px;
                    overflow: hidden;
                    border: 1px solid color-mix(in srgb, var(--border-color) 84%, white 16%);
                    background: color-mix(in srgb, var(--bg-primary) 90%, white 10%);
                }

                .market-analysis--embed .ant-table-thead > tr > th {
                    background: color-mix(in srgb, var(--bg-secondary) 84%, white 16%);
                    color: var(--text-secondary);
                    font-size: 12px;
                    font-weight: 700;
                }

                .market-analysis--embed .ant-table-tbody > tr > td {
                    background: transparent;
                }

                .market-analysis--embed .ant-empty {
                    padding: 20px 0;
                }

                .market-analysis--embed .radar-chart-container {
                    border-radius: 18px;
                    background: color-mix(in srgb, var(--bg-primary) 88%, white 12%);
                    border: 1px solid color-mix(in srgb, var(--border-color) 84%, white 16%);
                    padding: 12px;
                }

                @media (max-width: 640px) {
                    .market-analysis__controls--embed {
                        width: 100%;
                        margin-left: 0;
                    }

                    .market-analysis__controls--embed .ant-radio-group {
                        width: 100%;
                        display: grid;
                        grid-template-columns: repeat(2, minmax(0, 1fr));
                    }

                    .market-analysis__controls--embed .ant-radio-button-wrapper {
                        text-align: center;
                    }
                }
            `}</style>
        </div>
    );
};

export default MarketAnalysis;
