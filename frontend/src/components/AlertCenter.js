import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Drawer,
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
};

const buildAlertCenterSummary = (orchestration) => {
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
  };
};

const AlertCenter = () => {
  const [visible, setVisible] = useState(false);
  const [loading, setLoading] = useState(false);
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
    } catch (error) {
      console.error('获取研究告警数据失败:', error);
      setOrchestration(EMPTY_ALERT_ORCHESTRATION);
    } finally {
      if (showSpinner) {
        setLoading(false);
      }
    }
  }, []);

  // 解决告警
  const resolveAlert = useCallback(async (alert) => {
    if (!alert?.id) {
      return;
    }
    try {
      setLoading(true);
      const response = await api.updateQuantAlertOrchestration({
        history_updates: [
          {
            ...alert,
            review_status: 'resolved',
            acknowledged_at: new Date().toISOString(),
          },
        ],
      });
      setOrchestration(response || EMPTY_ALERT_ORCHESTRATION);
    } catch (error) {
      console.error('更新研究告警状态失败:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  // 组件挂载时获取数据
  useEffect(() => {
    void fetchAlerts({ showSpinner: false });
  }, [fetchAlerts]);

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

  useEffect(() => {
    const refreshOnFocus = () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
        return;
      }
      void fetchAlerts({ showSpinner: false });
    };

    window.addEventListener('focus', refreshOnFocus);
    document.addEventListener('visibilitychange', refreshOnFocus);
    return () => {
      window.removeEventListener('focus', refreshOnFocus);
      document.removeEventListener('visibilitychange', refreshOnFocus);
    };
  }, [fetchAlerts]);

  // 渲染告警项
  const renderAlertItem = (alert, index) => {
    const config = alertConfig[String(alert?.severity || 'info').toLowerCase()] || alertConfig.info;
    const reviewStatus = String(alert?.review_status || 'pending').toLowerCase();
    const isResolved = reviewStatus !== 'pending';
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
        actions={[
          !isResolved && (
            <Button
              size="small"
              type="link"
              icon={<CheckOutlined />}
              onClick={() => resolveAlert(alert)}
            >
              解决
            </Button>
          )
        ].filter(Boolean)}
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
              {reviewStatus === 'resolved' ? <Tag color="green">已解决</Tag> : null}
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

  return (
    <>
      {/* 告警铃铛按钮 */}
      <Button
        type="text"
        icon={<BellOutlined />}
        onClick={() => setVisible(true)}
        aria-label="打开研究告警中心"
        style={{
          color: summary.activeAlerts > 0 ? '#7dc6ff' : undefined
        }}
      />

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
