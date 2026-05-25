import {
  buildContributionColumns,
  buildCorrelationColumns,
  buildExecutionBatchColumns,
  buildExecutionRouteColumns,
} from '../components/cross-market/CrossMarketResultsSectionColumns';

describe('CrossMarketResultsSection column builders', () => {
  it('builds correlation columns from the matrix column list', () => {
    const columns = buildCorrelationColumns({
      correlation_matrix: { columns: ['SPY', 'TLT'] },
    });

    expect(columns.map((column) => column.key)).toEqual(['symbol', 'SPY', 'TLT']);
    expect(columns[1].render(0.12345)).toBe('0.123');
  });

  it('keeps contribution table column order stable', () => {
    const columns = buildContributionColumns();

    expect(columns.map((column) => column.key)).toEqual([
      'symbol',
      'side',
      'asset_class',
      'weight',
      'cumulative_return',
      'volatility',
    ]);
  });

  it('keeps execution batch columns discoverable outside the large component', () => {
    const columns = buildExecutionBatchColumns();

    expect(columns.map((column) => column.key)).toEqual([
      'execution_channel',
      'venue',
      'preferred_provider',
      'order_count',
      'gross_weight',
      'target_notional',
      'estimated_fill_notional',
      'capacity_band',
      'adv_usage',
      'liquidity_band',
      'margin_requirement',
      'symbols',
    ]);
  });

  it('keeps execution route columns discoverable outside the large component', () => {
    const columns = buildExecutionRouteColumns();

    expect(columns.map((column) => column.key)).toEqual([
      'symbol',
      'side',
      'asset_class',
      'execution_channel',
      'venue',
      'preferred_provider',
      'capital_fraction',
      'reference_price',
      'target_quantity',
      'rounded_quantity',
      'target_notional',
      'residual_fraction',
      'capacity_band',
      'avg_daily_notional',
      'adv_usage',
      'liquidity_band',
      'margin_rate',
      'margin_requirement',
    ]);
  });
});
