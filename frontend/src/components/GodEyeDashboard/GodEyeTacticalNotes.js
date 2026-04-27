import React from 'react';
import { Card, Typography } from 'antd';

const { Text } = Typography;

const GodEyeTacticalNotes = () => (
  <Card
    title="战术说明"
    variant="borderless"
    styles={{ body: { display: 'flex', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' } }}
  >
    <Text type="secondary">实体链路热区用来观察物理世界堵点、库存压力和人才结构变化。</Text>
    <Text type="secondary">风险溢价雷达和宏观因子面板用来判断错价强度、共振来源和输入质量。</Text>
    <Text type="secondary">政策时间轴、异常猎手与跨市场模板总览共同决定下一步该回到定价研究还是打开跨市场模板。</Text>
  </Card>
);

export default GodEyeTacticalNotes;
