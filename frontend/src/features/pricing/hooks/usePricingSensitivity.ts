import { startTransition, useCallback, useEffect, useState } from 'react';

import { getValuationSensitivityAnalysis } from '@/services/api/pricing';
import { resolveAnalysisSymbol } from '@/features/pricing/lib/pricingResearch';

export interface SensitivityControls {
  wacc: number;
  initialGrowth: number;
  terminalGrowth: number;
  fcfMargin: number;
}

export interface UsePricingSensitivityParams {
  data: Record<string, unknown> | null | undefined;
  researchContextSymbol?: string;
  symbol: string;
}

export interface UsePricingSensitivityResult {
  handleRunSensitivity: () => Promise<void>;
  sensitivity: unknown;
  sensitivityControls: SensitivityControls;
  sensitivityError: string | null;
  sensitivityLoading: boolean;
  setSensitivityControls: React.Dispatch<React.SetStateAction<SensitivityControls>>;
}

// Need React import for the Dispatch type
import type React from 'react';

const DEFAULT_CONTROLS: SensitivityControls = {
  wacc: 8.2,
  initialGrowth: 12,
  terminalGrowth: 2.5,
  fcfMargin: 80,
};

export default function usePricingSensitivity({
  data,
  researchContextSymbol,
  symbol,
}: UsePricingSensitivityParams): UsePricingSensitivityResult {
  const [sensitivity, setSensitivity] = useState<unknown>(null);
  const [sensitivityLoading, setSensitivityLoading] = useState<boolean>(false);
  const [sensitivityError, setSensitivityError] = useState<string | null>(null);
  const [sensitivityControls, setSensitivityControls] =
    useState<SensitivityControls>(DEFAULT_CONTROLS);

  // Sync controls to DCF anchor when data changes
  useEffect(() => {
    const valuation = (data as Record<string, unknown> | null | undefined)?.valuation as
      | Record<string, unknown>
      | undefined;
    const dcf = valuation?.dcf as Record<string, unknown> | undefined;
    const anchor = dcf?.sensitivity_anchor as Record<string, unknown> | undefined;
    if (!anchor) return;
    startTransition(() => {
      setSensitivityControls({
        wacc: Number(Number((anchor.wacc as number | undefined || 0) * 100).toFixed(1)),
        initialGrowth: Number(
          Number((anchor.initial_growth as number | undefined || 0) * 100).toFixed(1),
        ),
        terminalGrowth: Number(
          Number((anchor.terminal_growth as number | undefined || 0) * 100).toFixed(1),
        ),
        fcfMargin: Number(
          Number((anchor.fcf_margin as number | undefined || 0) * 100).toFixed(0),
        ),
      });
    });
  }, [data]);

  const handleRunSensitivity = useCallback(async () => {
    const targetSymbol = resolveAnalysisSymbol(symbol, researchContextSymbol || '');
    if (!targetSymbol) {
      // In the web version we skip antd message and let the UI disable the button.
      return;
    }

    setSensitivityLoading(true);
    setSensitivityError(null);
    try {
      const valuation = (data as Record<string, unknown> | null | undefined)?.valuation as
        | Record<string, unknown>
        | undefined;
      const fairValue = valuation?.fair_value as Record<string, unknown> | undefined;

      const payload = await getValuationSensitivityAnalysis({
        symbol: targetSymbol,
        wacc: Number(sensitivityControls.wacc) / 100,
        initial_growth: Number(sensitivityControls.initialGrowth) / 100,
        terminal_growth: Number(sensitivityControls.terminalGrowth) / 100,
        fcf_margin: Number(sensitivityControls.fcfMargin) / 100,
        dcf_weight: fairValue?.dcf_weight as number | undefined,
        comparable_weight: fairValue?.comparable_weight as number | undefined,
      });
      setSensitivity(payload);
    } catch (err) {
      const e = err as { userMessage?: string; message?: string };
      setSensitivityError(e.userMessage ?? e.message ?? '敏感性分析失败');
      setSensitivity(null);
    } finally {
      setSensitivityLoading(false);
    }
  }, [
    data,
    researchContextSymbol,
    sensitivityControls,
    symbol,
  ]);

  return {
    handleRunSensitivity,
    sensitivity,
    sensitivityControls,
    sensitivityError,
    sensitivityLoading,
    setSensitivityControls,
  };
}
