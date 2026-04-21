import { useCallback } from 'react';
import {
  getAltSignalDiagnostics,
  getIndustryIntelligence,
  getIndustryNetwork,
  getMacroFactorBacktest,
  getRealtimeAnomalyDiagnostics,
  getRealtimeOrderbook,
  getRealtimeReplay,
} from '../../services/api';

const unwrapData = (payload) => payload?.data || payload;

const parseCompareSymbols = (value) => String(value || '')
  .split(/[\s,，]+/)
  .map((item) => item.trim().toUpperCase())
  .filter(Boolean)
  .slice(0, 4);

function useQuantLabResearchActions({
  message,
  setAltSignalDiagnostics,
  setAnomalyDiagnostics,
  setIndustryIntelLoading,
  setIndustryIntelResult,
  setIndustryNetworkResult,
  setLinkedReplayResult,
  setMacroValidationResult,
  setMarketProbeLoading,
  setOrderbookResult,
  setReplayResult,
  setSignalValidationLoading,
}) {
  const handleIndustryIntelligence = useCallback(async (values) => {
    setIndustryIntelLoading(true);
    try {
      const [intelligencePayload, networkPayload] = await Promise.all([
        getIndustryIntelligence(values.top_n, values.lookback_days),
        getIndustryNetwork(values.network_top_n, values.lookback_days, values.min_similarity),
      ]);
      setIndustryIntelResult(unwrapData(intelligencePayload));
      setIndustryNetworkResult(unwrapData(networkPayload));
      message.success('行业智能扩展已刷新');
    } catch (error) {
      message.error(`行业智能扩展失败: ${error.userMessage || error.message}`);
    } finally {
      setIndustryIntelLoading(false);
    }
  }, [message, setIndustryIntelLoading, setIndustryIntelResult, setIndustryNetworkResult]);

  const handleSignalValidation = useCallback(async (values) => {
    setSignalValidationLoading(true);
    try {
      const [macroPayload, altPayload] = await Promise.all([
        getMacroFactorBacktest({
          benchmark: values.benchmark,
          period: values.period,
          horizons: values.horizons,
          limit: values.macro_limit,
        }),
        getAltSignalDiagnostics({
          category: values.category,
          timeframe: values.timeframe,
          limit: values.alt_limit,
          half_life_days: values.half_life_days,
        }),
      ]);
      setMacroValidationResult(unwrapData(macroPayload));
      setAltSignalDiagnostics(unwrapData(altPayload));
      message.success('信号验证已完成');
    } catch (error) {
      message.error(`信号验证失败: ${error.userMessage || error.message}`);
    } finally {
      setSignalValidationLoading(false);
    }
  }, [message, setAltSignalDiagnostics, setMacroValidationResult, setSignalValidationLoading]);

  const handleMarketProbe = useCallback(async (values) => {
    setMarketProbeLoading(true);
    try {
      const compareSymbols = parseCompareSymbols(values.compare_symbols);
      const [replayPayload, orderbookPayload, anomalyPayload] = await Promise.all([
        getRealtimeReplay(values.symbol, {
          period: values.replay_period,
          interval: values.replay_interval,
          limit: values.replay_limit,
        }),
        getRealtimeOrderbook(values.symbol, values.levels),
        getRealtimeAnomalyDiagnostics(values.symbol, {
          period: values.replay_period,
          interval: values.replay_interval,
          limit: values.replay_limit,
          z_window: values.z_window,
          return_z_threshold: values.return_z_threshold,
          volume_z_threshold: values.volume_z_threshold,
          cusum_threshold_sigma: values.cusum_threshold_sigma,
          pattern_lookback: values.pattern_lookback,
          pattern_matches: values.pattern_matches,
        }),
      ]);
      setReplayResult(unwrapData(replayPayload));
      setOrderbookResult(unwrapData(orderbookPayload));
      setAnomalyDiagnostics(unwrapData(anomalyPayload));

      if (compareSymbols.length) {
        const linkedPayloads = await Promise.all(
          compareSymbols.map((symbol) => getRealtimeReplay(symbol, {
            period: values.replay_period,
            interval: values.replay_interval,
            limit: values.replay_limit,
          })),
        );
        setLinkedReplayResult({
          symbols: compareSymbols,
          series: linkedPayloads.map((item, index) => ({
            symbol: compareSymbols[index],
            bars: item.data?.bars || item.bars || [],
          })),
        });
      } else {
        setLinkedReplayResult(null);
      }

      message.success('实时行情深度探测完成');
    } catch (error) {
      message.error(`实时行情探测失败: ${error.userMessage || error.message}`);
    } finally {
      setMarketProbeLoading(false);
    }
  }, [
    message,
    setAnomalyDiagnostics,
    setLinkedReplayResult,
    setMarketProbeLoading,
    setOrderbookResult,
    setReplayResult,
  ]);

  return {
    handleIndustryIntelligence,
    handleMarketProbe,
    handleSignalValidation,
  };
}

export default useQuantLabResearchActions;
