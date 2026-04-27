import React from 'react';
import { Button, Card, List, Space, Tag, Typography } from 'antd';

const { Text } = Typography;

const severityColor = {
  high: 'red',
  medium: 'orange',
  low: 'blue',
};

const severityLabel = {
  high: '高',
  medium: '中',
  low: '低',
};

function AlertHunterPanel({ alerts = [], onNavigate }) {
  return (
    <Card
      title="异常猎手"
      variant="borderless"
      extra={<Tag color="magenta">{alerts.length} 条候选</Tag>}
      styles={{ body: { minHeight: 320 } }}
    >
      <List
        dataSource={alerts}
        locale={{ emptyText: '暂无需要猎杀的异常' }}
        renderItem={(item) => (
          <List.Item
            actions={[
              item.action?.target && item.action.target !== 'observe' ? (
                <Button key="go" size="small" onClick={() => onNavigate?.(item.action)}>
                  {item.action.label}
                </Button>
              ) : (
                <Tag key="observe">继续观察</Tag>
              ),
            ]}
          >
            <List.Item.Meta
              title={
                <Space wrap>
                  <Text strong>{item.title}</Text>
                  <Tag color={severityColor[item.severity] || 'default'}>{severityLabel[item.severity] || item.severity}</Tag>
                </Space>
              }
              description={item.description}
            />
          </List.Item>
        )}
      />
    </Card>
  );
}

export default AlertHunterPanel;
