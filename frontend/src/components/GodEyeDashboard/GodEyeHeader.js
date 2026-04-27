import React from 'react';
import {
  Button,
  Card,
  Space,
  Tag,
  Typography,
} from 'antd';
import { ReloadOutlined } from '@ant-design/icons';

import { getSignalLabel } from './viewModels';

const { Paragraph, Title } = Typography;

const signalColor = {
  1: 'red',
  0: 'gold',
  '-1': 'green',
};

const GodEyeHeader = ({
  handleManualRefresh,
  macroSignal,
  navigateTo,
  refreshing,
}) => (
  <Card
    className="godeye-topbar"
    variant="borderless"
    style={{
      background:
        'radial-gradient(circle at top left, rgba(26, 66, 98, 0.96), rgba(10, 22, 33, 0.98) 55%, rgba(38, 54, 34, 0.92))',
      color: '#f4f7fb',
      overflow: 'hidden',
      boxShadow: '0 22px 48px rgba(0, 0, 0, 0.25)',
    }}
  >
    <div className="godeye-topbar__row">
      <div className="godeye-topbar__copy">
        <Space direction="vertical" size={8}>
          <Tag color="cyan" style={{ width: 'fit-content', marginInlineEnd: 0 }}>
            宏观错价指挥台
          </Tag>
          <Title level={4} style={{ margin: 0, color: '#f4f7fb' }}>
            GodEye V2 作战大屏
          </Title>
          <Paragraph style={{ margin: 0, color: 'rgba(244, 247, 251, 0.82)', maxWidth: 760 }}>
            把当前主模板、结构风险、政策节奏和猎杀信号收拢到同一张战情页里，先判断哪里值得立刻下钻。
          </Paragraph>
          <Space wrap size={[10, 10]}>
            <Button size="small" type="primary" onClick={() => navigateTo('pricing')}>
              打开定价剧本
            </Button>
          </Space>
        </Space>
      </div>
      <div className="godeye-topbar__actions">
        <Space wrap size={[10, 10]}>
          <Button
            size="small"
            icon={<ReloadOutlined />}
            loading={refreshing}
            onClick={handleManualRefresh}
          >
            强制刷新
          </Button>
          <Tag color={signalColor[macroSignal ?? 0]} style={{ fontSize: 14, padding: '6px 10px' }}>
            {getSignalLabel(macroSignal ?? 0)}
          </Tag>
        </Space>
      </div>
    </div>
  </Card>
);

export default GodEyeHeader;
