import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Drawer,
  Badge,
  List,
  Tag,
  Button,
  Empty,
  Typography,
  Space,
  Divider,
  Alert as AntAlert
} from 'antd';
import {
  BellOutlined,
  ExclamationCircleOutlined,
  WarningOutlined,
  InfoCircleOutlined,
  CloseCircleOutlined,
  CheckOutlined
} from '@ant-design/icons';
import * as api from '../services/api';

const { Text, Title } = Typography;

const EMPTY_ALERT_ORCHESTRATION = {
  summary: {},
  history_stats: {
    pending_queue: [],
  },
  event_bus: {
    history: [],
  },
  alert_center: {
    current_alerts: [],
    timeline: [],
    counts: {},
    digest: null,
  },
};

const isResolvedAlert = (alert) => {
  const status = String(alert?.status || alert?.review_status || 'active').toLowerCase();
  return ['resolved', 'false_positive', 'closed', 'done', 'dismissed'].includes(status);
};

const hasOwn = (target, key) => Object.prototype.hasOwnProperty.call(target || {}, key);

const getAlertIdentifier = (alert) => {
  if (hasOwn(alert, 'target_alert_id')) return alert.target_alert_id;
  if (hasOwn(alert, 'targetAlertId')) return alert.targetAlertId;
  if (hasOwn(alert, 'alert_id')) return alert.alert_id;
  if (hasOwn(alert, 'alertId')) return alert.alertId;
  if (hasOwn(alert, 'id')) return alert.id;
  return undefined;
};

const hasUsableAlertIdentifier = (value) => (
  value !== undefined
  && value !== null
  && String(value).trim() !== ''
);

const getLifecycleActionLabel = (action) => ({
  acknowledge: '确认',
  snooze: '暂缓',
  resolve: '解决',
  dismiss: '忽略',
}[action] || '处理');

const resolveNextActionLifecycleAction = (item) => {
  const actionType = String(item?.action_type || '').toLowerCase();
  if (actionType === 'resolve_acknowledged_alert') return 'resolve';
  if (actionType === 'check_snoozed_alert') return 'snooze';
  return 'acknowledge';
};

const buildSnoozeUntil = () => new Date(Date.now() + 4 * 60 * 60 * 1000).toISOString();

const shouldFallbackToLegacyAlertUpdate = (error) => (
  [404, 405, 501].includes(Number(error?.response?.status))
);

const buildLegacyLifecycleUpdate = ({ source, alertId, action, note, sourceActionId }) => {
  const actedAt = new Date().toISOString();
  const lifecycleEvent = {
    action,
    acted_at: actedAt,
    source_action_id: sourceActionId,
    note,
  };
  const update = {
    ...source,
    id: alertId,
    alert_id: alertId,
    resolution_action: action,
    resolution_note: note,
    lifecycle_events: [
      ...(Array.isArray(source?.lifecycle_events) ? source.lifecycle_events : []),
      lifecycleEvent,
    ],
  };

  if (action === 'acknowledge') {
    return {
      ...update,
      status: 'acknowledged',
      review_status: 'pending',
      acknowledged_at: source?.acknowledged_at || actedAt,
    };
  }
  if (action === 'snooze') {
    return {
      ...update,
      status: 'snoozed',
      review_status: 'pending',
      acknowledged_at: source?.acknowledged_at || actedAt,
      snoozed_until: buildSnoozeUntil(),
    };
  }
  return {
    ...update,
    status: 'resolved',
    review_status: action === 'dismiss' ? 'false_positive' : 'resolved',
    acknowledged_at: source?.acknowledged_at || actedAt,
    resolved_at: actedAt,
    dismissed_at: action === 'dismiss' ? actedAt : source?.dismissed_at,
  };
};

const countAlertsBySeverity = (alerts) => (
  alerts.reduce((accumulator, alert) => {
    const level = String(alert?.severity || 'info').toLowerCase();
    accumulator[level] = (accumulator[level] || 0) + 1;
    return accumulator;
  }, {})
);

const buildAlertCenterSummary = (orchestration) => {
  const alertCenter = orchestration?.alert_center || null;
  if (alertCenter) {
    const currentAlerts = Array.isArray(alertCenter.current_alerts)
      ? alertCenter.current_alerts
      : [];
    const timeline = Array.isArray(alertCenter.timeline)
      ? alertCenter.timeline
      : [];
    const recentAlerts = (currentAlerts.length ? currentAlerts : timeline).slice(0, 20);
    const openCurrentCount = alertCenter.counts?.open_current;
    const activeAlerts = openCurrentCount !== undefined
      && openCurrentCount !== null
      && Number.isFinite(Number(openCurrentCount))
      ? Number(openCurrentCount)
      : currentAlerts.filter((alert) => !isResolvedAlert(alert)).length;

    return {
      activeAlerts,
      recentAlerts,
      alertsByLevel: alertCenter.counts?.by_severity || countAlertsBySeverity(currentAlerts),
      digest: alertCenter.digest || null,
    };
  }

  const recentAlerts = Array.isArray(orchestration?.event_bus?.history)
    ? orchestration.event_bus.history.slice(0, 20)
    : [];
  const pendingAlerts = Array.isArray(orchestration?.history_stats?.pending_queue)
    ? orchestration.history_stats.pending_queue
    : [];
  const alertsByLevel = recentAlerts.reduce((accumulator, alert) => {
    const level = String(alert?.severity || 'info').toLowerCase();
    accumulator[level] = (accumulator[level] || 0) + 1;
    return accumulator;
  }, {});

  return {
    activeAlerts: pendingAlerts.length,
    recentAlerts,
    alertsByLevel,
    digest: null,
  };
};

const AlertCenter = () => {
  const [visible, setVisible] = useState(false);
  const [loading, setLoading] = useState(false);
  const [hasLoadedAlerts, setHasLoadedAlerts] = useState(false);
  const [orchestration, setOrchestration] = useState(EMPTY_ALERT_ORCHESTRATION);

  // 告警级别配置
  const alertConfig = useMemo(() => ({
    info: {
      color: 'blue',
      icon: <InfoCircleOutlined />,
      label: '信息'
    },
    warning: {
      color: 'orange',
      icon: <WarningOutlined />,
      label: '警告'
    },
    error: {
      color: 'red',
      icon: <CloseCircleOutlined />,
      label: '错误'
    },
    critical: {
      color: 'volcano',
      icon: <ExclamationCircleOutlined />,
      label: '严重'
    }
  }), []);
  const summary = useMemo(
    () => buildAlertCenterSummary(orchestration),
    [orchestration],
  );

  // 获取告警数据
  const fetchAlerts = useCallback(async ({ showSpinner = true } = {}) => {
    if (showSpinner) {
      setLoading(true);
    }
    try {
      const data = await api.getQuantAlertOrchestration();
      setOrchestration(data || EMPTY_ALERT_ORCHESTRATION);
      setHasLoadedAlerts(true);
    } catch (error) {
      console.error('获取研究告警数据失败:', error);
      setOrchestration(EMPTY_ALERT_ORCHESTRATION);
    } finally {
      if (showSpinner) {
        setLoading(false);
      }
    }
  }, []);

  const handleAlertLifecycleAction = useCallback(async (source, action, note) => {
    const alertId = getAlertIdentifier(source);
    if (!hasUsableAlertIdentifier(alertId)) {
      return;
    }
    const sourceActionId = source?.action_type ? source?.id : source?.source_action_id;
    const payload = {
      alert_id: alertId,
      action,
      note: note || source?.label || source?.rule_name || source?.message || undefined,
      source_action_id: sourceActionId,
    };
    if (action === 'snooze') {
      payload.snoozed_until = buildSnoozeUntil();
    }
    try {
      setLoading(true);
      if (typeof api.resolveQuantAlertAction === 'function') {
        try {
          const response = await api.resolveQuantAlertAction(payload);
          setOrchestration(response?.orchestration || response || EMPTY_ALERT_ORCHESTRATION);
          return;
        } catch (error) {
          if (!shouldFallbackToLegacyAlertUpdate(error)) {
            throw error;
          }
        }
      }
      const response = await api.updateQuantAlertOrchestration({
        history_updates: [
          buildLegacyLifecycleUpdate({
            source,
            alertId,
            action,
            note: payload.note,
            sourceActionId,
          }),
        ],
      });
      setOrchestration(response || EMPTY_ALERT_ORCHESTRATION);
    } catch (error) {
      console.error('更新研究告警状态失败:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  // 解决告警
  const resolveAlert = useCallback((alert) => (
    handleAlertLifecycleAction(alert, 'resolve')
  ), [handleAlertLifecycleAction]);

  useEffect(() => {
    if (!visible) {
      return undefined;
    }

    void fetchAlerts();
    const interval = setInterval(() => {
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
        return;
      }
      void fetchAlerts({ showSpinner: false });
    }, 30000);
    return () => clearInterval(interval);
  }, [fetchAlerts, visible]);

  // 渲染告警项
  const renderAlertItem = (alert, index) => {
    const config = alertConfig[String(alert?.severity || 'info').toLowerCase()] || alertConfig.info;
    const reviewStatus = String(alert?.review_status || alert?.status || 'pending').toLowerCase();
    const isResolved = isResolvedAlert(alert);
    const actions = alert?.actions || {};
    const canAcknowledge = actions.can_acknowledge !== undefined
      ? actions.can_acknowledge
      : reviewStatus === 'pending' || reviewStatus === 'active';
    const canSnooze = actions.can_snooze !== undefined ? actions.can_snooze : !isResolved;
    const canResolve = actions.can_resolve !== undefined ? actions.can_resolve : !isResolved;
    const canDismiss = actions.can_dismiss !== undefined ? actions.can_dismiss : !isResolved;
    const itemSurface = isResolved
      ? {
          background: 'rgba(15, 23, 35, 0.74)',
          border: '1px solid rgba(109, 126, 148, 0.22)',
        }
      : {
          background: 'linear-gradient(135deg, rgba(31, 60, 92, 0.92), rgba(18, 34, 53, 0.98))',
          border: '1px solid rgba(93, 174, 255, 0.28)',
        };

    return (
      <List.Item
        key={index}
        actions={!isResolved ? [
          <Space key="alert-actions" size={4} wrap>
            {canAcknowledge ? (
              <Button
                size="small"
                type="link"
                onClick={() => handleAlertLifecycleAction(alert, 'acknowledge')}
                aria-label={`确认告警 ${alert.rule_name || alert.title || '未命名告警'}`}
              >
                确认
              </Button>
            ) : null}
            {canSnooze ? (
              <Button
                size="small"
                type="link"
                onClick={() => handleAlertLifecycleAction(alert, 'snooze')}
                aria-label={`暂缓告警 ${alert.rule_name || alert.title || '未命名告警'}`}
              >
                暂缓
              </Button>
            ) : null}
            {canResolve ? (
              <Button
                size="small"
                type="link"
                icon={<CheckOutlined />}
                onClick={() => resolveAlert(alert)}
                aria-label={`解决告警 ${alert.rule_name || alert.title || '未命名告警'}`}
              >
                解决
              </Button>
            ) : null}
            {canDismiss ? (
              <Button
                size="small"
                type="link"
                danger
                onClick={() => handleAlertLifecycleAction(alert, 'dismiss')}
                aria-label={`忽略告警 ${alert.rule_name || alert.title || '未命名告警'}`}
              >
                忽略
              </Button>
            ) : null}
          </Space>
        ] : []}
        style={{
          opacity: isResolved ? 0.78 : 1,
          borderRadius: 16,
          padding: '14px 16px',
          marginBottom: 12,
          borderBlockEnd: 'none',
          ...itemSurface,
        }}
      >
        <List.Item.Meta
          avatar={
            <Tag
              color={config.color}
              icon={config.icon}
              style={{ marginRight: 12 }}
            >
              {config.label}
            </Tag>
          }
          title={
            <Space wrap>
              <Text
                strong={!isResolved}
                delete={isResolved}
                style={{ color: isResolved ? 'rgba(214, 224, 235, 0.74)' : '#f5f8fc' }}
              >
                {alert.rule_name || alert.title || '未命名告警'}
              </Text>
              {alert.symbol ? <Tag>{alert.symbol}</Tag> : null}
              {alert.source_module ? <Tag color="geekblue">{alert.source_module}</Tag> : null}
              {isResolved && reviewStatus !== 'false_positive' ? <Tag color="green">已解决</Tag> : null}
              {reviewStatus === 'false_positive' ? <Tag color="red">误报</Tag> : null}
            </Space>
          }
          description={
            <div style={{ color: isResolved ? 'rgba(210, 220, 231, 0.76)' : 'rgba(232, 239, 247, 0.94)' }}>
              <div style={{ marginBottom: 8, lineHeight: 1.6 }}>
                {alert.message || alert.condition_summary || '暂无说明'}
              </div>
              <Text style={{ color: 'rgba(176, 193, 214, 0.86)', fontSize: 12 }}>
                {new Date(alert.trigger_time || alert.timestamp || Date.now()).toLocaleString('zh-CN')}
              </Text>
            </div>
          }
        />
      </List.Item>
    );
  };

  // 获取告警统计信息
  const getAlertStats = () => {
    const stats = summary.alertsByLevel || {};
    return (
      <Space direction="vertical" style={{ width: '100%' }}>
        <Title level={5}>告警统计</Title>
        <Space wrap>
          <Tag color="gold">待处理: {summary.activeAlerts}</Tag>
          <Tag color="green">已复盘: {orchestration.summary?.reviewed_events || 0}</Tag>
          {Object.entries(alertConfig).map(([level, config]) => (
            <Tag
              key={level}
              color={config.color}
              icon={config.icon}
            >
              {config.label}: {stats[level] || 0}
            </Tag>
          ))}
        </Space>
      </Space>
    );
  };

  const getDigestColor = (urgency) => ({
    critical: 'volcano',
    warning: 'orange',
    info: 'blue',
    clear: 'green',
  }[urgency] || 'default');

  const renderAlertDigest = () => {
    const digest = summary.digest;
    if (!digest) {
      return null;
    }
    const nextActions = Array.isArray(digest.next_actions)
      ? digest.next_actions.slice(0, 3)
      : [];

    return (
      <div
        aria-label="告警摘要"
        style={{
          marginBottom: 16,
          padding: '14px 16px',
          borderRadius: 12,
          background: 'rgba(13, 30, 48, 0.82)',
          border: '1px solid rgba(125, 198, 255, 0.22)',
        }}
      >
        <Space direction="vertical" size={8} style={{ width: '100%' }}>
          <Space wrap>
            <Text strong style={{ color: '#f5f8fc' }}>告警摘要</Text>
            {digest.urgency ? (
              <Tag color={getDigestColor(digest.urgency)}>{digest.urgency}</Tag>
            ) : null}
          </Space>
          <Text style={{ color: 'rgba(232, 239, 247, 0.94)' }}>
            {digest.headline || '当前暂无告警活动'}
          </Text>
          {nextActions.length ? (
            <List
              size="small"
              dataSource={nextActions}
              renderItem={(item) => {
                const lifecycleAction = resolveNextActionLifecycleAction(item);
                const actionLabel = getLifecycleActionLabel(lifecycleAction);
                const itemLabel = item.label || item.action_type || '下一步动作';
                return (
                  <List.Item
                    style={{ padding: '6px 0', borderBlockEnd: 'none' }}
                    actions={[
                      <Button
                        key="digest-action"
                        size="small"
                        type="link"
                        onClick={() => handleAlertLifecycleAction(item, lifecycleAction, itemLabel)}
                        aria-label={`${actionLabel}下一步动作 ${itemLabel}`}
                      >
                        {actionLabel}
                      </Button>
                    ]}
                  >
                    <Space direction="vertical" size={0}>
                      <Text style={{ color: '#f5f8fc' }}>
                        {itemLabel}
                      </Text>
                      {item.reason ? (
                        <Text style={{ color: 'rgba(176, 193, 214, 0.86)', fontSize: 12 }}>
                          {item.reason}
                        </Text>
                      ) : null}
                    </Space>
                  </List.Item>
                );
              }}
            />
          ) : null}
        </Space>
      </div>
    );
  };

  return (
    <>
      {/* 告警铃铛按钮 */}
      <Badge
        count={hasLoadedAlerts ? summary.activeAlerts : 0}
        size="small"
        offset={[-2, 4]}
      >
        <Button
          type="text"
          icon={<BellOutlined />}
          onClick={() => setVisible(true)}
          aria-label="打开研究告警中心"
          style={{
            color: summary.activeAlerts > 0 ? '#7dc6ff' : undefined
          }}
        />
      </Badge>

      {/* 告警抽屉 */}
      <Drawer
        title="研究告警中心"
        placement="right"
        width={480}
        onClose={() => setVisible(false)}
        open={visible}
        extra={
          <Button
            type="primary"
            size="small"
            onClick={fetchAlerts}
            loading={loading}
          >
            刷新
          </Button>
        }
      >
        {/* 总体告警状态 */}
        {summary.activeAlerts > 0 ? (
          <AntAlert
            message={`当前有 ${summary.activeAlerts} 个待复盘告警`}
            type="warning"
            showIcon
            style={{ marginBottom: 16 }}
          />
        ) : summary.recentAlerts.length > 0 ? (
          <AntAlert
            message="当前没有待处理告警"
            description="可以在下方继续回看最近告警和复盘记录。"
            type="info"
            showIcon
            style={{ marginBottom: 16 }}
          />
        ) : (
          <AntAlert
            message="当前暂无告警记录"
            type="success"
            showIcon
            style={{ marginBottom: 16 }}
          />
        )}

        {/* 告警统计 */}
        {renderAlertDigest()}
        {getAlertStats()}

        <Divider />

        {/* 告警列表 */}
        <Title level={5}>最近告警</Title>
        {summary.recentAlerts.length === 0 ? (
          <Empty
            description="暂无告警记录"
            image={Empty.PRESENTED_IMAGE_SIMPLE}
          />
        ) : (
          <List
            dataSource={summary.recentAlerts}
            renderItem={renderAlertItem}
            loading={loading}
            style={{ maxHeight: '60vh', overflowY: 'auto' }}
          />
        )}
      </Drawer>
    </>
  );
};

export default AlertCenter;
