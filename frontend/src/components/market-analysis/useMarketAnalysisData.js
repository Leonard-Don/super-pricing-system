import { useEffect, useRef, useState } from 'react';

import {
    getAnalysisOverview,
    analyzeTrend,
    analyzeVolumePrice,
    analyzeSentiment,
    recognizePatterns,
    getFundamentalAnalysis,
    getKlines,
    getTechnicalIndicators,
    getSentimentHistory,
    getIndustryComparison,
    getRiskMetrics,
    getCorrelationAnalysis,
    getEventSummary,
} from '../../services/api';

const ANALYSIS_CACHE_TTL_MS = 2 * 60 * 1000;
const analysisResponseCache = new Map();

const buildAnalysisCacheKey = (tab, symbol, interval = '') => `${tab}|${symbol || ''}|${interval || ''}`;

const clearAnalysisCache = (symbol, interval) => {
    const keyFragments = [
        buildAnalysisCacheKey('overview', symbol, interval),
        buildAnalysisCacheKey('trend', symbol, interval),
        buildAnalysisCacheKey('volume', symbol, interval),
        buildAnalysisCacheKey('sentiment', symbol, interval),
        buildAnalysisCacheKey('pattern', symbol, interval),
        buildAnalysisCacheKey('fundamental', symbol),
        buildAnalysisCacheKey('technical', symbol, interval),
        buildAnalysisCacheKey('events', symbol),
        buildAnalysisCacheKey('sentimentHistory', symbol),
        buildAnalysisCacheKey('industry', symbol),
        buildAnalysisCacheKey('risk', symbol, interval),
        buildAnalysisCacheKey('correlation', symbol),
    ];
    keyFragments.forEach((cacheKey) => analysisResponseCache.delete(cacheKey));
};

const readAnalysisCacheEntry = (cacheKey) => {
    const cached = analysisResponseCache.get(cacheKey);
    if (!cached) {
        return null;
    }

    if (Date.now() - cached.cachedAt > ANALYSIS_CACHE_TTL_MS) {
        analysisResponseCache.delete(cacheKey);
        return null;
    }

    return cached;
};

const writeAnalysisCache = (cacheKey, data) => {
    const cachedAt = Date.now();
    analysisResponseCache.set(cacheKey, {
        data,
        cachedAt,
    });
    return cachedAt;
};

const buildAnalysisKey = (sym, intv) => `${sym || ''}|${intv || ''}`;

export const useMarketAnalysisData = ({ symbol, interval, propSymbol, embedMode, setSymbol, setActiveTab }) => {
    const [overviewData, setOverviewData] = useState(null);
    const [trendData, setTrendData] = useState(null);
    const [volumeData, setVolumeData] = useState(null);
    const [sentimentData, setSentimentData] = useState(null);
    const [patternData, setPatternData] = useState(null);
    const [fundamentalData, setFundamentalData] = useState(null);
    const [klinesData, setKlinesData] = useState(null);
    // 新增状态
    const [technicalData, setTechnicalData] = useState(null);
    const [sentimentHistoryData, setSentimentHistoryData] = useState(null);
    const [industryData, setIndustryData] = useState(null);
    const [riskData, setRiskData] = useState(null);
    const [correlationData, setCorrelationData] = useState(null);
    const [eventData, setEventData] = useState(null);

    const [loadingTab, setLoadingTab] = useState({});
    const [errorTab, setErrorTab] = useState({});
    const [tabMeta, setTabMeta] = useState({});

    const setTabLoading = (key, value) => {
        setLoadingTab(prev => ({ ...prev, [key]: value }));
    };

    const setTabError = (key, value) => {
        setErrorTab(prev => ({ ...prev, [key]: value }));
    };
    const setTabMetaEntry = (key, source, updatedAt) => {
        setTabMeta(prev => ({
            ...prev,
            [key]: {
                source,
                updatedAt,
            },
        }));
    };

    const resetAll = () => {
        setOverviewData(null);
        setTrendData(null);
        setVolumeData(null);
        setSentimentData(null);
        setPatternData(null);
        setFundamentalData(null);
        setKlinesData(null);
        setTechnicalData(null);
        setSentimentHistoryData(null);
        setIndustryData(null);
        setRiskData(null);
        setCorrelationData(null);
        setEventData(null);
        setLoadingTab({});
        setErrorTab({});
        setTabMeta({});
    };


    const analysisKeyRef = useRef(buildAnalysisKey(symbol, interval));
    const prefetchHandleRef = useRef(null);
    const isInitializedRef = useRef(false); // 防止 StrictMode 双重执行
    const previousPropSymbolRef = useRef(propSymbol || null);

    const cancelPrefetch = () => {
        if (!prefetchHandleRef.current) return;
        if (prefetchHandleRef.current.type === 'idle' && typeof window !== 'undefined' && window.cancelIdleCallback) {
            window.cancelIdleCallback(prefetchHandleRef.current.id);
        } else {
            clearTimeout(prefetchHandleRef.current.id);
        }
        prefetchHandleRef.current = null;
    };

    const fetchTabIfNeeded = (tabKey, currentSymbol, currentInterval) => {
        const targetSymbol = currentSymbol || symbol;
        const targetInterval = currentInterval || interval;

        if (tabKey === 'overview' && !overviewData && !loadingTab.overview) {
            fetchOverview(targetSymbol, targetInterval);
            // 同时获取事件数据
            if (!eventData && !loadingTab.events) {
                fetchEvents(targetSymbol);
            }
        }
        if (tabKey === 'trend' && !trendData && !loadingTab.trend) {
            fetchTrend(targetSymbol, targetInterval);
        }
        if (tabKey === 'volume' && !volumeData && !loadingTab.volume) {
            fetchVolume(targetSymbol, targetInterval);
        }
        if (tabKey === 'sentiment' && !sentimentData && !loadingTab.sentiment) {
            fetchSentiment(targetSymbol, targetInterval);
            // 同时获取历史情绪数据
            if (!sentimentHistoryData && !loadingTab.sentimentHistory) {
                fetchSentimentHistory(targetSymbol);
            }
        }
        if (tabKey === 'pattern' && !patternData && !loadingTab.pattern) {
            fetchPattern(targetSymbol, targetInterval);
        }
        if (tabKey === 'fundamental' && !fundamentalData && !loadingTab.fundamental) {
            fetchFundamental(targetSymbol);
        }
        // 新增 Tab
        if (tabKey === 'industry' && !industryData && !loadingTab.industry) {
            fetchIndustryComparison(targetSymbol);
        }
        if (tabKey === 'risk' && !riskData && !loadingTab.risk) {
            fetchRiskMetrics(targetSymbol, targetInterval);
        }
        if (tabKey === 'correlation' && !correlationData && !loadingTab.correlation) {
            fetchCorrelation(targetSymbol);
        }
    };

    const schedulePrefetch = (localKey) => {
        if (localKey !== analysisKeyRef.current) return;
        cancelPrefetch();
        const queue = embedMode ? [] : ['trend', 'volume', 'sentiment', 'fundamental'];
        if (!queue.length) return;

        const runStep = (index) => {
            if (localKey !== analysisKeyRef.current) return;
            if (index >= queue.length) return;
            // Always use current refs for fetch
            fetchTabIfNeeded(queue[index], symbol, interval);

            const scheduleNext = () => runStep(index + 1);
            if (typeof window !== 'undefined' && window.requestIdleCallback) {
                const id = window.requestIdleCallback(scheduleNext, { timeout: 1000 });
                prefetchHandleRef.current = { type: 'idle', id };
            } else {
                const id = setTimeout(scheduleNext, 300);
                prefetchHandleRef.current = { type: 'timeout', id };
            }
        };

        const scheduleStart = () => runStep(0);
        if (typeof window !== 'undefined' && window.requestIdleCallback) {
            const id = window.requestIdleCallback(scheduleStart, { timeout: 1000 });
            prefetchHandleRef.current = { type: 'idle', id };
        } else {
            const id = setTimeout(scheduleStart, 300);
            prefetchHandleRef.current = { type: 'timeout', id };
        }
    };

    const fetchOverview = async (searchSymbol, selectedInterval = '1d') => {
        if (!searchSymbol) return;
        const localKey = analysisKeyRef.current;
        const cacheKey = buildAnalysisCacheKey('overview', searchSymbol, selectedInterval);
        const cachedEntry = readAnalysisCacheEntry(cacheKey);
        const cachedResult = cachedEntry?.data;
        if (cachedResult) {
            setTabError('overview', null);
            setOverviewData(cachedResult);
            setTabMetaEntry('overview', 'cache', cachedEntry.cachedAt);
            if (cachedResult.indicators) {
                setTechnicalData(cachedResult.indicators);
            } else if (!technicalData && !loadingTab.technical) {
                fetchTechnicalIndicators(searchSymbol, selectedInterval);
            }
            schedulePrefetch(localKey);
            return;
        }
        setTabLoading('overview', true);
        setTabError('overview', null);
        try {
            const result = await getAnalysisOverview(searchSymbol, selectedInterval);
            if (localKey !== analysisKeyRef.current) return;
            const cachedAt = writeAnalysisCache(cacheKey, result);
            setOverviewData(result);
            setTabMetaEntry('overview', 'live', cachedAt);
            if (result.indicators) {
                setTechnicalData(result.indicators);
            } else if (!technicalData && !loadingTab.technical) {
                fetchTechnicalIndicators(searchSymbol, selectedInterval);
            }
            schedulePrefetch(localKey);
        } catch (err) {
            console.error('Failed to fetch overview:', err);
            if (localKey !== analysisKeyRef.current) return;
            setTabError('overview', '获取总览数据失败: ' + (err.response?.data?.detail || err.message));
        } finally {
            if (localKey === analysisKeyRef.current) {
                setTabLoading('overview', false);
            }
        }
    };

    const fetchTrend = async (searchSymbol, selectedInterval = '1d') => {
        if (!searchSymbol) return;
        const localKey = analysisKeyRef.current;
        const cacheKey = buildAnalysisCacheKey('trend', searchSymbol, selectedInterval);
        const cachedEntry = readAnalysisCacheEntry(cacheKey);
        const cachedResult = cachedEntry?.data;
        if (cachedResult) {
            setTabError('trend', null);
            setTrendData(cachedResult);
            setTabMetaEntry('trend', 'cache', cachedEntry.cachedAt);
            return;
        }
        setTabLoading('trend', true);
        setTabError('trend', null);
        try {
            const result = await analyzeTrend(searchSymbol, selectedInterval);
            if (localKey !== analysisKeyRef.current) return;
            const cachedAt = writeAnalysisCache(cacheKey, result);
            setTrendData(result);
            setTabMetaEntry('trend', 'live', cachedAt);
        } catch (err) {
            console.error('Failed to fetch trend:', err);
            if (localKey !== analysisKeyRef.current) return;
            setTabError('trend', '获取趋势数据失败: ' + (err.response?.data?.detail || err.message));
        } finally {
            if (localKey === analysisKeyRef.current) {
                setTabLoading('trend', false);
            }
        }
    };

    const fetchVolume = async (searchSymbol, selectedInterval = '1d') => {
        if (!searchSymbol) return;
        const localKey = analysisKeyRef.current;
        const cacheKey = buildAnalysisCacheKey('volume', searchSymbol, selectedInterval);
        const cachedEntry = readAnalysisCacheEntry(cacheKey);
        const cachedResult = cachedEntry?.data;
        if (cachedResult) {
            setTabError('volume', null);
            setVolumeData(cachedResult);
            setTabMetaEntry('volume', 'cache', cachedEntry.cachedAt);
            return;
        }
        setTabLoading('volume', true);
        setTabError('volume', null);
        try {
            const result = await analyzeVolumePrice(searchSymbol, selectedInterval);
            if (localKey !== analysisKeyRef.current) return;
            const cachedAt = writeAnalysisCache(cacheKey, result);
            setVolumeData(result);
            setTabMetaEntry('volume', 'live', cachedAt);
        } catch (err) {
            console.error('Failed to fetch volume:', err);
            if (localKey !== analysisKeyRef.current) return;
            setTabError('volume', '获取量价数据失败: ' + (err.response?.data?.detail || err.message));
        } finally {
            if (localKey === analysisKeyRef.current) {
                setTabLoading('volume', false);
            }
        }
    };

    const fetchSentiment = async (searchSymbol, selectedInterval = '1d') => {
        if (!searchSymbol) return;
        const localKey = analysisKeyRef.current;
        const cacheKey = buildAnalysisCacheKey('sentiment', searchSymbol, selectedInterval);
        const cachedEntry = readAnalysisCacheEntry(cacheKey);
        const cachedResult = cachedEntry?.data;
        if (cachedResult) {
            setTabError('sentiment', null);
            setSentimentData(cachedResult);
            setTabMetaEntry('sentiment', 'cache', cachedEntry.cachedAt);
            return;
        }
        setTabLoading('sentiment', true);
        setTabError('sentiment', null);
        try {
            const result = await analyzeSentiment(searchSymbol, selectedInterval);
            if (localKey !== analysisKeyRef.current) return;
            const cachedAt = writeAnalysisCache(cacheKey, result);
            setSentimentData(result);
            setTabMetaEntry('sentiment', 'live', cachedAt);
        } catch (err) {
            console.error('Failed to fetch sentiment:', err);
            if (localKey !== analysisKeyRef.current) return;
            setTabError('sentiment', '获取情绪数据失败: ' + (err.response?.data?.detail || err.message));
        } finally {
            if (localKey === analysisKeyRef.current) {
                setTabLoading('sentiment', false);
            }
        }
    };

    const fetchPattern = async (searchSymbol, selectedInterval = '1d') => {
        if (!searchSymbol) return;
        const localKey = analysisKeyRef.current;
        const cacheKey = buildAnalysisCacheKey('pattern', searchSymbol, selectedInterval);
        const cachedEntry = readAnalysisCacheEntry(cacheKey);
        const cachedResult = cachedEntry?.data;
        if (cachedResult) {
            setTabError('pattern', null);
            setPatternData(cachedResult.patternResult);
            setKlinesData(cachedResult.klinesData || []);
            setTabMetaEntry('pattern', 'cache', cachedEntry.cachedAt);
            return;
        }
        setTabLoading('pattern', true);
        setTabError('pattern', null);
        try {
            const [patternResult, klinesResult] = await Promise.all([
                recognizePatterns(searchSymbol, selectedInterval),
                getKlines(searchSymbol, selectedInterval)
            ]);
            if (localKey !== analysisKeyRef.current) return;
            const cachedAt = writeAnalysisCache(cacheKey, {
                patternResult,
                klinesData: klinesResult.klines || [],
            });
            setPatternData(patternResult);
            setKlinesData(klinesResult.klines || []);
            setTabMetaEntry('pattern', 'live', cachedAt);
        } catch (err) {
            console.error('Failed to fetch pattern:', err);
            if (localKey !== analysisKeyRef.current) return;
            setTabError('pattern', '获取形态数据失败: ' + (err.response?.data?.detail || err.message));
        } finally {
            if (localKey === analysisKeyRef.current) {
                setTabLoading('pattern', false);
            }
        }
    };

    const fetchFundamental = async (searchSymbol) => {
        if (!searchSymbol) return;
        const localKey = analysisKeyRef.current;
        const cacheKey = buildAnalysisCacheKey('fundamental', searchSymbol);
        const cachedEntry = readAnalysisCacheEntry(cacheKey);
        const cachedResult = cachedEntry?.data;
        if (cachedResult) {
            setTabError('fundamental', null);
            setFundamentalData(cachedResult);
            setTabMetaEntry('fundamental', 'cache', cachedEntry.cachedAt);
            return;
        }
        setTabLoading('fundamental', true);
        setTabError('fundamental', null);
        try {
            const result = await getFundamentalAnalysis(searchSymbol);
            if (localKey !== analysisKeyRef.current) return;
            const cachedAt = writeAnalysisCache(cacheKey, result);
            setFundamentalData(result);
            setTabMetaEntry('fundamental', 'live', cachedAt);
        } catch (err) {
            console.error('Failed to fetch fundamental:', err);
            if (localKey !== analysisKeyRef.current) return;
            setTabError('fundamental', '获取基本面数据失败: ' + (err.response?.data?.detail || err.message));
        } finally {
            if (localKey === analysisKeyRef.current) {
                setTabLoading('fundamental', false);
            }
        }
    };

    // 新增 fetch 函数
    const fetchTechnicalIndicators = async (searchSymbol, selectedInterval = '1d') => {
        if (!searchSymbol) return;
        const cacheKey = buildAnalysisCacheKey('technical', searchSymbol, selectedInterval);
        const cachedEntry = readAnalysisCacheEntry(cacheKey);
        const cachedResult = cachedEntry?.data;
        if (cachedResult) {
            setTabError('technical', null);
            setTechnicalData(cachedResult);
            return;
        }
        setTabLoading('technical', true);
        setTabError('technical', null);
        const localKey = analysisKeyRef.current;
        try {
            const data = await getTechnicalIndicators(searchSymbol, selectedInterval);
            if (localKey !== analysisKeyRef.current) return;
            // 后端直接返回 { rsi, macd, bollinger, overall }，无需额外转换
            writeAnalysisCache(cacheKey, data);
            setTechnicalData(data);
        } catch (err) {
            console.error('Failed to fetch technical indicators:', err);
            if (localKey !== analysisKeyRef.current) return;
            setTabError('technical', '获取技术指标失败: ' + (err.response?.data?.detail || err.message));
        } finally {
            if (localKey === analysisKeyRef.current) {
                setTabLoading('technical', false);
            }
        }
    };

    const fetchEvents = async (searchSymbol) => {
        if (!searchSymbol) return;
        const localKey = analysisKeyRef.current;
        const cacheKey = buildAnalysisCacheKey('events', searchSymbol);
        const cachedEntry = readAnalysisCacheEntry(cacheKey);
        const cachedResult = cachedEntry?.data;
        if (cachedResult) {
            setTabError('events', null);
            setEventData(cachedResult);
            return;
        }
        setTabLoading('events', true);
        setTabError('events', null);
        try {
            const data = await getEventSummary(searchSymbol);
            if (localKey !== analysisKeyRef.current) return;
            writeAnalysisCache(cacheKey, data);
            setEventData(data);
        } catch (error) {
            console.error('Error fetching events:', error);
            if (localKey !== analysisKeyRef.current) return;
            setTabError('events', '获取事件数据失败: ' + (error.response?.data?.detail || error.message));
        } finally {
            if (localKey === analysisKeyRef.current) {
                setTabLoading('events', false);
            }
        }
    };

    const fetchSentimentHistory = async (searchSymbol) => {
        if (!searchSymbol) return;
        const localKey = analysisKeyRef.current;
        const cacheKey = buildAnalysisCacheKey('sentimentHistory', searchSymbol);
        const cachedEntry = readAnalysisCacheEntry(cacheKey);
        const cachedResult = cachedEntry?.data;
        if (cachedResult) {
            setTabError('sentimentHistory', null);
            setSentimentHistoryData(cachedResult);
            return;
        }
        setTabLoading('sentimentHistory', true);
        setTabError('sentimentHistory', null);
        try {
            const result = await getSentimentHistory(searchSymbol, 30);
            if (localKey !== analysisKeyRef.current) return;
            writeAnalysisCache(cacheKey, result);
            setSentimentHistoryData(result);
        } catch (err) {
            console.error('Failed to fetch sentiment history:', err);
            if (localKey !== analysisKeyRef.current) return;
            setTabError('sentimentHistory', '获取历史情绪失败: ' + (err.response?.data?.detail || err.message));
        } finally {
            if (localKey === analysisKeyRef.current) {
                setTabLoading('sentimentHistory', false);
            }
        }
    };

    const fetchIndustryComparison = async (searchSymbol) => {
        if (!searchSymbol) return;
        const localKey = analysisKeyRef.current;
        const cacheKey = buildAnalysisCacheKey('industry', searchSymbol);
        const cachedEntry = readAnalysisCacheEntry(cacheKey);
        const cachedResult = cachedEntry?.data;
        if (cachedResult) {
            setTabError('industry', null);
            setIndustryData(cachedResult);
            setTabMetaEntry('industry', 'cache', cachedEntry.cachedAt);
            return;
        }
        setTabLoading('industry', true);
        setTabError('industry', null);
        try {
            const result = await getIndustryComparison(searchSymbol);
            if (localKey !== analysisKeyRef.current) return;
            const cachedAt = writeAnalysisCache(cacheKey, result);
            setIndustryData(result);
            setTabMetaEntry('industry', 'live', cachedAt);
        } catch (err) {
            console.error('Failed to fetch industry comparison:', err);
            if (localKey !== analysisKeyRef.current) return;
            setTabError('industry', '获取行业对比失败: ' + (err.response?.data?.detail || err.message));
        } finally {
            if (localKey === analysisKeyRef.current) {
                setTabLoading('industry', false);
            }
        }
    };

    const fetchRiskMetrics = async (searchSymbol, selectedInterval = '1d') => {
        if (!searchSymbol) return;
        const localKey = analysisKeyRef.current;
        const cacheKey = buildAnalysisCacheKey('risk', searchSymbol, selectedInterval);
        const cachedEntry = readAnalysisCacheEntry(cacheKey);
        const cachedResult = cachedEntry?.data;
        if (cachedResult) {
            setTabError('risk', null);
            setRiskData(cachedResult);
            setTabMetaEntry('risk', 'cache', cachedEntry.cachedAt);
            return;
        }
        setTabLoading('risk', true);
        setTabError('risk', null);
        try {
            const result = await getRiskMetrics(searchSymbol, selectedInterval);
            if (localKey !== analysisKeyRef.current) return;
            const cachedAt = writeAnalysisCache(cacheKey, result);
            setRiskData(result);
            setTabMetaEntry('risk', 'live', cachedAt);
        } catch (err) {
            console.error('Failed to fetch risk metrics:', err);
            if (localKey !== analysisKeyRef.current) return;
            setTabError('risk', '获取风险指标失败: ' + (err.response?.data?.detail || err.message));
        } finally {
            if (localKey === analysisKeyRef.current) {
                setTabLoading('risk', false);
            }
        }
    };

    const fetchCorrelation = async (searchSymbol) => {
        if (!searchSymbol) return;
        const localKey = analysisKeyRef.current;
        const cacheKey = buildAnalysisCacheKey('correlation', searchSymbol);
        const cachedEntry = readAnalysisCacheEntry(cacheKey);
        const cachedResult = cachedEntry?.data;
        if (cachedResult) {
            setTabError('correlation', null);
            setCorrelationData(cachedResult);
            setTabMetaEntry('correlation', 'cache', cachedEntry.cachedAt);
            return;
        }
        setTabLoading('correlation', true);
        setTabError('correlation', null);
        try {
            // 默认添加几个常见股票进行对比
            const defaultSymbols = ['SPY', 'QQQ', 'AAPL', 'MSFT', 'GOOGL'];
            const symbolsToUse = [searchSymbol, ...defaultSymbols.filter(s => s !== searchSymbol)].slice(0, 5);
            const result = await getCorrelationAnalysis(symbolsToUse, 90);
            if (localKey !== analysisKeyRef.current) return;
            const cachedAt = writeAnalysisCache(cacheKey, result);
            setCorrelationData(result);
            setTabMetaEntry('correlation', 'live', cachedAt);
        } catch (err) {
            console.error('Failed to fetch correlation:', err);
            if (localKey !== analysisKeyRef.current) return;
            setTabError('correlation', '获取相关性分析失败: ' + (err.response?.data?.detail || err.message));
        } finally {
            if (localKey === analysisKeyRef.current) {
                setTabLoading('correlation', false);
            }
        }
    };

    const beginAnalysis = (nextSymbol, nextInterval) => {
        const localKey = buildAnalysisKey(nextSymbol, nextInterval);
        analysisKeyRef.current = localKey;
        cancelPrefetch();
        resetAll();
        setActiveTab('overview');
        fetchOverview(nextSymbol, nextInterval);
    };

    useEffect(() => {
        const targetSymbol = propSymbol || symbol;
        const incomingPropSymbol = propSymbol || null;
        const shouldReinitialize = !isInitializedRef.current || incomingPropSymbol !== previousPropSymbolRef.current;

        if (!targetSymbol || !shouldReinitialize) {
            return;
        }

        isInitializedRef.current = true;
        previousPropSymbolRef.current = incomingPropSymbol;

        if (propSymbol && propSymbol !== symbol) {
            setSymbol(propSymbol);
        }

        beginAnalysis(targetSymbol, interval);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [propSymbol]);

    const refreshAnalysis = (currentTab) => {
        clearAnalysisCache(symbol, interval);
        cancelPrefetch();
        resetAll();
        analysisKeyRef.current = buildAnalysisKey(symbol, interval);
        setActiveTab(currentTab);
        fetchOverview(symbol, interval);
        if (currentTab !== 'overview' && currentTab !== 'prediction') {
            fetchTabIfNeeded(currentTab, symbol, interval);
        }
    };

    return {
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
    };
};
