/**
 * 自选股错价报告 — 纯函数层
 * Pure, no DOM/side-effects. All DOM/print lives in the hook.
 */

import { renderTable } from '@/features/pricing/lib/report';
import { exportToCSV } from '@/lib/export';
import type { ScreeningRow } from '@/features/pricing/lib/pricingResearch';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface WatchlistReportRow {
  symbol: string;
  price: string;
  fairValue: string;
  gapPct: string;
  direction: '高估' | '低估';
  confidence: string;
  score: string;
}

export interface WatchlistReportMeta {
  generatedAt?: string;
  threshold?: number;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const finiteOrDash = (value: unknown, digits = 2): string => {
  if (value === null || value === undefined || value === '') return '—';
  const n = Number(value);
  return Number.isFinite(n) ? n.toFixed(digits) : '—';
};

const finiteOrDashPct = (value: unknown, digits = 1): string => {
  if (value === null || value === undefined || value === '') return '—';
  const n = Number(value);
  if (!Number.isFinite(n)) return '—';
  return `${n > 0 ? '+' : ''}${n.toFixed(digits)}%`;
};

/**
 * Determine mispricing direction from gap_pct sign.
 * gap > 0 ⇒ market price is above fair value ⇒ 高估 (overvalued).
 * gap ≤ 0 ⇒ market price is below fair value ⇒ 低估 (undervalued).
 */
const directionFromGap = (gapPct: unknown): '高估' | '低估' => {
  const n = Number(gapPct);
  return Number.isFinite(n) && n > 0 ? '高估' : '低估';
};

// ─── Public pure functions ────────────────────────────────────────────────────

/**
 * Shape raw screener results into normalised report rows.
 * Sorted by |gap_pct| descending (largest mispricing first).
 */
export const buildWatchlistReportRows = (
  screenerResults: ScreeningRow[],
): WatchlistReportRow[] => {
  const rows: WatchlistReportRow[] = screenerResults.map((r) => ({
    symbol: r.symbol,
    price: finiteOrDash(r.current_price),
    fairValue: finiteOrDash(r.fair_value),
    gapPct: finiteOrDashPct(r.gap_pct),
    direction: directionFromGap(r.gap_pct),
    confidence: String(r.confidence ?? r.confidence_score ?? '—'),
    score: finiteOrDash(r.screening_score, 1),
  }));

  // Sort by absolute gap_pct descending, fallback to screening_score
  rows.sort((a, b) => {
    const aGap = Math.abs(Number(screenerResults.find((r) => r.symbol === a.symbol)?.gap_pct ?? 0));
    const bGap = Math.abs(Number(screenerResults.find((r) => r.symbol === b.symbol)?.gap_pct ?? 0));
    if (bGap !== aGap) return bGap - aGap;
    const aScore = Number(screenerResults.find((r) => r.symbol === a.symbol)?.screening_score ?? 0);
    const bScore = Number(screenerResults.find((r) => r.symbol === b.symbol)?.screening_score ?? 0);
    return bScore - aScore;
  });

  return rows;
};

/**
 * Build a self-contained HTML document for the watchlist mispricing report.
 * Reuses renderTable and A4 print styling from report.ts.
 */
export const buildWatchlistReportHtml = (
  rows: WatchlistReportRow[],
  meta: WatchlistReportMeta = {},
): string => {
  const generatedAt = meta.generatedAt ?? new Date().toLocaleString('zh-CN');
  const symbolCount = rows.length;
  const beyondThreshold =
    meta.threshold !== undefined
      ? rows.filter((r) => {
          const raw = Number(r.gapPct.replace('%', '').replace('+', ''));
          return Math.abs(raw) >= meta.threshold!;
        }).length
      : null;

  const headerLine =
    beyondThreshold !== null
      ? `${symbolCount} 个标的 · ${beyondThreshold} 个超阈值（|gap| ≥ ${meta.threshold}%）`
      : `${symbolCount} 个标的`;

  const tableHtml =
    rows.length > 0
      ? renderTable(
          ['代码', '现价', '公允价值', '偏差%', '方向', '置信度', '机会分'],
          rows.map((r) => [
            r.symbol,
            r.price,
            r.fairValue,
            r.gapPct,
            r.direction,
            r.confidence,
            r.score,
          ]),
        )
      : '<p style="color:#64748b;margin:16px 0;">自选股暂无错价数据。</p>';

  return `<!DOCTYPE html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <title>自选股错价报告</title>
    <style>
      :root {
        color-scheme: light;
        --text-main: #0f172a;
        --text-muted: #475569;
        --line: #dbe4f0;
        --panel: #f8fafc;
        --panel-strong: #eff6ff;
        --accent: #1d4ed8;
        --good: #15803d;
        --bad: #b91c1c;
      }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        padding: 28px;
        font-family: "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif;
        color: var(--text-main);
        background: white;
      }
      .report { max-width: 960px; margin: 0 auto; }
      h1 { margin: 0 0 4px; font-size: 26px; }
      .subtitle { color: var(--text-muted); font-size: 13px; margin-bottom: 20px; line-height: 1.7; }
      table { width: 100%; border-collapse: collapse; margin-top: 12px; }
      th, td { border: 1px solid var(--line); padding: 10px 12px; text-align: left; font-size: 13px; }
      th { background: #eff6ff; color: var(--accent); }
      .footer {
        margin-top: 28px;
        padding: 14px 16px;
        border: 1px solid var(--line);
        border-radius: 12px;
        background: var(--panel);
        font-size: 12px;
        color: var(--text-muted);
        line-height: 1.8;
      }
      .footer strong { color: var(--text-main); }
      @page { size: A4; margin: 16mm; }
      @media print { body { padding: 0; } .report { max-width: none; } }
    </style>
  </head>
  <body>
    <div class="report">
      <h1>自选股错价报告</h1>
      <div class="subtitle">
        生成时间：${generatedAt} &nbsp;·&nbsp; ${headerLine}
      </div>

      ${tableHtml}

      <div class="footer">
        <strong>方法论：</strong>错价偏差（gap%）= (市价 − 公允价值) / |公允价值| × 100，
        公允价值综合 DCF、可比倍数与因子定价模型加权得出。
        置信度与机会分反映多维因子证据共振程度及样本量充分性，
        数值越高代表信号越清晰，但<strong>不构成任何收益保证</strong>。<br />
        <strong>声明：</strong>本报告仅供内部研究复盘用途，<strong>非投资建议，无前视收益保证</strong>，
        不可作为买卖决策依据。过往偏差不代表未来走势，请结合自身风险承受能力审慎判断。
      </div>
    </div>
    <script>
      window.addEventListener('load', () => { window.print(); });
    </script>
  </body>
</html>`;
};

/**
 * Build CSV content string for the watchlist report rows.
 * Delegates actual download to exportToCSV from lib/export.ts.
 */
export const buildWatchlistReportCsv = (
  rows: WatchlistReportRow[],
  filename = 'watchlist-mispricing-report',
): void => {
  if (!rows.length) return;
  const data = rows.map((r) => ({
    symbol: r.symbol,
    price: r.price,
    fairValue: r.fairValue,
    gapPct: r.gapPct,
    direction: r.direction,
    confidence: r.confidence,
    score: r.score,
  }));
  exportToCSV(data, filename, [
    { key: 'symbol', title: '代码' },
    { key: 'price', title: '现价' },
    { key: 'fairValue', title: '公允价值' },
    { key: 'gapPct', title: '偏差%' },
    { key: 'direction', title: '方向' },
    { key: 'confidence', title: '置信度' },
    { key: 'score', title: '机会分' },
  ]);
};
