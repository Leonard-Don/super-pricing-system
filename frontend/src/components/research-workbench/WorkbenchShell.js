import React from 'react';
import { Button, Card, Typography } from 'antd';
import { FolderOutlined } from '@ant-design/icons';

const { Paragraph, Title } = Typography;

function WorkbenchShell({
  bulkCommentCount,
  bulkQueueCount,
  children,
  contextItems,
  heroBriefItems,
  heroMetrics,
  onBulkComment,
  onBulkQueue,
  onCopyViewLink,
  saving,
  viewSummary,
}) {
  return (
    <div className="app-page-shell app-page-shell--wide workbench-page-shell" data-testid="workbench-page">
      <section className="app-page-hero app-page-hero--workbench" data-testid="workbench-hero">
        <div className="app-page-hero__header">
          <div className="app-page-hero__content">
            <div className="app-page-eyebrow">任务闭环</div>
            <div className="app-page-heading">
              <FolderOutlined className="app-page-heading__icon" />
              <div>
                <Title level={3} style={{ margin: 0 }}>
                  研究工作台
                </Title>
                <Paragraph type="secondary" style={{ margin: '10px 0 0' }}>
                  这页不是再看一遍长列表，而是把当前筛选队列、批量动作、任务详情和重开入口放到同一个地方，方便你先决定“现在看哪条、下一步做什么”。
                </Paragraph>
              </div>
            </div>
          </div>
          <div className="app-page-hero__aside">
            <div className="app-page-metric-strip workbench-hero-metrics">
              {heroMetrics.map((item) => (
                <div key={item.label} className="app-page-metric-card">
                  <span className="app-page-metric-card__label">{item.label}</span>
                  <span className="app-page-metric-card__value">{item.value}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
        <div className="workbench-hero-brief">
          {heroBriefItems.map((item) => (
            <div key={item.label} className="workbench-hero-brief__item">
              <span className="workbench-hero-brief__label">{item.label}</span>
              <span className="workbench-hero-brief__value">{item.value}</span>
            </div>
          ))}
        </div>
      </section>

      <Card className="app-page-context-rail workbench-context-rail" variant="borderless">
        <div className="app-page-context-rail__header">
          <div>
            <div className="app-page-context-rail__eyebrow">当前视图</div>
            <Title level={5} style={{ margin: 0 }}>
              当前视图与下一步
            </Title>
            <Paragraph type="secondary" style={{ margin: '8px 0 0' }}>
              {viewSummary.note}
            </Paragraph>
          </div>
          <div className="app-page-context-rail__actions workbench-context-rail__actions">
            <Button size="small" type="default" onClick={onCopyViewLink}>
              复制当前视图链接
            </Button>
            <Button
              size="small"
              onClick={onBulkQueue}
              disabled={!viewSummary.hasActiveFilters || !bulkQueueCount || saving}
            >
              批量推进到进行中 {bulkQueueCount ? `(${bulkQueueCount})` : ''}
            </Button>
            <Button
              size="small"
              onClick={onBulkComment}
              disabled={!viewSummary.hasActiveFilters || !bulkCommentCount || saving}
            >
              批量写入复盘评论 {bulkCommentCount ? `(${bulkCommentCount})` : ''}
            </Button>
          </div>
        </div>
        <div className="app-page-context-rail__grid">
          {contextItems.map((item) => (
            <div key={item.title} className="app-page-context-item">
              <span className="app-page-context-item__title">{item.title}</span>
              <span className="app-page-context-item__detail">{item.detail}</span>
            </div>
          ))}
        </div>
      </Card>

      {children}
    </div>
  );
}

export default WorkbenchShell;
