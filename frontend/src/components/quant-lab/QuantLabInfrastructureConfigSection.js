import React from 'react';
import {
  Button,
  Card,
  Col,
  Form,
  Input,
  InputNumber,
  Row,
  Table,
  Tag,
  Typography,
} from 'antd';

const { Text } = Typography;

export const QuantLabInfrastructureConfigSection = ({
  configDiff,
  configDiffRows,
  configLookupForm,
  configVersionForm,
  configVersionLoading,
  configVersionRows,
  handleDiffLatestConfigVersions,
  handleLoadConfigVersions,
  handleRestoreConfigVersion,
  handleSaveConfigVersion,
}) => (
  <Card
    title="配置版本化与回滚"
    extra={<Button size="small" onClick={handleDiffLatestConfigVersions} disabled={configVersionRows.length < 2} loading={configVersionLoading}>对比最新两版</Button>}
  >
    <Row gutter={[16, 16]}>
      <Col xs={24} xl={10}>
        <Form
          form={configVersionForm}
          layout="vertical"
          onFinish={handleSaveConfigVersion}
          initialValues={{
            owner_id: 'default',
            config_type: 'strategy',
            config_key: 'moving_average',
            payload: '{"short_window": 20, "long_window": 60, "risk_budget": 0.12}',
          }}
        >
          <Row gutter={12}>
            <Col xs={24} md={8}>
              <Form.Item name="owner_id" label="Owner">
                <Input />
              </Form.Item>
            </Col>
            <Col xs={24} md={8}>
              <Form.Item name="config_type" label="配置类型" rules={[{ required: true, message: '请输入配置类型' }]}>
                <Input />
              </Form.Item>
            </Col>
            <Col xs={24} md={8}>
              <Form.Item name="config_key" label="配置键" rules={[{ required: true, message: '请输入配置键' }]}>
                <Input />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item name="payload" label="配置 JSON">
            <Input.TextArea rows={5} />
          </Form.Item>
          <Button type="primary" htmlType="submit" loading={configVersionLoading}>保存新版本</Button>
        </Form>
      </Col>
      <Col xs={24} xl={14}>
        <Form
          form={configLookupForm}
          layout="inline"
          onFinish={handleLoadConfigVersions}
          initialValues={{ owner_id: 'default', config_type: 'strategy', config_key: 'moving_average', limit: 20 }}
          style={{ marginBottom: 12 }}
        >
          <Form.Item name="owner_id" label="Owner">
            <Input style={{ width: 110 }} />
          </Form.Item>
          <Form.Item name="config_type" label="类型">
            <Input style={{ width: 120 }} />
          </Form.Item>
          <Form.Item name="config_key" label="键">
            <Input style={{ width: 150 }} />
          </Form.Item>
          <Form.Item name="limit" label="数量">
            <InputNumber min={1} max={200} precision={0} style={{ width: 90 }} />
          </Form.Item>
          <Button htmlType="submit" loading={configVersionLoading}>读取历史</Button>
        </Form>
        <Table
          size="small"
          pagination={{ pageSize: 5 }}
          dataSource={configVersionRows}
          columns={[
            { title: '版本', render: (_, record) => `v${record.payload?.version || '--'}` },
            { title: '创建者', render: (_, record) => record.payload?.created_by || '--' },
            { title: '恢复自', render: (_, record) => record.payload?.restored_from ? `v${record.payload.restored_from}` : '--' },
            { title: '更新时间', dataIndex: 'updated_at', render: (value) => String(value || '').slice(0, 19).replace('T', ' ') },
            {
              title: '操作',
              render: (_, record) => (
                <Button size="small" onClick={() => handleRestoreConfigVersion(record)} loading={configVersionLoading}>
                  恢复为新版本
                </Button>
              ),
            },
          ]}
          expandable={{
            expandedRowRender: (record) => (
              <Text code>{JSON.stringify(record.payload?.payload || {}, null, 2)}</Text>
            ),
          }}
        />
      </Col>
    </Row>
    {configDiff ? (
      <Card size="small" title={`配置差异 v${configDiff.from_version} → v${configDiff.to_version}`} style={{ marginTop: 16 }}>
        <Table
          size="small"
          pagination={{ pageSize: 6 }}
          dataSource={configDiffRows}
          columns={[
            { title: '路径', dataIndex: 'path' },
            { title: '变更', dataIndex: 'change', render: (value) => <Tag color={value === 'added' ? 'green' : value === 'removed' ? 'red' : 'blue'}>{value}</Tag> },
            { title: 'Before', dataIndex: 'before', ellipsis: true, render: (value) => JSON.stringify(value) },
            { title: 'After', dataIndex: 'after', ellipsis: true, render: (value) => JSON.stringify(value) },
          ]}
        />
      </Card>
    ) : null}
  </Card>
);
