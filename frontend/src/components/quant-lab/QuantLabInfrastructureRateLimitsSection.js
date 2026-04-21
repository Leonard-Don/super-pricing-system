import React from 'react';
import {
  Button,
  Card,
  Col,
  Form,
  Input,
  InputNumber,
  Row,
  Space,
  Statistic,
  Table,
  Tag,
} from 'antd';

const FULL_WIDTH_STYLE = { width: '100%' };

export const QuantLabInfrastructureRateLimitsSection = ({
  formatDateTime,
  handleUpdateRateLimits,
  infrastructureStatus,
  rateLimitForm,
  loading = false,
}) => (
  <Card title="精细化限流" loading={loading}>
    <Space direction="vertical" size="large" style={FULL_WIDTH_STYLE}>
      <Row gutter={[12, 12]}>
        <Col xs={24} md={6}><Statistic title="默认 RPM" value={infrastructureStatus.rate_limits?.default_rule?.requests_per_minute || 0} /></Col>
        <Col xs={24} md={6}><Statistic title="默认 Burst" value={infrastructureStatus.rate_limits?.default_rule?.burst_size || 0} /></Col>
        <Col xs={24} md={6}><Statistic title="追踪桶" value={infrastructureStatus.rate_limits?.tracked_buckets || 0} /></Col>
        <Col xs={24} md={6}><Statistic title="最近阻断" value={(infrastructureStatus.rate_limits?.recent_blocks || []).length} /></Col>
      </Row>
      <Row gutter={[16, 16]}>
        <Col xs={24} xl={10}>
          <Form form={rateLimitForm} layout="vertical" onFinish={handleUpdateRateLimits}>
            <Row gutter={12}>
              <Col span={12}>
                <Form.Item name="default_requests_per_minute" label="默认每分钟请求数" rules={[{ required: true, message: '请输入默认 RPM' }]}>
                  <InputNumber min={1} max={10000} precision={0} style={FULL_WIDTH_STYLE} />
                </Form.Item>
              </Col>
              <Col span={12}>
                <Form.Item name="default_burst_size" label="默认突发容量" rules={[{ required: true, message: '请输入默认 Burst' }]}>
                  <InputNumber min={1} max={10000} precision={0} style={FULL_WIDTH_STYLE} />
                </Form.Item>
              </Col>
            </Row>
            <Form.Item name="rules_json" label="端点规则 JSON">
              <Input.TextArea rows={12} placeholder='[{"pattern":"/api/v1/backtest*","requests_per_minute":24,"burst_size":36,"enabled":true}]' />
            </Form.Item>
            <Button type="primary" htmlType="submit">更新限流规则</Button>
          </Form>
        </Col>
        <Col xs={24} xl={14}>
          <Space direction="vertical" size="large" style={FULL_WIDTH_STYLE}>
            <Card size="small" title="按端点统计">
              <Table
                size="small"
                pagination={{ pageSize: 5 }}
                rowKey="endpoint"
                dataSource={infrastructureStatus.rate_limits?.top_endpoints || []}
                columns={[
                  { title: '端点', dataIndex: 'endpoint', ellipsis: true },
                  { title: '规则', dataIndex: 'rule_pattern', ellipsis: true },
                  { title: '放行', dataIndex: 'allowed' },
                  { title: '阻断', dataIndex: 'blocked' },
                  { title: '最近访问', dataIndex: 'last_seen', render: (value) => value ? formatDateTime(value) : '--' },
                ]}
              />
            </Card>
            <Card size="small" title="最近阻断事件">
              <Table
                size="small"
                pagination={{ pageSize: 4 }}
                rowKey={(record) => `${record.subject || 'unknown'}-${record.timestamp || 'na'}-${record.endpoint || 'endpoint'}`}
                dataSource={infrastructureStatus.rate_limits?.recent_blocks || []}
                columns={[
                  { title: '时间', dataIndex: 'timestamp', render: (value) => formatDateTime(value) },
                  { title: '端点', dataIndex: 'endpoint', ellipsis: true },
                  { title: '身份', dataIndex: 'identity_type', render: (value) => <Tag color="red">{value}</Tag> },
                  { title: '重试(s)', dataIndex: 'retry_after' },
                ]}
              />
            </Card>
          </Space>
        </Col>
      </Row>
    </Space>
  </Card>
);
