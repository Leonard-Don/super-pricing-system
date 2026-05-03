import { buildWorkbenchLink } from '../../utils/researchContext';
import {
  buildWorkbenchDailyBriefingEmailDocument,
  buildWorkbenchDailyBriefingEmailSubject,
  buildWorkbenchDailyBriefingEmailText,
  buildWorkbenchDailyBriefingMailtoUrl,
  buildWorkbenchDailyBriefingMarkdown,
  buildWorkbenchDailyBriefingFilename,
  buildWorkbenchDailyBriefingShareDocument,
  buildWorkbenchDailyBriefingText,
} from './workbenchUtils';
import {
  DAILY_BRIEFING_BRAND_LABEL,
  formatDailyBriefingExportedAt,
  formatWorkbenchTaskPreview,
  mountDailyBriefingShareContainer,
} from './dailyBriefingHelpers';

function useDailyBriefingSharing({
  message,
  // dailyBriefing state from useDailyBriefing
  dailyBriefingTeamNote,
  dailyBriefingEmailRecipients,
  dailyBriefingEmailCcRecipients,
  dailyBriefingPreviewSeed,
  setDailyBriefingPreviewSeed,
  setDailyBriefingPdfExporting,
  // outer workbench context
  filters,
  selectedTask,
  selectedTaskId,
  morningPresetActive,
  morningPresetCandidate,
  morningPresetSummary,
  workbenchDailyBriefing,
  workbenchViewSummary,
  autoRefreshSummary,
}) {
  const buildDailyBriefingSharePayload = (referenceDate = new Date()) => {
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
      window.location.search
    );
    const absoluteUrl = new URL(relativeUrl, window.location.origin).toString();
    const focusLabel = selectedTask
      ? formatWorkbenchTaskPreview(selectedTask)
      : (workbenchViewSummary.scopedTaskLabel || '');
    const morningPresetLabel = morningPresetActive
      ? (morningPresetCandidate?.label || '')
      : (morningPresetSummary?.label || '');
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

  const buildDailyBriefingShareArtifacts = (referenceDate = new Date()) => {
    const payload = buildDailyBriefingSharePayload(referenceDate);
    const briefingDocument = buildWorkbenchDailyBriefingShareDocument({
      briefing: workbenchDailyBriefing,
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
      briefing: workbenchDailyBriefing,
      brandLabel: payload.brandLabel,
    });
    const emailBody = buildWorkbenchDailyBriefingEmailText({
      briefing: workbenchDailyBriefing,
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
      briefing: workbenchDailyBriefing,
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

  const handleCopyDailyBriefing = async () => {
    if (!navigator?.clipboard?.writeText) {
      message.warning('当前环境不支持复制今日简报');
      return;
    }

    const { absoluteUrl, brandLabel, exportedAtLabel, focusLabel, morningPresetLabel, teamNote } = buildDailyBriefingSharePayload();
    const briefingText = buildWorkbenchDailyBriefingText({
      briefing: workbenchDailyBriefing,
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
      message.success('今日简报已复制');
    } catch (error) {
      message.error('复制今日简报失败，请稍后重试');
    }
  };

  const handleCopyDailyBriefingMarkdown = async () => {
    if (!navigator?.clipboard?.writeText) {
      message.warning('当前环境不支持复制 Markdown 简报');
      return;
    }

    const { absoluteUrl, brandLabel, exportedAtLabel, focusLabel, morningPresetLabel, teamNote } = buildDailyBriefingSharePayload();
    const briefingText = buildWorkbenchDailyBriefingMarkdown({
      briefing: workbenchDailyBriefing,
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
      message.success('Markdown 简报已复制');
    } catch (error) {
      message.error('复制 Markdown 简报失败，请稍后重试');
    }
  };

  const handleCopyDailyBriefingHtml = async () => {
    if (!navigator?.clipboard?.writeText) {
      message.warning('当前环境不支持复制 HTML 简报');
      return;
    }

    const { briefingDocument } = buildDailyBriefingShareArtifacts();

    try {
      await navigator.clipboard.writeText(briefingDocument);
      message.success('HTML 简报已复制');
    } catch (error) {
      message.error('复制 HTML 简报失败，请稍后重试');
    }
  };

  const handleCopyDailyBriefingEmailBody = async () => {
    if (!navigator?.clipboard?.writeText) {
      message.warning('当前环境不支持复制邮件正文');
      return;
    }

    const { emailBody } = buildDailyBriefingShareArtifacts();

    try {
      await navigator.clipboard.writeText(emailBody);
      message.success('邮件正文已复制');
    } catch (error) {
      message.error('复制邮件正文失败，请稍后重试');
    }
  };

  const handleCopyDailyBriefingEmailSubject = async () => {
    if (!navigator?.clipboard?.writeText) {
      message.warning('当前环境不支持复制邮件主题');
      return;
    }

    const { emailSubject } = buildDailyBriefingShareArtifacts();

    try {
      await navigator.clipboard.writeText(emailSubject);
      message.success('邮件主题已复制');
    } catch (error) {
      message.error('复制邮件主题失败，请稍后重试');
    }
  };

  const handleOpenDailyBriefingShareCard = () => {
    if (typeof window === 'undefined' || typeof window.open !== 'function') {
      message.warning('当前环境不支持分享卡片预览');
      return;
    }

    const { briefingDocument } = buildDailyBriefingShareArtifacts();
    const shareWindow = window.open('', '_blank', 'noopener,noreferrer,width=960,height=760');

    if (!shareWindow?.document) {
      message.warning('分享窗口被浏览器拦截了，请允许弹窗后重试');
      return;
    }

    shareWindow.document.write(briefingDocument);
    shareWindow.document.close();
  };

  const handleOpenDailyBriefingEmailTemplatePage = () => {
    if (typeof window === 'undefined' || typeof window.open !== 'function') {
      message.warning('当前环境不支持邮件模板页预览');
      return;
    }

    const { emailDocument } = buildDailyBriefingShareArtifacts();
    const emailWindow = window.open('', '_blank', 'noopener,noreferrer,width=980,height=820');

    if (!emailWindow?.document) {
      message.warning('邮件模板窗口被浏览器拦截了，请允许弹窗后重试');
      return;
    }

    emailWindow.document.write(emailDocument);
    emailWindow.document.close();
  };

  const handleOpenDailyBriefingMailDraft = () => {
    if (typeof window === 'undefined' || typeof window.open !== 'function') {
      message.warning('当前环境不支持打开邮件草稿');
      return;
    }

    const { emailMailtoUrl, toRecipients } = buildDailyBriefingShareArtifacts();
    if (!toRecipients) {
      message.warning('请先设置收件人模板，再打开邮件草稿');
      return;
    }

    const mailWindow = window.open(emailMailtoUrl, '_blank', 'noopener,noreferrer');

    if (!mailWindow) {
      message.warning('邮件客户端草稿窗口被浏览器拦截了，请允许弹窗后重试');
      return;
    }

    message.success('已尝试打开邮件草稿');
  };

  const handleDownloadDailyBriefingHtml = () => {
    if (typeof window === 'undefined' || typeof document === 'undefined' || typeof Blob === 'undefined') {
      message.warning('当前环境不支持下载 HTML 简报');
      return;
    }
    if (!window.URL?.createObjectURL || !window.URL?.revokeObjectURL) {
      message.warning('当前环境不支持下载 HTML 简报');
      return;
    }

    const { briefingDocument } = buildDailyBriefingShareArtifacts();
    const filename = buildWorkbenchDailyBriefingFilename({
      symbol: selectedTask?.symbol || '',
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
      message.success(`HTML 简报已下载：${filename}`);
    } catch (error) {
      message.error('下载 HTML 简报失败，请稍后重试');
    }
  };

  const handleExportDailyBriefingPdf = async () => {
    if (typeof window === 'undefined' || typeof document === 'undefined') {
      message.warning('当前环境不支持导出 PDF 简报');
      return;
    }

    const { briefingDocument } = buildDailyBriefingShareArtifacts();
    const filename = buildWorkbenchDailyBriefingFilename({
      extension: 'pdf',
      symbol: selectedTask?.symbol || '',
      taskId: selectedTaskId,
    });

    setDailyBriefingPdfExporting(true);
    try {
      const { jsPDF } = await import('jspdf');
      const cleanup = mountDailyBriefingShareContainer(briefingDocument);

      try {
        const pdf = new jsPDF({
          orientation: 'portrait',
          unit: 'pt',
          format: 'a4',
        });

        await new Promise((resolve, reject) => {
          try {
            pdf.html(document.querySelector('[data-testid="daily-briefing-pdf-source"]'), {
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
          } catch (error) {
            reject(error);
          }
        });

        pdf.save(filename);
        message.success(`PDF 简报已下载：${filename}`);
      } finally {
        cleanup();
      }
    } catch (error) {
      message.error('导出 PDF 简报失败，请稍后重试');
    } finally {
      setDailyBriefingPdfExporting(false);
    }
  };

  const handleOpenDailyBriefingPreviewDrawer = () => {
    setDailyBriefingPreviewSeed((current) => current || new Date().toISOString());
  };

  const handleCloseDailyBriefingPreviewDrawer = () => {
    setDailyBriefingPreviewSeed(null);
  };

  const handleRefreshDailyBriefingPreview = () => {
    setDailyBriefingPreviewSeed(new Date().toISOString());
  };

  const dailyBriefingPreviewArtifacts = dailyBriefingPreviewSeed
    ? buildDailyBriefingShareArtifacts(new Date(dailyBriefingPreviewSeed))
    : null;
  const dailyBriefingPreviewMailDraftStatus = dailyBriefingPreviewArtifacts?.emailMailtoUrl
    ? dailyBriefingPreviewArtifacts.toRecipients
      ? '已生成，可用上方“打开邮件草稿”创建本地邮件'
      : '已生成，但尚未设置收件人模板；可先补全收件人后再打开邮件草稿'
    : '未生成';
  const canOpenDailyBriefingPreviewMailDraft = Boolean(dailyBriefingPreviewArtifacts?.toRecipients);

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
