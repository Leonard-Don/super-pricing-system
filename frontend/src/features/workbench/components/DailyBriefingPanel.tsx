/**
 * DailyBriefingPanel — daily briefing distribution config + email-preset list
 * (add / save / delete / apply / set-default) + dry-run / send buttons +
 * preview trigger + status display.
 *
 * Driven by useDailyBriefing (T3).
 */

import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Eye, Play, Send, Plus, Save, Trash2, Star, ChevronRight } from 'lucide-react';
import type { UseDailyBriefingResult } from '@/features/workbench/hooks/useDailyBriefing';
import type { DailyBriefingEmailPreset } from '@/features/workbench/lib/dailyBriefingHelpers';
import { GlassPanel, SectionFrame } from '@/components/command';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface DailyBriefingPanelProps {
  /**
   * The single `useDailyBriefing` instance owned by {@link DailyBriefingCluster}.
   * The panel is a pure view over this shared state — it does NOT instantiate
   * the hook itself, so panel edits stay connected to the sharing/preview state.
   */
  briefing: UseDailyBriefingResult;
  /** Called when the user clicks the preview button — parent opens the Sheet */
  onOpenPreview: () => void;
}

// ---------------------------------------------------------------------------
// Sub-component: PresetRow
// ---------------------------------------------------------------------------

interface PresetRowProps {
  preset: DailyBriefingEmailPreset;
  isActive: boolean;
  isDefault: boolean;
  onApply: (id: string) => void;
  onSave: (id: string) => void;
  onDelete: (id: string) => void;
  onSetDefault: (id: string) => void;
}

function PresetRow({
  preset,
  isActive,
  isDefault,
  onApply,
  onSave,
  onDelete,
  onSetDefault,
}: PresetRowProps) {
  return (
    <li
      data-testid={`briefing-preset-row-${preset.id}`}
      className="flex items-center gap-2 rounded-lg border border-border px-3 py-2"
    >
      {/* Active indicator */}
      {isActive && (
        <ChevronRight className="size-3 shrink-0 text-primary" aria-label="当前活跃预设" />
      )}
      {/* Default star */}
      <Star
        className={`size-3 shrink-0 ${isDefault ? 'fill-warning text-warning' : 'text-muted-foreground'}`}
        aria-label={isDefault ? '默认预设' : '非默认预设'}
      />

      {/* Name */}
      <span
        className="flex-1 truncate text-sm font-medium text-foreground"
        title={preset.toRecipients || preset.name}
      >
        {preset.name || '未命名预设'}
      </span>

      {/* Recipients preview */}
      {preset.toRecipients && (
        <span className="hidden truncate text-xs text-muted-foreground sm:block" title={preset.toRecipients}>
          {preset.toRecipients}
        </span>
      )}

      {/* Actions */}
      <div className="flex shrink-0 items-center gap-1">
        <Button
          data-testid={`briefing-preset-apply-${preset.id}`}
          size="sm"
          variant="ghost"
          className="h-6 px-2 text-xs"
          onClick={() => onApply(preset.id)}
          title="应用此预设"
        >
          应用
        </Button>
        <Button
          data-testid={`briefing-preset-save-${preset.id}`}
          size="icon-sm"
          variant="ghost"
          onClick={() => onSave(preset.id)}
          title="将当前收件人保存到此预设"
        >
          <Save className="size-3" />
          <span className="sr-only">保存预设</span>
        </Button>
        <Button
          data-testid={`briefing-preset-setdefault-${preset.id}`}
          size="icon-sm"
          variant="ghost"
          onClick={() => onSetDefault(preset.id)}
          title={isDefault ? '取消默认' : '设为默认'}
        >
          <Star className={`size-3 ${isDefault ? 'fill-warning text-warning' : ''}`} />
          <span className="sr-only">{isDefault ? '取消默认' : '设为默认'}</span>
        </Button>
        <Button
          data-testid={`briefing-preset-delete-${preset.id}`}
          size="icon-sm"
          variant="ghost"
          className="text-destructive hover:bg-destructive/10 hover:text-destructive"
          onClick={() => onDelete(preset.id)}
          title="删除此预设"
        >
          <Trash2 className="size-3" />
          <span className="sr-only">删除预设</span>
        </Button>
      </div>
    </li>
  );
}

// ---------------------------------------------------------------------------
// DailyBriefingPanel
// ---------------------------------------------------------------------------

export default function DailyBriefingPanel({ briefing, onOpenPreview }: DailyBriefingPanelProps) {
  const {
    dailyBriefingDistributionEnabled,
    dailyBriefingDistributionTime,
    dailyBriefingDistributionTimezone,
    dailyBriefingDistributionWeekdays,
    dailyBriefingEmailPresets,
    dailyBriefingDryRunRunning,
    dailyBriefingSending,
    dailyBriefingLastOpStatus,
    activeDailyBriefingEmailPresetId,
    dailyBriefingDefaultEmailPresetId,
    handleRunDailyBriefingDryRun,
    handleSendDailyBriefing,
    handleAddDailyBriefingEmailPreset,
    handleSaveDailyBriefingEmailPreset,
    handleDeleteDailyBriefingEmailPreset,
    handleApplyDailyBriefingEmailPreset,
    handleSetDefaultDailyBriefingEmailPreset,
  } = briefing;

  const busy = dailyBriefingDryRunRunning || dailyBriefingSending;

  const handleDryRunClick = () => {
    void handleRunDailyBriefingDryRun();
  };

  const handleSendClick = () => {
    void handleSendDailyBriefing();
  };

  return (
    <GlassPanel
      data-testid="daily-briefing-panel"
      className="flex flex-col gap-4 p-4"
    >
      {/* ── Header ── */}
      <div className="flex items-center justify-between">
        <SectionFrame title="每日简报" latin="DAILY BRIEFING" />

        {/* Preview trigger */}
        <Button
          data-testid="briefing-preview-btn"
          size="sm"
          variant="outline"
          onClick={onOpenPreview}
          disabled={busy}
          className="shrink-0 border-white/20 text-white/80 hover:bg-white/10"
        >
          <Eye className="mr-1.5 size-3.5" />
          预览
        </Button>
      </div>

      <Separator />

      {/* ── Distribution config ── */}
      <div data-testid="briefing-distribution-config" className="flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-muted-foreground">分发配置</span>
          <span
            data-testid="briefing-distribution-enabled"
            className={`rounded-full px-2 py-0.5 text-xs font-medium ${
              dailyBriefingDistributionEnabled
                ? 'bg-success/15 text-success'
                : 'bg-muted text-muted-foreground'
            }`}
          >
            {dailyBriefingDistributionEnabled ? '已启用' : '未启用'}
          </span>
        </div>

        <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground sm:grid-cols-3">
          <div>
            <span className="font-medium text-foreground">发送时间：</span>
            {dailyBriefingDistributionTime}
          </div>
          <div>
            <span className="font-medium text-foreground">时区：</span>
            {dailyBriefingDistributionTimezone}
          </div>
          <div>
            <span className="font-medium text-foreground">工作日：</span>
            {dailyBriefingDistributionWeekdays.join('、') || '未设置'}
          </div>
        </div>
      </div>

      <Separator />

      {/* ── Email preset list ── */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium text-muted-foreground">分发预设</span>
          <Button
            data-testid="briefing-add-preset-btn"
            size="sm"
            variant="ghost"
            className="h-6 gap-1 px-2 text-xs"
            onClick={handleAddDailyBriefingEmailPreset}
          >
            <Plus className="size-3" />
            新增预设
          </Button>
        </div>

        {dailyBriefingEmailPresets.length === 0 ? (
          <p className="text-xs text-muted-foreground">暂无预设，请点击"新增预设"添加</p>
        ) : (
          <ul
            data-testid="briefing-preset-list"
            className="flex flex-col gap-1"
          >
            {dailyBriefingEmailPresets.map((preset) => (
              <PresetRow
                key={preset.id}
                preset={preset}
                isActive={activeDailyBriefingEmailPresetId === preset.id}
                isDefault={dailyBriefingDefaultEmailPresetId === preset.id}
                onApply={handleApplyDailyBriefingEmailPreset}
                onSave={handleSaveDailyBriefingEmailPreset}
                onDelete={handleDeleteDailyBriefingEmailPreset}
                onSetDefault={handleSetDefaultDailyBriefingEmailPreset}
              />
            ))}
          </ul>
        )}
      </div>

      <Separator />

      {/* ── Action buttons ── */}
      <div className="flex flex-wrap items-center gap-2">
        <Button
          data-testid="briefing-dryrun-btn"
          size="sm"
          variant="outline"
          onClick={handleDryRunClick}
          disabled={dailyBriefingDryRunRunning || dailyBriefingSending}
        >
          <Play className="mr-1.5 size-3.5" />
          {dailyBriefingDryRunRunning ? 'Dry-run 中…' : 'Dry-run'}
        </Button>

        <Button
          data-testid="briefing-send-btn"
          size="sm"
          variant="default"
          onClick={handleSendClick}
          disabled={dailyBriefingSending || dailyBriefingDryRunRunning}
        >
          <Send className="mr-1.5 size-3.5" />
          {dailyBriefingSending ? '发送中…' : '发送简报'}
        </Button>
      </div>

      {/* ── Status message ── */}
      {dailyBriefingLastOpStatus.type !== null && dailyBriefingLastOpStatus.message && (
        <p
          data-testid="briefing-status-message"
          className={`text-xs ${
            dailyBriefingLastOpStatus.type === 'error'
              ? 'text-destructive'
              : dailyBriefingLastOpStatus.type === 'warning'
                ? 'text-warning'
                : 'text-success'
          }`}
        >
          {dailyBriefingLastOpStatus.message}
        </p>
      )}
    </GlassPanel>
  );
}
