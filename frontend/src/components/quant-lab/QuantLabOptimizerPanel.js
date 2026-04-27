import React, { useMemo } from 'react';
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
  Typography,
} from 'antd';

const { Text } = Typography;

const FULL_WIDTH_STYLE = { width: '100%' };

const OPTIMIZER_INITIAL_VALUES = {
  symbol: 'AAPL',
  strategy: 'moving_average',
  density: 3,
  optimization_metric: 'sharpe_ratio',
  optimization_method: 'grid',
  initial_capital: 10000,
  commission: 0.001,
  slippage: 0.001,
};

const OPTIMIZATION_METHOD_OPTIONS = [
  { value: 'grid', label: '网格搜索' },
  { value: 'bayesian', label: '贝叶斯搜索' },
];

const OPTIMIZATION_METRIC_OPTIONS = [
  { value: 'sharpe_ratio', label: '夏普' },
  { value: 'total_return', label: '总收益' },
  { value: 'calmar_ratio', label: '卡玛' },
];

const QuantLabOptimizerPanel = ({
  HeatmapGridComponent,
  formatPct,
  handleOptimize,
  handleQueueOptimizer,
  optimizerForm,
  optimizerLoading,
  optimizerQueueLoading,
  optimizerResult,
  strategies,
}) => {
  const optimizerStrategyOptions = useMemo(
    () => (
      Array.isArray(strategies)
        ? strategies.map((item) => ({
            value: item.name,
            label: item.name,
            description: item.description,
          }))
        : []
    ),
    [strategies],
  );

  const optimizerLeaderboard = useMemo(
    () => (
      Array.isArray(optimizerResult?.leaderboard)
        ? optimizerResult.leaderboard.map((item, index) => ({
            key: `${index}-${JSON.stringify(item.parameters)}`,
            rank: index + 1,
            score: item.score,
            parameters: JSON.stringify(item.parameters),
            total_return: item.metrics?.total_return,
            sharpe_ratio: item.metrics?.sharpe_ratio,
            max_drawdown: item.metrics?.max_drawdown,
          }))
        : []
    ),
    [optimizerResult],
  );

  return (
    <Space direction="vertical" size="large" style={FULL_WIDTH_STYLE}>
      <Card className="quantlab-optimizer-card">
        <Form
          form={optimizerForm}
          layout="vertical"
          initialValues={OPTIMIZER_INITIAL_VALUES}
          onFinish={handleOptimize}
        >
          <Row gutter={16}>
            <Col xs={24} md={12} lg={5}>
              <Form.Item name="symbol" label="标的代码" rules={[{ required: true, message: '请输入标的代码' }]}>
                <Input />
              </Form.Item>
            </Col>
            <Col xs={24} md={12} lg={5}>
              <Form.Item name="strategy" label="策略" rules={[{ required: true, message: '请选择策略' }]}>
                <Select
                  style={FULL_WIDTH_STYLE}
                  options={optimizerStrategyOptions}
                  optionRender={({ data }) => (
                    <div className="quantlab-strategy-option">
                      <span className="quantlab-strategy-option__name">{data.label}</span>
                      {data.description ? (
                        <span className="quantlab-strategy-option__description">{data.description}</span>
                      ) : null}
                    </div>
                  )}
                />
              </Form.Item>
            </Col>
            <Col xs={12} md={6} lg={4}>
              <Form.Item name="density" label="网格密度">
                <InputNumber min={2} max={6} precision={0} style={FULL_WIDTH_STYLE} />
              </Form.Item>
            </Col>
            <Col xs={12} md={6} lg={5}>
              <Form.Item name="optimization_method" label="优化方式">
                <Select style={FULL_WIDTH_STYLE} options={OPTIMIZATION_METHOD_OPTIONS} />
              </Form.Item>
            </Col>
            <Col xs={12} md={6} lg={5}>
              <Form.Item name="optimization_metric" label="优化目标">
                <Select style={FULL_WIDTH_STYLE} options={OPTIMIZATION_METRIC_OPTIONS} />
              </Form.Item>
            </Col>
            <Col xs={12} md={8} lg={4}>
              <Form.Item name="initial_capital" label="初始资金">
                <InputNumber min={1000} step={1000} precision={0} style={FULL_WIDTH_STYLE} />
              </Form.Item>
            </Col>
            <Col xs={12} md={8} lg={4}>
              <Form.Item name="commission" label="手续费">
                <InputNumber min={0} step={0.0005} precision={4} style={FULL_WIDTH_STYLE} />
              </Form.Item>
            </Col>
            <Col xs={12} md={8} lg={4}>
              <Form.Item name="slippage" label="滑点">
                <InputNumber min={0} step={0.0005} precision={4} style={FULL_WIDTH_STYLE} />
              </Form.Item>
            </Col>
          </Row>
          <Space wrap>
            <Button type="primary" htmlType="submit" loading={optimizerLoading}>运行优化</Button>
            <Button onClick={handleQueueOptimizer} loading={optimizerQueueLoading}>异步排队</Button>
          </Space>
        </Form>
      </Card>

      {optimizerLoading ? <Spin size="large" /> : null}
      {!optimizerLoading && optimizerResult ? (
        <>
          <Row gutter={[16, 16]}>
            <Col xs={24} md={8}><Card><Statistic title="最佳训练夏普" value={Number(optimizerResult.best_train_metrics?.sharpe_ratio || 0).toFixed(3)} /></Card></Col>
            <Col xs={24} md={8}><Card><Statistic title="样本外收益" value={formatPct(optimizerResult.validation_metrics?.total_return || 0)} /></Card></Col>
            <Col xs={24} md={8}><Card><Statistic title="参数稳定度" value={Number(optimizerResult.parameter_stability?.score || 0).toFixed(3)} /></Card></Col>
          </Row>
          <Card title="最优参数与验证闭环">
            <Space direction="vertical" style={FULL_WIDTH_STYLE}>
              <Alert
                type="success"
                showIcon
                message={`最佳参数: ${JSON.stringify(optimizerResult.best_parameters || {})}`}
                description={`已生成验证回测请求，可直接回放到主回测模块。全样本收益 ${formatPct(optimizerResult.full_sample_metrics?.total_return || 0)}，全样本夏普 ${Number(optimizerResult.full_sample_metrics?.sharpe_ratio || 0).toFixed(3)}。`}
              />
              <Text code>{JSON.stringify(optimizerResult.validation_backtest_request || {})}</Text>
            </Space>
          </Card>
          <Card title="参数敏感度热力图">
            <HeatmapGridComponent heatmap={optimizerResult.heatmap} />
          </Card>
          <Card title="候选参数排行榜">
            <Table
              size="small"
              pagination={{ pageSize: 8 }}
              dataSource={optimizerLeaderboard}
              columns={[
                { title: '#', dataIndex: 'rank', width: 64 },
                { title: 'Score', dataIndex: 'score', render: (value) => Number(value || 0).toFixed(3) },
                { title: '参数', dataIndex: 'parameters', ellipsis: true },
                { title: '收益', dataIndex: 'total_return', render: (value) => formatPct(value || 0) },
                { title: '夏普', dataIndex: 'sharpe_ratio', render: (value) => Number(value || 0).toFixed(3) },
                { title: '回撤', dataIndex: 'max_drawdown', render: (value) => formatPct(value || 0) },
              ]}
            />
          </Card>
          {optimizerResult.walk_forward?.aggregate_metrics ? (
            <Card title="Walk-Forward 稳健性">
              <Row gutter={[16, 16]}>
                <Col xs={24} md={6}><Statistic title="窗口数" value={optimizerResult.walk_forward.n_windows || 0} /></Col>
                <Col xs={24} md={6}><Statistic title="平均收益" value={formatPct(optimizerResult.walk_forward.aggregate_metrics.average_return || 0)} /></Col>
                <Col xs={24} md={6}><Statistic title="平均夏普" value={Number(optimizerResult.walk_forward.aggregate_metrics.average_sharpe || 0).toFixed(3)} /></Col>
                <Col xs={24} md={6}><Statistic title="Monte Carlo P50" value={Number(optimizerResult.walk_forward.monte_carlo?.p50 || 0).toFixed(3)} /></Col>
              </Row>
            </Card>
          ) : null}
        </>
      ) : null}
    </Space>
  );
};

export default QuantLabOptimizerPanel;
