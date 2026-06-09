/**
 * MispricingAlertPanel — rule form + dry-run evaluate + recent-fires history.
 *
 * Fetches the rule on mount; never breaks the host page (try/catch + empty states).
 * Honest states:
 *   - loading       → Skeleton placeholders
 *   - rule disabled → disabled-rule notice
 *   - empty history → empty-state message
 *   - empty dry-run → empty-state message
 */

import { useState, useEffect, useCallback, useId } from 'react';
import { GlassPanel, DataNumber, MicroBar, Skeleton } from '@/components/command';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  fetchMispricingRule,
  saveMispricingRule,
  fetchMispricingHistory,
  evaluateMispricing,
} from '../api';
import type {
  MispricingRule,
  MispricingHistoryEntry,
  WouldFireEntry,
  AlertDirection,
} from '../types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const DIRECTION_OPTIONS: { label: string; value: AlertDirection }[] = [
  { label: '低估 (under)', value: 'under' },
  { label: '高估 (over)', value: 'over' },
  { label: '双向 (both)', value: 'both' },
];

function directionTone(direction: AlertDirection): 'pos' | 'neg' | 'amber' {
  if (direction === 'under') return 'pos';
  if (direction === 'over') return 'neg';
  return 'amber';
}

function formatFiredAt(isoString: string): string {
  try {
    return new Date(isoString).toLocaleString('zh-CN', {
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return isoString;
  }
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function FieldRow({
  label,
  htmlFor,
  children,
}: {
  label: string;
  htmlFor?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-3">
      <Label
        htmlFor={htmlFor}
        className="w-28 shrink-0 text-[11px] uppercase tracking-wider text-[var(--cmd-ink3)]"
      >
        {label}
      </Label>
      <div className="flex-1">{children}</div>
    </div>
  );
}

function WouldFireRow({ entry }: { entry: WouldFireEntry }) {
  const gapAbs = Math.abs(entry.gap_pct);
  const tone = directionTone(entry.direction);
  return (
    <div
      className="border-b border-white/[0.06] py-2.5 last:border-0"
      data-testid="would-fire-row"
    >
      <div className="mb-1.5 flex items-center justify-between">
        <span className="text-[12px] font-semibold text-[var(--cmd-ink2)]">{entry.symbol}</span>
        <div className="flex items-center gap-2">
          <span className="rounded-full bg-white/[0.06] px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-[var(--cmd-ink3)]">
            {entry.direction}
          </span>
          <DataNumber
            value={`${entry.gap_pct > 0 ? '+' : ''}${entry.gap_pct.toFixed(1)}%`}
            tone={tone}
            className="text-[11px]"
          />
        </div>
      </div>
      <div className="mb-1 flex items-center justify-between text-[10px] text-[var(--cmd-ink3)]">
        <span>价差</span>
        <DataNumber value={`${gapAbs.toFixed(1)}%`} tone={tone} className="text-[10px]" />
      </div>
      <MicroBar value={gapAbs} max={20} tone={tone} className="mb-1" />
      <div className="flex items-center justify-between text-[10px] text-[var(--cmd-ink3)]">
        <span>置信度</span>
        <DataNumber
          value={`${Math.round(entry.confidence * 100)}%`}
          tone="amber"
          className="text-[10px]"
        />
      </div>
      <MicroBar value={entry.confidence} max={1} tone="amber" />
    </div>
  );
}

function HistoryRow({ entry }: { entry: MispricingHistoryEntry }) {
  const gapAbs = Math.abs(entry.gap_pct);
  const tone = directionTone(entry.direction);
  return (
    <div
      className="border-b border-white/[0.06] py-2 last:border-0"
      data-testid="history-row"
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-[12px] font-semibold text-[var(--cmd-ink2)]">{entry.symbol}</span>
          <span className="rounded-full bg-white/[0.06] px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-[var(--cmd-ink3)]">
            {entry.direction}
          </span>
        </div>
        <DataNumber
          value={`${entry.gap_pct > 0 ? '+' : ''}${entry.gap_pct.toFixed(1)}%`}
          tone={tone}
          className="text-[11px]"
        />
      </div>
      <div className="mt-0.5 flex items-center justify-between text-[10px] text-[var(--cmd-ink3)]">
        <span>置信度 {Math.round(entry.confidence * 100)}%</span>
        <span>{formatFiredAt(entry.fired_at)}</span>
      </div>
      <MicroBar value={gapAbs} max={20} tone={tone} className="mt-1" />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Default rule (pre-form state before first fetch)
// ---------------------------------------------------------------------------

const DEFAULT_RULE: MispricingRule = {
  enabled: false,
  threshold_pct: 5,
  direction: 'both',
  min_confidence: 0.6,
  cooldown_hours: 24,
  channels: [],
};

// ---------------------------------------------------------------------------
// Main panel
// ---------------------------------------------------------------------------

export interface MispricingAlertPanelProps {
  /** Optionally provide an initial rule (skips the fetch — useful in tests). */
  initialRule?: MispricingRule;
  /** Optionally provide initial history (skips the fetch — useful in tests). */
  initialHistory?: MispricingHistoryEntry[];
}

export function MispricingAlertPanel({
  initialRule,
  initialHistory,
}: MispricingAlertPanelProps) {
  const formId = useId();

  // ── Rule state ─────────────────────────────────────────────────────────────
  const [rule, setRule] = useState<MispricingRule>(initialRule ?? DEFAULT_RULE);
  const [ruleLoading, setRuleLoading] = useState<boolean>(!initialRule);
  const [ruleSaving, setRuleSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // Channels free-text (comma-separated) — synced to rule.channels
  const [channelText, setChannelText] = useState<string>(
    (initialRule?.channels ?? []).join(', '),
  );

  // ── History state ──────────────────────────────────────────────────────────
  const [history, setHistory] = useState<MispricingHistoryEntry[]>(initialHistory ?? []);
  const [historyLoading, setHistoryLoading] = useState<boolean>(!initialHistory);

  // ── Evaluate (dry-run) state ────────────────────────────────────────────────
  const [wouldFire, setWouldFire] = useState<WouldFireEntry[] | null>(null);
  const [evalLoading, setEvalLoading] = useState(false);
  const [evalError, setEvalError] = useState<string | null>(null);
  const [evalEvaluated, setEvalEvaluated] = useState<number | null>(null);

  // ── Fetch on mount (unless initial data provided) ──────────────────────────
  // Initial loading state is derived from props: `!initialRule` / `!initialHistory`.
  // We only flip it to false in the async callbacks, never synchronously inside
  // the effect body (which would violate react-hooks/set-state-in-effect).
  useEffect(() => {
    if (initialRule) return;
    let cancelled = false;
    fetchMispricingRule()
      .then((r) => {
        if (cancelled) return;
        setRule(r);
        setChannelText(r.channels.join(', '));
      })
      .catch(() => {
        /* silent — panel stays with default rule */
      })
      .finally(() => {
        if (!cancelled) setRuleLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [initialRule]);

  useEffect(() => {
    if (initialHistory) return;
    let cancelled = false;
    fetchMispricingHistory()
      .then((resp) => {
        if (cancelled) return;
        setHistory(resp.history);
      })
      .catch(() => {
        /* silent — show empty list */
      })
      .finally(() => {
        if (!cancelled) setHistoryLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [initialHistory]);

  // ── Handlers ───────────────────────────────────────────────────────────────

  const handleSave = useCallback(async () => {
    setSaveError(null);
    setSaveSuccess(false);
    setRuleSaving(true);
    const channels = channelText
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    const payload: MispricingRule = { ...rule, channels };
    try {
      const saved = await saveMispricingRule(payload);
      setRule(saved);
      setChannelText(saved.channels.join(', '));
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 2500);
    } catch {
      setSaveError('保存失败，请稍后重试');
    } finally {
      setRuleSaving(false);
    }
  }, [rule, channelText]);

  const handleEvaluate = useCallback(async () => {
    setEvalError(null);
    setWouldFire(null);
    setEvalEvaluated(null);
    setEvalLoading(true);
    try {
      const resp = await evaluateMispricing();
      setWouldFire(resp.would_fire);
      setEvalEvaluated(resp.evaluated);
    } catch {
      setEvalError('评估失败，请稍后重试');
    } finally {
      setEvalLoading(false);
    }
  }, []);

  // ── Form field helpers ──────────────────────────────────────────────────────

  const updateRule = useCallback(
    <K extends keyof MispricingRule>(key: K, value: MispricingRule[K]) => {
      setRule((prev) => ({ ...prev, [key]: value }));
    },
    [],
  );

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col gap-5" data-testid="mispricing-alert-panel">
      {/* ── Rule form ── */}
      <GlassPanel className="p-4">
        <div className="mb-3 flex items-center justify-between">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-[var(--cmd-ink3)]">
            规则配置
          </span>
          {saveSuccess && (
            <span
              className="text-[11px] text-[var(--pos,#4ade80)]"
              data-testid="save-success-msg"
            >
              已保存
            </span>
          )}
        </div>

        {ruleLoading ? (
          <div className="flex flex-col gap-3">
            {[1, 2, 3, 4, 5].map((i) => (
              <Skeleton key={i} w="100%" h={32} />
            ))}
          </div>
        ) : (
          <form
            id={formId}
            className="flex flex-col gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              void handleSave();
            }}
          >
            {/* Enabled toggle */}
            <FieldRow label="启用告警" htmlFor={`${formId}-enabled`}>
              <div className="flex items-center gap-2">
                <input
                  id={`${formId}-enabled`}
                  type="checkbox"
                  checked={rule.enabled}
                  onChange={(e) => updateRule('enabled', e.target.checked)}
                  className="size-4 cursor-pointer rounded border-border accent-[var(--primary)]"
                  data-testid="rule-enabled-toggle"
                />
                <span className="text-[11px] text-[var(--cmd-ink3)]">
                  {rule.enabled ? '已启用' : '已停用'}
                </span>
              </div>
            </FieldRow>

            {!rule.enabled && (
              <div
                className="rounded-lg border border-amber-400/20 bg-amber-400/[0.06] px-3 py-2 text-[11px] text-amber-400/80"
                data-testid="rule-disabled-notice"
              >
                告警规则当前已停用，不会发送任何通知。
              </div>
            )}

            {/* Threshold */}
            <FieldRow label="价差阈值 %" htmlFor={`${formId}-threshold`}>
              <Input
                id={`${formId}-threshold`}
                type="number"
                min={0}
                step={0.1}
                value={rule.threshold_pct}
                onChange={(e) => updateRule('threshold_pct', parseFloat(e.target.value) || 0)}
                className="h-7 text-sm"
                data-testid="rule-threshold-input"
              />
            </FieldRow>

            {/* Direction */}
            <FieldRow label="方向">
              <div className="flex gap-2">
                {DIRECTION_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => updateRule('direction', opt.value)}
                    className={[
                      'rounded-md border px-2 py-1 text-[11px] transition-colors',
                      rule.direction === opt.value
                        ? 'border-[var(--primary)] bg-[var(--primary)]/10 text-[var(--primary)]'
                        : 'border-border text-[var(--cmd-ink3)] hover:border-[var(--primary)]/40',
                    ].join(' ')}
                    data-testid={`rule-direction-${opt.value}`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </FieldRow>

            {/* Min confidence */}
            <FieldRow label="最低置信度" htmlFor={`${formId}-confidence`}>
              <div className="flex items-center gap-2">
                <Input
                  id={`${formId}-confidence`}
                  type="number"
                  min={0}
                  max={1}
                  step={0.05}
                  value={rule.min_confidence}
                  onChange={(e) =>
                    updateRule('min_confidence', Math.max(0, Math.min(1, parseFloat(e.target.value) || 0)))
                  }
                  className="h-7 w-20 text-sm"
                  data-testid="rule-confidence-input"
                />
                <MicroBar value={rule.min_confidence} max={1} tone="amber" className="flex-1" />
              </div>
            </FieldRow>

            {/* Cooldown hours */}
            <FieldRow label="冷却 (小时)" htmlFor={`${formId}-cooldown`}>
              <Input
                id={`${formId}-cooldown`}
                type="number"
                min={0}
                step={1}
                value={rule.cooldown_hours}
                onChange={(e) => updateRule('cooldown_hours', parseInt(e.target.value, 10) || 0)}
                className="h-7 text-sm"
                data-testid="rule-cooldown-input"
              />
            </FieldRow>

            {/* Channels */}
            <FieldRow label="通知渠道" htmlFor={`${formId}-channels`}>
              <Input
                id={`${formId}-channels`}
                type="text"
                value={channelText}
                onChange={(e) => setChannelText(e.target.value)}
                placeholder="email, slack, wecom （逗号分隔）"
                className="h-7 text-sm"
                data-testid="rule-channels-input"
              />
            </FieldRow>

            {saveError && (
              <p className="text-[11px] text-[var(--neg,#f87171)]" data-testid="save-error-msg">
                {saveError}
              </p>
            )}

            {/* Action buttons */}
            <div className="flex gap-2 pt-1">
              <Button
                type="submit"
                size="sm"
                disabled={ruleSaving}
                data-testid="save-rule-btn"
              >
                {ruleSaving ? '保存中…' : '保存'}
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={evalLoading}
                onClick={() => void handleEvaluate()}
                data-testid="evaluate-btn"
              >
                {evalLoading ? '评估中…' : '现在评估 · dry-run'}
              </Button>
            </div>
          </form>
        )}
      </GlassPanel>

      {/* ── Dry-run results ── */}
      {(wouldFire !== null || evalLoading || evalError) && (
        <GlassPanel className="p-4" data-testid="evaluate-results">
          <div className="mb-3 flex items-center justify-between">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-[var(--cmd-ink3)]">
              dry-run 结果
            </span>
            {evalEvaluated !== null && (
              <span className="text-[10px] text-[var(--cmd-ink3)]">
                共评估{' '}
                <DataNumber value={evalEvaluated} className="text-[10px]" /> 个标的
              </span>
            )}
          </div>

          {evalLoading && (
            <div className="flex flex-col gap-2">
              {[1, 2].map((i) => (
                <Skeleton key={i} w="100%" h={72} />
              ))}
            </div>
          )}

          {evalError && (
            <p className="text-[11px] text-[var(--neg,#f87171)]" data-testid="eval-error-msg">
              {evalError}
            </p>
          )}

          {!evalLoading && wouldFire !== null && wouldFire.length === 0 && (
            <p
              className="py-3 text-center text-[11px] text-[var(--cmd-ink3)]"
              data-testid="evaluate-empty"
            >
              当前规则下无标的触发告警
            </p>
          )}

          {!evalLoading && wouldFire !== null && wouldFire.length > 0 && (
            <div data-testid="would-fire-list">
              {wouldFire.map((entry) => (
                <WouldFireRow key={`${entry.symbol}-${entry.direction}`} entry={entry} />
              ))}
            </div>
          )}
        </GlassPanel>
      )}

      {/* ── Recent fires history ── */}
      <GlassPanel className="p-4" data-testid="history-panel">
        <div className="mb-3">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-[var(--cmd-ink3)]">
            近期触发
          </span>
        </div>

        {historyLoading && (
          <div className="flex flex-col gap-2">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} w="100%" h={56} />
            ))}
          </div>
        )}

        {!historyLoading && history.length === 0 && (
          <p
            className="py-3 text-center text-[11px] text-[var(--cmd-ink3)]"
            data-testid="history-empty"
          >
            暂无历史触发记录
          </p>
        )}

        {!historyLoading && history.length > 0 && (
          <div data-testid="history-list">
            {history.map((entry, idx) => (
              <HistoryRow key={`${entry.symbol}-${entry.fired_at}-${idx}`} entry={entry} />
            ))}
          </div>
        )}
      </GlassPanel>
    </div>
  );
}
