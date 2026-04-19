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
            <div className="app-page-eyebrow">Quant Lab</div>
            <div className="app-page-heading">
              <DashboardOutlined className="app-page-heading__icon" />
              <div>
                <Title level={3} style={{ margin: 0 }}>
                  量化实验与运营工作台
                </Title>
                <Paragraph type="secondary" style={{ margin: '10px 0 0' }}>
                  把策略研究、信号验证、基础设施和运营复盘收进同一条闭环里，首屏先告诉你当前焦点、系统状态和下一步应该进入哪块工作区。
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
            <span className="quantlab-hero-brief__label">研究执行</span>
            <span className="quantlab-hero-brief__value">优化、回测增强、风险归因、估值集成</span>
          </div>
          <div className="quantlab-hero-brief__item">
            <span className="quantlab-hero-brief__label">信号与情报</span>
            <span className="quantlab-hero-brief__value">行业轮动、宏观验证、实时行情深度、自定义因子</span>
          </div>
          <div className="quantlab-hero-brief__item">
            <span className="quantlab-hero-brief__label">运营闭环</span>
            <span className="quantlab-hero-brief__value">告警编排、交易日志、数据质量、认证与任务队列</span>
          </div>
        </div>
      </section>

      <Card className="app-page-context-rail quantlab-context-rail" variant="borderless">
        <div className="app-page-context-rail__header">
          <div>
            <div className="app-page-context-rail__eyebrow">Workspace Focus</div>
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
            message="这一版优先补齐研究闭环"
            description="后端已经把策略优化、风险分析、估值历史追踪、交易日志、智能告警编排和数据质量观测统一到 Quant Lab；前端现在把这些工作区放进同一张可扫描的操作面板。"
          />
          {children}
        </section>
      </div>
    </div>
  );
}

export default QuantLabShell;
