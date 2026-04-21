import React, { useMemo } from 'react';
import {
  Button,
  Card,
  Col,
  Empty,
  Form,
  Input,
  Row,
  Select,
  Space,
  Spin,
  Statistic,
  Table,
  Tag,
} from 'antd';

const FULL_WIDTH_STYLE = { width: '100%' };

const RISK_INITIAL_VALUES = {
  symbols: 'AAPL, MSFT, NVDA',
  weights: '0.4, 0.35, 0.25',
  period: '1y',
};

const QuantLabRiskPanel = ({
  HeatmapGridComponent,
  formatPct,
  handleQueueRiskAnalysis,
  handleRiskAnalysis,
  periodOptions,
  queueLoading,
  riskForm,
  riskLoading,
  riskResult,
}) => {
  const factorRows = useMemo(
    () => (
      Array.isArray(riskResult?.factor_decomposition?.risk_split)
        ? riskResult.factor_decomposition.risk_split.map((item) => ({ ...item, key: item.factor }))
        : []
    ),
    [riskResult],
  );

  const stressRows = useMemo(
    () => (
      Array.isArray(riskResult?.stress_tests)
        ? riskResult.stress_tests.map((item) => ({ ...item, key: item.scenario }))
        : []
    ),
    [riskResult],
  );

  const attributionRows = useMemo(
    () => (
      Array.isArray(riskResult?.performance_attribution?.rows)
        ? riskResult.performance_attribution.rows.map((item) => ({ ...item, key: item.symbol }))
        : []
    ),
    [riskResult],
  );

  const correlationCells = useMemo(
    () => (Array.isArray(riskResult?.correlation_matrix?.cells) ? riskResult.correlation_matrix.cells : []),
    [riskResult],
  );

  return (
    <Space direction="vertical" size="large" style={FULL_WIDTH_STYLE}>
      <Card>
        <Form
          form={riskForm}
          layout="vertical"
          initialValues={RISK_INITIAL_VALUES}
          onFinish={handleRiskAnalysis}
        >
          <Row gutter={16}>
            <Col xs={24} md={10}>
              <Form.Item name="symbols" label="组合标的" rules={[{ required: true, message: '请输入标的列表' }]}>
                <Input placeholder="逗号分隔，如 AAPL, MSFT, NVDA" />
              </Form.Item>
            </Col>
            <Col xs={24} md={8}>
              <Form.Item name="weights" label="组合权重">
                <Input placeholder="可选，逗号分隔，如 0.4, 0.3, 0.3" />
              </Form.Item>
            </Col>
            <Col xs={24} md={4}>
              <Form.Item name="period" label="历史区间">
                <Select options={periodOptions} />
              </Form.Item>
            </Col>
          </Row>
          <Space wrap>
            <Button type="primary" htmlType="submit" loading={riskLoading}>运行风险分析</Button>
            <Button onClick={handleQueueRiskAnalysis} loading={queueLoading}>异步排队</Button>
          </Space>
        </Form>
      </Card>

      {riskLoading ? <Spin size="large" /> : null}
      {!riskLoading && riskResult ? (
        <>
          <Row gutter={[16, 16]}>
            <Col xs={24} md={6}><Card><Statistic title="年化收益" value={formatPct(riskResult.summary?.annualized_return || 0)} /></Card></Col>
            <Col xs={24} md={6}><Card><Statistic title="年化波动" value={formatPct(riskResult.summary?.volatility || 0)} /></Card></Col>
            <Col xs={24} md={6}><Card><Statistic title="夏普比率" value={Number(riskResult.summary?.sharpe_ratio || 0).toFixed(3)} /></Card></Col>
            <Col xs={24} md={6}><Card><Statistic title="最大回撤" value={formatPct(riskResult.summary?.max_drawdown || 0)} /></Card></Col>
          </Row>
          <Card title="VaR / CVaR">
            <Table
              size="small"
              pagination={false}
              rowKey="method"
              dataSource={[
                { method: '历史模拟', ...riskResult.var_cvar?.historical },
                { method: '参数法', ...riskResult.var_cvar?.parametric },
                { method: 'Monte Carlo', ...riskResult.var_cvar?.monte_carlo },
              ]}
              columns={[
                { title: '方法', dataIndex: 'method' },
                { title: '95% VaR', render: (_, record) => formatPct(record.confidence_95?.var || 0) },
                { title: '95% CVaR', render: (_, record) => formatPct(record.confidence_95?.cvar || 0) },
                { title: '99% VaR', render: (_, record) => formatPct(record.confidence_99?.var || 0) },
                { title: '99% CVaR', render: (_, record) => formatPct(record.confidence_99?.cvar || 0) },
              ]}
            />
          </Card>
          <Row gutter={[16, 16]}>
            <Col xs={24} xl={12}>
              <Card title="因子风险分解">
                <Table
                  size="small"
                  pagination={false}
                  dataSource={factorRows}
                  columns={[
                    { title: '因子', dataIndex: 'factor' },
                    { title: '暴露', dataIndex: 'loading', render: (value) => Number(value || 0).toFixed(3) },
                    { title: '年化贡献', dataIndex: 'annual_contribution', render: (value) => formatPct(value || 0) },
                    { title: '风险占比', dataIndex: 'risk_share', render: (value) => formatPct(value || 0) },
                  ]}
                />
              </Card>
            </Col>
            <Col xs={24} xl={12}>
              <Card title="压力测试">
                <Table
                  size="small"
                  pagination={false}
                  dataSource={stressRows}
                  columns={[
                    { title: '情景', dataIndex: 'label' },
                    { title: '投影收益', dataIndex: 'projected_return', render: (value) => formatPct(value || 0) },
                    { title: '投影 VaR95', dataIndex: 'projected_var_95', render: (value) => formatPct(value || 0) },
                    { title: '级别', dataIndex: 'severity', render: (value) => <Tag color={value === 'high' ? 'red' : value === 'medium' ? 'orange' : 'green'}>{value}</Tag> },
                  ]}
                />
              </Card>
            </Col>
          </Row>
          <Card title="收益归因">
            <Table
              size="small"
              pagination={{ pageSize: 6 }}
              dataSource={attributionRows}
              columns={[
                { title: '标的', dataIndex: 'symbol' },
                { title: '组合权重', dataIndex: 'portfolio_weight', render: (value) => formatPct(value || 0) },
                { title: '基准权重', dataIndex: 'benchmark_weight', render: (value) => formatPct(value || 0) },
                { title: '区间收益', dataIndex: 'asset_return', render: (value) => formatPct(value || 0) },
                { title: '配置效应', dataIndex: 'allocation_effect', render: (value) => formatPct(value || 0) },
              ]}
            />
          </Card>
          <Card title="相关性矩阵">
            {correlationCells.length ? (
              <HeatmapGridComponent
                heatmap={{
                  type: 'matrix',
                  x_key: 'asset',
                  y_key: 'asset',
                  cells: correlationCells.map((item) => ({ x: item.symbol1, y: item.symbol2, value: item.correlation })),
                }}
              />
            ) : (
              <Empty description="暂无相关性矩阵" />
            )}
          </Card>
        </>
      ) : null}
    </Space>
  );
};

export default QuantLabRiskPanel;
