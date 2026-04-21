import React from 'react';
import {
  Alert,
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
} from 'antd';

const FULL_WIDTH_STYLE = { width: '100%' };

const INDUSTRY_ROTATION_INITIAL_VALUES = {
  start_date: '2024-01-01',
  end_date: '2025-12-31',
  rebalance_freq: 'monthly',
  top_industries: 3,
  stocks_per_industry: 3,
  weight_method: 'equal',
  initial_capital: 1000000,
  commission: 0.001,
  slippage: 0.001,
};

const REBALANCE_FREQ_OPTIONS = [
  { value: 'weekly', label: '每周' },
  { value: 'biweekly', label: '双周' },
  { value: 'monthly', label: '每月' },
  { value: 'quarterly', label: '季度' },
];

const WEIGHT_METHOD_OPTIONS = [
  { value: 'equal', label: '等权' },
  { value: 'market_cap', label: '市值权重' },
];

const QuantLabIndustryRotationPanel = ({
  describeExecution,
  executionAlertType,
  formatMoney,
  formatPct,
  handleIndustryRotation,
  handleQueueIndustryRotation,
  industryRotationQueueLoading,
  rotationForm,
  rotationLoading,
  rotationResult,
}) => (
  <Space direction="vertical" size="large" style={FULL_WIDTH_STYLE}>
    <Card>
      <Form
        form={rotationForm}
        layout="vertical"
        initialValues={INDUSTRY_ROTATION_INITIAL_VALUES}
        onFinish={handleIndustryRotation}
      >
        <Row gutter={16}>
          <Col xs={24} md={6}>
            <Form.Item name="start_date" label="开始日期" rules={[{ required: true, message: '请输入开始日期' }]}>
              <Input placeholder="YYYY-MM-DD" />
            </Form.Item>
          </Col>
          <Col xs={24} md={6}>
            <Form.Item name="end_date" label="结束日期" rules={[{ required: true, message: '请输入结束日期' }]}>
              <Input placeholder="YYYY-MM-DD" />
            </Form.Item>
          </Col>
          <Col xs={12} md={4}>
            <Form.Item name="rebalance_freq" label="调仓频率">
              <Select options={REBALANCE_FREQ_OPTIONS} />
            </Form.Item>
          </Col>
          <Col xs={12} md={4}>
            <Form.Item name="top_industries" label="热门行业数">
              <InputNumber min={1} max={6} precision={0} style={FULL_WIDTH_STYLE} />
            </Form.Item>
          </Col>
          <Col xs={12} md={4}>
            <Form.Item name="stocks_per_industry" label="每行业股票数">
              <InputNumber min={1} max={6} precision={0} style={FULL_WIDTH_STYLE} />
            </Form.Item>
          </Col>
          <Col xs={12} md={4}>
            <Form.Item name="weight_method" label="权重方式">
              <Select options={WEIGHT_METHOD_OPTIONS} />
            </Form.Item>
          </Col>
        </Row>
        <Space wrap>
          <Button type="primary" htmlType="submit" loading={rotationLoading}>运行行业轮动回测</Button>
          <Button onClick={handleQueueIndustryRotation} loading={industryRotationQueueLoading}>异步排队</Button>
        </Space>
      </Form>
    </Card>
    {rotationLoading ? <Spin size="large" /> : null}
    {!rotationLoading && rotationResult ? (
      <>
        {rotationResult.execution ? (
          <Alert
            showIcon
            type={executionAlertType(rotationResult.execution)}
            message={rotationResult.execution.degraded ? '当前为快路径/降级回测结果' : '当前为同步回测结果'}
            description={describeExecution(rotationResult.execution, '同步入口优先返回可快速交互的轮动结果；需要完整链路时可继续走异步排队。')}
          />
        ) : null}
        <Row gutter={[16, 16]}>
          <Col xs={24} md={6}><Card><Statistic title="总收益" value={formatPct(rotationResult.summary?.total_return || 0)} /></Card></Col>
          <Col xs={24} md={6}><Card><Statistic title="超额收益" value={formatPct(rotationResult.summary?.excess_return || 0)} /></Card></Col>
          <Col xs={24} md={6}><Card><Statistic title="夏普" value={Number(rotationResult.summary?.sharpe_ratio || 0).toFixed(3)} /></Card></Col>
          <Col xs={24} md={6}><Card><Statistic title="最大回撤" value={formatPct(rotationResult.summary?.max_drawdown || 0)} /></Card></Col>
        </Row>
        <Card title="策略诊断">
          <Alert
            type="info"
            showIcon
            message={`基准 ${formatPct(rotationResult.summary?.benchmark_return || 0)}，胜率 ${formatPct(rotationResult.summary?.win_rate || 0)}`}
            description={`交易次数 ${rotationResult.summary?.trade_count || 0}，Sortino ${Number(rotationResult.summary?.sortino_ratio || 0).toFixed(3)}，Calmar ${Number(rotationResult.summary?.calmar_ratio || 0).toFixed(3)}，VaR95 ${formatPct(rotationResult.summary?.var_95 || 0)}。`}
          />
          <Table
            style={{ marginTop: 16 }}
            size="small"
            pagination={false}
            rowKey={(record) => record.date}
            dataSource={(rotationResult.equity_curve || []).slice(-12)}
            columns={[
              { title: '日期', dataIndex: 'date' },
              { title: '净值', dataIndex: 'value', render: (value) => formatMoney(value || 0) },
            ]}
          />
        </Card>
        <Card title="回测执行与代理诊断">
          <Table
            size="small"
            pagination={false}
            rowKey="label"
            dataSource={[
              { label: '行业选择来源', value: rotationResult.diagnostics?.industry_selection_source || '--' },
              { label: '龙头选择来源', value: rotationResult.diagnostics?.leader_selection_source || '--' },
              { label: 'Proxy 覆盖率', value: `${Math.round(Number(rotationResult.diagnostics?.proxy_coverage_ratio || 0) * 100)}%` },
              { label: 'Benchmark', value: rotationResult.diagnostics?.benchmark_symbol || '--' },
            ]}
            columns={[
              { title: '诊断项', dataIndex: 'label' },
              { title: '值', dataIndex: 'value' },
            ]}
          />
        </Card>
      </>
    ) : null}
  </Space>
);

export default QuantLabIndustryRotationPanel;
