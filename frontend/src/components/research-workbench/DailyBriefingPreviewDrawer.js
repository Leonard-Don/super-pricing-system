import React from 'react';
import { Button, Drawer, Space, Typography } from 'antd';

const { Text } = Typography;

function DailyBriefingPreviewDrawer({
  canOpenDailyBriefingPreviewMailDraft,
  dailyBriefingPdfExporting,
  dailyBriefingPreviewArtifacts,
  dailyBriefingPreviewMailDraftStatus,
  handleCloseDailyBriefingPreviewDrawer,
  handleCopyDailyBriefingEmailBody,
  handleCopyDailyBriefingEmailSubject,
  handleCopyDailyBriefingHtml,
  handleDownloadDailyBriefingHtml,
  handleExportDailyBriefingPdf,
  handleOpenDailyBriefingEmailTemplatePage,
  handleOpenDailyBriefingMailDraft,
  handleRefreshDailyBriefingPreview,
}) {
  return (
    <Drawer
      rootClassName="workbench-daily-briefing-preview-drawer"
      title={<span className="workbench-daily-briefing-preview-title">每日简报预览</span>}
      placement="right"
      width="min(920px, 100vw)"
      onClose={handleCloseDailyBriefingPreviewDrawer}
      open={Boolean(dailyBriefingPreviewArtifacts)}
      extra={(
        <Space wrap className="workbench-daily-briefing-preview-actions">
          <Button size="small" onClick={handleRefreshDailyBriefingPreview}>
            刷新预览时间
          </Button>
          <Button size="small" onClick={handleCopyDailyBriefingHtml}>
            复制 HTML
          </Button>
          <Button size="small" onClick={handleCopyDailyBriefingEmailSubject}>
            复制邮件主题
          </Button>
          <Button size="small" onClick={handleCopyDailyBriefingEmailBody}>
            复制邮件正文
          </Button>
          <Button size="small" onClick={handleDownloadDailyBriefingHtml}>
            下载 HTML
          </Button>
          <Button size="small" onClick={handleOpenDailyBriefingEmailTemplatePage}>
            打开邮件模板页
          </Button>
          <Button
            size="small"
            onClick={handleOpenDailyBriefingMailDraft}
            disabled={!canOpenDailyBriefingPreviewMailDraft}
            title={canOpenDailyBriefingPreviewMailDraft ? '打开邮件草稿' : '请先设置收件人模板'}
          >
            打开邮件草稿
          </Button>
          <Button
            type="primary"
            size="small"
            onClick={handleExportDailyBriefingPdf}
            loading={dailyBriefingPdfExporting}
          >
            导出 PDF
          </Button>
        </Space>
      )}
    >
      {dailyBriefingPreviewArtifacts ? (
        <div className="workbench-daily-briefing-preview-content">
          <div className="workbench-daily-briefing-preview-meta">
            <Text strong className="workbench-daily-briefing-preview-meta-title">
              当前分享卡片 HTML、PDF 与下载文件共用这份内容。
            </Text>
            <Text type="secondary">
              {`导出时间：${dailyBriefingPreviewArtifacts.exportedAtLabel || '未生成'}`}
            </Text>
            <Text type="secondary" style={{ whiteSpace: 'pre-wrap' }}>
              {`收件人模板：${dailyBriefingPreviewArtifacts.toRecipients || '未设置'}`}
            </Text>
            <Text type="secondary" style={{ whiteSpace: 'pre-wrap' }}>
              {`抄送模板：${dailyBriefingPreviewArtifacts.ccRecipients || '未设置'}`}
            </Text>
            <Text type="secondary" style={{ whiteSpace: 'pre-wrap' }}>
              {`邮件主题：${dailyBriefingPreviewArtifacts.emailSubject || '未生成'}`}
            </Text>
            <Text type="secondary" style={{ whiteSpace: 'pre-wrap' }}>
              {`邮件草稿：${dailyBriefingPreviewMailDraftStatus}`}
            </Text>
            {dailyBriefingPreviewArtifacts.teamNote ? (
              <Text type="secondary" style={{ whiteSpace: 'pre-wrap' }}>
                {`团队备注：${dailyBriefingPreviewArtifacts.teamNote}`}
              </Text>
            ) : (
              <Text type="secondary">当前还没有填写团队备注。</Text>
            )}
          </div>
          <iframe
            className="workbench-daily-briefing-preview-frame"
            title="研究工作台每日简报预览"
            srcDoc={dailyBriefingPreviewArtifacts.briefingDocument}
            sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox"
          />
        </div>
      ) : null}
    </Drawer>
  );
}

export default DailyBriefingPreviewDrawer;
