import * as React from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardAction,
} from '@/components/ui/card';
import {
  CHART_GRID_COLOR,
  CHART_TICK_COLOR,
  CHART_TOOLTIP_STYLE,
} from '@/features/pricing/lib/chartTheme';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface FactorSignificance {
  alpha_t_stat?: number | string;
  alpha_p_value?: number | string;
  beta_t_stat?: number | string;
  market_p_value?: number | string;
  size_p_value?: number | string;
  value_p_value?: number | string;
  profitability_p_value?: number | string;
  investment_p_value?: number | string;
}

interface ResidualDiagnostics {
  autocorr_lag1?: number | string;
  durbin_watson?: number | string;
}

interface FactorLoadings {
  market?: number | string;
  size?: number | string;
  value?: number | string;
  profitability?: number | string;
  investment?: number | string;
}

interface CAPMModel {
  error?: string;
  alpha_pct?: number | string;
  beta?: number | string;
  r_squared?: number | string;
  idiosyncratic_risk?: number | string;
  significance?: FactorSignificance;
  residual_diagnostics?: ResidualDiagnostics;
  interpretation?: Record<string, string>;
}

interface FF3Model {
  error?: string;
  alpha_pct?: number | string;
  r_squared?: number | string;
  factor_loadings?: FactorLoadings;
  significance?: FactorSignificance;
  residual_diagnostics?: ResidualDiagnostics;
  interpretation?: Record<string, string>;
}

interface FF5Model {
  error?: string;
  alpha_pct?: number | string;
  r_squared?: number | string;
  factor_loadings?: FactorLoadings;
  significance?: FactorSignificance;
  residual_diagnostics?: ResidualDiagnostics;
  interpretation?: Record<string, string>;
}

interface AttributionComponent {
  label: string;
  pct?: number | string;
}

interface Attribution {
  components?: Record<string, AttributionComponent>;
}

interface FactorSource {
  label?: string;
  warning?: string;
  is_proxy?: boolean;
}

export interface FactorModelData {
  capm?: CAPMModel;
  fama_french?: FF3Model;
  fama_french_five_factor?: FF5Model;
  attribution?: Attribution;
  factor_source?: FactorSource;
  five_factor_source?: FactorSource;
  period?: string;
  data_points?: number;
}

interface FactorModelCardProps {
  data: FactorModelData | null | undefined;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const toFin = (value: unknown): number => {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
};

const fmtSignedExposure = (value: unknown): string => {
  const n = toFin(value);
  return `${n > 0 ? '+' : ''}${n.toFixed(3)}`;
};

const fmtPValue = (value: unknown): string => {
  const n = Number(value);
  if (!Number.isFinite(n)) return 'n/a';
  if (n > 0 && n < 0.001) return '<0.001';
  return n.toFixed(3);
};

const FF3_META = [
  { key: 'market', label: '市场', factor: 'Mkt-RF', color: '#1677ff' },
  { key: 'size', label: '规模', factor: 'SMB', color: '#13c2c2' },
  { key: 'value', label: '价值', factor: 'HML', color: '#fa8c16' },
] as const;

interface ExposureItem {
  key: string;
  label: string;
  factor: string;
  color: string;
  exposure: number;
  pValue: unknown;
  significant: boolean;
  direction: string;
}

function buildExposureData(ff3: FF3Model): ExposureItem[] {
  return FF3_META.map((meta) => {
    const exposure = toFin(ff3.factor_loadings?.[meta.key as keyof FactorLoadings]);
    const pValue = ff3.significance?.[`${meta.key}_p_value` as keyof FactorSignificance];
    const pNum = Number(pValue);
    return {
      ...meta,
      exposure,
      pValue,
      significant: Number.isFinite(pNum) && pNum <= 0.1,
      direction: exposure > 0 ? '顺向' : exposure < 0 ? '反向' : '中性',
    };
  });
}

function symmetricDomain(items: ExposureItem[]): [number, number] {
  const largest = Math.max(0.4, ...items.map((i) => Math.abs(i.exposure)));
  const bound = Math.ceil(largest * 10) / 10;
  return [-bound, bound];
}

// ---------------------------------------------------------------------------
// Sub-sections
// ---------------------------------------------------------------------------

function StatGrid({
  items,
}: {
  items: { label: string; value: React.ReactNode; className?: string }[];
}) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {items.map((item) => (
        <div key={item.label} className="flex flex-col gap-0.5">
          <span className="text-xs text-muted-foreground">{item.label}</span>
          <span className={`font-mono text-sm font-semibold ${item.className ?? ''}`}>
            {item.value}
          </span>
        </div>
      ))}
    </div>
  );
}

function TagRow({ items }: { items: string[] }) {
  return (
    <div className="flex flex-wrap gap-1 mt-2">
      {items.map((t) => (
        <span
          key={t}
          className="inline-flex items-center rounded border border-border px-1.5 py-0.5 text-xs text-muted-foreground font-mono"
        >
          {t}
        </span>
      ))}
    </div>
  );
}

function SectionDivider({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-2 my-3">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      <div className="flex-1 border-t border-border" />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main card
// ---------------------------------------------------------------------------

export function FactorModelCard({ data }: FactorModelCardProps): React.JSX.Element | null {
  if (!data) return null;

  const capm = data.capm ?? {};
  const ff3 = data.fama_french ?? {};
  const ff5 = data.fama_french_five_factor ?? {};
  const attribution = data.attribution ?? {};
  const factorSource = data.factor_source ?? {};
  const fiveFactorSource = data.five_factor_source ?? {};

  const hasCAPM = !capm.error;
  const hasFF3 = !ff3.error;
  const hasFF5 = !ff5.error;

  const exposureData = hasFF3 ? buildExposureData(ff3) : [];
  const exposureDomain = symmetricDomain(exposureData);
  const dominant = exposureData.reduce<ExposureItem | undefined>(
    (cur, item) => (Math.abs(item.exposure) > Math.abs(cur?.exposure ?? 0) ? item : cur),
    exposureData[0],
  );

  const attributionRows: { name: string; pct: number }[] = attribution.components
    ? Object.values(attribution.components).map((c) => ({
        name: c.label.replace('贡献', ''),
        pct: toFin(c.pct),
      }))
    : [];

  return (
    <Card data-testid="pricing-factor-card">
      <CardHeader>
        <CardTitle>因子模型分析</CardTitle>
        <CardAction>
          <div className="flex gap-1">
            {data.period && (
              <span className="inline-flex items-center rounded border border-border px-1.5 py-0.5 text-xs text-muted-foreground font-mono">
                {data.period}
              </span>
            )}
            {data.data_points != null && (
              <span className="inline-flex items-center rounded border border-border px-1.5 py-0.5 text-xs text-muted-foreground font-mono">
                样本 {data.data_points}
              </span>
            )}
            {factorSource.is_proxy && (
              <span className="inline-flex items-center rounded border border-amber-500/40 bg-amber-500/10 px-1.5 py-0.5 text-xs text-amber-400 font-mono">
                代理因子
              </span>
            )}
          </div>
        </CardAction>
      </CardHeader>

      <CardContent className="space-y-1">
        {/* Factor source warnings */}
        {factorSource.warning && (
          <div className="rounded-md border border-border bg-muted/30 px-3 py-2 text-xs text-muted-foreground mb-2">
            <span className="font-medium">因子来源：{factorSource.label}</span>
            {' — '}
            {factorSource.warning}
          </div>
        )}
        {fiveFactorSource.warning && fiveFactorSource.warning !== factorSource.warning && (
          <div className="rounded-md border border-border bg-muted/30 px-3 py-2 text-xs text-muted-foreground mb-2">
            <span className="font-medium">五因子来源：{fiveFactorSource.label}</span>
            {' — '}
            {fiveFactorSource.warning}
          </div>
        )}

        {/* ── CAPM ── */}
        <SectionDivider label="CAPM 模型" />
        {hasCAPM ? (
          <>
            <StatGrid
              items={[
                {
                  label: 'Alpha (年化)',
                  value: `${toFin(capm.alpha_pct).toFixed(2)}%`,
                  className: toFin(capm.alpha_pct) > 0 ? 'text-pos' : 'text-neg',
                },
                { label: 'Beta', value: toFin(capm.beta).toFixed(3) },
                { label: 'R²', value: `${(toFin(capm.r_squared) * 100).toFixed(1)}%` },
                {
                  label: 'DW',
                  value: toFin(capm.residual_diagnostics?.durbin_watson).toFixed(2),
                },
              ]}
            />
            {capm.significance && (
              <TagRow
                items={[
                  `Alpha t=${capm.significance.alpha_t_stat}`,
                  `Alpha p=${capm.significance.alpha_p_value}`,
                  `Beta t=${capm.significance.beta_t_stat}`,
                ]}
              />
            )}
          </>
        ) : (
          <p className="text-xs text-muted-foreground">{capm.error}</p>
        )}

        {/* ── FF3 ── */}
        <SectionDivider label="Fama-French 三因子" />
        {hasFF3 ? (
          <>
            <StatGrid
              items={[
                {
                  label: 'FF3 Alpha',
                  value: `${toFin(ff3.alpha_pct).toFixed(2)}%`,
                  className: toFin(ff3.alpha_pct) > 0 ? 'text-pos' : 'text-neg',
                },
                { label: '市场 (Mkt-RF)', value: toFin(ff3.factor_loadings?.market).toFixed(3) },
                { label: '规模 (SMB)', value: toFin(ff3.factor_loadings?.size).toFixed(3) },
                { label: '价值 (HML)', value: toFin(ff3.factor_loadings?.value).toFixed(3) },
              ]}
            />
            <p className="text-xs text-muted-foreground mt-1">
              R² = {(toFin(ff3.r_squared) * 100).toFixed(1)}%
            </p>
            {ff3.significance && (
              <TagRow
                items={[
                  `Alpha p=${fmtPValue(ff3.significance.alpha_p_value)}`,
                  `市场 p=${fmtPValue(ff3.significance.market_p_value)}`,
                  `规模 p=${fmtPValue(ff3.significance.size_p_value)}`,
                  `价值 p=${fmtPValue(ff3.significance.value_p_value)}`,
                ]}
              />
            )}

            {/* FF3 factor exposure bar chart */}
            {exposureData.length > 0 && (
              <div className="mt-3">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-medium">因子暴露分解</span>
                  <div className="flex gap-1">
                    {dominant && (
                      <span
                        className={`inline-flex items-center rounded border px-1.5 py-0.5 text-xs font-mono ${dominant.significant ? 'border-primary/40 text-primary' : 'border-border text-muted-foreground'}`}
                      >
                        {dominant.label}因子主导
                      </span>
                    )}
                    <span className="inline-flex items-center rounded border border-border px-1.5 py-0.5 text-xs text-muted-foreground font-mono">
                      R² {(toFin(ff3.r_squared) * 100).toFixed(1)}%
                    </span>
                  </div>
                </div>
                <div data-testid="ff3-exposure-chart" style={{ width: '100%', height: 180 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={exposureData}
                      margin={{ top: 16, right: 12, left: -8, bottom: 4 }}
                    >
                      <CartesianGrid
                        strokeDasharray="3 3"
                        vertical={false}
                        stroke={CHART_GRID_COLOR}
                      />
                      <XAxis
                        dataKey="label"
                        tickLine={false}
                        tick={{ fill: CHART_TICK_COLOR, fontSize: 11 }}
                      />
                      <YAxis
                        domain={exposureDomain}
                        tickFormatter={(v) => Number(v).toFixed(1)}
                        tickLine={false}
                        tick={{ fill: CHART_TICK_COLOR, fontSize: 11 }}
                        width={42}
                      />
                      <ReferenceLine y={0} stroke="rgba(148,163,184,0.7)" strokeDasharray="4 4" />
                      <RechartsTooltip
                        contentStyle={CHART_TOOLTIP_STYLE}
                        formatter={(value: unknown, _name: unknown, item: { payload?: ExposureItem }) => [
                          fmtSignedExposure(value),
                          `${item?.payload?.factor ?? 'FF3'} ${item?.payload?.direction ?? ''}暴露`,
                        ]}
                        labelFormatter={(label) => `${String(label ?? '')}因子`}
                      />
                      <Bar
                        dataKey="exposure"
                        name="因子暴露"
                        radius={[7, 7, 7, 7]}
                        barSize={54}
                        isAnimationActive={false}
                      >
                        {exposureData.map((item) => (
                          <Cell
                            key={item.key}
                            fill={item.exposure >= 0 ? item.color : '#ff7875'}
                            stroke={
                              item.significant
                                ? item.color
                                : 'rgba(148,163,184,0.56)'
                            }
                            strokeWidth={item.significant ? 2 : 1}
                          />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                {/* Legend */}
                <div className="flex flex-col gap-0.5 mt-1">
                  {exposureData.map((item) => (
                    <div key={item.key} className="flex items-center gap-2 text-xs">
                      <span
                        className="inline-block w-2.5 h-2.5 rounded-sm flex-shrink-0"
                        style={{ background: item.exposure >= 0 ? item.color : '#ff7875' }}
                      />
                      <span className="text-muted-foreground">
                        {item.label} {item.factor}
                      </span>
                      <span className="font-mono text-muted-foreground ml-auto">
                        {fmtSignedExposure(item.exposure)} · {item.direction} · p=
                        {fmtPValue(item.pValue)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        ) : (
          <p className="text-xs text-muted-foreground">{ff3.error}</p>
        )}

        {/* ── FF5 ── */}
        <SectionDivider label="Fama-French 五因子" />
        {hasFF5 ? (
          <>
            <StatGrid
              items={[
                {
                  label: 'FF5 Alpha',
                  value: `${toFin(ff5.alpha_pct).toFixed(2)}%`,
                  className: toFin(ff5.alpha_pct) > 0 ? 'text-pos' : 'text-neg',
                },
                {
                  label: '盈利能力 (RMW)',
                  value: toFin(ff5.factor_loadings?.profitability).toFixed(3),
                },
                {
                  label: '投资 (CMA)',
                  value: toFin(ff5.factor_loadings?.investment).toFixed(3),
                },
                { label: 'R²', value: `${(toFin(ff5.r_squared) * 100).toFixed(1)}%` },
              ]}
            />
            {ff5.significance && (
              <TagRow
                items={[
                  `盈利 p=${fmtPValue(ff5.significance.profitability_p_value)}`,
                  `投资 p=${fmtPValue(ff5.significance.investment_p_value)}`,
                ]}
              />
            )}
          </>
        ) : (
          <p className="text-xs text-muted-foreground">{ff5.error}</p>
        )}

        {/* ── Attribution ── */}
        {attributionRows.length > 0 && (
          <>
            <SectionDivider label="因子归因" />
            <div style={{ width: '100%', height: 200 }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={attributionRows}>
                  <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID_COLOR} />
                  <XAxis
                    dataKey="name"
                    tick={{ fill: CHART_TICK_COLOR, fontSize: 11 }}
                  />
                  <YAxis tick={{ fill: CHART_TICK_COLOR, fontSize: 11 }} />
                  <RechartsTooltip
                    contentStyle={CHART_TOOLTIP_STYLE}
                    formatter={(v: unknown) => [`${toFin(v).toFixed(2)}%`, '贡献']}
                  />
                  <Bar dataKey="pct" radius={[6, 6, 0, 0]} isAnimationActive={false}>
                    {attributionRows.map((item) => (
                      <Cell
                        key={item.name}
                        fill={item.pct >= 0 ? '#5FBF7E' : '#E5685A'}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
