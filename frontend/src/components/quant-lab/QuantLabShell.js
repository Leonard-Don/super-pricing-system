import React from 'react';
import { Alert, Button, Card, Typography } from 'antd';
import { DashboardOutlined } from '@ant-design/icons';

const { Paragraph, Title } = Typography;

function QuantLabShell({
  activeTab,
  activeTabMeta,
  children,
  focusItems,
  heroMetrics,
  onTabChange,
  tabMeta,
}) {
  return (
    <div className="app-page-shell app-page-shell--wide quantlab-page-shell" data-testid="quantlab-page">
      <section className="app-page-hero app-page-hero--quantlab" data-testid="quantlab-hero">
        <div className="app-page-hero__header">
          <div className="app-page-hero__content">
            <div className="app-page-eyebrow">量化实验台</div>
            <div className="app-page-heading">
              <DashboardOutlined className="app-page-heading__icon" />
              <div>
                <Title level={3} style={{ margin: 0 }}>
                  量化实验台
                </Title>
                <Paragraph type="secondary" style={{ margin: '10px 0 0' }}>
                  这里是当前仓的内部实验与运行面板，用来把策略实验、验证结果、基础设施状态和运营回看放在一张页面里，而不是另一套独立产品。
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
        <div className="quantlab-hero-brief">
          <div className="quantlab-hero-brief__item">
            <span className="quantlab-hero-brief__label">实验主线</span>
            <span className="quantlab-hero-brief__value">优化、回测增强、风险与估值四类实验统一在这里推进。</span>
          </div>
          <div className="quantlab-hero-brief__item">
            <span className="quantlab-hero-brief__label">验证工作区</span>
            <span className="quantlab-hero-brief__value">行业、信号、因子三类验证面板继续保留，但统一挂在同一套实验流程下。</span>
          </div>
          <div className="quantlab-hero-brief__item">
            <span className="quantlab-hero-brief__label">运行面板</span>
            <span className="quantlab-hero-brief__value">基础设施、告警、交易日志和数据质量放在一起，方便看状态而不是来回切页面。</span>
          </div>
        </div>
      </section>

      <Card className="app-page-context-rail quantlab-context-rail" variant="borderless">
        <div className="app-page-context-rail__header">
          <div>
            <div className="app-page-context-rail__eyebrow">当前工作区</div>
            <Title level={5} style={{ margin: 0 }}>
              {activeTabMeta.title}
            </Title>
            <Paragraph type="secondary" style={{ margin: '8px 0 0' }}>
              {activeTabMeta.summary}
            </Paragraph>
          </div>
          <div className="app-page-context-rail__actions quantlab-tab-shortcuts" data-testid="quantlab-shortcuts">
            {tabMeta.map((item) => (
              <Button
                key={item.key}
                size="small"
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
          <Alert
            style={{ marginBottom: 16 }}
            type="info"
            showIcon
            message="这一版先把本仓已有实验与运行能力收拢到一起"
            description="已有实验、验证和运行能力都保留，只是收拢到同一张面板里，减少来回跳转。"
          />
          {children}
        </section>
      </div>
    </div>
  );
}

export default QuantLabShell;
