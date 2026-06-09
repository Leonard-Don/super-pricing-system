// ─── Helpers ────────────────────────────────────────────────────────────────

const escapeHtml = (value: unknown): string =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const finiteOrPlaceholder = (value: unknown): number | null => {
  if (value === null || value === undefined || value === '') return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
};

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  value !== null &&
  typeof value === 'object' &&
  (Object.getPrototypeOf(value) === Object.prototype ||
    Object.getPrototypeOf(value) === null);

type SanitizedValue =
  | null
  | boolean
  | number
  | string
  | SanitizedValue[]
  | { [key: string]: SanitizedValue };

const sanitizeAuditPayloadValue = (value: unknown): SanitizedValue => {
  if (value === undefined) return null;

  if (['bigint', 'function', 'symbol'].includes(typeof value)) {
    return null;
  }

  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }

  if (Array.isArray(value)) {
    return value.map(sanitizeAuditPayloadValue);
  }

  if (isPlainObject(value)) {
    return Object.fromEntries(
      Object.entries(value).map(([key, nestedValue]) => [
        key,
        sanitizeAuditPayloadValue(nestedValue),
      ]),
    ) as { [key: string]: SanitizedValue };
  }

  return value as SanitizedValue;
};

const formatCurrency = (value: unknown, digits = 2): string => {
  const numeric = finiteOrPlaceholder(value);
  return numeric === null ? '—' : `$${numeric.toFixed(digits)}`;
};

const formatPercentPoints = (value: unknown, digits = 1): string => {
  const numeric = finiteOrPlaceholder(value);
  if (numeric === null) return '—';
  return `${numeric > 0 ? '+' : ''}${numeric.toFixed(digits)}%`;
};

const formatFractionRate = (value: unknown, digits = 1): string => {
  const numeric = finiteOrPlaceholder(value);
  return numeric === null ? '—' : `${(numeric * 100).toFixed(digits)}%`;
};

const formatRatio = (value: unknown, digits = 2): string => {
  const numeric = finiteOrPlaceholder(value);
  return numeric === null ? '—' : numeric.toFixed(digits);
};

const formatSignedNumber = (value: unknown, digits = 2): string => {
  const numeric = finiteOrPlaceholder(value);
  if (numeric === null) return '—';
  return `${numeric > 0 ? '+' : ''}${numeric.toFixed(digits)}`;
};

const renderMetricCard = (label: string, value: string, tone = 'neutral'): string => `
  <div class="metric-card metric-card--${tone}">
    <div class="metric-card__label">${escapeHtml(label)}</div>
    <div class="metric-card__value">${escapeHtml(value)}</div>
  </div>
`;

export const renderTable = (headers: string[] = [], rows: string[][] = []): string => `
  <table>
    <thead>
      <tr>${headers.map((header) => `<th>${escapeHtml(header)}</th>`).join('')}</tr>
    </thead>
    <tbody>
      ${
        rows.length
          ? rows
              .map(
                (row) =>
                  `<tr>${row.map((cell) => `<td>${escapeHtml(cell)}</td>`).join('')}</tr>`,
              )
              .join('')
          : `<tr><td colspan="${headers.length}">暂无数据</td></tr>`
      }
    </tbody>
  </table>
`;

// ─── Public types ────────────────────────────────────────────────────────────

export interface AuditPayloadInput {
  symbol?: unknown;
  period?: unknown;
  context?: unknown;
  analysis?: unknown;
  snapshot?: unknown;
  playbook?: unknown;
  sensitivity?: unknown;
  history?: unknown;
  peerComparison?: unknown;
}

export interface AuditPayload {
  exported_at: string | null;
  symbol: SanitizedValue;
  period: SanitizedValue;
  context: SanitizedValue;
  playbook: SanitizedValue;
  snapshot: SanitizedValue;
  analysis: SanitizedValue;
  sensitivity: SanitizedValue;
  history: SanitizedValue;
  peer_comparison: SanitizedValue;
}

export interface ReportHtmlInput {
  symbol?: unknown;
  period?: unknown;
  generatedAt?: unknown;
  analysis?: unknown;
  snapshot?: unknown;
  context?: unknown;
  sensitivity?: unknown;
  history?: unknown;
  peerComparison?: unknown;
}

// ─── Exports ─────────────────────────────────────────────────────────────────

export const buildPricingResearchAuditPayload = ({
  symbol,
  period,
  context = {},
  analysis = null,
  snapshot = null,
  playbook = null,
  sensitivity = null,
  history = null,
  peerComparison = null,
}: AuditPayloadInput): AuditPayload =>
  sanitizeAuditPayloadValue({
    exported_at: new Date().toISOString(),
    symbol,
    period,
    context,
    playbook,
    snapshot,
    analysis,
    sensitivity,
    history,
    peer_comparison: peerComparison,
  }) as unknown as AuditPayload;

export const buildPricingResearchReportHtml = ({
  symbol,
  period,
  generatedAt,
  analysis = {},
  snapshot = {},
  context = {},
  sensitivity = {},
  history = {},
  peerComparison = {},
}: ReportHtmlInput): string => {
  const a = analysis as Record<string, unknown>;
  const gap = (a?.gap_analysis ?? {}) as Record<string, unknown>;
  const valuation = (a?.valuation ?? {}) as Record<string, unknown>;
  const factorModel = (a?.factor_model ?? {}) as Record<string, unknown>;
  const implications = (a?.implications ?? {}) as Record<string, unknown>;
  const drivers = (
    (a?.deviation_drivers as Record<string, unknown>)?.drivers ?? []
  ) as Array<Record<string, unknown>>;
  const primaryDriver: Record<string, unknown> | null =
    ((a?.deviation_drivers as Record<string, unknown>)
      ?.primary_driver as Record<string, unknown> | undefined) ??
    drivers[0] ??
    null;
  const dcfScenarios = (
    (valuation?.dcf as Record<string, unknown>)?.scenarios ?? []
  ) as Array<Record<string, unknown>>;
  const comparableMethods = (
    (valuation?.comparable as Record<string, unknown>)?.methods ?? []
  ) as Array<Record<string, unknown>>;
  const confidenceBreakdown = (
    (implications?.confidence_breakdown as unknown[]) ?? []
  ) as Array<Record<string, unknown>>;
  const snap = (snapshot ?? {}) as Record<string, unknown>;
  const ctx = (context ?? {}) as Record<string, unknown>;
  const sens = (sensitivity ?? {}) as Record<string, unknown>;
  const hist = (history ?? {}) as Record<string, unknown>;
  const peer = (peerComparison ?? {}) as Record<string, unknown>;

  const thesis = (
    a?.macro_mispricing_thesis ??
    (implications?.macro_mispricing_thesis as unknown) ??
    snap?.macro_mispricing_thesis ??
    {}
  ) as Record<string, unknown>;

  const historyRows = (
    ((hist?.history as unknown[]) ?? []).slice(-8).reverse()
  ) as Array<Record<string, unknown>>;
  const peerRows = [
    peer?.target as Record<string, unknown> | undefined,
    ...((peer?.peers as Array<Record<string, unknown>>) ?? []),
  ].filter(Boolean) as Array<Record<string, unknown>>;

  const generatedTime =
    generatedAt != null ? String(generatedAt) : new Date().toLocaleString();

  const evidenceItems: string[] = [
    valuation.current_price_source
      ? `现价来源：${String(valuation.current_price_source)}`
      : null,
    factorModel.period ? `分析窗口：${String(factorModel.period)}` : null,
    factorModel.data_points
      ? `因子样本：${String(factorModel.data_points)}`
      : null,
    (valuation?.comparable as Record<string, unknown>)?.benchmark_source
      ? `可比基准：${String((valuation.comparable as Record<string, unknown>).benchmark_source)}`
      : null,
  ].filter((x): x is string => x !== null);

  return `<!DOCTYPE html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <title>定价研究报告</title>
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
        --warn: #b45309;
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
      .report {
        max-width: 1040px;
        margin: 0 auto;
      }
      h1 {
        margin: 0 0 12px;
        font-size: 30px;
      }
      .subtitle, .summary, .muted {
        color: var(--text-muted);
        line-height: 1.7;
      }
      .header-grid, .metric-grid, .evidence-grid, .driver-grid {
        display: grid;
        gap: 12px;
      }
      .header-grid {
        grid-template-columns: repeat(4, minmax(0, 1fr));
        margin: 20px 0 12px;
      }
      .metric-grid {
        grid-template-columns: repeat(5, minmax(0, 1fr));
        margin: 20px 0;
      }
      .evidence-grid {
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }
      .driver-grid {
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }
      .panel, .metric-card {
        border: 1px solid var(--line);
        border-radius: 16px;
        background: var(--panel);
        padding: 14px 16px;
      }
      .panel--strong {
        background: var(--panel-strong);
      }
      .metric-card__label, .meta-label, .section-kicker {
        color: var(--text-muted);
        font-size: 12px;
        margin-bottom: 6px;
      }
      .metric-card__value, .meta-value {
        font-size: 18px;
        font-weight: 700;
      }
      .metric-card--good .metric-card__value { color: var(--good); }
      .metric-card--bad .metric-card__value { color: var(--bad); }
      .metric-card--warn .metric-card__value { color: var(--warn); }
      .section-title {
        margin: 30px 0 12px;
        font-size: 18px;
        font-weight: 700;
      }
      .pill-list {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
        margin-top: 10px;
      }
      .pill {
        display: inline-flex;
        align-items: center;
        border-radius: 999px;
        border: 1px solid var(--line);
        background: white;
        padding: 6px 10px;
        font-size: 12px;
        color: var(--text-muted);
      }
      table {
        width: 100%;
        border-collapse: collapse;
        margin-top: 12px;
      }
      th, td {
        border: 1px solid var(--line);
        padding: 10px 12px;
        text-align: left;
        font-size: 13px;
      }
      th {
        background: #eff6ff;
        color: var(--accent);
      }
      .kv {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 10px 14px;
      }
      .kv-item {
        border-bottom: 1px dashed var(--line);
        padding-bottom: 8px;
      }
      .kv-item strong {
        display: block;
        margin-bottom: 4px;
        font-size: 12px;
        color: var(--text-muted);
      }
      .two-col {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 16px;
      }
      @page {
        size: A4;
        margin: 16mm;
      }
      @media print {
        body { padding: 0; }
        .report { max-width: none; }
      }
    </style>
  </head>
  <body>
    <div class="report">
      <h1>定价研究报告</h1>
      <div class="subtitle">把一级估值、因子定价、驱动归因和交易情景放进同一份可打印研究摘要。</div>

      <div class="header-grid">
        <div class="panel">
          <div class="meta-label">标的</div>
          <div class="meta-value">${escapeHtml(symbol ?? a?.symbol ?? '—')}</div>
        </div>
        <div class="panel">
          <div class="meta-label">分析窗口</div>
          <div class="meta-value">${escapeHtml(period ?? factorModel?.period ?? '1y')}</div>
        </div>
        <div class="panel">
          <div class="meta-label">生成时间</div>
          <div class="meta-value">${escapeHtml(generatedTime)}</div>
        </div>
        <div class="panel">
          <div class="meta-label">研究来源</div>
          <div class="meta-value">${escapeHtml(ctx?.source ?? '直接分析')}</div>
        </div>
      </div>

      <div class="metric-grid">
        ${renderMetricCard('当前市价', formatCurrency(gap.current_price))}
        ${renderMetricCard('公允价值', formatCurrency(gap.fair_value_mid), 'good')}
        ${renderMetricCard('偏差幅度', formatPercentPoints(gap.gap_pct), Number(gap.gap_pct ?? 0) > 0 ? 'bad' : 'good')}
        ${renderMetricCard('研究观点', String(implications.primary_view ?? gap.direction ?? '合理'))}
        ${renderMetricCard('置信度', `${String(implications.confidence ?? 'medium')} / ${formatRatio(implications.confidence_score)}`, 'warn')}
      </div>

      <div class="panel panel--strong">
        <div class="section-kicker">执行摘要</div>
        <div class="summary">
          ${escapeHtml(a?.summary ?? (implications?.trade_setup as Record<string, unknown>)?.summary ?? '当前研究已完成定价偏差、估值锚点和因子证据的联动分析。')}
        </div>
        <div class="pill-list">
          ${(evidenceItems.length ? evidenceItems : ['暂无额外证据标签']).map((item) => `<span class="pill">${escapeHtml(item)}</span>`).join('')}
          ${(implications?.factor_alignment as Record<string, unknown>)?.label ? `<span class="pill">证据共振：${escapeHtml(String((implications.factor_alignment as Record<string, unknown>).label))}</span>` : ''}
          ${primaryDriver?.factor ? `<span class="pill">主驱动：${escapeHtml(String(primaryDriver.factor))}</span>` : ''}
        </div>
      </div>

      <div class="section-title">估值与因子概览</div>
      <div class="two-col">
        <div class="panel">
          <div class="section-kicker">估值锚点</div>
          <div class="kv">
            <div class="kv-item"><strong>公允价值区间</strong>${escapeHtml(`${formatCurrency(gap.fair_value_low)} ~ ${formatCurrency(gap.fair_value_high)}`)}</div>
            <div class="kv-item"><strong>DCF 中枢</strong>${escapeHtml(formatCurrency((valuation?.dcf as Record<string, unknown>)?.intrinsic_value))}</div>
            <div class="kv-item"><strong>Comparable 中枢</strong>${escapeHtml(formatCurrency((valuation?.comparable as Record<string, unknown>)?.fair_value))}</div>
            <div class="kv-item"><strong>综合方法</strong>${escapeHtml(String((valuation?.fair_value as Record<string, unknown>)?.method ?? '—'))}</div>
          </div>
        </div>
        <div class="panel">
          <div class="section-kicker">因子摘要</div>
          <div class="kv">
            <div class="kv-item"><strong>CAPM Alpha</strong>${escapeHtml(formatPercentPoints((factorModel?.capm as Record<string, unknown>)?.alpha_pct, 2))}</div>
            <div class="kv-item"><strong>CAPM Beta</strong>${escapeHtml(formatRatio((factorModel?.capm as Record<string, unknown>)?.beta, 3))}</div>
            <div class="kv-item"><strong>FF3 Alpha</strong>${escapeHtml(formatPercentPoints((factorModel?.fama_french as Record<string, unknown>)?.alpha_pct, 2))}</div>
            <div class="kv-item"><strong>FF5 Alpha</strong>${escapeHtml(formatPercentPoints((factorModel?.fama_french_five_factor as Record<string, unknown>)?.alpha_pct, 2))}</div>
          </div>
        </div>
      </div>

      <div class="section-title">估值细节</div>
      ${renderTable(
        ['情景', '公允价值', 'WACC', '初始增长', '溢价/折价'],
        dcfScenarios.map((item) => [
          String(item.label ?? item.name ?? '—'),
          formatCurrency(item.intrinsic_value),
          formatFractionRate((item.assumptions as Record<string, unknown>)?.wacc),
          formatFractionRate((item.assumptions as Record<string, unknown>)?.initial_growth),
          formatPercentPoints(item.premium_discount),
        ]),
      )}

      ${renderTable(
        ['方法', '当前倍数', '行业/同行基准', '公允价值'],
        comparableMethods.map((item) => [
          String(item.method ?? '—'),
          formatRatio(item.current_multiple, 1),
          formatRatio(item.benchmark_multiple, 1),
          formatCurrency(item.fair_value),
        ]),
      )}

      <div class="section-title">驱动与交易情景</div>
      <div class="driver-grid">
        <div class="panel">
          <div class="section-kicker">主驱动</div>
          <div style="font-size: 18px; font-weight: 700; margin-bottom: 6px;">${escapeHtml(String(primaryDriver?.factor ?? '暂无'))}</div>
          <div class="muted">${escapeHtml(String(primaryDriver?.ranking_reason ?? primaryDriver?.description ?? '暂无主驱动解释'))}</div>
        </div>
        <div class="panel">
          <div class="section-kicker">交易情景</div>
          <div class="kv">
            <div class="kv-item"><strong>立场</strong>${escapeHtml(String((implications?.trade_setup as Record<string, unknown>)?.stance ?? '观察'))}</div>
            <div class="kv-item"><strong>目标价</strong>${escapeHtml(formatCurrency((implications?.trade_setup as Record<string, unknown>)?.target_price))}</div>
            <div class="kv-item"><strong>风险边界</strong>${escapeHtml(formatCurrency((implications?.trade_setup as Record<string, unknown>)?.stop_loss))}</div>
            <div class="kv-item"><strong>盈亏比</strong>${escapeHtml(formatRatio((implications?.trade_setup as Record<string, unknown>)?.risk_reward))}</div>
          </div>
        </div>
      </div>

      ${(thesis?.primary_leg as Record<string, unknown>)?.symbol || (thesis?.hedge_leg as Record<string, unknown>)?.symbol ? `
        <div class="section-title">Macro Mispricing Thesis</div>
        <div class="driver-grid">
          <div class="panel">
            <div class="section-kicker">主腿 / 对冲腿</div>
            <div class="kv">
              <div class="kv-item"><strong>主腿</strong>${escapeHtml(`${String((thesis?.primary_leg as Record<string, unknown>)?.symbol ?? '—')} ${String((thesis?.primary_leg as Record<string, unknown>)?.side ?? '')}`)}</div>
              <div class="kv-item"><strong>对冲腿</strong>${escapeHtml(`${String((thesis?.hedge_leg as Record<string, unknown>)?.symbol ?? '—')} ${String((thesis?.hedge_leg as Record<string, unknown>)?.side ?? '')}`)}</div>
              <div class="kv-item"><strong>姿态</strong>${escapeHtml(String(thesis?.stance ?? '观察'))}</div>
              <div class="kv-item"><strong>观察期</strong>${escapeHtml(String(thesis?.horizon ?? '—'))}</div>
            </div>
          </div>
          <div class="panel">
            <div class="section-kicker">Kill Conditions</div>
            <div class="summary">${escapeHtml(((thesis?.kill_conditions as string[]) ?? []).slice(0, 3).join('；') || '暂无')}</div>
          </div>
        </div>
      ` : ''}

      <div class="section-title">置信度拆解</div>
      ${renderTable(
        ['维度', '变化', '状态', '说明'],
        confidenceBreakdown.map((item) => [
          String(item.label ?? item.key ?? '—'),
          formatSignedNumber(item.delta),
          String(item.status ?? 'neutral'),
          String(item.detail ?? '—'),
        ]),
      )}

      <div class="section-title">历史与同行</div>
      <div class="two-col">
        <div class="panel">
          <div class="section-kicker">最近偏差轨迹</div>
          ${renderTable(
            ['日期', '价格', '偏差'],
            historyRows.map((item) => [
              String(item.date ?? '—'),
              formatCurrency(item.price),
              formatPercentPoints(item.gap_pct),
            ]),
          )}
        </div>
        <div class="panel">
          <div class="section-kicker">同行估值快照</div>
          ${renderTable(
            ['标的', '现价', '公允价值', '溢折价'],
            peerRows.slice(0, 6).map((item) => [
              String(item.symbol ?? '—'),
              formatCurrency(item.current_price),
              formatCurrency(item.fair_value),
              formatPercentPoints(item.premium_discount),
            ]),
          )}
        </div>
      </div>

      <div class="section-title">审计附注</div>
      <div class="panel">
        <div class="summary">该导出用于研究沉淀与复盘。结构化审计快照已单独保存在导出 JSON 中，可对接工作台或外部归档流程。</div>
        ${(snap?.audit_trail || sens?.selected_case) ? `
          <div class="pill-list">
            ${(snap?.audit_trail as Record<string, unknown>)?.price_source ? `<span class="pill">现价来源：${escapeHtml(String((snap.audit_trail as Record<string, unknown>).price_source))}</span>` : ''}
            ${(snap?.audit_trail as Record<string, unknown>)?.factor_source ? `<span class="pill">FF3 来源：${escapeHtml(String((snap.audit_trail as Record<string, unknown>).factor_source))}</span>` : ''}
            ${(snap?.audit_trail as Record<string, unknown>)?.five_factor_source ? `<span class="pill">FF5 来源：${escapeHtml(String((snap.audit_trail as Record<string, unknown>).five_factor_source))}</span>` : ''}
            ${(snap?.audit_trail as Record<string, unknown>)?.comparable_benchmark_source ? `<span class="pill">可比基准：${escapeHtml(String((snap.audit_trail as Record<string, unknown>).comparable_benchmark_source))}</span>` : ''}
            ${sens?.selected_case ? `<span class="pill">What-If 当前情景：${escapeHtml(String((sens.selected_case as Record<string, unknown>)?.label ?? '自定义'))}</span>` : ''}
          </div>
        ` : ''}
      </div>
    </div>
    <script>
      window.addEventListener('load', () => {
        window.print();
      });
    </script>
  </body>
</html>`;
};

export const openPricingResearchPrintWindow = (reportHtml: string): boolean => {
  const printWindow = window.open('', '_blank');
  if (!printWindow) {
    return false;
  }

  printWindow.opener = null;
  printWindow.document.open();
  printWindow.document.write(reportHtml);
  printWindow.document.close();
  printWindow.focus();
  return true;
};
