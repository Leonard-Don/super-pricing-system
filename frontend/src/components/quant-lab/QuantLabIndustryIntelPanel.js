import React, { useMemo } from 'react';
import {
  Alert,
  Button,
  Card,
  Col,
  Form,
  InputNumber,
  Row,
  Space,
  Spin,
  Statistic,
  Table,
  Tag,
} from 'antd';

const FULL_WIDTH_STYLE = { width: '100%' };

const INDUSTRY_INTEL_INITIAL_VALUES = {
  top_n: 12,
  network_top_n: 18,
  lookback_days: 5,
  min_similarity: 0.92,
};

const QuantLabIndustryIntelPanel = ({
  describeExecution,
  executionAlertType,
  formatPct,
  handleIndustryIntelligence,
  industryIntelForm,
  industryIntelLoading,
  industryIntelResult,
  industryNetworkResult,
}) => {
  const execution = industryIntelResult?.execution || industryNetworkResult?.execution;

  const industryIntelRows = useMemo(
    () => (
      Array.isArray(industryIntelResult?.industries)
        ? industryIntelResult.industries.map((item) => ({ ...item, key: item.industry_name }))
        : []
    ),
    [industryIntelResult],
  );

  const industryNetworkEdges = useMemo(
    () => (
      Array.isArray(industryNetworkResult?.edges)
        ? industryNetworkResult.edges.map((item, index) => ({ ...item, key: `${item.source}-${item.target}-${index}` }))
        : []
    ),
    [industryNetworkResult],
  );

  return (
    <Space direction="vertical" size="large" style={FULL_WIDTH_STYLE}>
      <Card>
        <Form
          form={industryIntelForm}
          layout="vertical"
          initialValues={INDUSTRY_INTEL_INITIAL_VALUES}
          onFinish={handleIndustryIntelligence}
        >
          <Row gutter={16}>
            <Col xs={12} md={4}>
              <Form.Item name="top_n" label="行业数">
                <InputNumber min={1} max={30} precision={0} style={FULL_WIDTH_STYLE} />
              </Form.Item>
            </Col>
            <Col xs={12} md={4}>
              <Form.Item name="network_top_n" label="网络节点">
                <InputNumber min={4} max={50} precision={0} style={FULL_WIDTH_STYLE} />
              </Form.Item>
            </Col>
            <Col xs={12} md={4}>
              <Form.Item name="lookback_days" label="回看天数">
                <InputNumber min={1} max={30} precision={0} style={FULL_WIDTH_STYLE} />
              </Form.Item>
            </Col>
            <Col xs={12} md={4}>
              <Form.Item name="min_similarity" label="网络相似度">
                <InputNumber min={0} max={1} step={0.01} precision={2} style={FULL_WIDTH_STYLE} />
              </Form.Item>
            </Col>
          </Row>
          <Button type="primary" htmlType="submit" loading={industryIntelLoading}>刷新行业智能</Button>
        </Form>
      </Card>
      {industryIntelLoading ? <Spin size="large" /> : null}
      {!industryIntelLoading && execution ? (
        <Alert
          showIcon
          type={executionAlertType(execution)}
          message={execution.degraded ? '行业智能当前使用快照/降级结果' : '行业智能已刷新'}
          description={describeExecution(
            execution,
            '同步刷新优先使用可快速返回的行业快照；后台实时热度链路异常时会自动回退。',
          )}
        />
      ) : null}
      {!industryIntelLoading && industryIntelRows.length ? (
        <Card title="生命周期、ETF 映射与事件日历">
          <Table
            size="small"
            pagination={{ pageSize: 8 }}
            dataSource={industryIntelRows}
            columns={[
              { title: '行业', dataIndex: 'industry_name' },
              { title: '阶段', render: (_, record) => <Tag color={record.lifecycle?.stage === '成长期' ? 'green' : record.lifecycle?.stage === '衰退期' ? 'red' : 'blue'}>{record.lifecycle?.stage || '--'}</Tag> },
              { title: '置信度', render: (_, record) => formatPct(record.lifecycle?.confidence || 0) },
              { title: 'ETF', render: (_, record) => (record.etf_mapping || []).slice(0, 3).map((item) => <Tag key={`${record.industry_name}-${item.symbol}`}>{item.symbol}</Tag>) },
              {
                title: '下一事件',
                render: (_, record) => {
                  const event = (record.event_calendar || [])[0];
                  return event ? `${event.date} · ${event.title}` : '--';
                },
              },
            ]}
          />
        </Card>
      ) : null}
      {!industryIntelLoading && industryNetworkResult ? (
        <Row gutter={[16, 16]}>
          <Col xs={24} md={8}><Card><Statistic title="网络节点" value={(industryNetworkResult.nodes || []).length} /></Card></Col>
          <Col xs={24} md={8}><Card><Statistic title="联动边" value={(industryNetworkResult.edges || []).length} /></Card></Col>
          <Col xs={24} md={8}><Card><Statistic title="相似度阈值" value={Number(industryNetworkResult.metadata?.min_similarity || 0).toFixed(2)} /></Card></Col>
        </Row>
      ) : null}
      {!industryIntelLoading && industryNetworkEdges.length ? (
        <Card title="行业联动网络边">
          <Table
            size="small"
            pagination={{ pageSize: 10 }}
            dataSource={industryNetworkEdges}
            columns={[
              { title: 'Source', dataIndex: 'source' },
              { title: 'Target', dataIndex: 'target' },
              { title: '关系', dataIndex: 'relationship' },
              { title: '权重', dataIndex: 'weight', render: (value) => Number(value || 0).toFixed(4) },
            ]}
          />
        </Card>
      ) : null}
    </Space>
  );
};

export default QuantLabIndustryIntelPanel;
