
import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Card, Spin, Empty, Typography, Tag, Row, Col, Statistic, message, Button, Progress, Slider, Grid } from 'antd';
import {
    RiseOutlined,
    FallOutlined,
    ReloadOutlined,
    FireOutlined,
    DashboardOutlined,
    BarChartOutlined,
    BgColorsOutlined,
} from '@ant-design/icons';
import { getIndustryHeatmap, getIndustryHeatmapHistory } from '../services/api';
import { activateOnEnterOrSpace } from './industry/industryShared';
import { squarify } from './industry/treemapLayout';
import { matchesIndustrySearch } from './industry/heatmapSearchHelpers';
import IndustryHeatmapControls from './industry/IndustryHeatmapControls';
import IndustryHeatmapTile from './industry/IndustryHeatmapTile';
import {
    HEATMAP_SURFACE,
    HEATMAP_POSITIVE,
    HEATMAP_NEGATIVE,
    HEATMAP_WARNING,
    HEATMAP_LIVE_REQUEST_TIMEOUT_MS,
    HEATMAP_HISTORY_FALLBACK_TIMEOUT_MS,
} from './industry/heatmapStyles';

const { Text } = Typography;
const { useBreakpoint } = Grid;

export const buildFallbackHeatmapPayload = (historyResponse, timeframe) => {
    const historyItems = Array.isArray(historyResponse?.items) ? historyResponse.items : [];
    const matchingItem = historyItems.find(
        (item) => Number(item?.days || 0) === Number(timeframe || 0) && Array.isArray(item?.industries) && item.industries.length > 0
    );
    const fallbackItem = matchingItem || historyItems.find((item) => Array.isArray(item?.industries) && item.industries.length > 0);

    if (!fallbackItem) {
        return null;
    }

    return {
        industries: fallbackItem.industries || [],
        max_value: fallbackItem.max_value ?? 0,
        min_value: fallbackItem.min_value ?? 0,
        update_time: fallbackItem.update_time || fallbackItem.captured_at || '',
    };
};

// ========================================
// IndustryHeatmap 组件
// ========================================

/**
 * 行业热力图组件
 * 使用 Squarified Treemap 展示各行业涨跌幅，方块大小反映市值
 */
const IndustryHeatmap = ({
    onIndustryClick,
    onDataLoad,
    onLeadingStockClick,
    replaySnapshot = null,
    marketCapFilter = 'all',
    onClearMarketCapFilter,
    onSelectMarketCapFilter,
    timeframeValue,
    sizeMetricValue,
    colorMetricValue,
    displayCountValue,
    searchTermValue,
    onTimeframeChange,
    onSizeMetricChange,
    onColorMetricChange,
    onDisplayCountChange,
    onSearchTermChange,
    legendRangeValue,
    onLegendRangeChange,
    focusControlKey,
    showStats = true,
    onToggleFullscreen,
    isFullscreen = false,
}) => {
    const screens = useBreakpoint();
    const isCompactMobile = !screens.md;
    const [refreshSec, setRefreshSec] = useState(60);
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [loadSource, setLoadSource] = useState('');
    const [containerNode, setContainerNode] = useState(null);
    const [containerSize, setContainerSize] = useState({ width: 800, height: 450 });
    const [searchTerm, setSearchTerm] = useState('');
    const [displayCount, setDisplayCount] = useState(30);
    const [timeframe, setTimeframe] = useState(1); // 新增时间维度

    // 视图状态
    const [sizeMetric, setSizeMetric] = useState('market_cap'); // 方块大小: market_cap, turnover, net_inflow
    const [colorMetric, setColorMetric] = useState('change_pct'); // 颜色含义: change_pct, net_inflow_ratio, turnover_rate

    // AbortController refs
    const loadDataAbortRef = useRef(null);

    useEffect(() => {
        if (!focusControlKey) return undefined;
        const selectorMap = {
            market_cap_filter: '.heatmap-control-market-cap-filter',
            timeframe: '.heatmap-control-timeframe',
            size_metric: '.heatmap-control-size-metric',
            color_metric: '.heatmap-control-color-metric',
            display_count: '.heatmap-control-display-count',
            search: '.heatmap-control-search',
        };
        const timeoutId = window.setTimeout(() => {
            const node = document.querySelector(selectorMap[focusControlKey]);
            if (node) {
                node.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' });
                const focusTarget = node.querySelector('input, button, .ant-select-selector');
                if (focusTarget?.focus) {
                    focusTarget.focus();
                }
            }
        }, 120);
        return () => window.clearTimeout(timeoutId);
    }, [focusControlKey]);

    useEffect(() => {
        if (timeframeValue != null) {
            setTimeframe(timeframeValue);
        }
    }, [timeframeValue]);

    useEffect(() => {
        if (sizeMetricValue) {
            setSizeMetric(sizeMetricValue);
        }
    }, [sizeMetricValue]);

    useEffect(() => {
        if (colorMetricValue) {
            setColorMetric(colorMetricValue);
        }
    }, [colorMetricValue]);

    useEffect(() => {
        if (displayCountValue != null) {
            setDisplayCount(displayCountValue);
        }
    }, [displayCountValue]);

    useEffect(() => {
        if (typeof searchTermValue === 'string') {
            setSearchTerm(searchTermValue);
        }
    }, [searchTermValue]);

    useEffect(() => {
        if (!replaySnapshot?.data) return undefined;
        if (loadDataAbortRef.current) {
            loadDataAbortRef.current.abort();
        }
        setError(null);
        setLoading(false);
        setLoadSource('replay');
        setData(replaySnapshot.data);
        return undefined;
    }, [replaySnapshot]);

    // 响应式容器尺寸监听
    useEffect(() => {
        if (!containerNode) return;

        const updateSize = () => {
            const { width } = containerNode.getBoundingClientRect();
            if (width > 0) {
                // Finding the "Golden" Aspect Ratio for Squarified Treemap:
                // 1.0 causes a horizontal strip at the bottom for Top 30 due to data distribution.
                // 0.6 causes a vertical strip on the right.
                // 0.8 is the balanced sweet spot to keep blocks squarish for a 30-item set.
                // For 'All' (displayCount = 0) and 'Top 50', we use 1.0 for maximum vertical expansion.
                const count = displayCount > 0 ? displayCount : 100;
                const ratio = count > 35 ? 1.0 : 0.8;
                setContainerSize({
                    width: Math.max(width - 2, 300),
                    height: Math.max(Math.round(width * ratio), 320)
                });
            }
        };

        const observer = new ResizeObserver(updateSize);
        observer.observe(containerNode);

        // Initial update
        updateSize();

        return () => observer.disconnect();
    }, [containerNode, displayCount]);

    const loadHistoryFallback = useCallback(async (currentAbort, reason = 'error') => {
        try {
            const historyResponse = await getIndustryHeatmapHistory(
                { limit: 6, days: timeframe },
                {
                    signal: currentAbort.signal,
                    timeout: HEATMAP_HISTORY_FALLBACK_TIMEOUT_MS,
                }
            );
            if (loadDataAbortRef.current !== currentAbort) return false;

            const fallbackPayload = buildFallbackHeatmapPayload(historyResponse, timeframe);
            if (!fallbackPayload?.industries?.length) {
                return false;
            }

            setData(fallbackPayload);
            setError(null);
            setLoadSource('history');
            onDataLoad?.(fallbackPayload);
            message.warning(
                reason === 'empty'
                    ? '行业热力图暂时无实时结果，已切换到最近快照'
                    : '行业热力图实时链路异常，已切换到最近快照'
            );
            return true;
        } catch (fallbackError) {
            if (fallbackError?.name === 'CanceledError') {
                return false;
            }
            if (loadDataAbortRef.current !== currentAbort) {
                return false;
            }
            console.error('Failed to load industry heatmap history fallback:', fallbackError);
            return false;
        }
    }, [onDataLoad, timeframe]);

    // 加载热力图数据
    const loadData = useCallback(async () => {
        if (replaySnapshot?.data) {
            setData(replaySnapshot.data);
            setLoading(false);
            setError(null);
            setLoadSource('replay');
            return;
        }
        if (loadDataAbortRef.current) {
            loadDataAbortRef.current.abort();
        }
        const currentAbort = new AbortController();
        loadDataAbortRef.current = currentAbort;

        let isCanceled = false;
        try {
            setLoading(true);
            setError(null);
            setLoadSource('');
            const result = await getIndustryHeatmap(timeframe, {
                signal: currentAbort.signal,
                timeout: HEATMAP_LIVE_REQUEST_TIMEOUT_MS,
            });
            if (loadDataAbortRef.current !== currentAbort) return;
            if (!result?.industries?.length) {
                const usedFallback = await loadHistoryFallback(currentAbort, 'empty');
                if (usedFallback) {
                    return;
                }
            }
            setData(result);
            setLoadSource('live');
            onDataLoad?.(result);
        } catch (err) {
            if (err.name === 'CanceledError') {
                isCanceled = true;
                return;
            }
            if (loadDataAbortRef.current !== currentAbort) return;
            console.error('Failed to load industry heatmap:', err);
            const usedFallback = await loadHistoryFallback(currentAbort, 'error');
            if (usedFallback) {
                return;
            }
            setError(err.userMessage || '加载行业数据失败');
            setLoadSource('');
            message.error('加载行业数据失败');
        } finally {
            if (!isCanceled && loadDataAbortRef.current === currentAbort) {
                setLoading(false);
            }
        }
    }, [loadHistoryFallback, onDataLoad, replaySnapshot, timeframe]);

    useEffect(() => {
        if (replaySnapshot?.data) {
            return () => {
                if (loadDataAbortRef.current) {
                    loadDataAbortRef.current.abort();
                }
            };
        }
        loadData();
        
        return () => {
            if (loadDataAbortRef.current) {
                loadDataAbortRef.current.abort();
            }
        };
    }, [loadData, replaySnapshot]);

    // 自动刷新
    useEffect(() => {
        if (replaySnapshot?.data) return undefined;
        if (refreshSec > 0) {
            const timer = setInterval(loadData, refreshSec * 1000);
            return () => clearInterval(timer);
        }
    }, [refreshSec, loadData, replaySnapshot]);

    // 红涨绿跌渐变色计算（共用逻辑）
    const redGreenGradient = useCallback((value, absMax) => {
        if (value === 0) return '#555555';
        const clampedMax = Math.max(absMax, 2);
        const intensity = Math.min(Math.abs(value) / clampedMax, 1);
        const t = Math.pow(intensity, 0.7);
        if (value > 0) {
            return `rgb(${Math.round(160 + t * 75)}, ${Math.round(80 - t * 65)}, ${Math.round(70 - t * 55)})`;
        } else {
            return `rgb(${Math.round(60 - t * 45)}, ${Math.round(140 + t * 50)}, ${Math.round(80 - t * 50)})`;
        }
    }, []);

    const matchesMarketCapFilter = useCallback((item) => {
        const source = String(item?.marketCapSource || 'unknown');
        if (marketCapFilter === 'all') return true;
        if (marketCapFilter === 'snapshot') return source.startsWith('snapshot_');
        if (marketCapFilter === 'proxy') return source === 'sina_proxy_stock_sum';
        if (marketCapFilter === 'estimated') return source === 'unknown' || source.startsWith('estimated');
        if (marketCapFilter === 'live') {
            return !source.startsWith('snapshot_')
                && source !== 'sina_proxy_stock_sum'
                && source !== 'unknown'
                && !source.startsWith('estimated');
        }
        return true;
    }, [marketCapFilter]);

    const getMarketCapDisplayKind = useCallback((item) => {
        const source = String(item?.marketCapSource || 'unknown');
        if (source.startsWith('snapshot_')) return 'snapshot';
        if (source === 'sina_proxy_stock_sum') return 'proxy';
        if (source === 'unknown' || source.startsWith('estimated') || source === 'constant_fallback') return 'estimated';
        return 'live';
    }, []);

    const getVolatilitySourceMeta = useCallback((source) => {
        switch (source) {
            case 'historical_index':
                return { label: '历史指数', color: '#69c0ff' };
            case 'stock_dispersion':
                return { label: '成分股离散度', color: '#95de64' };
            case 'amplitude_proxy':
                return { label: '振幅代理', color: '#ffd666' };
            case 'turnover_rate_proxy':
                return { label: '换手率代理', color: '#ffbb96' };
            case 'change_proxy':
                return { label: '涨跌幅代理', color: '#d3adf7' };
            default:
                return { label: '暂无', color: '#8c8c8c' };
        }
    }, []);

    const legendMeta = useMemo(() => {
        if (colorMetric === 'net_inflow_ratio') {
            return { min: -3, max: 3, step: 0.1, leftLabel: '净流出', rightLabel: '净流入', suffix: '%' };
        }
        if (colorMetric === 'turnover_rate') {
            return { min: 0, max: 8, step: 0.1, leftLabel: '低换手', rightLabel: '高换手', suffix: '%' };
        }
        if (colorMetric === 'pe_ttm') {
            return { min: 0, max: 80, step: 1, leftLabel: '低估值', rightLabel: '高估值', suffix: 'x' };
        }
        if (colorMetric === 'pb') {
            return { min: 0, max: 10, step: 0.1, leftLabel: '低PB', rightLabel: '高PB', suffix: 'x' };
        }
        const maxAbs = data?.max_value !== undefined
            ? Math.max(Math.abs(data.max_value || 0), Math.abs(data.min_value || 0), 5)
            : 5;
        return { min: -maxAbs, max: maxAbs, step: 0.1, leftLabel: '跌/出', rightLabel: '涨/入', suffix: '%' };
    }, [colorMetric, data]);

    const effectiveLegendRange = useMemo(() => {
        if (
            Array.isArray(legendRangeValue)
            && legendRangeValue.length === 2
            && Number.isFinite(Number(legendRangeValue[0]))
            && Number.isFinite(Number(legendRangeValue[1]))
        ) {
            return [Number(legendRangeValue[0]), Number(legendRangeValue[1])];
        }
        return [legendMeta.min, legendMeta.max];
    }, [legendMeta.max, legendMeta.min, legendRangeValue]);

    // 计算颜色
    const getColor = useCallback((value, metric, dynamicMax = 5) => {
        if (metric === 'change_pct') {
            return redGreenGradient(value, dynamicMax);
        }
        else if (metric === 'net_inflow_ratio') {
            return redGreenGradient(value, 2); // +/- 2% 为饱和点
        }
        else if (metric === 'pe_ttm') {
            // PE: 低估值(绿/灰) -> 高估值(红)
            // 简单逻辑：20以下绿色，40以上红色
            if (value <= 0) return '#555555';
            if (value < 20) return `rgb(60, 140, 80)`; // 稳重绿
            if (value < 40) return `rgb(200, 180, 60)`; // 警示黄
            return `rgb(220, 60, 60)`; // 危险红
        }
        else if (metric === 'pb') {
             // PB: < 1 绿, > 5 红
             if (value <= 0) return '#555555';
             if (value < 1.5) return `rgb(60, 140, 80)`;
             if (value < 4) return `rgb(200, 180, 60)`;
             return `rgb(220, 60, 60)`;
        }
        else if (metric === 'turnover_rate') {
            // 换手率：热度图（蓝 -> 黄 -> 红）
            const max = 5; // 5% 以上为高换手
            const t = Math.min(Math.max(value, 0) / max, 1);
            if (t < 0.5) {
                const ratio = t * 2;
                return `rgb(${Math.round(ratio * 255)}, ${Math.round(ratio * 255)}, ${Math.round(255 - ratio * 155)})`;
            } else {
                const ratio = (t - 0.5) * 2;
                return `rgb(255, ${Math.round(255 - ratio * 200)}, ${Math.round(100 - ratio * 100)})`;
            }
        }
        return '#555555';
    }, [redGreenGradient]);

    // 渲染统计信息
    const renderStats = useMemo(() => {
        if (!data?.industries) return null;

        const industries = data.industries;
        const total = industries.length;
        const upCount = industries.filter(i => i.value > 0).length;
        const downCount = industries.filter(i => i.value < 0).length;
        const flatCount = industries.filter(i => i.value === 0).length;
        const upRatio = total > 0 ? Math.round((upCount / total) * 100) : 0;

        // 市场情绪
        const sentimentRatio = upCount / (total || 1);
        const sentiment = sentimentRatio > 0.6
            ? { label: '偏多', color: HEATMAP_POSITIVE, bg: 'color-mix(in srgb, var(--accent-danger) 12%, var(--bg-secondary) 88%)' }
            : sentimentRatio < 0.4
                ? { label: '偏空', color: HEATMAP_NEGATIVE, bg: 'color-mix(in srgb, var(--accent-success) 12%, var(--bg-secondary) 88%)' }
                : { label: '中性', color: HEATMAP_WARNING, bg: 'color-mix(in srgb, var(--accent-warning) 12%, var(--bg-secondary) 88%)' };

        // 资金 TOP3 流入行业
        const top3Inflow = [...industries]
            .filter(i => (i.moneyFlow || 0) > 0)
            .sort((a, b) => (b.moneyFlow || 0) - (a.moneyFlow || 0))
            .slice(0, 3);

        return (
            <div style={{ marginBottom: 16 }}>
                {/* 第一行：数字统计 */}
                <Row gutter={12} align="middle" style={{ marginBottom: 10 }}>
                    <Col flex="none">
                        <Statistic
                            title="上涨"
                            value={upCount}
                            valueStyle={{ color: HEATMAP_POSITIVE, fontSize: 22 }}
                            prefix={<RiseOutlined style={{ fontSize: 14 }} />}
                        />
                    </Col>
                    <Col flex="none">
                        <Statistic
                            title="下跌"
                            value={downCount}
                            valueStyle={{ color: HEATMAP_NEGATIVE, fontSize: 22 }}
                            prefix={<FallOutlined style={{ fontSize: 14 }} />}
                        />
                    </Col>
                    <Col flex="none">
                        <Statistic
                            title="平盘"
                            value={flatCount}
                            valueStyle={{ color: 'var(--text-muted)', fontSize: 22 }}
                            prefix={<DashboardOutlined style={{ fontSize: 14 }} />}
                        />
                    </Col>

                    {/* 市场广度进度条 */}
                    <Col flex="1" style={{ minWidth: 140 }}>
                        <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 4 }}>市场广度 ({upRatio}%)</div>
                        <Progress
                            percent={upRatio}
                            showInfo={false}
                            strokeColor={HEATMAP_POSITIVE}
                            trailColor={HEATMAP_NEGATIVE}
                            size="small"
                        />
                    </Col>

                    {/* 市场情绪标签 */}
                    <Col flex="none">
                        <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 4 }}>市场情绪</div>
                        <Tag
                            style={{
                                color: sentiment.color,
                                background: sentiment.bg,
                                border: `1px solid ${sentiment.color}`,
                                fontWeight: 'bold',
                                fontSize: 13,
                                padding: '2px 10px'
                            }}
                        >
                            {sentiment.label}
                        </Tag>
                    </Col>

                    <Col flex="none">
                        <Statistic
                            title="更新时间"
                            value={data.update_time ? new Date(data.update_time).toLocaleTimeString('zh-CN', { hour12: false }) : '-'}
                            valueStyle={{ fontSize: 13 }}
                        />
                    </Col>
                </Row>

                {/* 第二行：资金净流入 TOP3 */}
                {top3Inflow.length > 0 && (
                    <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                        padding: '6px 10px',
                        background: 'color-mix(in srgb, var(--accent-danger) 10%, var(--bg-secondary) 90%)',
                        borderRadius: 6,
                        border: '1px solid color-mix(in srgb, var(--accent-danger) 22%, var(--border-color) 78%)',
                        flexWrap: 'wrap'
                    }}>
                        <span style={{ fontSize: 12, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>💰 主力净流入</span>
                        {top3Inflow.map((ind, idx) => (
                            <Tag
                                key={ind.name}
                                color={idx === 0 ? 'red' : idx === 1 ? 'volcano' : 'orange'}
                                style={{ cursor: 'pointer', margin: 0 }}
                                onClick={() => onIndustryClick?.(ind.name)}
                                role="button"
                                tabIndex={0}
                                aria-label={`查看 ${ind.name} 行业详情，主力净流入 ${(ind.moneyFlow / 1e8).toFixed(1)} 亿`}
                                onKeyDown={(event) => activateOnEnterOrSpace(event, () => onIndustryClick?.(ind.name))}
                            >
                                {ind.name} +{(ind.moneyFlow / 1e8).toFixed(1)}亿
                            </Tag>
                        ))}
                    </div>
                )}
            </div>
        );
    }, [data, onIndustryClick]);

    // 使用 Treemap 计算布局和渲染
    const renderTreemap = useMemo(() => {
        if (!data?.industries || data.industries.length === 0) {
            return (
                <Empty description="暂无行业数据">
                    <Button type="primary" onClick={loadData} icon={<ReloadOutlined />}>
                        刷新数据
                    </Button>
                </Empty>
            );
        }

        const industries = data.industries;
        const { width: W, height: H } = containerSize;
        const gap = 2;

        // 准备 Treemap 数据
        // [Fallback] 检测市值数据是否全为 0，自动回退到 moneyFlow 作为大小代理
        const allSizeZero = sizeMetric === 'market_cap' && industries.every(ind => !ind.size || ind.size === 0);

        const sorted = [...industries]
            .map(ind => {
                // 根据 sizeMetric 决定方块大小
                let sizeValue = 1;
                if (sizeMetric === 'market_cap') {
                    if (allSizeZero) {
                        // 市值全为 0 时，使用 |moneyFlow| 或 stockCount 作为代理
                        sizeValue = Math.abs(ind.moneyFlow || 0) || (ind.stockCount || 1);
                    } else {
                        sizeValue = ind.size || 0;
                    }
                }
                else if (sizeMetric === 'turnover') {
                    // 真实成交额优先 (亿元 -> 元)
                    const realVolume = (ind.totalInflow || 0) + (ind.totalOutflow || 0);
                    if (realVolume > 0) {
                        sizeValue = realVolume * 1e8;
                    } else {
                        // 兜底：估算
                        sizeValue = Math.abs(ind.moneyFlow || 0) + (ind.size * (ind.turnoverRate || 0) / 100) || 0;
                    }
                }
                else if (sizeMetric === 'net_inflow') sizeValue = Math.abs(ind.moneyFlow || 0); // 绝对值做大小
                else sizeValue = 1;

                return {
                    ...ind,
                    normalizedSize: Math.max(sizeValue, 1) // 保持最小可见性
                };
            })
            .sort((a, b) => b.normalizedSize - a.normalizedSize);

        // 限制展示数量，让方块足够大以显示文字
        const sourceScoped = marketCapFilter === 'all'
            ? sorted
            : sorted.filter(matchesMarketCapFilter);
        const searchScoped = searchTerm
            ? sourceScoped.filter((item) => matchesIndustrySearch(item.name, searchTerm))
            : sourceScoped;
        const legendScoped = searchTerm
            ? searchScoped
            : searchScoped.filter((item) => {
                let metricValue = 0;
                if (colorMetric === 'change_pct') metricValue = Number(item.value || 0);
                else if (colorMetric === 'net_inflow_ratio') metricValue = Number(item.netInflowRatio || 0);
                else if (colorMetric === 'turnover_rate') metricValue = Number(item.turnoverRate || 0);
                else if (colorMetric === 'pe_ttm') metricValue = Number(item.pe_ttm || 0);
                else if (colorMetric === 'pb') metricValue = Number(item.pb || 0);
                return metricValue >= effectiveLegendRange[0] && metricValue <= effectiveLegendRange[1];
            });
        const displayedBase = legendScoped;
        const displayed = displayCount > 0 ? displayedBase.slice(0, displayCount) : displayedBase;

        if (displayed.length === 0) {
            const emptyDescription = searchTerm
                ? (marketCapFilter !== 'all' ? '当前筛选条件下未找到匹配行业' : '未找到匹配的行业')
                : legendRangeValue
                    ? '当前色阶区间下暂无匹配行业'
                    : '当前市值来源筛选下暂无行业';
            return (
                <div
                    ref={setContainerNode}
                    style={{
                        position: 'relative',
                        width: '100%',
                        height: H,
                        background: HEATMAP_SURFACE,
                        borderRadius: 8,
                        overflow: 'hidden',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                    }}
                >
                    <Empty
                        description={emptyDescription}
                        image={Empty.PRESENTED_IMAGE_SIMPLE}
                    >
                        {searchTerm && (
                            <Button
                                size="small"
                                style={{ marginRight: 8 }}
                                onClick={() => {
                                    setSearchTerm('');
                                    onSearchTermChange?.('');
                                }}
                            >
                                清除搜索
                            </Button>
                        )}
                        {legendRangeValue && (
                            <Button
                                size="small"
                                style={{ marginRight: 8 }}
                                onClick={() => onLegendRangeChange?.(null)}
                            >
                                清除色阶筛选
                            </Button>
                        )}
                        {onClearMarketCapFilter && (
                            <Button type="primary" size="small" onClick={onClearMarketCapFilter}>
                                {marketCapFilter !== 'all' ? '查看全部行业' : '刷新视图'}
                            </Button>
                        )}
                    </Empty>
                </div>
            );
        }

        // 执行 Treemap 布局
        const layoutItems = squarify(displayed, { x: 0, y: 0, width: W, height: H });

        // 计算当前数据集中涨跌幅的绝对值最大值，用于动态颜色映射
        const maxAbsChange = data.max_value !== undefined
            ? Math.max(Math.abs(data.max_value), Math.abs(data.min_value))
            : 5;

        return (
            <div
                ref={setContainerNode}
                style={{
                    position: 'relative',
                    width: '100%',
                    height: H,
                    background: HEATMAP_SURFACE,
                    borderRadius: 8,
                    overflow: 'hidden',
                }}
            >
                {layoutItems.map((item) => (
                    <IndustryHeatmapTile
                        key={item.name}
                        item={item}
                        gap={gap}
                        colorMetric={colorMetric}
                        sizeMetric={sizeMetric}
                        marketCapFilter={marketCapFilter}
                        maxAbsChange={maxAbsChange}
                        getColor={getColor}
                        getMarketCapDisplayKind={getMarketCapDisplayKind}
                        getVolatilitySourceMeta={getVolatilitySourceMeta}
                        onIndustryClick={onIndustryClick}
                        onLeadingStockClick={onLeadingStockClick}
                        onSelectMarketCapFilter={onSelectMarketCapFilter}
                    />
                ))}
            </div >
        );
    }, [
        data,
        containerSize,
        getColor,
        getMarketCapDisplayKind,
        getVolatilitySourceMeta,
        onIndustryClick,
        onLeadingStockClick,
        onClearMarketCapFilter,
        onSelectMarketCapFilter,
        onSearchTermChange,
        searchTerm,
        displayCount,
        sizeMetric,
        colorMetric,
        marketCapFilter,
        matchesMarketCapFilter,
        effectiveLegendRange,
        legendRangeValue,
        loadData,
        onLegendRangeChange,
    ]);

    // 计算资金流入 TOP3（用于图例横幅，来自内存数据无需新 API）
    const top3InflowBanner = useMemo(() => {
        if (!data?.industries) return [];
        return [...data.industries]
            .filter(i => (i.moneyFlow || 0) > 0)
            .sort((a, b) => (b.moneyFlow || 0) - (a.moneyFlow || 0))
            .slice(0, 3);
    }, [data]);

    // 渲染图例
    const renderLegend = (
        <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginTop: 12,
            gap: 12,
            flexWrap: 'wrap'
        }}>
            {/* 颜色图例 + 大小图例 */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <BgColorsOutlined />
                    <Text style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                        {legendMeta.leftLabel}
                    </Text>
                    <div style={{
                        width: 120,
                        height: 8,
                        background: colorMetric === 'turnover_rate'
                            ? 'linear-gradient(to right, blue, yellow, red)'
                            : 'linear-gradient(to right, rgb(20, 180, 40), #6B6B6B, rgb(235, 20, 20))',
                        borderRadius: 4
                    }} />
                    <Text style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                        {legendMeta.rightLabel}
                    </Text>
                </div>
                <div style={{ minWidth: 280, maxWidth: 380, flex: '1 1 280px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 4 }}>
                        <Text style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                            色阶区间刷选
                        </Text>
                        <Text style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
                            {effectiveLegendRange[0].toFixed(colorMetric === 'pe_ttm' ? 0 : 1)}
                            {legendMeta.suffix}
                            {' '}~{' '}
                            {effectiveLegendRange[1].toFixed(colorMetric === 'pe_ttm' ? 0 : 1)}
                            {legendMeta.suffix}
                        </Text>
                    </div>
                    <div data-testid="heatmap-legend-slider">
                        <Slider
                            range
                            min={legendMeta.min}
                            max={legendMeta.max}
                            step={legendMeta.step}
                            value={effectiveLegendRange}
                            onChange={(value) => onLegendRangeChange?.(value)}
                            onChangeComplete={(value) => onLegendRangeChange?.(value)}
                            tooltip={{ open: false }}
                        />
                    </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <BarChartOutlined />
                    <Text style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                        方块大小 = {
                            sizeMetric === 'market_cap' ? '总市值' :
                                sizeMetric === 'turnover' ? '当日总成交额' :
                                    sizeMetric === 'net_inflow' ? '净流入绝对值' : '未知'
                        }
                    </Text>
                </div>
            </div>

            {/* 资金流入 TOP3 横幅 */}
            {top3InflowBanner.length > 0 && (
                <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    padding: '4px 10px',
                    background: 'color-mix(in srgb, var(--accent-danger) 10%, var(--bg-secondary) 90%)',
                    borderRadius: 6,
                    border: '1px solid color-mix(in srgb, var(--accent-danger) 24%, var(--border-color) 76%)',
                    flexWrap: 'wrap'
                }}>
                    <span style={{ fontSize: 11, color: 'var(--accent-danger)', whiteSpace: 'nowrap' }}>💰 净流入 TOP</span>
                    {top3InflowBanner.map((ind, idx) => (
                        <Tag
                            key={ind.name}
                            color={idx === 0 ? 'red' : idx === 1 ? 'volcano' : 'orange'}
                            style={{ margin: 0, cursor: 'pointer', fontSize: 11 }}
                            onClick={() => onIndustryClick?.(ind.name)}
                            role="button"
                            tabIndex={0}
                            aria-label={`查看 ${ind.name} 行业详情`}
                            onKeyDown={(event) => activateOnEnterOrSpace(event, () => onIndustryClick?.(ind.name))}
                        >
                            {ind.name}
                        </Tag>
                    ))}
                </div>
            )}
        </div>
    );

    const renderControls = (
        <IndustryHeatmapControls
            isCompactMobile={isCompactMobile}
            timeframe={timeframe}
            setTimeframe={setTimeframe}
            onTimeframeChange={onTimeframeChange}
            sizeMetric={sizeMetric}
            setSizeMetric={setSizeMetric}
            onSizeMetricChange={onSizeMetricChange}
            colorMetric={colorMetric}
            setColorMetric={setColorMetric}
            onColorMetricChange={onColorMetricChange}
            displayCount={displayCount}
            setDisplayCount={setDisplayCount}
            onDisplayCountChange={onDisplayCountChange}
            searchTerm={searchTerm}
            setSearchTerm={setSearchTerm}
            onSearchTermChange={onSearchTermChange}
            refreshSec={refreshSec}
            setRefreshSec={setRefreshSec}
            focusControlKey={focusControlKey}
            replaySnapshot={replaySnapshot}
            loadSource={loadSource}
            loading={loading}
            onToggleFullscreen={onToggleFullscreen}
            isFullscreen={isFullscreen}
            loadData={loadData}
        />
    );

    if (loading) {
        // 骨架屏：模拟热力图方块布局，减少等待焦虑
        const skeletonBlocks = [
            { w: '28%', h: 90 }, { w: '22%', h: 90 }, { w: '18%', h: 90 }, { w: '30%', h: 90 },
            { w: '35%', h: 70 }, { w: '25%', h: 70 }, { w: '40%', h: 70 },
            { w: '20%', h: 55 }, { w: '30%', h: 55 }, { w: '25%', h: 55 }, { w: '25%', h: 55 },
        ];
        return (
            <Card
                className="industry-heatmap-card"
                title={<span><FireOutlined style={{ marginRight: 8, color: 'var(--accent-danger)' }} />行业热力图</span>}
                extra={renderControls}
                styles={isCompactMobile ? { body: { padding: 12 } } : undefined}
            >
                <div style={{
                    display: 'flex', flexWrap: 'wrap', gap: 3,
                    background: 'linear-gradient(180deg, color-mix(in srgb, var(--bg-secondary) 82%, var(--bg-primary) 18%) 0%, var(--bg-secondary) 100%)', borderRadius: 8, padding: 3,
                    minHeight: 300, position: 'relative', overflow: 'hidden'
                }}>
                    {skeletonBlocks.map((b, i) => (
                        <div key={i} style={{
                            width: b.w, height: b.h, borderRadius: 3,
                            background: `color-mix(in srgb, var(--bg-tertiary) ${18 + (i % 3) * 8}%, transparent)`,
                            animation: 'pulse 1.8s ease-in-out infinite',
                            animationDelay: `${i * 0.12}s`,
                        }} className="industry-heatmap-skeleton-block" />
                    ))}
                    <div style={{
                        position: 'absolute', top: '50%', left: '50%',
                        transform: 'translate(-50%, -50%)',
                        textAlign: 'center', zIndex: 2
                    }}>
                        <Spin size="large" />
                        <div style={{ marginTop: 12, color: 'var(--text-secondary)', fontSize: 13 }}>
                            正在加载行业数据…
                        </div>
                    </div>
                </div>
                <style>{`@keyframes pulse { 0%,100% { opacity: 0.4; } 50% { opacity: 0.8; } }`}</style>
            </Card>
        );
    }

    if (error) {
        return (
            <Card
                className="industry-heatmap-card"
                title="行业热力图"
                extra={
                    <Button className="industry-inline-link" type="link" size="small" onClick={loadData} style={{ padding: 0 }}>
                        <ReloadOutlined /> 重试
                    </Button>
                }
            >
                <Empty description={error} />
            </Card>
        );
    }

    return (
        <Card
            className="industry-heatmap-card"
            title={
                <span>
                    <FireOutlined style={{ marginRight: 8, color: 'var(--accent-danger)' }} />
                    行业热力图
                </span>
            }
            extra={renderControls}
            styles={isCompactMobile ? { body: { padding: 12 } } : undefined}
        >
            {showStats && !isCompactMobile && renderStats}
            {renderTreemap}
            {renderLegend}
        </Card>
    );
};

export default IndustryHeatmap;
