// ---------------------------------------------------------------------------
// PeopleLayerCard — shadcn/Tailwind presentation component
// Rebuilt from frontend/src/components/pricing/PricingInsightCards.js (PeopleLayerCard export)
// Props: data, overlay — nested paths follow the old component exactly.
// No API calls. No `any`.
// ---------------------------------------------------------------------------

import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { getSourceModeLabel } from '@/features/pricing/lib/pricingResearch';

// ---------------------------------------------------------------------------
// Types — narrow; all fields optional
// ---------------------------------------------------------------------------

interface ExecutiveProfile {
  technical_authority_score?: number | string | null;
  capital_markets_pressure?: number | string | null;
  leadership_balance?: string;
  average_tenure_years?: number | string | null;
  summary?: string;
}

interface InsiderFlow {
  label?: string;
  net_action?: string;
  transaction_count?: number | string | null;
  summary?: string;
}

interface HiringSignal {
  signal?: string;
  dilution_ratio?: number | string | null;
  tech_ratio?: number | string | null;
  alert_message?: string;
}

interface SourceModeSummary {
  label?: string;
  coverage?: number | string | null;
  official_share?: number | string | null;
  fallback_share?: number | string | null;
  dominant?: string;
}

interface PolicyExecutionContext {
  label?: string;
  top_department?: string;
  reversal_count?: number | string | null;
  execution_status?: string;
  lag_days?: number | string | null;
  summary?: string;
  reason?: string;
}

export interface PeopleLayerData {
  stance?: string;
  risk_level?: string;
  confidence?: number | string | null;
  summary?: string;
  flags?: string[];
  notes?: string[];
  executive_profile?: ExecutiveProfile;
  insider_flow?: InsiderFlow;
  hiring_signal?: HiringSignal;
  /** Provenance fields forwarded from the backend people_signal_analyzer. */
  data_mode?: string;
  source?: string;
}

export interface PeopleLayerOverlay {
  label?: string;
  governance_discount_pct?: number | string | null;
  confidence?: number | string | null;
  summary?: string;
  executive_evidence?: ExecutiveProfile;
  insider_evidence?: InsiderFlow;
  hiring_evidence?: HiringSignal;
  source_mode_summary?: SourceModeSummary;
  policy_execution_context?: PolicyExecutionContext;
}

export interface PeopleLayerCardProps {
  data: PeopleLayerData;
  overlay?: PeopleLayerOverlay | null;
}

// ---------------------------------------------------------------------------
// Constants (mirrors the old component)
// ---------------------------------------------------------------------------

const PEOPLE_RISK_LABELS: Record<string, string> = {
  low: '低',
  medium: '中',
  high: '高',
};

const PEOPLE_STANCE_LABELS: Record<string, string> = {
  supportive: '支撑',
  balanced: '均衡',
  fragile: '脆弱',
};

const PEOPLE_SIGNAL_LABELS: Record<string, string> = {
  bullish: '偏多',
  bearish: '偏空',
  neutral: '中性',
  mixed: '分歧',
};

const INSIDER_ACTION_LABELS: Record<string, string> = {
  buying: '增持',
  selling: '减持',
  neutral: '中性',
  mixed: '分歧',
};

const POLICY_EXECUTION_LABELS: Record<string, string> = {
  chaotic: '混乱',
  watch: '观察',
  stable: '稳定',
};

const POLICY_EXECUTION_STATUS_LABELS: Record<string, string> = {
  lagging: '滞后执行',
  reversal_cluster: '反转聚集',
  stable: '稳定执行',
  normal: '正常推进',
};

const INLINE_PEOPLE_ENUM_LABELS: Record<string, string> = {
  buying: '增持',
  selling: '减持',
  mixed: '分歧',
  neutral: '中性',
  bullish: '偏多',
  bearish: '偏空',
  chaotic: '混乱',
  watch: '观察',
  lagging: '滞后执行',
  reversal_cluster: '反转聚集',
  low: '低',
  medium: '中',
  high: '高',
};

/** Localize inline enum keywords embedded in free text strings */
const localizePeopleLayerText = (value: string | undefined | null): string =>
  String(value ?? '').replace(
    /\b(buying|selling|mixed|neutral|bullish|bearish|chaotic|watch|lagging|reversal_cluster|low|medium|high)\b/g,
    (match) => INLINE_PEOPLE_ENUM_LABELS[match] ?? match,
  );

/** Map source mode label to Badge variant */
const sourceModeBadgeVariant = (
  label: string,
): 'destructive' | 'default' | 'secondary' => {
  switch (label) {
    case 'fallback-heavy':
      return 'destructive';
    case 'official-led':
      return 'default';
    default:
      return 'secondary';
  }
};

/** Map policy label to Badge variant */
const policyBadgeVariant = (
  labelKey: string,
): 'destructive' | 'secondary' | 'default' => {
  switch (labelKey) {
    case 'chaotic':
      return 'destructive';
    case 'watch':
      return 'secondary';
    default:
      return 'default';
  }
};

/** Map risk key to Badge variant */
const riskBadgeVariant = (
  riskKey: string,
): 'destructive' | 'secondary' | 'default' | 'outline' => {
  switch (riskKey) {
    case 'high':
      return 'destructive';
    case 'medium':
      return 'secondary';
    case 'low':
      return 'default';
    default:
      return 'outline';
  }
};

/** Governance discount badge variant */
const governanceBadgeVariant = (
  pct: number,
): 'destructive' | 'secondary' | 'default' | 'outline' => {
  if (pct >= 10) return 'destructive';
  if (pct >= 4) return 'secondary';
  if (pct >= 0) return 'outline';
  return 'default'; // negative = execution support
};

/** Inline progress bar */
function ProgressBar({
  value,
  colorClass,
}: {
  value: number;
  colorClass: string;
}) {
  return (
    <div className="h-1.5 w-full rounded-full bg-secondary overflow-hidden">
      <div
        className={`h-full rounded-full transition-all ${colorClass}`}
        style={{ width: `${Math.min(Math.max(value, 0), 100)}%` }}
      />
    </div>
  );
}

/** Capital markets pressure progress bar — red when high */
const capitalPressureColor = (val: number): string =>
  val > 0.55 ? 'bg-destructive' : 'bg-primary';

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function PeopleLayerCard({ data, overlay = null }: PeopleLayerCardProps) {
  // Mirror old: return null if both data and overlay are empty
  const dataEmpty = !data || !Object.keys(data).length;
  const overlayEmpty = !overlay || !Object.keys(overlay).length;
  if (dataEmpty && overlayEmpty) return null;

  // Resolve sub-objects (overlay evidence takes precedence where available)
  const executive: ExecutiveProfile =
    data?.executive_profile ?? overlay?.executive_evidence ?? {};
  const insider: InsiderFlow =
    data?.insider_flow ?? overlay?.insider_evidence ?? {};
  const hiring: HiringSignal =
    data?.hiring_signal ?? overlay?.hiring_evidence ?? {};
  const policyCtx: PolicyExecutionContext =
    overlay?.policy_execution_context ?? {};
  const sourceMode: SourceModeSummary =
    overlay?.source_mode_summary ?? {};

  const stanceKey = String(data?.stance ?? 'balanced').toLowerCase();
  const riskKey = String(data?.risk_level ?? 'medium').toLowerCase();
  const insiderActionKey = String(insider.net_action ?? '').toLowerCase();
  const hiringSignalKey = String(hiring.signal ?? 'neutral').toLowerCase();
  const policyLabelKey = String(policyCtx.label ?? '').toLowerCase();
  const policyStatusKey = String(policyCtx.execution_status ?? '').toLowerCase();
  const sourceModeLabel = String(sourceMode.label ?? '').toLowerCase();

  const stanceLabel = PEOPLE_STANCE_LABELS[stanceKey] ?? '均衡';
  const riskLabel = PEOPLE_RISK_LABELS[riskKey] ?? PEOPLE_RISK_LABELS['medium'];

  const governanceDiscountPct = Number(overlay?.governance_discount_pct ?? 0);

  // Alert type for overlay summary
  const overlayAlertIntent: 'warning' | 'info' =
    governanceDiscountPct >= 4 ? 'warning' : 'info';

  // Executive scores
  const techAuthorityPct = Math.round(Number(executive.technical_authority_score ?? 0) * 100);
  const capitalPressurePct = Math.round(Number(executive.capital_markets_pressure ?? 0) * 100);

  const hasFooter = !!(overlay?.source_mode_summary || policyCtx?.label);

  // Curated flag: show the prominent badge when data_mode is curated OR when neither live nor
  // real-time is indicated (absence of data_mode also means catalog data).
  const isCurated =
    !data?.data_mode || data.data_mode === 'curated' || data.data_mode === '';

  return (
    <Card data-testid="pricing-people-layer-card" className="bg-card border-border">
      <CardHeader className="pb-2">
        <div className="flex flex-wrap items-center gap-2">
          <CardTitle className="text-foreground">人的维度 / 治理折扣</CardTitle>
          {/* Bug B fix: prominent curated/honesty badge near the heading */}
          {isCurated && (
            <Badge
              variant="secondary"
              className="text-xs font-semibold border border-yellow-500/50 bg-yellow-500/10 text-yellow-700 dark:text-yellow-400"
              data-testid="people-layer-curated-badge"
            >
              示意数据 · CURATED
            </Badge>
          )}
        </div>
      </CardHeader>

      <CardContent className="flex flex-col gap-4">
        {/* Top tag row */}
        <div className="flex flex-wrap gap-1.5">
          <Badge variant="secondary">组织姿态 {stanceLabel}</Badge>
          <Badge variant={riskBadgeVariant(riskKey)}>组织风险 {riskLabel}</Badge>
          {data?.confidence !== undefined && data?.confidence !== null && (
            <Badge variant="outline" className="text-xs">
              置信度 {Number(data.confidence).toFixed(2)}
            </Badge>
          )}
          {overlay?.label && (
            <Badge variant={governanceBadgeVariant(governanceDiscountPct)}>
              {overlay.label}
            </Badge>
          )}
          {overlay?.governance_discount_pct !== undefined &&
            overlay?.governance_discount_pct !== null && (
              <Badge variant={governanceBadgeVariant(governanceDiscountPct)} className="text-xs">
                {governanceDiscountPct >= 0
                  ? `治理折价 ${governanceDiscountPct.toFixed(1)}%`
                  : `执行支撑 ${Math.abs(governanceDiscountPct).toFixed(1)}%`}
              </Badge>
            )}
          {overlay?.confidence !== undefined && overlay?.confidence !== null && (
            <Badge variant="outline" className="text-xs">
              治理置信度 {Number(overlay.confidence).toFixed(2)}
            </Badge>
          )}
          {overlay?.source_mode_summary && (
            <Badge variant={sourceModeBadgeVariant(sourceModeLabel)} className="text-xs">
              来源 {getSourceModeLabel(sourceMode as Record<string, unknown>)}
            </Badge>
          )}
        </div>

        {/* Summary / alert */}
        {overlay?.summary ? (
          <div
            className={`rounded-lg border px-3 py-2 text-sm leading-snug ${
              overlayAlertIntent === 'warning'
                ? 'border-yellow-500/40 bg-yellow-500/10 text-foreground'
                : 'border-border bg-card/50 text-muted-foreground'
            }`}
          >
            <p className="font-medium text-xs mb-1">{overlay.label ?? '治理折扣'}</p>
            <p className="text-xs">{localizePeopleLayerText(overlay.summary)}</p>
          </div>
        ) : data?.summary ? (
          <p className="text-sm text-muted-foreground leading-snug">
            {localizePeopleLayerText(data.summary)}
          </p>
        ) : null}

        {/* 3-column grid: management / insider / hiring */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {/* Management profile */}
          <div className="rounded-lg border border-border p-3">
            <div className="flex items-center gap-1.5">
              <p className="text-sm font-semibold text-foreground">管理层画像</p>
              {/* Bug C fix: inline curated marker so synthetic numbers are never naked */}
              {isCurated && (
                <span
                  className="text-[10px] font-medium text-yellow-600 dark:text-yellow-400 opacity-80"
                  data-testid="people-layer-executive-curated-inline"
                >
                  示意
                </span>
              )}
            </div>
            <div className="mt-2 flex flex-col gap-2">
              <div>
                <p className="text-xs text-muted-foreground mb-0.5">技术决策权</p>
                <ProgressBar value={techAuthorityPct} colorClass="bg-primary" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-0.5">资本市场压力</p>
                <ProgressBar
                  value={capitalPressurePct}
                  colorClass={capitalPressureColor(Number(executive.capital_markets_pressure ?? 0))}
                />
              </div>
            </div>
            <p className="mt-2 text-xs text-muted-foreground leading-snug">
              {localizePeopleLayerText(executive.leadership_balance) || '管理层结构待确认'}
              {executive.average_tenure_years
                ? ` · 平均任期 ${executive.average_tenure_years} 年`
                : ''}
              {executive.summary
                ? ` · ${localizePeopleLayerText(executive.summary)}`
                : ''}
            </p>
          </div>

          {/* Insider trading */}
          <div className="rounded-lg border border-border p-3">
            <div className="flex items-center gap-1.5">
              <p className="text-sm font-semibold text-foreground">内部人交易</p>
              {isCurated && (
                <span
                  className="text-[10px] font-medium text-yellow-600 dark:text-yellow-400 opacity-80"
                  data-testid="people-layer-insider-curated-inline"
                >
                  示意
                </span>
              )}
            </div>
            <div className="mt-2 flex flex-wrap gap-1.5">
              <Badge variant="outline" className="text-xs">
                {localizePeopleLayerText(insider.label) || '信号中性'}
              </Badge>
              {insider.net_action && (
                <Badge variant="outline" className="text-xs">
                  动作 {INSIDER_ACTION_LABELS[insiderActionKey] ?? '待确认'}
                </Badge>
              )}
              {insider.transaction_count !== undefined &&
                insider.transaction_count !== null && (
                  <Badge variant="outline" className="text-xs">
                    笔数 {insider.transaction_count}
                  </Badge>
                )}
            </div>
            <p className="mt-2 text-xs text-muted-foreground leading-snug">
              {localizePeopleLayerText(insider.summary) || '暂无可用内部人交易数据'}
            </p>
          </div>

          {/* Hiring dilution */}
          <div className="rounded-lg border border-border p-3">
            <div className="flex items-center gap-1.5">
              <p className="text-sm font-semibold text-foreground">招聘稀释度</p>
              {isCurated && (
                <span
                  className="text-[10px] font-medium text-yellow-600 dark:text-yellow-400 opacity-80"
                  data-testid="people-layer-hiring-curated-inline"
                >
                  示意
                </span>
              )}
            </div>
            <div className="mt-2 flex flex-wrap gap-1.5">
              <Badge variant="outline" className="text-xs">
                信号 {PEOPLE_SIGNAL_LABELS[hiringSignalKey] ?? '中性'}
              </Badge>
              {hiring.dilution_ratio !== undefined && hiring.dilution_ratio !== null && (
                <Badge
                  variant={Number(hiring.dilution_ratio) > 1.5 ? 'destructive' : 'outline'}
                  className="text-xs"
                >
                  稀释度 {Number(hiring.dilution_ratio).toFixed(2)}
                </Badge>
              )}
              {hiring.tech_ratio !== undefined && hiring.tech_ratio !== null && (
                <Badge variant="outline" className="text-xs">
                  技术占比 {(Number(hiring.tech_ratio) * 100).toFixed(0)}%
                </Badge>
              )}
            </div>
            <p className="mt-2 text-xs text-muted-foreground leading-snug">
              {localizePeopleLayerText(hiring.alert_message) ||
                '当前招聘结构未触发强烈组织风险预警'}
            </p>
          </div>
        </div>

        {/* Footer: source governance + policy execution context */}
        {hasFooter && (
          <div className="flex flex-col gap-2">
            {overlay?.source_mode_summary && (
              <div className="rounded-lg border border-border bg-card/50 px-3 py-2">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-xs font-semibold text-foreground">证据来源治理</span>
                  <Badge
                    variant={sourceModeBadgeVariant(sourceModeLabel)}
                    className="text-xs"
                  >
                    {getSourceModeLabel(sourceMode as Record<string, unknown>)}
                  </Badge>
                  {sourceMode.coverage !== undefined && sourceMode.coverage !== null && (
                    <Badge variant="outline" className="text-xs">
                      覆盖 {Number(sourceMode.coverage)}
                    </Badge>
                  )}
                </div>
                <p className="mt-1.5 text-xs text-muted-foreground">
                  官方/披露占比{' '}
                  {`${Math.round(Number(sourceMode.official_share ?? 0) * 100)}%`}
                  {' · '}
                  回退占比{' '}
                  {`${Math.round(Number(sourceMode.fallback_share ?? 0) * 100)}%`}
                </p>
              </div>
            )}
            {policyCtx?.label && (
              <div className="rounded-lg border border-border bg-card/50 px-3 py-2">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-xs font-semibold text-foreground">政策执行上下文</span>
                  <Badge
                    variant={policyBadgeVariant(policyLabelKey)}
                    className="text-xs"
                  >
                    {POLICY_EXECUTION_LABELS[policyLabelKey] ?? '待确认'}
                  </Badge>
                  {policyCtx.top_department && (
                    <Badge variant="outline" className="text-xs">
                      {policyCtx.top_department}
                    </Badge>
                  )}
                  {policyCtx.reversal_count !== undefined &&
                    policyCtx.reversal_count !== null && (
                      <Badge variant="outline" className="text-xs">
                        反转 {policyCtx.reversal_count}
                      </Badge>
                    )}
                </div>
                <p className="mt-1.5 text-xs text-muted-foreground leading-snug">
                  {localizePeopleLayerText(
                    policyCtx.summary ?? policyCtx.reason,
                  ) || '当前暂无显著政策执行噪音。'}
                  {policyCtx.execution_status
                    ? ` · 执行状态 ${POLICY_EXECUTION_STATUS_LABELS[policyStatusKey] ?? '待确认'}`
                    : ''}
                  {policyCtx.lag_days !== undefined && policyCtx.lag_days !== null
                    ? ` · 滞后 ${policyCtx.lag_days} 天`
                    : ''}
                </p>
              </div>
            )}
          </div>
        )}

        {/* Governance flags */}
        {(data?.flags?.length ?? 0) > 0 && (
          <div className="flex flex-col gap-1.5">
            <span className="text-xs text-muted-foreground">治理提示</span>
            <div className="flex flex-wrap gap-1.5">
              {(data.flags ?? []).map((flag) => (
                <Badge key={flag} variant="outline" className="text-xs">
                  {localizePeopleLayerText(flag)}
                </Badge>
              ))}
            </div>
          </div>
        )}

        {/* Notes alert */}
        {(data?.notes?.length ?? 0) > 0 && (
          <div
            className={`rounded-lg border px-3 py-2 text-xs leading-snug ${
              data?.risk_level === 'high'
                ? 'border-yellow-500/40 bg-yellow-500/10 text-foreground'
                : 'border-border bg-card/50 text-muted-foreground'
            }`}
          >
            <p className="font-medium text-xs mb-1">人的维度补充判断</p>
            <p>
              {localizePeopleLayerText(
                (data.notes ?? []).slice(0, 2).join(' '),
              )}
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default PeopleLayerCard;
