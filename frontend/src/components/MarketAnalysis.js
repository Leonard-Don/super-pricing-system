import React, { useState, useMemo, useCallback, lazy, Suspense } from 'react';
import {
    Card,
    Input,
    Tabs,
    Row,
    Col,
    Tag,
    List,
    Typography,
    Progress,
    Alert,
    Space,
    Table,
    Statistic,
    Empty,
    Divider,
    Radio,
    Spin,
    Popover
} from 'antd';
import {
    RiseOutlined,
    FallOutlined,
    WarningOutlined,
    RadarChartOutlined,
    BarChartOutlined,
    ThunderboltOutlined,
    RobotOutlined,
    SolutionOutlined,
    InfoCircleOutlined,
    ExperimentOutlined,
    FundOutlined,
    LineChartOutlined,
    BankOutlined,
    CalendarOutlined,
    DollarCircleOutlined,
    NotificationOutlined,
    DashboardOutlined,
    ReloadOutlined,
} from '@ant-design/icons';
import {
    Radar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
    ComposedChart, ReferenceArea, ReferenceLine, Scatter,
    ResponsiveContainer,
    Tooltip as RechartsTooltip,
    BarChart,
    Bar,
    XAxis,
    YAxis,
    Cell,
    CartesianGrid,
    Line,
    LineChart,
} from 'recharts';
import { useMarketAnalysisData } from './market-analysis/useMarketAnalysisData';
import {
    DISPLAY_EMPTY,
    formatDisplayNumber,
    formatDisplayPercent,
    formatMetaTime,
    normalizeVolumeTrend,
} from './market-analysis/helpers';
import OverviewTab from './market-analysis/OverviewTab';
import TrendTab from './market-analysis/TrendTab';
import VolumeTab from './market-analysis/VolumeTab';
import SentimentTab from './market-analysis/SentimentTab';
import PatternTab from './market-analysis/PatternTab';

import { Tooltip } from 'antd'; // Careful, we have RechartsTooltip imported as well.

const { Title, Text } = Typography;
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
    const fundamentalContent = useMemo(() => {
        if (loadingTab.fundamental && !fundamentalData) {
            return <div style={{ padding: 24, textAlign: 'center' }}><Spin /></div>;
        }
        if (errorTab.fundamental) {
            return <Alert message="错误" description={errorTab.fundamental} type="error" showIcon />;
        }
        if (!fundamentalData) return <Empty description="暂无基本面数据" />;

        const fundamental_analysis = fundamentalData.fundamental_analysis || fundamentalData;
        if (!fundamental_analysis) return <Empty description="暂无基本面数据" />;

        const { metrics, valuation, financial_health, growth, summary } = fundamental_analysis;

        const formatLargeNumber = (num) => {
            if (!num) return DISPLAY_EMPTY;
            if (num > 1e12) return (num / 1e12).toFixed(2) + '万亿';
            if (num > 1e8) return (num / 1e8).toFixed(2) + '亿';
            return num.toLocaleString();
        };

        const FUNDAMENTAL_STATUS_MAP = {
            'fair_value': '合理估值', 'undervalued': '低估', 'overvalued': '高估',
            'stable': '稳定', 'moderate': '适中', 'strong': '强劲', 'weak': '弱',
            'healthy': '健康', 'unhealthy': '不健康',
            'high_growth': '高增长', 'low_growth': '低增长', 'negative_growth': '负增长',
            'good': '良好', 'poor': '较差', 'excellent': '优秀',
        };

        const ANALYST_RATING_MAP = {
            'strong_buy': '强力买入', 'buy': '买入', 'hold': '持有',
            'sell': '卖出', 'strong_sell': '强力卖出',
            'outperform': '跑赢大盘', 'underperform': '跑输大盘',
        };

        const translateStatus = (s) => FUNDAMENTAL_STATUS_MAP[s?.toLowerCase?.()] || s;
        const translateRating = (r) => ANALYST_RATING_MAP[r?.toLowerCase?.()?.replace(/\s+/g, '_')] || r;

        const renderScore = (item) => {
            if (!item) return null;
            let color = '#faad14';
            if (item.score >= 70) color = '#52c41a';
            if (item.score <= 30) color = '#ff4d4f';
            return <Tag color={color} style={{ marginLeft: 8 }}>{translateStatus(item.status)}</Tag>;
        };

        return (
            <Row gutter={[16, 16]}>
                <Col span={24}>
                    <Alert
                        message="基本面概览"
                        description={summary}
                        type="info"
                        showIcon
                        icon={<SolutionOutlined />}
                        style={{ marginBottom: 16 }}
                    />
                </Col>

                <Col xs={24} md={8}>
                    <Card title="估值指标" extra={renderScore(valuation)}>
                        <Statistic title="市盈率 (PE)" value={formatDisplayNumber(metrics.pe_ratio)} suffix={metrics.pe_ratio !== null && metrics.pe_ratio !== undefined ? 'x' : ''} />
                        <div style={{ marginTop: 16 }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                <Text type="secondary">PEG:</Text>
                                <Text>{formatDisplayNumber(metrics.peg_ratio)}</Text>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8 }}>
                                <Text type="secondary">市净率 (PB):</Text>
                                <Text>{formatDisplayNumber(metrics.price_to_book)}</Text>
                            </div>
                        </div>
                    </Card>
                </Col>

                <Col xs={24} md={8}>
                    <Card title="财务健康" extra={renderScore(financial_health)}>
                        <Statistic title="流动比率" value={formatDisplayNumber(metrics.current_ratio)} />
                        <div style={{ marginTop: 16 }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                <Text type="secondary">负债权益比:</Text>
                                <Text>{formatDisplayPercent(metrics.debt_to_equity)}</Text>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8 }}>
                                <Text type="secondary">利润率:</Text>
                                <Text>{formatDisplayPercent(metrics.profit_margin, 2, true)}</Text>
                            </div>
                        </div>
                    </Card>
                </Col>

                <Col xs={24} md={8}>
                    <Card title="增长能力" extra={renderScore(growth)}>
                        <Statistic
                            title="营收增长"
                            value={metrics.revenue_growth !== null && metrics.revenue_growth !== undefined ? Number((metrics.revenue_growth * 100).toFixed(2)) : undefined}
                            precision={2}
                            valueStyle={{ color: metrics.revenue_growth > 0 ? '#3f8600' : '#cf1322' }}
                            prefix={metrics.revenue_growth > 0 ? <RiseOutlined /> : <FallOutlined />}
                            suffix="%"
                        />
                        <div style={{ marginTop: 16 }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                <Text type="secondary">盈利增长:</Text>
                                <Text type={metrics.earnings_growth > 0 ? 'success' : 'danger'}>
                                    {formatDisplayPercent(metrics.earnings_growth, 2, true)}
                                </Text>
                            </div>
                        </div>
                    </Card>
                </Col>

                <Col span={24}>
                    <Card title="公司信息">
                        <Row gutter={[24, 24]}>
                            <Col span={8}>
                                <Statistic title="总市值" value={formatLargeNumber(metrics.market_cap)} />
                            </Col>
                            <Col span={8}>
                                <div className="ant-statistic-title">所属板块</div>
                                <div className="ant-statistic-content" style={{ fontSize: 20 }}>{metrics.sector || DISPLAY_EMPTY}</div>
                            </Col>
                            <Col span={8}>
                                <div className="ant-statistic-title">行业</div>
                                <div className="ant-statistic-content" style={{ fontSize: 20 }}>{metrics.industry || DISPLAY_EMPTY}</div>
                            </Col>
                            <Col span={8}>
                                <div className="ant-statistic-title">分析师评级</div>
                                <div className="ant-statistic-content" style={{ fontSize: 20 }}>
                                    {metrics.analyst_rating ? translateRating(metrics.analyst_rating) : DISPLAY_EMPTY}
                                </div>
                            </Col>
                            <Col span={8}>
                                <Statistic title="目标价" value={metrics.target_price} prefix="$" precision={2} />
                            </Col>
                            <Col span={8}>
                                <Statistic title="52周最高" value={metrics['52w_high']} prefix="$" precision={2} />
                            </Col>
                        </Row>
                    </Card>
                </Col>
            </Row>
        );
    }, [loadingTab.fundamental, errorTab.fundamental, fundamentalData]);

    // 7. Industry Comparison Content
    const industryContent = useMemo(() => {
        if (loadingTab.industry && !industryData) {
            return <div style={{ padding: 24, textAlign: 'center' }}><Spin /></div>;
        }
        if (errorTab.industry) {
            return <Alert message="错误" description={errorTab.industry} type="error" showIcon />;
        }
        if (!industryData) return <Empty description="暂无行业对比数据" />;

        const { target, peers, industry_avg, industry, sector } = industryData;

        const columns = [
            { title: '股票', dataIndex: 'symbol', key: 'symbol', render: (t, r) => <Text strong={r.symbol === target?.symbol}>{t}</Text> },
            { title: '名称', dataIndex: 'name', key: 'name', ellipsis: true },
            { title: 'PE', dataIndex: 'pe_ratio', key: 'pe_ratio', render: v => formatDisplayNumber(v) },
            { title: '营收增长', dataIndex: 'revenue_growth', key: 'revenue_growth', render: v => formatDisplayPercent(v) },
            { title: '利润率', dataIndex: 'profit_margin', key: 'profit_margin', render: v => formatDisplayPercent(v) },
        ];

        const tableData = target ? [target, ...(peers || [])] : (peers || []);

        return (
            <Row gutter={[16, 16]}>
                <Col span={24}>
                    <Alert
                        message={`行业: ${industry || DISPLAY_EMPTY} | 板块: ${sector || DISPLAY_EMPTY}`}
                        description={`${target?.symbol || DISPLAY_EMPTY} 在同行业中 PE 排名第 ${target?.pe_rank || DISPLAY_EMPTY} 位，增长排名第 ${target?.growth_rank || DISPLAY_EMPTY} 位`}
                        type="info"
                        showIcon
                        icon={<BankOutlined />}
                    />
                </Col>
                <Col xs={24} md={8}>
                    <Card title="行业均值">
                        <Statistic title="平均 PE" value={formatDisplayNumber(industry_avg?.pe_ratio)} />
                        <Statistic title="平均增长率" value={formatDisplayPercent(industry_avg?.revenue_growth)} style={{ marginTop: 16 }} />
                        <Statistic title="平均利润率" value={formatDisplayPercent(industry_avg?.profit_margin)} style={{ marginTop: 16 }} />
                    </Card>
                </Col>
                <Col xs={24} md={16}>
                    <Card title="同行业公司对比">
                        <Table
                            dataSource={tableData}
                            columns={columns}
                            rowKey="symbol"
                            pagination={false}
                            size="small"
                        />
                    </Card>
                </Col>
            </Row>
        );
    }, [loadingTab.industry, errorTab.industry, industryData]);

    // 8. Risk Metrics Content
    const riskContent = useMemo(() => {
        if (loadingTab.risk && !riskData) {
            return <div style={{ padding: 24, textAlign: 'center' }}><Spin /></div>;
        }
        if (errorTab.risk) {
            return <Alert message="错误" description={errorTab.risk} type="error" showIcon />;
        }
        if (!riskData) return <Empty description="暂无风险评估数据" />;

        const riskLevelText = { very_high: '极高', high: '高', medium: '中等', low: '低', very_low: '极低' };

        return (
            <Row gutter={[16, 16]}>
                <Col span={24}>
                    <Alert
                        message={`风险等级: ${riskLevelText[riskData.risk_level] || riskData.risk_level}`}
                        description={riskData.risk_description}
                        type={riskData.risk_level === 'low' || riskData.risk_level === 'very_low' ? 'success' :
                            riskData.risk_level === 'medium' ? 'warning' : 'error'}
                        showIcon
                        icon={<DashboardOutlined />}
                    />
                </Col>
                <Col xs={24} md={8}>
                    <Card title="风险价值 (VaR)">
                        <Statistic
                            title="95% VaR (日度)"
                            value={riskData.var_95}
                            suffix="%"
                            valueStyle={{ color: riskData.var_95 < -5 ? '#ff4d4f' : '#faad14' }}
                        />
                        <Statistic
                            title="99% VaR (日度)"
                            value={riskData.var_99}
                            suffix="%"
                            style={{ marginTop: 16 }}
                            valueStyle={{ color: riskData.var_99 < -8 ? '#ff4d4f' : '#faad14' }}
                        />
                    </Card>
                </Col>
                <Col xs={24} md={8}>
                    <Card title="回撤与波动">
                        <Statistic
                            title="最大回撤"
                            value={riskData.max_drawdown}
                            suffix="%"
                            valueStyle={{ color: riskData.max_drawdown < -30 ? '#ff4d4f' : '#faad14' }}
                        />
                        <Statistic
                            title="年化波动率"
                            value={riskData.annual_volatility}
                            suffix="%"
                            style={{ marginTop: 16 }}
                        />
                    </Card>
                </Col>
                <Col xs={24} md={8}>
                    <Card title="风险调整收益">
                        <Statistic
                            title="夏普比率"
                            value={riskData.sharpe_ratio}
                            valueStyle={{ color: riskData.sharpe_ratio > 1 ? '#52c41a' : riskData.sharpe_ratio < 0 ? '#ff4d4f' : '#faad14' }}
                        />
                        <Statistic
                            title="索提诺比率"
                            value={riskData.sortino_ratio}
                            style={{ marginTop: 16 }}
                            valueStyle={{ color: riskData.sortino_ratio > 1 ? '#52c41a' : '#faad14' }}
                        />
                    </Card>
                </Col>
                <Col xs={24} md={12}>
                    <Card title="收益与Beta">
                        <Row gutter={16}>
                            <Col span={12}>
                                <Statistic
                                    title="年化收益率"
                                    value={riskData.annual_return}
                                    suffix="%"
                                    valueStyle={{ color: riskData.annual_return > 0 ? '#52c41a' : '#ff4d4f' }}
                                />
                            </Col>
                            <Col span={12}>
                                <Statistic title="Beta" value={riskData.beta} />
                            </Col>
                        </Row>
                    </Card>
                </Col>
                <Col xs={24} md={12}>
                    <Card title="最大回撤区间">
                        <Text>
                            从 {riskData.max_drawdown_period?.start || DISPLAY_EMPTY} 到 {riskData.max_drawdown_period?.end || DISPLAY_EMPTY}
                        </Text>
                        <div style={{ marginTop: 8 }}>
                            <Text type="secondary">分析数据点: {riskData.data_points ?? DISPLAY_EMPTY} 个</Text>
                        </div>
                    </Card>
                </Col>
            </Row>
        );
    }, [loadingTab.risk, errorTab.risk, riskData]);

    // 9. Correlation Content
    const correlationContent = useMemo(() => {
        if (loadingTab.correlation && !correlationData) {
            return <div style={{ padding: 24, textAlign: 'center' }}><Spin /></div>;
        }
        if (errorTab.correlation) {
            return <Alert message="错误" description={errorTab.correlation} type="error" showIcon />;
        }
        if (!correlationData) return <Empty description="暂无相关性分析数据" />;

        // API 返回格式: { correlation_matrix: [{symbol1, symbol2, correlation}, ...], symbols: [...] }
        const rawMatrix = correlationData.correlation_matrix || [];
        const symbols = correlationData.symbols || [];

        // 构建相关性查找表
        const correlationMap = {};
        rawMatrix.forEach(item => {
            if (!correlationMap[item.symbol1]) correlationMap[item.symbol1] = {};
            correlationMap[item.symbol1][item.symbol2] = item.correlation;
        });

        const getCorrelationColor = (value) => {
            if (value === undefined || value === null) return '#d9d9d9';
            if (value >= 0.7) return '#52c41a';
            if (value >= 0.4) return '#faad14';
            if (value >= 0) return '#d9d9d9';
            if (value >= -0.4) return '#ffa39e';
            return '#ff4d4f';
        };

        const columns = [
            { title: '', dataIndex: 'symbol', key: 'symbol', fixed: 'left', width: 80 },
            ...symbols.map(s => ({
                title: s,
                dataIndex: s,
                key: s,
                width: 80,
                render: (v) => (
                    <div style={{
                        background: getCorrelationColor(v),
                        padding: '4px 8px',
                        borderRadius: 4,
                        textAlign: 'center',
                        color: Math.abs(v || 0) > 0.5 ? '#fff' : '#000'
                    }}>
                        {v !== undefined ? v.toFixed(2) : '-'}
                    </div>
                )
            }))
        ];

        const tableData = symbols.map(s1 => {
            const row = { symbol: s1 };
            symbols.forEach(s2 => {
                row[s2] = correlationMap[s1]?.[s2];
            });
            return row;
        });

        return (
            <Row gutter={[16, 16]}>
                <Col span={24}>
                    <Alert
                        message="股票相关性分析"
                        description="显示选定股票之间的价格走势相关性。相关系数范围 -1 到 1，正值表示正相关，负值表示负相关。"
                        type="info"
                        showIcon
                        icon={<LineChartOutlined />}
                    />
                </Col>
                <Col span={24}>
                    <Card title="相关性矩阵">
                        <Table
                            dataSource={tableData}
                            columns={columns}
                            rowKey="symbol"
                            pagination={false}
                            scroll={{ x: 'max-content' }}
                            size="small"
                        />
                    </Card>
                </Col>
                <Col span={24}>
                    <Card title="相关性图例">
                        <Space>
                            <Tag color="#52c41a">强正相关 (≥0.7)</Tag>
                            <Tag color="#faad14">中等正相关 (0.4~0.7)</Tag>
                            <Tag color="#d9d9d9">弱相关 (0.0~0.4)</Tag>
                            <Tag color="#ffa39e">中等负相关 (-0.4~0)</Tag>
                            <Tag color="#ff4d4f">强负相关 (≤-0.4)</Tag>
                        </Space>
                    </Card>
                </Col>
            </Row>
        );
    }, [loadingTab.correlation, errorTab.correlation, correlationData]);

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
