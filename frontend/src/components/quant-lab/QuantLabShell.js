import React from 'react';
import { Button, Card, Tag, Typography } from 'antd';
import { DashboardOutlined } from '@ant-design/icons';

const { Paragraph, Title } = Typography;

function QuantLabShell({
  activeBoundary,
  activeTab,
  activeTabMeta,
  boundarySummary = [],
  children,
  focusItems,
  heroMetrics,
  onTabChange,
  tabMeta,
}) {
  const currentBoundary = activeBoundary || {};

  return (
    <div className="app-page-shell app-page-shell--wide quantlab-page-shell" data-testid="quantlab-page">
      <section className="app-page-hero app-page-hero--quantlab" data-testid="quantlab-hero">
        <div className="app-page-hero__header">
          <div className="app-page-hero__content">
            <div className="app-page-eyebrow">定价实验台</div>
            <div className="app-page-heading">
              <DashboardOutlined className="app-page-heading__icon" />
              <div>
                <Title level={3} style={{ margin: 0 }}>
                  定价实验台
                </Title>
                <Paragraph type="secondary" style={{ margin: '10px 0 0' }}>
                  这里是当前仓的内部定价实验和运行支撑区；交易策略、实时行情和行业轮动类能力只作为迁移候选保留，继续开发归 quant-trading-system。
                </Paragraph>
              </div>
            </div>
          </div>
          <div className="app-page-hero__aside">
            <div className="app-page-metric-strip quantlab-hero-metrics">
              {heroMetrics.map((item) => (
                <div key={item.label} className="app-page-metric-card">
                  <span className="app-page-metric-card__label">{item.label}</span>
                  <span className="app-page-metric-card__value">{item.value}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
        <div className="quantlab-hero-brief" data-testid="quantlab-boundary-summary">
          {boundarySummary.map((item) => (
            <div key={item.key} className={`quantlab-hero-brief__item quantlab-boundary-card quantlab-boundary-card--${item.tone}`}>
              <span className="quantlab-hero-brief__label">
                {item.label}
                <b>{item.count} 个</b>
              </span>
              <span className="quantlab-hero-brief__value">{item.description}</span>
            </div>
          ))}
        </div>
      </section>

      <Card className="app-page-context-rail quantlab-context-rail quantlab-context-rail--compact" variant="borderless">
        <div className="app-page-context-rail__header">
          <div>
            <div className="app-page-context-rail__eyebrow">当前工作区</div>
            <Title level={5} style={{ margin: 0 }}>
              {activeTabMeta.title}
              {currentBoundary.label ? (
                <Tag className={`quantlab-boundary-tag quantlab-boundary-tag--${currentBoundary.tone}`}>
                  {currentBoundary.label}
                </Tag>
              ) : null}
            </Title>
            <Paragraph type="secondary" style={{ margin: '8px 0 0' }}>
              {activeTabMeta.boundarySummary || activeTabMeta.summary}
            </Paragraph>
          </div>
          <div className="app-page-context-rail__actions quantlab-tab-shortcuts" data-testid="quantlab-shortcuts">
            {tabMeta.map((item) => (
              <Button
                key={item.key}
                className={`quantlab-tab-shortcut quantlab-tab-shortcut--${item.boundary || 'support'}`}
                size="small"
                title={`${item.title || item.shortTitle} · ${item.boundarySummary || item.summary || ''}`}
                type={activeTab === item.key ? 'primary' : 'default'}
                onClick={() => onTabChange(item.key)}
              >
                {item.shortTitle}
              </Button>
            ))}
          </div>
        </div>
        <div className="app-page-context-rail__grid">
          {focusItems.map((item) => (
            <div key={item.title} className="app-page-context-item">
              <span className="app-page-context-item__title">{item.title}</span>
              <span className="app-page-context-item__detail">{item.detail}</span>
            </div>
          ))}
        </div>
      </Card>

      <div className="app-page-section-block">
        <div className="app-page-section-kicker">实验与运营工作区</div>
        <section className="app-page-workspace-surface quantlab-workspace-surface">
          {children}
        </section>
      </div>
    </div>
  );
}

export default QuantLabShell;
