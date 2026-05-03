import React from 'react';
import { Badge, Button, Card, Space, Switch, Tag, Typography } from 'antd';
import {
  BellOutlined,
  PauseCircleOutlined,
  PlayCircleOutlined,
  SyncOutlined,
} from '@ant-design/icons';

const { Text } = Typography;

const RealtimeHeroCard = ({
  activeTab,
  getCategoryLabel,
  getDisplayName,
  handleOpenAlerts,
  heroPrimaryStats,
  heroSignalToneStyles,
  isAutoUpdate,
  isBrowserOnline,
  isConnected,
  lastMarketUpdateLabel,
  loading,
  manualReconnect,
  realtimeActionPosture,
  reconnectAttempts,
  refreshCurrentTab,
  saveReviewSnapshot,
  setIsSnapshotDrawerVisible,
  spotlightChangeLabel,
  spotlightSymbol,
  toggleAutoUpdate,
  transportBanner,
  transportModeLabel,
}) => {
  return (
    <div className="app-page-section-block">
      <div className="app-page-section-kicker">实时指挥席</div>
      <Card
        className="realtime-hero-card"
        style={{
          borderRadius: 28,
          overflow: 'hidden',
          border: '1px solid color-mix(in srgb, var(--accent-primary) 24%, var(--border-color) 76%)',
          boxShadow: '0 24px 60px rgba(15, 23, 42, 0.10)',
        }}
        styles={{ body: { padding: 0 } }}
      >
        <div className="realtime-hero">
          <div className="realtime-hero__main">
            <div className="realtime-hero__statusbar">
              <div className="realtime-hero__eyebrow">Realtime Radar</div>
              <div className="realtime-hero__status-meta">
                {spotlightSymbol && (
                  <div className="realtime-hero__focus-pill">
                    <span className="realtime-hero__focus-label">当前焦点</span>
                    <span className="realtime-hero__focus-text">
                      {getDisplayName(spotlightSymbol)} · {spotlightSymbol} · {spotlightChangeLabel}
                    </span>
                  </div>
                )}
                <Tag
                  color={isConnected ? 'success' : 'error'}
                  style={{ margin: 0, borderRadius: 999, paddingInline: 12, fontWeight: 700 }}
                >
                  {isConnected ? '已连接' : '未连接'}
                </Tag>
              </div>
            </div>
            <div className="realtime-hero__title-row">
              <div className="realtime-hero__headline">
                <Space>
                  <Badge status={isConnected ? 'processing' : 'error'} />
                  <Text strong style={{ fontSize: '24px', color: 'var(--text-primary)' }}>实时行情工作台</Text>
                </Space>
                <div className="realtime-hero__subtitle">
                  先确认链路和分组状态，再直接进入卡片盯盘、提醒和详情联动。
                </div>
              </div>
            </div>
            <div className="realtime-hero__meta">
              <div className="realtime-hero__chip">当前分组：{getCategoryLabel(activeTab)}</div>
              <div className="realtime-hero__chip">链路模式：{transportModeLabel}</div>
              <div className="realtime-hero__chip">自动更新：{isAutoUpdate ? '开启' : '暂停'}</div>
              <div className="realtime-hero__chip">行情时间：{lastMarketUpdateLabel}</div>
              {reconnectAttempts > 0 && <div className="realtime-hero__chip">重连 {reconnectAttempts}</div>}
            </div>
            <div className="realtime-hero__metric-grid">
              {heroPrimaryStats.map((item) => (
                <div key={item.key} className="realtime-hero__metric">
                  <div className="realtime-hero__metric-label">{item.label}</div>
                  <div className="realtime-hero__metric-value">{item.value}</div>
                  <div className="realtime-hero__metric-detail">{item.detail}</div>
                </div>
              ))}
            </div>
            {!isConnected && (
              <div className="realtime-hero__telemetry">
                <Button
                  type="link"
                  size="small"
                  icon={<SyncOutlined />}
                  onClick={manualReconnect}
                  style={{ padding: 0, height: 'auto', fontSize: 12 }}
                >
                  手动重连
                </Button>
              </div>
            )}
          </div>

          <div className="realtime-hero__sidecar">
            <div className="realtime-hero__action-row">
              <Button
                className="realtime-hero__refresh"
                type="primary"
                icon={<SyncOutlined spin={loading} />}
                onClick={refreshCurrentTab}
                loading={loading}
                size="large"
              >
                刷新
              </Button>
              <Button
                className="realtime-hero__secondary-button"
                icon={<BellOutlined />}
                onClick={() => handleOpenAlerts()}
                size="large"
              >
                价格提醒
              </Button>
            </div>
            <div className="realtime-hero__utility-row">
              <div className="realtime-hero__toggle-pill">
                <Text style={{ color: 'var(--text-secondary)', fontSize: '13px' }}>自动更新</Text>
                <Switch
                  checked={isAutoUpdate}
                  onChange={toggleAutoUpdate}
                  checkedChildren={<PlayCircleOutlined />}
                  unCheckedChildren={<PauseCircleOutlined />}
                />
              </div>
              <div className="realtime-hero__utility-actions">
                <Button className="realtime-hero__secondary-button" onClick={saveReviewSnapshot}>
                  保存快照
                </Button>
                <Button type="text" onClick={() => setIsSnapshotDrawerVisible(true)}>
                  查看复盘快照
                </Button>
              </div>
            </div>
            <div className="realtime-hero__signal-stack">
              {!isBrowserOnline && (
                <div
                  className="realtime-hero__signal-card"
                  style={{
                    border: '1px solid rgba(239, 68, 68, 0.4)',
                    background: 'rgba(239, 68, 68, 0.10)',
                    color: '#b91c1c',
                  }}
                >
                  <div style={{ fontWeight: 700, fontSize: 13 }}>浏览器已离线</div>
                  <div style={{ marginTop: 4, fontSize: 12, lineHeight: 1.6 }}>
                    网络连接已中断，实时数据暂停更新。恢复网络后将自动重连。
                  </div>
                </div>
              )}
              <div
                className="realtime-hero__signal-card"
                style={{
                  border: `1px solid ${heroSignalToneStyles.borderColor}`,
                  background: heroSignalToneStyles.background,
                  color: heroSignalToneStyles.color,
                }}
              >
                <div className="realtime-hero__signal-pill-row">
                  <span className="realtime-hero__signal-pill">{transportBanner.title}</span>
                  <span className="realtime-hero__signal-pill realtime-hero__signal-pill--accent">{realtimeActionPosture.title}</span>
                </div>
                <div className="realtime-hero__signal-card-detail">{realtimeActionPosture.actionHint}</div>
                <div className="realtime-hero__signal-card-detail realtime-hero__signal-card-detail--muted">
                  {transportBanner.description}
                </div>
                <div className="realtime-hero__signal-card-detail realtime-hero__signal-card-detail--muted">
                  {realtimeActionPosture.reason}
                </div>
              </div>
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
};

export default RealtimeHeroCard;
