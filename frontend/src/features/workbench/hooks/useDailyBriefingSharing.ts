/**
 * useDailyBriefingSharing — TypeScript port of
 * frontend/src/components/research-workbench/useDailyBriefingSharing.js
 *
 * Composes share artifacts from lib/dailyBriefing builders, handles
 * clipboard copy, HTML download, lazy-loaded jsPDF export, share pop-up
 * windows, and preview-drawer state.
 *
 * No antd `message` dependency — status is exposed via callback props so the
 * consuming component can use whatever notification system it wants.
 */

import {
  buildWorkbenchDailyBriefingEmailDocument,
  buildWorkbenchDailyBriefingEmailSubject,
  buildWorkbenchDailyBriefingEmailText,
  buildWorkbenchDailyBriefingMailtoUrl,
  buildWorkbenchDailyBriefingMarkdown,
  buildWorkbenchDailyBriefingFilename,
  buildWorkbenchDailyBriefingShareDocument,
  buildWorkbenchDailyBriefingText,
  type DailyBriefingPayload,
} from '@/features/workbench/lib/dailyBriefing';
import {
  DAILY_BRIEFING_BRAND_LABEL,
  formatDailyBriefingExportedAt,
  formatWorkbenchTaskPreview,
  mountDailyBriefingShareContainer,
} from '@/features/workbench/lib/dailyBriefingHelpers';
import { buildWorkbenchLink } from '@/features/godeye/lib/researchContext';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface WorkbenchFilters {
  refresh?: string;
  type?: string;
  source?: string;
  reason?: string;
  snapshotView?: string;
  snapshotFingerprint?: string;
  snapshotSummary?: string;
  keyword?: string;
}

export interface MorningPreset {
  label?: string;
}

export interface WorkbenchViewSummary {
  headline?: string;
  scopedTaskLabel?: string;
}

export interface AutoRefreshSummary {
  lastRefreshLabel?: string;
}

export interface SelectedTask {
  symbol?: string;
  title?: string;
  id?: string;
  type?: string;
}

export interface DailyBriefingShareArtifacts {
  absoluteUrl: string;
  brandLabel: string;
  ccRecipients: string;
  exportedAtLabel: string;
  focusLabel: string;
  morningPresetLabel: string;
  teamNote: string;
  toRecipients: string;
  emailBody: string;
  emailDocument: string;
  emailMailtoUrl: string;
  emailSubject: string;
  briefingDocument: string;
}

export interface UseDailyBriefingSharingProps {
  // state from useDailyBriefing
  dailyBriefingTeamNote: string;
  dailyBriefingEmailRecipients: string;
  dailyBriefingEmailCcRecipients: string;
  dailyBriefingPreviewSeed: string | null;
  setDailyBriefingPreviewSeed: (
    updater: string | null | ((current: string | null) => string | null),
  ) => void;
  setDailyBriefingPdfExporting: (value: boolean) => void;
  // outer workbench context
  filters: WorkbenchFilters;
  selectedTask?: SelectedTask | null;
  selectedTaskId?: string;
  morningPresetActive?: boolean;
  morningPresetCandidate?: MorningPreset | null;
  morningPresetSummary?: MorningPreset | null;
  workbenchDailyBriefing: DailyBriefingPayload | null | undefined;
  workbenchViewSummary: WorkbenchViewSummary;
  autoRefreshSummary: AutoRefreshSummary;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

function useDailyBriefingSharing({
  dailyBriefingTeamNote,
  dailyBriefingEmailRecipients,
  dailyBriefingEmailCcRecipients,
  dailyBriefingPreviewSeed,
  setDailyBriefingPreviewSeed,
  setDailyBriefingPdfExporting,
  filters,
  selectedTask,
  selectedTaskId,
  morningPresetActive,
  morningPresetCandidate,
  morningPresetSummary,
  workbenchDailyBriefing,
  workbenchViewSummary,
  autoRefreshSummary,
}: UseDailyBriefingSharingProps) {

  // ---- Share payload --------------------------------------------------------

  const buildDailyBriefingSharePayload = (referenceDate: Date = new Date()) => {
    const relativeUrl = buildWorkbenchLink(
      {
        refresh: filters.refresh,
        type: filters.type,
        sourceFilter: filters.source,
        reason: filters.reason,
        snapshotView: filters.snapshotView,
        snapshotFingerprint: filters.snapshotFingerprint,
        snapshotSummary: filters.snapshotSummary,
        keyword: filters.keyword,
        taskId: selectedTaskId,
      },
      typeof window !== 'undefined' ? window.location.search : '',
    );
    const absoluteUrl =
      typeof window !== 'undefined'
        ? new URL(relativeUrl, window.location.origin).toString()
        : relativeUrl;

    const focusLabel = selectedTask
      ? formatWorkbenchTaskPreview(selectedTask as Record<string, unknown>)
      : (workbenchViewSummary.scopedTaskLabel ?? '');

    const morningPresetLabel = morningPresetActive
      ? (morningPresetCandidate?.label ?? '')
      : (morningPresetSummary?.label ?? '');

    const ccRecipients = dailyBriefingEmailCcRecipients.trim();
    const exportedAtLabel = formatDailyBriefingExportedAt(referenceDate);
    const teamNote = dailyBriefingTeamNote.trim();
    const toRecipients = dailyBriefingEmailRecipients.trim();

    return {
      absoluteUrl,
      brandLabel: DAILY_BRIEFING_BRAND_LABEL,
      ccRecipients,
      exportedAtLabel,
      focusLabel,
      morningPresetLabel,
      teamNote,
      toRecipients,
    };
  };

  // ---- Share artifacts (full) -----------------------------------------------

  const buildDailyBriefingShareArtifacts = (
    referenceDate: Date = new Date(),
  ): DailyBriefingShareArtifacts => {
    const payload = buildDailyBriefingSharePayload(referenceDate);

    const briefingDocument = buildWorkbenchDailyBriefingShareDocument({
      briefing: workbenchDailyBriefing ?? undefined,
      brandLabel: payload.brandLabel,
      currentViewLabel: workbenchViewSummary.headline,
      exportedAtLabel: payload.exportedAtLabel,
      focusLabel: payload.focusLabel,
      morningPresetLabel: payload.morningPresetLabel,
      refreshLabel: autoRefreshSummary.lastRefreshLabel,
      teamNote: payload.teamNote,
      url: payload.absoluteUrl,
    });

    const emailSubject = buildWorkbenchDailyBriefingEmailSubject({
      briefing: workbenchDailyBriefing ?? undefined,
      brandLabel: payload.brandLabel,
    });

    const emailBody = buildWorkbenchDailyBriefingEmailText({
      briefing: workbenchDailyBriefing ?? undefined,
      brandLabel: payload.brandLabel,
      currentViewLabel: workbenchViewSummary.headline,
      emailSubject,
      exportedAtLabel: payload.exportedAtLabel,
      focusLabel: payload.focusLabel,
      morningPresetLabel: payload.morningPresetLabel,
      teamNote: payload.teamNote,
      url: payload.absoluteUrl,
    });

    const emailDocument = buildWorkbenchDailyBriefingEmailDocument({
      briefing: workbenchDailyBriefing ?? undefined,
      brandLabel: payload.brandLabel,
      ccRecipients: payload.ccRecipients,
      currentViewLabel: workbenchViewSummary.headline,
      emailSubject,
      exportedAtLabel: payload.exportedAtLabel,
      focusLabel: payload.focusLabel,
      morningPresetLabel: payload.morningPresetLabel,
      refreshLabel: autoRefreshSummary.lastRefreshLabel,
      teamNote: payload.teamNote,
      toRecipients: payload.toRecipients,
      url: payload.absoluteUrl,
    });

    return {
      ...payload,
      emailBody,
      emailDocument,
      emailMailtoUrl: buildWorkbenchDailyBriefingMailtoUrl({
        ccRecipients: payload.ccRecipients,
        emailBody,
        emailSubject,
        toRecipients: payload.toRecipients,
      }),
      emailSubject,
      briefingDocument,
    };
  };

  // ---- Clipboard handlers ---------------------------------------------------

  const handleCopyDailyBriefing = async (): Promise<{ ok: boolean; message: string }> => {
    if (!navigator?.clipboard?.writeText) {
      return { ok: false, message: '当前环境不支持复制今日简报' };
    }

    const { absoluteUrl, brandLabel, exportedAtLabel, focusLabel, morningPresetLabel, teamNote } =
      buildDailyBriefingSharePayload();

    const briefingText = buildWorkbenchDailyBriefingText({
      briefing: workbenchDailyBriefing ?? undefined,
      brandLabel,
      currentViewLabel: workbenchViewSummary.headline,
      exportedAtLabel,
      focusLabel,
      morningPresetLabel,
      teamNote,
      url: absoluteUrl,
    });

    try {
      await navigator.clipboard.writeText(briefingText);
      return { ok: true, message: '今日简报已复制' };
    } catch {
      return { ok: false, message: '复制今日简报失败，请稍后重试' };
    }
  };

  const handleCopyDailyBriefingMarkdown = async (): Promise<{ ok: boolean; message: string }> => {
    if (!navigator?.clipboard?.writeText) {
      return { ok: false, message: '当前环境不支持复制 Markdown 简报' };
    }

    const { absoluteUrl, brandLabel, exportedAtLabel, focusLabel, morningPresetLabel, teamNote } =
      buildDailyBriefingSharePayload();

    const briefingText = buildWorkbenchDailyBriefingMarkdown({
      briefing: workbenchDailyBriefing ?? undefined,
      brandLabel,
      currentViewLabel: workbenchViewSummary.headline,
      exportedAtLabel,
      focusLabel,
      morningPresetLabel,
      teamNote,
      url: absoluteUrl,
    });

    try {
      await navigator.clipboard.writeText(briefingText);
      return { ok: true, message: 'Markdown 简报已复制' };
    } catch {
      return { ok: false, message: '复制 Markdown 简报失败，请稍后重试' };
    }
  };

  const handleCopyDailyBriefingHtml = async (): Promise<{ ok: boolean; message: string }> => {
    if (!navigator?.clipboard?.writeText) {
      return { ok: false, message: '当前环境不支持复制 HTML 简报' };
    }

    const { briefingDocument } = buildDailyBriefingShareArtifacts();

    try {
      await navigator.clipboard.writeText(briefingDocument);
      return { ok: true, message: 'HTML 简报已复制' };
    } catch {
      return { ok: false, message: '复制 HTML 简报失败，请稍后重试' };
    }
  };

  const handleCopyDailyBriefingEmailBody = async (): Promise<{ ok: boolean; message: string }> => {
    if (!navigator?.clipboard?.writeText) {
      return { ok: false, message: '当前环境不支持复制邮件正文' };
    }

    const { emailBody } = buildDailyBriefingShareArtifacts();

    try {
      await navigator.clipboard.writeText(emailBody);
      return { ok: true, message: '邮件正文已复制' };
    } catch {
      return { ok: false, message: '复制邮件正文失败，请稍后重试' };
    }
  };

  const handleCopyDailyBriefingEmailSubject = async (): Promise<{
    ok: boolean;
    message: string;
  }> => {
    if (!navigator?.clipboard?.writeText) {
      return { ok: false, message: '当前环境不支持复制邮件主题' };
    }

    const { emailSubject } = buildDailyBriefingShareArtifacts();

    try {
      await navigator.clipboard.writeText(emailSubject);
      return { ok: true, message: '邮件主题已复制' };
    } catch {
      return { ok: false, message: '复制邮件主题失败，请稍后重试' };
    }
  };

  // ---- Pop-up window handlers -----------------------------------------------

  const handleOpenDailyBriefingShareCard = (): { ok: boolean; message: string } => {
    if (typeof window === 'undefined' || typeof window.open !== 'function') {
      return { ok: false, message: '当前环境不支持分享卡片预览' };
    }

    const { briefingDocument } = buildDailyBriefingShareArtifacts();
    const shareWindow = window.open('', '_blank', 'noopener,noreferrer,width=960,height=760');

    if (!shareWindow?.document) {
      return { ok: false, message: '分享窗口被浏览器拦截了，请允许弹窗后重试' };
    }

    shareWindow.document.write(briefingDocument);
    shareWindow.document.close();
    return { ok: true, message: '' };
  };

  const handleOpenDailyBriefingEmailTemplatePage = (): { ok: boolean; message: string } => {
    if (typeof window === 'undefined' || typeof window.open !== 'function') {
      return { ok: false, message: '当前环境不支持邮件模板页预览' };
    }

    const { emailDocument } = buildDailyBriefingShareArtifacts();
    const emailWindow = window.open('', '_blank', 'noopener,noreferrer,width=980,height=820');

    if (!emailWindow?.document) {
      return { ok: false, message: '邮件模板窗口被浏览器拦截了，请允许弹窗后重试' };
    }

    emailWindow.document.write(emailDocument);
    emailWindow.document.close();
    return { ok: true, message: '' };
  };

  const handleOpenDailyBriefingMailDraft = (): { ok: boolean; message: string } => {
    if (typeof window === 'undefined' || typeof window.open !== 'function') {
      return { ok: false, message: '当前环境不支持打开邮件草稿' };
    }

    const { emailMailtoUrl, toRecipients } = buildDailyBriefingShareArtifacts();
    if (!toRecipients) {
      return { ok: false, message: '请先设置收件人模板，再打开邮件草稿' };
    }

    const mailWindow = window.open(emailMailtoUrl, '_blank', 'noopener,noreferrer');
    if (!mailWindow) {
      return { ok: false, message: '邮件客户端草稿窗口被浏览器拦截了，请允许弹窗后重试' };
    }

    return { ok: true, message: '已尝试打开邮件草稿' };
  };

  // ---- Download handler -----------------------------------------------------

  const handleDownloadDailyBriefingHtml = (): { ok: boolean; message: string } => {
    if (
      typeof window === 'undefined' ||
      typeof document === 'undefined' ||
      typeof Blob === 'undefined'
    ) {
      return { ok: false, message: '当前环境不支持下载 HTML 简报' };
    }
    if (!window.URL?.createObjectURL || !window.URL?.revokeObjectURL) {
      return { ok: false, message: '当前环境不支持下载 HTML 简报' };
    }

    const { briefingDocument } = buildDailyBriefingShareArtifacts();
    const filename = buildWorkbenchDailyBriefingFilename({
      symbol: selectedTask?.symbol ?? '',
      taskId: selectedTaskId,
    });

    try {
      const blob = new Blob([briefingDocument], { type: 'text/html;charset=utf-8' });
      const objectUrl = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = objectUrl;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(objectUrl);
      return { ok: true, message: `HTML 简报已下载：${filename}` };
    } catch {
      return { ok: false, message: '下载 HTML 简报失败，请稍后重试' };
    }
  };

  // ---- PDF export -----------------------------------------------------------

  const handleExportDailyBriefingPdf = async (): Promise<{ ok: boolean; message: string }> => {
    if (typeof window === 'undefined' || typeof document === 'undefined') {
      return { ok: false, message: '当前环境不支持导出 PDF 简报' };
    }

    const { briefingDocument } = buildDailyBriefingShareArtifacts();
    const filename = buildWorkbenchDailyBriefingFilename({
      extension: 'pdf',
      symbol: selectedTask?.symbol ?? '',
      taskId: selectedTaskId,
    });

    setDailyBriefingPdfExporting(true);
    try {
      // Lazy-load jsPDF to keep the main bundle lean
      const { jsPDF } = await import('jspdf');
      const cleanup = mountDailyBriefingShareContainer(briefingDocument);

      try {
        const pdf = new jsPDF({
          orientation: 'portrait',
          unit: 'pt',
          format: 'a4',
        });

        await new Promise<void>((resolve, reject) => {
          try {
            const pdfSourceEl = document.querySelector(
              '[data-testid="daily-briefing-pdf-source"]',
            );
            if (!pdfSourceEl) {
              reject(new Error('PDF source element not found'));
              return;
            }
            pdf.html(pdfSourceEl as HTMLElement, {
              autoPaging: 'text',
              callback: () => resolve(),
              html2canvas: {
                backgroundColor: '#f8fafc',
                scale: 1,
                useCORS: true,
              },
              margin: [24, 24, 24, 24],
              width: 547,
              windowWidth: 920,
            });
          } catch (err) {
            reject(err);
          }
        });

        pdf.save(filename);
        return { ok: true, message: `PDF 简报已下载：${filename}` };
      } finally {
        cleanup();
      }
    } catch {
      return { ok: false, message: '导出 PDF 简报失败，请稍后重试' };
    } finally {
      setDailyBriefingPdfExporting(false);
    }
  };

  // ---- Preview drawer handlers -----------------------------------------------

  const handleOpenDailyBriefingPreviewDrawer = () => {
    setDailyBriefingPreviewSeed((current) => current ?? new Date().toISOString());
  };

  const handleCloseDailyBriefingPreviewDrawer = () => {
    setDailyBriefingPreviewSeed(null);
  };

  const handleRefreshDailyBriefingPreview = () => {
    setDailyBriefingPreviewSeed(new Date().toISOString());
  };

  // ---- Derived values -------------------------------------------------------

  const dailyBriefingPreviewArtifacts: DailyBriefingShareArtifacts | null =
    dailyBriefingPreviewSeed
      ? buildDailyBriefingShareArtifacts(new Date(dailyBriefingPreviewSeed))
      : null;

  const dailyBriefingPreviewMailDraftStatus = dailyBriefingPreviewArtifacts?.emailMailtoUrl
    ? dailyBriefingPreviewArtifacts.toRecipients
      ? '已生成，可用上方"打开邮件草稿"创建本地邮件'
      : '已生成，但尚未设置收件人模板；可先补全收件人后再打开邮件草稿'
    : '未生成';

  const canOpenDailyBriefingPreviewMailDraft = Boolean(
    dailyBriefingPreviewArtifacts?.toRecipients,
  );

  // ---- Return ---------------------------------------------------------------

  return {
    buildDailyBriefingShareArtifacts,
    handleCopyDailyBriefing,
    handleCopyDailyBriefingMarkdown,
    handleCopyDailyBriefingHtml,
    handleCopyDailyBriefingEmailBody,
    handleCopyDailyBriefingEmailSubject,
    handleOpenDailyBriefingShareCard,
    handleOpenDailyBriefingEmailTemplatePage,
    handleOpenDailyBriefingMailDraft,
    handleDownloadDailyBriefingHtml,
    handleExportDailyBriefingPdf,
    handleOpenDailyBriefingPreviewDrawer,
    handleCloseDailyBriefingPreviewDrawer,
    handleRefreshDailyBriefingPreview,
    dailyBriefingPreviewArtifacts,
    dailyBriefingPreviewMailDraftStatus,
    canOpenDailyBriefingPreviewMailDraft,
  };
}

export default useDailyBriefingSharing;
