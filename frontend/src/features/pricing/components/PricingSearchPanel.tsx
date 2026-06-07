import * as React from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';

/** A symbol suggestion item (from API or recent history). */
export interface SymbolSuggestion {
  value: string;
  label?: string;
}

/** A hot symbol chip item. */
export interface HotSymbolItem {
  symbol: string;
  name: string;
}

export interface PricingSearchPanelProps {
  /** Controlled symbol value. */
  symbol: string;
  onSymbolChange: (symbol: string) => void;
  /** Controlled period value (e.g. "1y"). */
  period: string;
  onPeriodChange: (period: string) => void;
  /** Called when user triggers analysis. */
  onAnalyze: () => void;
  /** Whether analysis is in-flight. */
  loading: boolean;
  /** Symbol autocomplete suggestions (optional). */
  suggestions?: SymbolSuggestion[];
  /** Hot symbol chips shown below the input (optional). */
  hotSymbols?: HotSymbolItem[];
  /** Called when export is requested; button hidden when omitted. */
  onExport?: () => void;
  /** Whether data exists (gates export button enabled state). */
  data?: unknown;
}

const PERIOD_OPTIONS = [
  { value: '6mo', label: '近6个月' },
  { value: '1y', label: '近1年' },
  { value: '2y', label: '近2年' },
  { value: '3y', label: '近3年' },
] as const;

export function PricingSearchPanel({
  symbol,
  onSymbolChange,
  period,
  onPeriodChange,
  onAnalyze,
  loading,
  hotSymbols,
  onExport,
  data,
}: PricingSearchPanelProps): React.JSX.Element {
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      onAnalyze();
    }
  };

  return (
    <Card size="sm" data-testid="pricing-search-panel">
      <CardHeader>
        <CardTitle>定价研究</CardTitle>
      </CardHeader>
      <CardContent>
        {/* Main controls row */}
        <div className="flex flex-wrap items-center gap-2">
          <Input
            data-testid="pricing-symbol-input"
            className="w-64"
            placeholder="输入股票代码，如 AAPL / MSFT"
            value={symbol}
            onChange={(e) => onSymbolChange(e.target.value)}
            onKeyDown={handleKeyDown}
          />

          <Select value={period} onValueChange={(v) => { if (v !== null) onPeriodChange(v); }}>
            <SelectTrigger
              data-testid="pricing-period-select"
              className="w-32"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PERIOD_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Button
            data-testid="pricing-analyze-button"
            onClick={onAnalyze}
            disabled={loading}
          >
            {loading ? '分析中…' : '开始分析'}
          </Button>

          {onExport && (
            <Button
              data-testid="pricing-export-button"
              variant="outline"
              onClick={onExport}
              disabled={!data}
            >
              导出研究报告
            </Button>
          )}
        </div>

        {/* Hot symbol chips */}
        {hotSymbols && hotSymbols.length > 0 && (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <span className="text-xs text-muted-foreground">热门标的:</span>
            {hotSymbols.map((item) => (
              <Badge
                key={item.symbol}
                variant="outline"
                className="cursor-pointer"
                onClick={() => onSymbolChange(item.symbol)}
              >
                {item.symbol}
              </Badge>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
