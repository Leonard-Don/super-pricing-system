import React from 'react';
import {
  Card,
  Col,
  Row,
  Statistic,
  Typography,
} from 'antd';
import {
  ClockCircleOutlined,
  GlobalOutlined,
  RadarChartOutlined,
  SyncOutlined,
} from '@ant-design/icons';

import {
  formatGodEyeSnapshotTimestamp,
  getGodEyeStalenessLabel,
} from './displayLabels';

const { Text } = Typography;

const GodEyeStatusStats = ({
  macroScore,
  providerCount,
  providerHealth,
  refreshing,
  schedulerStatus,
  snapshotTimestamp,
  staleness,
}) => {
  const formattedSnapshot = formatGodEyeSnapshotTimestamp(snapshotTimestamp);

  return (
    <Row gutter={[16, 16]}>
      <Col xs={24} md={6}>
        <Card variant="borderless">
          <Text type="secondary">最近刷新</Text>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 16 }}>
            <ClockCircleOutlined style={{ fontSize: 24, color: '#8db7dc' }} />
            <div style={{ minWidth: 0 }}>
              <Text strong style={{ display: 'block', fontSize: 18, lineHeight: 1.3 }}>
                {formattedSnapshot.date}
              </Text>
              {formattedSnapshot.time ? (
                <Text type="secondary" style={{ display: 'block', fontSize: 13, marginTop: 4 }}>
                  {formattedSnapshot.time}
                </Text>
              ) : null}
            </div>
          </div>
        </Card>
      </Col>
      <Col xs={24} md={6}>
        <Card variant="borderless">
          <Statistic
            title="数据新鲜度"
            value={getGodEyeStalenessLabel(staleness)}
            prefix={<SyncOutlined spin={refreshing} />}
          />
          <Text type="secondary">最大快照年龄 {staleness?.max_snapshot_age_seconds ?? '-'} 秒</Text>
        </Card>
      </Col>
      <Col xs={24} md={6}>
        <Card variant="borderless">
          <Statistic
            title="健康提供器"
            value={providerHealth?.healthy_providers ?? 0}
            suffix={`/ ${providerCount}`}
            prefix={<GlobalOutlined />}
          />
          <Text type="secondary">
            降级 {providerHealth?.degraded_providers ?? 0} / 异常 {providerHealth?.error_providers ?? 0}
          </Text>
        </Card>
      </Col>
      <Col xs={24} md={6}>
        <Card variant="borderless">
          <Statistic
            title="宏观错价分数"
            value={macroScore ?? 0}
            precision={4}
            prefix={<RadarChartOutlined />}
          />
          <Text type="secondary">调度任务 {schedulerStatus?.jobs?.length ?? 0}</Text>
        </Card>
      </Col>
    </Row>
  );
};

export default GodEyeStatusStats;
