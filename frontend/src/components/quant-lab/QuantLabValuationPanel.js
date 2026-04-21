import React, { useMemo } from 'react';
import {
  Button,
  Card,
  Col,
  Form,
  Input,
  InputNumber,
  Row,
  Select,
  Space,
  Spin,
  Statistic,
  Table,
  Tag,
  Typography,
} from 'antd';

const { Text } = Typography;

const FULL_WIDTH_STYLE = { width: '100%' };

const VALUATION_INITIAL_VALUES = {
  symbol: 'AAPL',
  period: '1y',
  peer_limit: 6,
  peer_symbols: 'MSFT, NVDA, GOOGL, AMZN',
};

const QuantLabValuationPanel = ({
  formatMoney,
  formatPct,
  formatSignedPct,
  handleQueueValuation,
  handleValuationAnalysis,
  periodOptions,
  queueLoading,
  valuationForm,
  valuationLoading,
  valuationResult,
}) => {
  const valuationPeerRows = useMemo(
    () => (
      Array.isArray(valuationResult?.peer_matrix?.rows)
        ? valuationResult.peer_matrix.rows.map((item) => ({ ...item, key: item.symbol }))
        : []
    ),
    [valuationResult],
  );

  return (
    <Space direction="vertical" size="large" style={FULL_WIDTH_STYLE}>
      <Card>
        <Form
          form={valuationForm}
          layout="vertical"
          initialValues={VALUATION_INITIAL_VALUES}
          onFinish={handleValuationAnalysis}
        >
          <Row gutter={16}>
            <Col xs={24} md={8}>
              <Form.Item name="symbol" label="股票代码" rules={[{ required: true, message: '请输入股票代码' }]}>
                <Input />
              </Form.Item>
            </Col>
            <Col xs={24} md={6}>
              <Form.Item name="period" label="因子周期">
                <Select options={periodOptions} />
              </Form.Item>
            </Col>
            <Col xs={24} md={4}>
              <Form.Item name="peer_limit" label="同行数量">
                <InputNumber min={2} max={12} precision={0} style={FULL_WIDTH_STYLE} />
              </Form.Item>
            </Col>
            <Col xs={24} md={6}>
              <Form.Item name="peer_symbols" label="自定义 Peer 组">
                <Input placeholder="可选，如 MSFT, NVDA, GOOGL" />
              </Form.Item>
            </Col>
          </Row>
          <Space wrap>
            <Button type="primary" htmlType="submit" loading={valuationLoading}>运行估值实验</Button>
            <Button onClick={handleQueueValuation} loading={queueLoading}>异步排队</Button>
          </Space>
        </Form>
      </Card>
      {valuationLoading ? <Spin size="large" /> : null}
      {!valuationLoading && valuationResult ? (
        <>
          <Row gutter={[16, 16]}>
            <Col xs={24} md={8}><Card><Statistic title="综合公允价值" value={formatMoney(valuationResult.ensemble_valuation?.fair_value || 0)} /></Card></Col>
            <Col xs={24} md={8}><Card><Statistic title="市场偏离" value={formatSignedPct(valuationResult.ensemble_valuation?.gap_pct || 0)} /></Card></Col>
            <Col xs={24} md={8}><Card><Statistic title="现价" value={formatMoney(valuationResult.analysis?.valuation?.current_price || 0)} /></Card></Col>
          </Row>
          <Card title="模型集成权重">
            <Table
              size="small"
              pagination={false}
              rowKey="model"
              dataSource={valuationResult.ensemble_valuation?.models || []}
              columns={[
                { title: '模型', dataIndex: 'model' },
                { title: '估值', dataIndex: 'value', render: (value) => formatMoney(value || 0) },
                { title: '权重', dataIndex: 'weight', render: (value) => formatPct(value || 0) },
              ]}
            />
          </Card>
          <Card title="估值历史追踪">
            <Table
              size="small"
              pagination={{ pageSize: 6 }}
              rowKey="timestamp"
              dataSource={valuationResult.valuation_history || []}
              columns={[
                { title: '时间', dataIndex: 'timestamp', render: (value) => String(value || '').slice(0, 19).replace('T', ' ') },
                { title: '综合公允价值', dataIndex: 'fair_value', render: (value) => formatMoney(value || 0) },
                { title: '现价', dataIndex: 'market_price', render: (value) => formatMoney(value || 0) },
                { title: '偏离', dataIndex: 'gap_pct', render: (value) => formatSignedPct(value || 0) },
              ]}
            />
          </Card>
          {valuationPeerRows.length ? (
            <Card title="同行对比矩阵">
              <Space wrap size={8} style={{ marginBottom: 12 }}>
                {valuationResult.peer_matrix?.sector ? <Tag color="blue">{valuationResult.peer_matrix.sector}</Tag> : null}
                {valuationResult.peer_matrix?.industry ? <Tag>{valuationResult.peer_matrix.industry}</Tag> : null}
                <Tag>{`同行 ${valuationResult.peer_matrix?.summary?.peer_count || 0} 家`}</Tag>
                <Tag>{`自定义 Peer ${valuationResult.peer_matrix?.summary?.custom_peer_count || 0} 家`}</Tag>
                {valuationResult.peer_matrix?.summary?.median_peer_premium_discount !== null && valuationResult.peer_matrix?.summary?.median_peer_premium_discount !== undefined ? (
                  <Tag>{`同行溢折价中位数 ${Number(valuationResult.peer_matrix.summary.median_peer_premium_discount).toFixed(1)}%`}</Tag>
                ) : null}
              </Space>
              <Table
                size="small"
                pagination={{ pageSize: 8 }}
                dataSource={valuationPeerRows}
                columns={[
                  {
                    title: '标的',
                    dataIndex: 'symbol',
                    render: (value, record) => (
                      <Space size={6}>
                        <Text strong>{value}</Text>
                        {record.is_target ? <Tag color="blue">当前</Tag> : null}
                        {!record.is_target ? <Tag color={record.peer_source === 'custom' ? 'gold' : 'default'}>{record.peer_source === 'custom' ? '自定义' : '自动'}</Tag> : null}
                      </Space>
                    ),
                  },
                  { title: '现价 / 公允', render: (_, record) => `${formatMoney(record.current_price || 0)} / ${formatMoney(record.fair_value || 0)}` },
                  { title: '溢折价', dataIndex: 'premium_discount', render: (value) => value === null || value === undefined ? '--' : <Tag color={value > 0 ? 'red' : 'green'}>{`${value > 0 ? '+' : ''}${Number(value).toFixed(1)}%`}</Tag> },
                  { title: 'P/E', dataIndex: 'pe_ratio', render: (value) => value ? Number(value).toFixed(1) : '--' },
                  { title: 'P/S', dataIndex: 'price_to_sales', render: (value) => value ? Number(value).toFixed(1) : '--' },
                  { title: '收入增速', dataIndex: 'revenue_growth', render: (value) => value === null || value === undefined ? '--' : formatPct(value) },
                  { title: '盈利增速', dataIndex: 'earnings_growth', render: (value) => value === null || value === undefined ? '--' : formatPct(value) },
                  { title: 'ROE', dataIndex: 'return_on_equity', render: (value) => value === null || value === undefined ? '--' : formatPct(value) },
                  { title: '利润率', dataIndex: 'profit_margin', render: (value) => value === null || value === undefined ? '--' : formatPct(value) },
                  { title: '价值分', dataIndex: 'value_score', render: (value) => value === null || value === undefined ? '--' : Number(value).toFixed(3) },
                  { title: '成长分', dataIndex: 'growth_score', render: (value) => value === null || value === undefined ? '--' : Number(value).toFixed(3) },
                  { title: '质量分', dataIndex: 'quality_score', render: (value) => value === null || value === undefined ? '--' : Number(value).toFixed(3) },
                ]}
              />
            </Card>
          ) : null}
        </>
      ) : null}
    </Space>
  );
};

export default QuantLabValuationPanel;
