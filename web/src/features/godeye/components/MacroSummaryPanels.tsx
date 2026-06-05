// ---------------------------------------------------------------------------
// MacroSummaryPanels — shadcn/Tailwind presentation components
// Rebuilt from frontend/src/components/GodEyeDashboard/MacroSummaryPanels.js (113)
// Exports: PeopleLayerPanel, DepartmentChaosPanel, InputReliabilityPanel
// Props in. No API calls.
// ---------------------------------------------------------------------------

import { Badge } from '@/components/ui/badge';
import {
  peopleLayerColor,
  departmentChaosColor,
  reliabilityColor,
} from '@/features/godeye/lib/macroFactorColors';
import {
  getGodEyeDepartmentLabel,
  getGodEyeStatusLabel,
  localizeGodEyeText,
} from '@/features/godeye/lib/displayLabels';

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------

const colorToVariant = (color: string): 'destructive' | 'outline' | 'secondary' | 'default' => {
  switch (color) {
    case 'red':
    case 'volcano':
      return 'destructive';
    case 'green':
      return 'outline';
    default:
      return 'secondary';
  }
};

// ---------------------------------------------------------------------------
// PeopleLayerPanel
// ---------------------------------------------------------------------------

export interface PeopleLayerSummary {
  label?: string;
  avg_fragility_score?: number;
  avg_quality_score?: number;
  fragile_company_count?: number;
  summary?: string;
  watchlist?: Array<{ symbol: string }>;
  fragile_companies?: Array<{ symbol: string; people_fragility_score?: number }>;
}

export interface PeopleLayerPanelProps {
  peopleLayerSummary?: PeopleLayerSummary;
}

export function PeopleLayerPanel({ peopleLayerSummary }: PeopleLayerPanelProps) {
  if (!peopleLayerSummary?.label) return null;

  const label = peopleLayerSummary.label;
  const color = peopleLayerColor[label] ?? 'blue';

  return (
    <div className="rounded-xl p-3 bg-card border border-border">
      <div className="flex flex-wrap justify-between gap-3">
        <div className="flex flex-wrap gap-2 items-center">
          <Badge variant={colorToVariant(color)}>
            人的维度 {getGodEyeStatusLabel('peopleLayer', label)}
          </Badge>
          <span className="text-xs text-muted-foreground">
            脆弱度 {Number(peopleLayerSummary.avg_fragility_score ?? 0).toFixed(2)}
          </span>
          <span className="text-xs text-muted-foreground">
            质量分 {Number(peopleLayerSummary.avg_quality_score ?? 0).toFixed(2)}
          </span>
          <span className="text-xs text-muted-foreground">
            高风险 {Number(peopleLayerSummary.fragile_company_count ?? 0)}
          </span>
        </div>
        {peopleLayerSummary.watchlist?.length ? (
          <span className="text-xs text-muted-foreground">
            重点观察 {(peopleLayerSummary.watchlist ?? []).slice(0, 3).map((item) => item.symbol).join('、')}
          </span>
        ) : null}
      </div>

      {peopleLayerSummary.summary ? (
        <div className="mt-2 text-sm text-foreground">
          {localizeGodEyeText(peopleLayerSummary.summary)}
        </div>
      ) : null}

      {peopleLayerSummary.fragile_companies?.length ? (
        <div className="mt-2 flex flex-wrap gap-1">
          {(peopleLayerSummary.fragile_companies ?? []).map((item) => (
            <Badge key={item.symbol} variant="destructive">
              {item.symbol} 脆弱度 {Number(item.people_fragility_score ?? 0).toFixed(2)}
            </Badge>
          ))}
        </div>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// DepartmentChaosPanel
// ---------------------------------------------------------------------------

export interface DepartmentChaosItem {
  department?: string;
  department_zh?: string;
  department_label?: string;
  label?: string;
  chaos_score?: number;
}

export interface DepartmentChaosSummary {
  label?: string;
  avg_chaos_score?: number;
  department_count?: number;
  chaotic_department_count?: number;
  summary?: string;
  top_departments?: DepartmentChaosItem[];
}

export interface DepartmentChaosPanelProps {
  departmentChaosSummary?: DepartmentChaosSummary;
}

export function DepartmentChaosPanel({ departmentChaosSummary }: DepartmentChaosPanelProps) {
  if (!departmentChaosSummary?.label) return null;

  const label = departmentChaosSummary.label;
  const color = departmentChaosColor[label] ?? 'blue';

  return (
    <div className="rounded-xl p-3 bg-card border border-border">
      <div className="flex flex-wrap justify-between gap-3">
        <div className="flex flex-wrap gap-2 items-center">
          <Badge variant={colorToVariant(color)}>
            部门 {getGodEyeStatusLabel('departmentChaos', label)}
          </Badge>
          <span className="text-xs text-muted-foreground">
            混乱度 {Number(departmentChaosSummary.avg_chaos_score ?? 0).toFixed(2)}
          </span>
          <span className="text-xs text-muted-foreground">
            主体 {Number(departmentChaosSummary.department_count ?? 0)}
          </span>
          <span className="text-xs text-muted-foreground">
            高混乱 {Number(departmentChaosSummary.chaotic_department_count ?? 0)}
          </span>
        </div>
        {departmentChaosSummary.top_departments?.length ? (
          <span className="text-xs text-muted-foreground">
            重点部门{' '}
            {(departmentChaosSummary.top_departments ?? [])
              .slice(0, 3)
              .map((item) => getGodEyeDepartmentLabel(item))
              .join('、')}
          </span>
        ) : null}
      </div>

      {departmentChaosSummary.summary ? (
        <div className="mt-2 text-sm text-foreground">
          {localizeGodEyeText(departmentChaosSummary.summary)}
        </div>
      ) : null}

      {departmentChaosSummary.top_departments?.length ? (
        <div className="mt-2 flex flex-wrap gap-1">
          {(departmentChaosSummary.top_departments ?? []).slice(0, 4).map((item) => (
            <Badge
              key={item.department ?? item.department_zh ?? item.department_label ?? 'dept'}
              variant={colorToVariant(departmentChaosColor[item.label ?? ''] ?? 'blue')}
            >
              {getGodEyeDepartmentLabel(item)} 混乱度 {Number(item.chaos_score ?? 0).toFixed(2)}
            </Badge>
          ))}
        </div>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// InputReliabilityPanel
// ---------------------------------------------------------------------------

export interface InputReliabilitySummary {
  label?: string;
  score?: number;
  issue_factor_hits?: number;
  support_factor_hits?: number;
  dominant_issue_labels?: string[];
  lead?: string;
  posture?: string;
  reason?: string;
}

export interface InputReliabilityPanelProps {
  inputReliabilitySummary?: InputReliabilitySummary;
}

export function InputReliabilityPanel({ inputReliabilitySummary }: InputReliabilityPanelProps) {
  if (!inputReliabilitySummary?.label) return null;

  const label = inputReliabilitySummary.label;
  const color = reliabilityColor[label] ?? 'blue';

  return (
    <div className="rounded-xl p-3 bg-card border border-border">
      <div className="flex flex-wrap justify-between gap-3">
        <div className="flex flex-wrap gap-2 items-center">
          <Badge variant={colorToVariant(color)}>
            输入可靠度 {getGodEyeStatusLabel('inputReliability', label)}
          </Badge>
          <span className="text-xs text-muted-foreground">
            评分 {Number(inputReliabilitySummary.score ?? 0).toFixed(2)}
          </span>
          <span className="text-xs text-muted-foreground">
            风险命中 {Number(inputReliabilitySummary.issue_factor_hits ?? 0)}
          </span>
          <span className="text-xs text-muted-foreground">
            支撑命中 {Number(inputReliabilitySummary.support_factor_hits ?? 0)}
          </span>
        </div>
        {inputReliabilitySummary.dominant_issue_labels?.length ? (
          <span className="text-xs text-muted-foreground">
            主要风险 {inputReliabilitySummary.dominant_issue_labels.join('，')}
          </span>
        ) : null}
      </div>

      {inputReliabilitySummary.lead ? (
        <div className="mt-2 text-sm text-foreground">
          {localizeGodEyeText(inputReliabilitySummary.lead)}
        </div>
      ) : null}

      {inputReliabilitySummary.posture ? (
        <div className="mt-1 text-xs text-muted-foreground">
          {localizeGodEyeText(inputReliabilitySummary.posture)}
        </div>
      ) : null}

      {inputReliabilitySummary.reason ? (
        <div className="mt-1 text-xs text-muted-foreground">
          {localizeGodEyeText(inputReliabilitySummary.reason)}
        </div>
      ) : null}
    </div>
  );
}
