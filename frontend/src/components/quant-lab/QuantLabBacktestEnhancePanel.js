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
} from 'antd';

const FULL_WIDTH_STYLE = { width: '100%' };

const MONTE_CARLO_INITIAL_VALUES = {
  symbol: 'AAPL',
  strategy: 'buy_and_hold',
  simulations: 500,
  horizon_days: 63,
  initial_capital: 10000,
};

const SIGNIFICANCE_INITIAL_VALUES = {
  symbol: 'AAPL',
  strategies: 'buy_and_hold, moving_average',
  bootstrap_samples: 500,
  initial_capital: 10000,
};

const MULTI_PERIOD_INITIAL_VALUES = {
  symbol: 'AAPL',
  strategy: 'buy_and_hold',
  intervals: '1d,1wk,1mo',
  initial_capital: 10000,
};

const IMPACT_ANALYSIS_INITIAL_VALUES = {
  symbol: 'AAPL',
  strategy: 'buy_and_hold',
  market_impact_bps: 12,
  market_impact_model: 'almgren_chriss',
  impact_reference_notional: 100000,
  impact_coefficient: 1.2,
  permanent_impact_bps: 4,
  sample_trade_values: '10000,50000,100000,250000',
  initial_capital: 10000,
};

const IMPACT_MODEL_OPTIONS = [
  { value: 'constant', label: '常数冲击' },
  { value: 'linear', label: '线性' },
  { value: 'sqrt', label: '平方根' },
  { value: 'almgren_chriss', label: 'Almgren-Chriss' },
];

const QuantLabBacktestEnhancePanel = ({
  backtestEnhancementLoading,
  backtestEnhancementResult,
  formatMoney,
  formatPct,
  handleBacktestMonteCarlo,
  handleMarketImpactAnalysis,
  handleMultiPeriodBacktest,
  handleQueueBacktestMonteCarlo,
  handleQueueMarketImpactAnalysis,
  handleQueueMultiPeriodBacktest,
  handleQueueStrategySignificance,
  handleStrategySignificance,
  impactAnalysisForm,
  monteCarloForm,
  multiPeriodForm,
  queuedTaskLoading,
  significanceForm,
  strategies,
}) => {
  const strategyOptions = useMemo(
    () => (Array.isArray(strategies) ? strategies.map((item) => ({ value: item.name, label: item.name })) : []),
    [strategies],
  );

  const monteCarloFanRows = useMemo(
    () => (
      backtestEnhancementResult?.type === 'monte_carlo' && Array.isArray(backtestEnhancementResult.payload?.monte_carlo?.fan_chart)
        ? backtestEnhancementResult.payload.monte_carlo.fan_chart.map((item) => ({ ...item, key: item.step }))
        : []
    ),
    [backtestEnhancementResult],
  );

  const significanceRows = useMemo(
    () => (
      backtestEnhancementResult?.type === 'significance' && Array.isArray(backtestEnhancementResult.payload?.comparisons)
        ? backtestEnhancementResult.payload.comparisons.map((item) => ({
            key: `${item.baseline}-${item.challenger}`,
            baseline: item.baseline,
            challenger: item.challenger,
            p_value: item.significance?.bootstrap?.p_value,
            annualized_delta: item.significance?.observed_annualized_delta,
            sharpe_delta: item.significance?.observed_sharpe_delta,
            significant: item.significance?.bootstrap?.significant_95,
          }))
        : []
    ),
    [backtestEnhancementResult],
  );

  const multiPeriodRows = useMemo(
    () => (
      backtestEnhancementResult?.type === 'multi_period' && Array.isArray(backtestEnhancementResult.payload?.intervals)
        ? backtestEnhancementResult.payload.intervals.map((item) => ({ ...item, key: item.interval }))
        : []
    ),
    [backtestEnhancementResult],
  );

  const impactScenarioRows = useMemo(
    () => (
      backtestEnhancementResult?.type === 'impact_analysis' && Array.isArray(backtestEnhancementResult.payload?.scenarios)
        ? backtestEnhancementResult.payload.scenarios.map((item) => ({
            key: item.label,
            label: item.label,
            model: item.scenario?.market_impact_model,
            impact_bps: item.scenario?.market_impact_bps,
            total_return: item.metrics?.total_return,
            sharpe_ratio: item.metrics?.sharpe_ratio,
            max_drawdown: item.metrics?.max_drawdown,
            impact_cost: item.execution_costs?.estimated_market_impact_cost,
            return_delta: item.vs_baseline?.return_delta,
          }))
        : []
    ),
    [backtestEnhancementResult],
  );

  const impactCurveRows = useMemo(
    () => (
      backtestEnhancementResult?.type === 'impact_analysis' && Array.isArray(backtestEnhancementResult.payload?.scenarios)
        ? backtestEnhancementResult.payload.scenarios.flatMap((scenario) => (
            Array.isArray(scenario.impact_curve)
              ? scenario.impact_curve.map((point) => ({
                  key: `${scenario.label}-${point.trade_value}`,
                  label: scenario.label,
                  ...point,
                }))
              : []
          ))
        : []
    ),
    [backtestEnhancementResult],
  );

  return (
    <Space direction="vertical" size="large" style={FULL_WIDTH_STYLE}>
      <Row gutter={[16, 16]}>
        <Col xs={24} xl={6}>
          <Card title="Monte Carlo 模拟">
            <Form
              form={monteCarloForm}
              layout="vertical"
              initialValues={MONTE_CARLO_INITIAL_VALUES}
              onFinish={handleBacktestMonteCarlo}
            >
              <Form.Item name="symbol" label="标的" rules={[{ required: true, message: '请输入标的' }]}>
                <Input />
              </Form.Item>
              <Form.Item name="strategy" label="策略">
                <Select options={strategyOptions} />
              </Form.Item>
              <Row gutter={12}>
                <Col span={12}>
                  <Form.Item name="simulations" label="模拟次数">
                    <InputNumber min={50} max={10000} precision={0} style={FULL_WIDTH_STYLE} />
                  </Form.Item>
                </Col>
                <Col span={12}>
                  <Form.Item name="horizon_days" label="预测天数">
                    <InputNumber min={5} max={756} precision={0} style={FULL_WIDTH_STYLE} />
                  </Form.Item>
                </Col>
              </Row>
              <Space wrap>
                <Button type="primary" htmlType="submit" loading={backtestEnhancementLoading}>运行 MC</Button>
                <Button onClick={handleQueueBacktestMonteCarlo} loading={Boolean(queuedTaskLoading.backtest_monte_carlo)}>异步排队</Button>
              </Space>
            </Form>
          </Card>
        </Col>
        <Col xs={24} xl={6}>
          <Card title="策略显著性检验">
            <Form
              form={significanceForm}
              layout="vertical"
              initialValues={SIGNIFICANCE_INITIAL_VALUES}
              onFinish={handleStrategySignificance}
            >
              <Form.Item name="symbol" label="标的" rules={[{ required: true, message: '请输入标的' }]}>
                <Input />
              </Form.Item>
              <Form.Item name="strategies" label="策略列表">
                <Input placeholder="buy_and_hold, moving_average" />
              </Form.Item>
              <Form.Item name="bootstrap_samples" label="Bootstrap 次数">
                <InputNumber min={100} max={10000} precision={0} style={FULL_WIDTH_STYLE} />
              </Form.Item>
              <Space wrap>
                <Button type="primary" htmlType="submit" loading={backtestEnhancementLoading}>检验显著性</Button>
                <Button onClick={handleQueueStrategySignificance} loading={Boolean(queuedTaskLoading.backtest_significance)}>异步排队</Button>
              </Space>
            </Form>
          </Card>
        </Col>
        <Col xs={24} xl={6}>
          <Card title="多周期回测">
            <Form
              form={multiPeriodForm}
              layout="vertical"
              initialValues={MULTI_PERIOD_INITIAL_VALUES}
              onFinish={handleMultiPeriodBacktest}
            >
              <Form.Item name="symbol" label="标的" rules={[{ required: true, message: '请输入标的' }]}>
                <Input />
              </Form.Item>
              <Form.Item name="strategy" label="策略">
                <Select options={strategyOptions} />
              </Form.Item>
              <Form.Item name="intervals" label="周期列表">
                <Input placeholder="1d,1wk,1mo" />
              </Form.Item>
              <Space wrap>
                <Button type="primary" htmlType="submit" loading={backtestEnhancementLoading}>运行多周期</Button>
                <Button onClick={handleQueueMultiPeriodBacktest} loading={Boolean(queuedTaskLoading.backtest_multi_period)}>异步排队</Button>
              </Space>
            </Form>
          </Card>
        </Col>
        <Col xs={24} xl={6}>
          <Card title="市场冲击诊断">
            <Form
              form={impactAnalysisForm}
              layout="vertical"
              initialValues={IMPACT_ANALYSIS_INITIAL_VALUES}
              onFinish={handleMarketImpactAnalysis}
            >
              <Form.Item name="symbol" label="标的" rules={[{ required: true, message: '请输入标的' }]}>
                <Input />
              </Form.Item>
              <Form.Item name="strategy" label="策略">
                <Select options={strategyOptions} />
              </Form.Item>
              <Row gutter={12}>
                <Col span={12}>
                  <Form.Item name="market_impact_model" label="模型">
                    <Select options={IMPACT_MODEL_OPTIONS} />
                  </Form.Item>
                </Col>
                <Col span={12}>
                  <Form.Item name="market_impact_bps" label="基础冲击(bps)">
                    <InputNumber min={0} max={200} precision={2} style={FULL_WIDTH_STYLE} />
                  </Form.Item>
                </Col>
              </Row>
              <Row gutter={12}>
                <Col span={12}>
                  <Form.Item name="impact_reference_notional" label="流动性锚">
                    <InputNumber min={1000} step={1000} precision={0} style={FULL_WIDTH_STYLE} />
                  </Form.Item>
                </Col>
                <Col span={12}>
                  <Form.Item name="impact_coefficient" label="冲击系数">
                    <InputNumber min={0} step={0.1} precision={2} style={FULL_WIDTH_STYLE} />
                  </Form.Item>
                </Col>
              </Row>
              <Form.Item name="permanent_impact_bps" label="永久冲击(bps)">
                <InputNumber min={0} max={100} precision={2} style={FULL_WIDTH_STYLE} />
              </Form.Item>
              <Form.Item name="sample_trade_values" label="样本成交额">
                <Input placeholder="10000,50000,100000,250000" />
              </Form.Item>
              <Space wrap>
                <Button type="primary" htmlType="submit" loading={backtestEnhancementLoading}>分析冲击</Button>
                <Button onClick={handleQueueMarketImpactAnalysis} loading={Boolean(queuedTaskLoading.backtest_impact_analysis)}>异步排队</Button>
              </Space>
            </Form>
          </Card>
        </Col>
      </Row>

      {backtestEnhancementLoading ? <Spin size="large" /> : null}
      {!backtestEnhancementLoading && backtestEnhancementResult?.type === 'monte_carlo' ? (
        <Card title="Monte Carlo 结果">
          <Row gutter={[16, 16]}>
            <Col xs={24} md={6}><Statistic title="亏损概率" value={formatPct(backtestEnhancementResult.payload?.monte_carlo?.return_distribution?.probability_of_loss || 0)} /></Col>
            <Col xs={24} md={6}><Statistic title="收益 P05" value={formatPct(backtestEnhancementResult.payload?.monte_carlo?.return_distribution?.p05 || 0)} /></Col>
            <Col xs={24} md={6}><Statistic title="收益 P95" value={formatPct(backtestEnhancementResult.payload?.monte_carlo?.return_distribution?.p95 || 0)} /></Col>
            <Col xs={24} md={6}><Statistic title="终值 P50" value={formatMoney(backtestEnhancementResult.payload?.monte_carlo?.terminal_value?.p50 || 0)} /></Col>
          </Row>
          <Table
            style={{ marginTop: 16 }}
            size="small"
            pagination={{ pageSize: 8 }}
            dataSource={monteCarloFanRows}
            columns={[
              { title: 'Step', dataIndex: 'step' },
              { title: 'P10', dataIndex: 'p10', render: formatMoney },
              { title: 'P50', dataIndex: 'p50', render: formatMoney },
              { title: 'P90', dataIndex: 'p90', render: formatMoney },
            ]}
          />
        </Card>
      ) : null}
      {!backtestEnhancementLoading && backtestEnhancementResult?.type === 'significance' ? (
        <Card title="显著性检验结果">
          <Table
            size="small"
            pagination={false}
            dataSource={significanceRows}
            columns={[
              { title: '基准', dataIndex: 'baseline' },
              { title: '挑战者', dataIndex: 'challenger' },
              { title: '年化差值', dataIndex: 'annualized_delta', render: (value) => formatPct(value || 0) },
              { title: '夏普差值', dataIndex: 'sharpe_delta', render: (value) => Number(value || 0).toFixed(3) },
              { title: 'Bootstrap p', dataIndex: 'p_value', render: (value) => Number(value || 0).toFixed(4) },
              { title: '显著', dataIndex: 'significant', render: (value) => <Tag color={value ? 'green' : 'default'}>{value ? '是' : '否'}</Tag> },
            ]}
          />
        </Card>
      ) : null}
      {!backtestEnhancementLoading && backtestEnhancementResult?.type === 'multi_period' ? (
        <Card title="多周期结果">
          <Table
            size="small"
            pagination={false}
            dataSource={multiPeriodRows}
            columns={[
              { title: '周期', dataIndex: 'interval' },
              { title: '状态', dataIndex: 'success', render: (value) => <Tag color={value ? 'green' : 'red'}>{value ? '成功' : '失败'}</Tag> },
              { title: '样本数', dataIndex: 'data_points' },
              { title: '收益', render: (_, record) => formatPct(record.metrics?.total_return || 0) },
              { title: '夏普', render: (_, record) => Number(record.metrics?.sharpe_ratio || 0).toFixed(3) },
              { title: '回撤', render: (_, record) => formatPct(record.metrics?.max_drawdown || 0) },
            ]}
          />
        </Card>
      ) : null}
      {!backtestEnhancementLoading && backtestEnhancementResult?.type === 'impact_analysis' ? (
        <Space direction="vertical" size="large" style={FULL_WIDTH_STYLE}>
          <Card title="市场冲击场景对比">
            <Row gutter={[16, 16]}>
              <Col xs={24} md={8}>
                <Statistic title="场景数" value={backtestEnhancementResult.payload?.summary?.scenario_count || 0} />
              </Col>
              <Col xs={24} md={8}>
                <Statistic title="最佳模型" value={backtestEnhancementResult.payload?.summary?.best_by_sharpe?.label || '--'} />
              </Col>
              <Col xs={24} md={8}>
                <Statistic title="最佳夏普" value={Number(backtestEnhancementResult.payload?.summary?.best_by_sharpe?.metrics?.sharpe_ratio || 0).toFixed(3)} />
              </Col>
            </Row>
            <Table
              style={{ marginTop: 16 }}
              size="small"
              pagination={false}
              dataSource={impactScenarioRows}
              columns={[
                { title: '场景', dataIndex: 'label' },
                { title: '模型', dataIndex: 'model' },
                { title: '基础冲击', dataIndex: 'impact_bps', render: (value) => `${Number(value || 0).toFixed(2)} bps` },
                { title: '收益', dataIndex: 'total_return', render: (value) => formatPct(value || 0) },
                { title: '夏普', dataIndex: 'sharpe_ratio', render: (value) => Number(value || 0).toFixed(3) },
                { title: '回撤', dataIndex: 'max_drawdown', render: (value) => formatPct(value || 0) },
                { title: '冲击成本', dataIndex: 'impact_cost', render: (value) => formatMoney(value || 0) },
                { title: '相对基线收益', dataIndex: 'return_delta', render: (value) => formatPct(value || 0) },
              ]}
            />
          </Card>
          <Card title="成交规模冲击曲线">
            <Table
              size="small"
              pagination={{ pageSize: 12 }}
              dataSource={impactCurveRows}
              columns={[
                { title: '场景', dataIndex: 'label' },
                { title: '成交额', dataIndex: 'trade_value', render: formatMoney },
                { title: '估算股数', dataIndex: 'estimated_shares', render: (value) => Number(value || 0).toFixed(2) },
                { title: '参与率', dataIndex: 'participation_rate', render: (value) => formatPct(value || 0) },
                { title: '冲击(bps)', dataIndex: 'market_impact_bps', render: (value) => Number(value || 0).toFixed(2) },
                { title: '估算成本', dataIndex: 'estimated_cost', render: formatMoney },
              ]}
            />
          </Card>
        </Space>
      ) : null}
    </Space>
  );
};

export default QuantLabBacktestEnhancePanel;
