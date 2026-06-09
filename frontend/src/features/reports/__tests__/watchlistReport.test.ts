/**
 * Unit tests for watchlistReport.ts pure functions.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  buildWatchlistReportRows,
  buildWatchlistReportHtml,
  buildWatchlistReportCsv,
} from '../lib/watchlistReport';
import type { ScreeningRow } from '@/features/pricing/lib/pricingResearch';

// exportToCSV is a DOM-side-effect function — mock it
vi.mock('@/lib/export', () => ({
  exportToCSV: vi.fn(),
}));

import { exportToCSV } from '@/lib/export';

// ─── Fixtures ────────────────────────────────────────────────────────────────

const makeRow = (overrides: Partial<ScreeningRow> = {}): ScreeningRow => ({
  symbol: 'AAPL',
  company_name: 'Apple Inc',
  sector: 'Technology',
  period: '1y',
  current_price: 150,
  fair_value: 120,
  gap_pct: 25,         // positive → 高估
  direction: 'over',
  severity: 'high',
  severity_label: 'high',
  primary_view: '高估',
  confidence: 'high',
  confidence_score: 0.85,
  factor_alignment_status: 'aligned',
  factor_alignment_label: 'aligned',
  factor_alignment_summary: '',
  price_source: 'yfinance',
  primary_driver: 'momentum',
  primary_driver_reason: '',
  people_governance_discount_pct: 0,
  people_governance_confidence: 'medium',
  people_governance_label: '',
  people_governance_summary: '',
  summary: '',
  screening_score: 80,
  ...overrides,
});

// ─── buildWatchlistReportRows ─────────────────────────────────────────────────

describe('buildWatchlistReportRows', () => {
  it('maps gap_pct > 0 to direction 高估', () => {
    const rows = buildWatchlistReportRows([makeRow({ gap_pct: 10 })]);
    expect(rows[0].direction).toBe('高估');
  });

  it('maps gap_pct < 0 to direction 低估', () => {
    const rows = buildWatchlistReportRows([makeRow({ gap_pct: -15 })]);
    expect(rows[0].direction).toBe('低估');
  });

  it('maps gap_pct === 0 to direction 低估 (not positive → undervalued)', () => {
    const rows = buildWatchlistReportRows([makeRow({ gap_pct: 0 })]);
    expect(rows[0].direction).toBe('低估');
  });

  it('carries symbol through correctly', () => {
    const rows = buildWatchlistReportRows([makeRow({ symbol: 'TSLA', gap_pct: -5 })]);
    expect(rows[0].symbol).toBe('TSLA');
  });

  it('formats confidence_score as string', () => {
    const rows = buildWatchlistReportRows([makeRow({ confidence: 'high', confidence_score: 0.9 })]);
    expect(rows[0].confidence).toBe('high');
  });

  it('formats screening_score to 1 decimal', () => {
    const rows = buildWatchlistReportRows([makeRow({ screening_score: 72.567 })]);
    expect(rows[0].score).toBe('72.6');
  });

  it('sorts by |gap_pct| descending', () => {
    const results = [
      makeRow({ symbol: 'A', gap_pct: 5 }),
      makeRow({ symbol: 'B', gap_pct: -30 }),
      makeRow({ symbol: 'C', gap_pct: 15 }),
    ];
    const rows = buildWatchlistReportRows(results);
    expect(rows.map((r) => r.symbol)).toEqual(['B', 'C', 'A']);
  });

  it('returns empty array for empty input', () => {
    expect(buildWatchlistReportRows([])).toEqual([]);
  });

  it('handles null/undefined gap_pct gracefully', () => {
    const rows = buildWatchlistReportRows([makeRow({ gap_pct: null as unknown as number })]);
    expect(rows[0].gapPct).toBe('—');
    expect(rows[0].direction).toBe('低估');
  });
});

// ─── buildWatchlistReportHtml ─────────────────────────────────────────────────

describe('buildWatchlistReportHtml', () => {
  const sampleRows = buildWatchlistReportRows([
    makeRow({ symbol: 'AAPL', gap_pct: 25 }),
    makeRow({ symbol: 'MSFT', gap_pct: -10 }),
  ]);

  it('contains the report title', () => {
    const html = buildWatchlistReportHtml(sampleRows);
    expect(html).toContain('自选股错价报告');
  });

  it('contains each symbol in the table', () => {
    const html = buildWatchlistReportHtml(sampleRows);
    expect(html).toContain('AAPL');
    expect(html).toContain('MSFT');
  });

  it('contains the symbol count', () => {
    const html = buildWatchlistReportHtml(sampleRows);
    expect(html).toContain('2 个标的');
  });

  it('contains beyond-threshold count when meta.threshold is given', () => {
    const html = buildWatchlistReportHtml(sampleRows, { threshold: 20 });
    // AAPL has gap +25% ≥ 20 threshold
    expect(html).toContain('超阈值');
  });

  it('contains the honesty footer — 研究用途声明', () => {
    const html = buildWatchlistReportHtml(sampleRows);
    expect(html).toContain('研究复盘用途');
    expect(html).toContain('非投资建议');
    expect(html).toContain('无前视收益保证');
  });

  it('contains methodology one-liner', () => {
    const html = buildWatchlistReportHtml(sampleRows);
    expect(html).toContain('gap%');
  });

  it('contains A4 page style', () => {
    const html = buildWatchlistReportHtml(sampleRows);
    expect(html).toContain('@page');
    expect(html).toContain('A4');
  });

  it('includes window.print() call', () => {
    const html = buildWatchlistReportHtml(sampleRows);
    expect(html).toContain('window.print()');
  });

  it('renders empty-state message when rows is empty', () => {
    const html = buildWatchlistReportHtml([]);
    expect(html).toContain('暂无错价数据');
  });

  it('uses provided generatedAt in the output', () => {
    const html = buildWatchlistReportHtml(sampleRows, { generatedAt: '2026-06-09 09:00:00' });
    expect(html).toContain('2026-06-09 09:00:00');
  });

  it('contains table headers', () => {
    const html = buildWatchlistReportHtml(sampleRows);
    expect(html).toContain('偏差%');
    expect(html).toContain('置信度');
    expect(html).toContain('机会分');
  });
});

// ─── buildWatchlistReportCsv ──────────────────────────────────────────────────

describe('buildWatchlistReportCsv', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('calls exportToCSV with correct column definitions', () => {
    const rows = buildWatchlistReportRows([makeRow()]);
    buildWatchlistReportCsv(rows);

    expect(exportToCSV).toHaveBeenCalledOnce();
    const [data, filename, columns] = (exportToCSV as ReturnType<typeof vi.fn>).mock.calls[0] as [
      unknown[],
      string,
      Array<{ key: string; title: string }>,
    ];
    expect(typeof filename).toBe('string');
    expect(columns.map((c) => c.key)).toContain('symbol');
    expect(columns.map((c) => c.key)).toContain('gapPct');
    expect(columns.map((c) => c.title)).toContain('代码');
    expect(columns.map((c) => c.title)).toContain('偏差%');
    expect(data.length).toBe(1);
  });

  it('does not call exportToCSV when rows is empty', () => {
    buildWatchlistReportCsv([]);
    expect(exportToCSV).not.toHaveBeenCalled();
  });
});
