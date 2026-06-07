/**
 * DailyBriefingCluster — self-contained wrapper that owns both hooks:
 *   useDailyBriefing (distribution config + presets + dry-run/send)
 *   useDailyBriefingSharing (artifacts + preview drawer state)
 *
 * Renders DailyBriefingPanel + DailyBriefingPreviewDrawer.
 * Placed in WorkbenchPage below the board/detail grid.
 */

import { useEffect, useRef } from 'react';
import useDailyBriefing, {
  type UseDailyBriefingProps,
  type ShareArtifacts,
} from '@/features/workbench/hooks/useDailyBriefing';
import useDailyBriefingSharing, {
  type UseDailyBriefingSharingProps,
} from '@/features/workbench/hooks/useDailyBriefingSharing';
import DailyBriefingPanel from './DailyBriefingPanel';
import DailyBriefingPreviewDrawer from './DailyBriefingPreviewDrawer';
import type { DailyBriefingPayload } from '@/features/workbench/lib/dailyBriefing';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface DailyBriefingClusterProps
  extends Pick<UseDailyBriefingProps, 'workbenchDailyBriefing' | 'filteredTasks'> {
  workbenchDailyBriefing: { headline?: string; summary?: string; chips?: unknown[]; details?: unknown[] };
  workbenchViewSummary: { headline?: string; scopedTaskLabel?: string };
  filters: UseDailyBriefingSharingProps['filters'];
  selectedTask?: UseDailyBriefingSharingProps['selectedTask'];
  selectedTaskId?: string;
  morningPresetActive?: boolean;
  morningPresetCandidate?: UseDailyBriefingSharingProps['morningPresetCandidate'];
  morningPresetSummary?: UseDailyBriefingSharingProps['morningPresetSummary'];
  autoRefreshSummary: UseDailyBriefingSharingProps['autoRefreshSummary'];
}

// ---------------------------------------------------------------------------
// DailyBriefingCluster
// ---------------------------------------------------------------------------

export default function DailyBriefingCluster({
  workbenchDailyBriefing,
  workbenchViewSummary,
  filteredTasks,
  filters,
  selectedTask,
  selectedTaskId,
  morningPresetActive,
  morningPresetCandidate,
  morningPresetSummary,
  autoRefreshSummary,
}: DailyBriefingClusterProps) {
  // ── buildShareArtifacts ref (bridge between useDailyBriefing and useDailyBriefingSharing)
  const buildShareArtifactsRef = useRef<((referenceDate?: Date) => ShareArtifacts) | null>(null);

  // ── useDailyBriefing ──────────────────────────────────────────────────────
  const briefing = useDailyBriefing({
    workbenchDailyBriefing,
    workbenchViewSummary,
    filteredTasks,
    buildShareArtifactsRef,
  });

  // ── useDailyBriefingSharing ───────────────────────────────────────────────
  const sharing = useDailyBriefingSharing({
    dailyBriefingTeamNote: briefing.dailyBriefingTeamNote,
    dailyBriefingEmailRecipients: briefing.dailyBriefingEmailRecipients,
    dailyBriefingEmailCcRecipients: briefing.dailyBriefingEmailCcRecipients,
    dailyBriefingPreviewSeed: briefing.dailyBriefingPreviewSeed,
    setDailyBriefingPreviewSeed: briefing.setDailyBriefingPreviewSeed,
    setDailyBriefingPdfExporting: briefing.setDailyBriefingPdfExporting,
    filters,
    selectedTask,
    selectedTaskId,
    morningPresetActive,
    morningPresetCandidate,
    morningPresetSummary,
    workbenchDailyBriefing: workbenchDailyBriefing as DailyBriefingPayload | null | undefined,
    workbenchViewSummary,
    autoRefreshSummary,
  });

  // Wire buildShareArtifacts so useDailyBriefing dry-run/send can use it.
  // The ref is updated after render so the sharing hook sees the latest closure.
  const buildShareArtifactsFn = sharing.buildDailyBriefingShareArtifacts;
  useEffect(() => {
    buildShareArtifactsRef.current = buildShareArtifactsFn;
  });

  // ── Preview open state (derived from previewSeed) ─────────────────────────
  const previewOpen = Boolean(briefing.dailyBriefingPreviewSeed);

  // ── PDF export handler wrapping the sharing hook ──────────────────────────
  const handleExportPdf = () => {
    void sharing.handleExportDailyBriefingPdf();
  };

  // ── Copy / download handlers (fire and ignore result — toast would be added by parent) ──
  const handleCopyHtml = () => { void sharing.handleCopyDailyBriefingHtml(); };
  const handleCopyEmailBody = () => { void sharing.handleCopyDailyBriefingEmailBody(); };
  const handleCopyEmailSubject = () => { void sharing.handleCopyDailyBriefingEmailSubject(); };
  const handleDownloadHtml = () => { sharing.handleDownloadDailyBriefingHtml(); };
  const handleOpenEmailTemplatePage = () => { sharing.handleOpenDailyBriefingEmailTemplatePage(); };
  const handleOpenMailDraft = () => { sharing.handleOpenDailyBriefingMailDraft(); };

  return (
    <div data-testid="daily-briefing-cluster" className="flex flex-col gap-4">
      <DailyBriefingPanel
        briefing={briefing}
        onOpenPreview={sharing.handleOpenDailyBriefingPreviewDrawer}
      />

      <DailyBriefingPreviewDrawer
        open={previewOpen}
        artifacts={sharing.dailyBriefingPreviewArtifacts}
        mailDraftStatus={sharing.dailyBriefingPreviewMailDraftStatus}
        canOpenMailDraft={sharing.canOpenDailyBriefingPreviewMailDraft}
        pdfExporting={briefing.dailyBriefingPdfExporting}
        onClose={sharing.handleCloseDailyBriefingPreviewDrawer}
        onRefresh={sharing.handleRefreshDailyBriefingPreview}
        onCopyHtml={handleCopyHtml}
        onCopyEmailSubject={handleCopyEmailSubject}
        onCopyEmailBody={handleCopyEmailBody}
        onDownloadHtml={handleDownloadHtml}
        onOpenEmailTemplatePage={handleOpenEmailTemplatePage}
        onOpenMailDraft={handleOpenMailDraft}
        onExportPdf={handleExportPdf}
      />
    </div>
  );
}
