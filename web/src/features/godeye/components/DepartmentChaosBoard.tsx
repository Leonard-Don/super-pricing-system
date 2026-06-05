// ---------------------------------------------------------------------------
// DepartmentChaosBoard — shadcn/Tailwind presentation component
// Rebuilt from frontend/src/components/GodEyeDashboard/DepartmentChaosBoard.js (101)
// Props: overview (from hook's overview, contains department_chaos_summary). No API calls.
// NOTE: distinct from DepartmentChaosPanel in MacroSummaryPanels.tsx (the macro-summary variant).
// ---------------------------------------------------------------------------

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  getGodEyeDepartmentLabel,
  getGodEyeStatusLabel,
  localizeGodEyeText,
} from '@/features/godeye/lib/displayLabels';
import { departmentChaosColor } from '@/features/godeye/lib/macroFactorColors';

// ---------------------------------------------------------------------------
// Internal types
// ---------------------------------------------------------------------------

interface PolicyTemplateAction {
  target: 'cross-market';
  template: string;
  source: string;
  note: string;
}

interface DepartmentItem {
  department?: string;
  department_label?: string;
  department_zh?: string;
  label?: string;
  chaos_score?: number;
  policy_reversal_count?: number;
  full_text_ratio?: number;
  lag_days?: number;
  execution_status?: string;
  execution_status_zh?: string;
  reason?: string;
}

interface DepartmentChaosSummaryData {
  label?: string;
  summary?: string;
  top_departments?: DepartmentItem[];
}

interface DepartmentChaosOverview {
  department_chaos_summary?: DepartmentChaosSummaryData;
}

export interface DepartmentChaosBoardProps {
  overview?: DepartmentChaosOverview;
  onNavigate?: (action: PolicyTemplateAction) => void;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// EXECUTION_STATUS_LABELS_ZH ported inline (matches altDataLabels.js dict)
const EXECUTION_STATUS_LABELS_ZH: Record<string, string> = {
  reversal_cluster: '政策反转簇',
  alignment_cluster: '政策共振簇',
  neutral: '中性',
  active: '正常推进',
  lagging: '执行滞后',
};

/** Resolve execution_status to Chinese label (preferZh pattern) */
function resolveExecutionStatus(item: DepartmentItem): string {
  if (item.execution_status_zh) return item.execution_status_zh;
  const raw = item.execution_status ?? 'unknown';
  return EXECUTION_STATUS_LABELS_ZH[raw] ?? raw;
}

function buildPolicyTemplateAction(
  summary: DepartmentChaosSummaryData,
  item?: DepartmentItem,
): PolicyTemplateAction {
  return {
    target: 'cross-market',
    template: 'utilities_vs_growth',
    source: 'godeye_department_chaos',
    note: item?.reason ?? summary?.summary ?? '来自 GodEye 部门执行混乱看板',
  };
}

/** Map antd color-token → shadcn badge variant */
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
// Component
// ---------------------------------------------------------------------------

export function DepartmentChaosBoard({
  overview = {},
  onNavigate,
}: DepartmentChaosBoardProps) {
  const summary = overview?.department_chaos_summary ?? {};
  const departments = summary?.top_departments ?? [];
  const overallLabel = summary?.label ?? '';
  const overallColor = departmentChaosColor[overallLabel] ?? 'blue';

  return (
    <Card className="bg-card border-border">
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-foreground">部门执行混乱看板</CardTitle>
        {overallLabel ? (
          <Badge variant={colorToVariant(overallColor)}>
            {getGodEyeStatusLabel('departmentChaos', overallLabel)}
          </Badge>
        ) : null}
      </CardHeader>

      <CardContent className="min-h-[280px]">
        {summary?.summary ? (
          <p className="text-muted-foreground text-sm mb-3">
            {localizeGodEyeText(summary.summary)}
          </p>
        ) : null}

        {departments.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-8">
            <p className="text-muted-foreground text-sm">暂无部门执行混乱数据</p>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => onNavigate?.(buildPolicyTemplateAction(summary))}
            >
              政策方案
            </Button>
          </div>
        ) : (
          <ul className="flex flex-col divide-y divide-border">
            {departments.slice(0, 5).map((item, idx) => {
              const itemColor = departmentChaosColor[item?.label ?? ''] ?? 'blue';
              return (
                <li
                  key={item?.department ?? item?.department_label ?? idx}
                  className="py-3 flex flex-col gap-1"
                >
                  {/* Title row: department label + chaos status + scores */}
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold text-foreground text-sm">
                      {getGodEyeDepartmentLabel(item)}
                    </span>
                    <Badge variant={colorToVariant(itemColor)}>
                      {getGodEyeStatusLabel('departmentChaos', item?.label ?? 'stable')}
                    </Badge>
                    <Badge variant="outline">
                      混乱 {Number(item?.chaos_score ?? 0).toFixed(2)}
                    </Badge>
                    <Badge variant="outline">
                      反转 {Number(item?.policy_reversal_count ?? 0)}
                    </Badge>
                  </div>

                  {/* Meta row */}
                  <div className="text-muted-foreground text-xs">
                    正文覆盖 {Number(item?.full_text_ratio ?? 0).toFixed(2)}
                    {' · '}
                    滞后 {Number(item?.lag_days ?? 0)} 天
                    {' · '}
                    执行状态 {localizeGodEyeText(resolveExecutionStatus(item))}
                  </div>

                  {item?.reason ? (
                    <div className="text-foreground text-xs">
                      {localizeGodEyeText(item.reason)}
                    </div>
                  ) : null}

                  {/* Action */}
                  <div className="mt-1">
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => onNavigate?.(buildPolicyTemplateAction(summary, item))}
                    >
                      政策方案
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

export default DepartmentChaosBoard;
