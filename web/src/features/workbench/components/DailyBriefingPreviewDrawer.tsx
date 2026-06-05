/**
 * DailyBriefingPreviewDrawer — shadcn Sheet containing an iframe srcDoc preview
 * + export/copy action buttons.
 *
 * Driven by useDailyBriefingSharing (T3).
 */

import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Separator } from '@/components/ui/separator';
import {
  Copy,
  Download,
  ExternalLink,
  FileText,
  Mail,
  RefreshCw,
} from 'lucide-react';
import type { DailyBriefingShareArtifacts } from '@/features/workbench/hooks/useDailyBriefingSharing';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface DailyBriefingPreviewDrawerProps {
  /** Whether the sheet is open (controlled by parent via preview seed) */
  open: boolean;
  /** Current preview artifacts — null means not yet generated */
  artifacts: DailyBriefingShareArtifacts | null;
  /** Mail draft status string from useDailyBriefingSharing */
  mailDraftStatus: string;
  /** Whether the mailto URL is usable (recipients set) */
  canOpenMailDraft: boolean;
  /** PDF export in-progress flag */
  pdfExporting: boolean;
  onClose: () => void;
  onRefresh: () => void;
  onCopyHtml: () => void;
  onCopyEmailSubject: () => void;
  onCopyEmailBody: () => void;
  onDownloadHtml: () => void;
  onOpenEmailTemplatePage: () => void;
  onOpenMailDraft: () => void;
  onExportPdf: () => void;
}

// ---------------------------------------------------------------------------
// DailyBriefingPreviewDrawer
// ---------------------------------------------------------------------------

export default function DailyBriefingPreviewDrawer({
  open,
  artifacts,
  mailDraftStatus,
  canOpenMailDraft,
  pdfExporting,
  onClose,
  onRefresh,
  onCopyHtml,
  onCopyEmailSubject,
  onCopyEmailBody,
  onDownloadHtml,
  onOpenEmailTemplatePage,
  onOpenMailDraft,
  onExportPdf,
}: DailyBriefingPreviewDrawerProps) {
  return (
    <Sheet open={open} onOpenChange={(nextOpen) => { if (!nextOpen) onClose(); }}>
      <SheetContent
        side="right"
        showCloseButton={false}
        data-testid="briefing-preview-drawer"
        className="flex w-full flex-col gap-0 p-0 sm:max-w-[min(920px,100vw)]"
      >
        {/* ── Header ── */}
        <SheetHeader className="flex flex-row items-center justify-between border-b border-border px-4 py-3">
          <SheetTitle className="text-sm font-semibold text-foreground">每日简报预览</SheetTitle>

          <Button
            data-testid="briefing-preview-close-btn"
            size="sm"
            variant="ghost"
            onClick={onClose}
          >
            关闭
          </Button>
        </SheetHeader>

        {/* ── Action strip ── */}
        <div
          data-testid="briefing-preview-actions"
          className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-2"
        >
          <Button
            data-testid="briefing-preview-refresh-btn"
            size="sm"
            variant="ghost"
            onClick={onRefresh}
          >
            <RefreshCw className="mr-1.5 size-3.5" />
            刷新预览时间
          </Button>

          <Button
            data-testid="briefing-preview-copy-html-btn"
            size="sm"
            variant="ghost"
            onClick={onCopyHtml}
          >
            <Copy className="mr-1.5 size-3.5" />
            复制 HTML
          </Button>

          <Button
            data-testid="briefing-preview-copy-subject-btn"
            size="sm"
            variant="ghost"
            onClick={onCopyEmailSubject}
          >
            <Copy className="mr-1.5 size-3.5" />
            复制邮件主题
          </Button>

          <Button
            data-testid="briefing-preview-copy-body-btn"
            size="sm"
            variant="ghost"
            onClick={onCopyEmailBody}
          >
            <Copy className="mr-1.5 size-3.5" />
            复制邮件正文
          </Button>

          <Button
            data-testid="briefing-preview-download-html-btn"
            size="sm"
            variant="ghost"
            onClick={onDownloadHtml}
          >
            <Download className="mr-1.5 size-3.5" />
            下载 HTML
          </Button>

          <Button
            data-testid="briefing-preview-open-template-btn"
            size="sm"
            variant="ghost"
            onClick={onOpenEmailTemplatePage}
          >
            <ExternalLink className="mr-1.5 size-3.5" />
            打开邮件模板页
          </Button>

          <Button
            data-testid="briefing-preview-open-draft-btn"
            size="sm"
            variant="ghost"
            disabled={!canOpenMailDraft}
            onClick={onOpenMailDraft}
            title={canOpenMailDraft ? '打开邮件草稿' : '请先设置收件人模板'}
          >
            <Mail className="mr-1.5 size-3.5" />
            打开邮件草稿
          </Button>

          <Button
            data-testid="briefing-preview-export-pdf-btn"
            size="sm"
            variant="default"
            onClick={onExportPdf}
            disabled={pdfExporting}
          >
            <FileText className="mr-1.5 size-3.5" />
            {pdfExporting ? '导出中…' : '导出 PDF'}
          </Button>
        </div>

        {/* ── Content ── */}
        {artifacts ? (
          <div
            data-testid="briefing-preview-content"
            className="flex flex-1 flex-col gap-0 overflow-hidden"
          >
            {/* Meta info */}
            <div className="flex flex-col gap-1 border-b border-border bg-muted/40 px-4 py-3 text-xs text-muted-foreground">
              <p className="font-medium text-foreground">
                当前分享卡片 HTML、PDF 与下载文件共用这份内容。
              </p>
              <p>
                <span className="font-medium">导出时间：</span>
                {artifacts.exportedAtLabel || '未生成'}
              </p>
              <p className="whitespace-pre-wrap">
                <span className="font-medium">收件人模板：</span>
                {artifacts.toRecipients || '未设置'}
              </p>
              <p className="whitespace-pre-wrap">
                <span className="font-medium">抄送模板：</span>
                {artifacts.ccRecipients || '未设置'}
              </p>
              <p className="whitespace-pre-wrap">
                <span className="font-medium">邮件主题：</span>
                {artifacts.emailSubject || '未生成'}
              </p>
              <p className="whitespace-pre-wrap">
                <span className="font-medium">邮件草稿：</span>
                {mailDraftStatus}
              </p>
              {artifacts.teamNote ? (
                <p className="whitespace-pre-wrap">
                  <span className="font-medium">团队备注：</span>
                  {artifacts.teamNote}
                </p>
              ) : (
                <p>当前还没有填写团队备注。</p>
              )}
            </div>

            <Separator />

            {/* iframe preview */}
            <iframe
              data-testid="briefing-preview-iframe"
              title="研究工作台每日简报预览"
              srcDoc={artifacts.briefingDocument}
              sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox"
              className="flex-1 border-0"
            />
          </div>
        ) : (
          <div
            data-testid="briefing-preview-empty"
            className="flex flex-1 items-center justify-center text-sm text-muted-foreground"
          >
            正在生成预览…
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
