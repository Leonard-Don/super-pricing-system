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
  Tag,
  Typography,
} from 'antd';

const { Text } = Typography;

const FULL_WIDTH_STYLE = { width: '100%' };

const SIGNAL_VALIDATION_INITIAL_VALUES = {
  benchmark: 'SPY',
  period: '2y',
  horizons: '5,20,60',
  macro_limit: 250,
  timeframe: '90d',
  alt_limit: 300,
  half_life_days: 14,
};

const MARKET_PROBE_INITIAL_VALUES = {
  symbol: 'AAPL',
  replay_period: '5d',
  replay_interval: '1d',
  replay_limit: 60,
  levels: 10,
  z_window: 20,
  return_z_threshold: 2,
  volume_z_threshold: 2,
  cusum_threshold_sigma: 2.5,
  pattern_lookback: 5,
  pattern_matches: 5,
  compare_symbols: 'AAPL, MSFT, NVDA',
};

const ALT_TIMEFRAME_OPTIONS = [
  { value: '30d', label: '30天' },
  { value: '90d', label: '90天' },
  { value: '180d', label: '180天' },
];

const ALT_CATEGORY_OPTIONS = [
  { value: 'policy', label: '政策' },
  { value: 'hiring', label: '招聘' },
  { value: 'bidding', label: '招投标' },
  { value: 'env_assessment', label: '环评' },
  { value: 'commodity_inventory', label: '商品库存' },
];

const REPLAY_PERIOD_OPTIONS = [
  { value: '1d', label: '1天' },
  { value: '5d', label: '5天' },
  { value: '1mo', label: '1个月' },
  { value: '3mo', label: '3个月' },
];

const REPLAY_INTERVAL_OPTIONS = [
  { value: '1m', label: '1m' },
  { value: '5m', label: '5m' },
  { value: '1h', label: '1h' },
  { value: '1d', label: '1d' },
];

const formatDateTime = (value) => String(value || '').slice(0, 19).replace('T', ' ');

const QuantLabSignalValidationPanel = ({
  altSignalDiagnostics,
  anomalyDiagnostics,
  describeExecution,
  executionAlertType,
  formatMoney,
  formatPct,
  handleMarketProbe,
  handleSignalValidation,
  linkedReplayResult,
  macroValidationResult,
  marketProbeForm,
  marketProbeLoading,
  orderbookResult,
  periodOptions,
  replayResult,
  signalValidationForm,
  signalValidationLoading,
}) => {
  const macroHorizonRows = useMemo(
    () => (
      Array.isArray(macroValidationResult?.horizon_results)
        ? macroValidationResult.horizon_results.map((item) => ({ ...item, key: item.horizon_days }))
        : []
    ),
    [macroValidationResult],
  );

  const macroFactorRows = useMemo(
    () => (
      Array.isArray(macroValidationResult?.factor_results)
        ? macroValidationResult.factor_results.map((item, index) => ({ ...item, key: `${item.factor}-${item.horizon_days}-${index}` }))
        : []
    ),
    [macroValidationResult],
  );

  const altProviderRows = useMemo(
    () => (
      Array.isArray(altSignalDiagnostics?.providers)
        ? altSignalDiagnostics.providers.map((item) => ({ ...item, key: item.provider }))
        : []
    ),
    [altSignalDiagnostics],
  );

  const altDecayRows = useMemo(
    () => (
      Array.isArray(altSignalDiagnostics?.decay_curve)
        ? altSignalDiagnostics.decay_curve.map((item) => ({ ...item, key: item.age_days }))
        : []
    ),
    [altSignalDiagnostics],
  );

  const replayRows = useMemo(
    () => (
      Array.isArray(replayResult?.bars)
        ? replayResult.bars.map((item, index) => ({ ...item, key: `${item.timestamp}-${index}` }))
        : []
    ),
    [replayResult],
  );

  const orderbookRows = useMemo(() => {
    const bids = Array.isArray(orderbookResult?.bids)
      ? orderbookResult.bids.map((item, index) => ({ ...item, side: 'Bid', key: `bid-${index}` }))
      : [];
    const asks = Array.isArray(orderbookResult?.asks)
      ? orderbookResult.asks.map((item, index) => ({ ...item, side: 'Ask', key: `ask-${index}` }))
      : [];
    return [...bids, ...asks];
  }, [orderbookResult]);

  const orderbookProviderRows = useMemo(
    () => (
      Array.isArray(orderbookResult?.diagnostics?.provider_candidates)
        ? orderbookResult.diagnostics.provider_candidates.map((item, index) => ({ ...item, key: `${item.provider}-${index}` }))
        : []
    ),
    [orderbookResult],
  );

  const anomalyRows = useMemo(
    () => (
      Array.isArray(anomalyDiagnostics?.recent_anomalies)
        ? anomalyDiagnostics.recent_anomalies.map((item, index) => ({ ...item, key: `${item.timestamp}-${index}` }))
        : []
    ),
    [anomalyDiagnostics],
  );

  const anomalyPatternRows = useMemo(
    () => (
      Array.isArray(anomalyDiagnostics?.pattern_matches)
        ? anomalyDiagnostics.pattern_matches.map((item, index) => ({ ...item, key: `${item.timestamp}-${index}` }))
        : []
    ),
    [anomalyDiagnostics],
  );

  const linkedReplayRows = useMemo(() => {
    const series = Array.isArray(linkedReplayResult?.series) ? linkedReplayResult.series : [];
    if (!series.length) {
      return [];
    }

    const bucket = new Map();
    series.forEach((entry) => {
      (entry.bars || []).forEach((bar) => {
        const timestamp = bar.timestamp || bar.date;
        if (!timestamp) {
          return;
        }
        const existing = bucket.get(timestamp) || { key: timestamp, timestamp };
        existing[entry.symbol] = bar.close;
        bucket.set(timestamp, existing);
      });
    });

    return Array.from(bucket.values())
      .sort((left, right) => String(left.timestamp).localeCompare(String(right.timestamp)))
      .slice(-40);
  }, [linkedReplayResult]);

  return (
    <Space direction="vertical" size="large" style={FULL_WIDTH_STYLE}>
      <Row gutter={[16, 16]}>
        <Col xs={24} xl={12}>
          <Card title="宏观因子与另类数据验证">
            <Form
              form={signalValidationForm}
              layout="vertical"
              initialValues={SIGNAL_VALIDATION_INITIAL_VALUES}
              onFinish={handleSignalValidation}
            >
              <Row gutter={12}>
                <Col xs={24} md={8}>
                  <Form.Item name="benchmark" label="验证基准">
                    <Input placeholder="SPY" />
                  </Form.Item>
                </Col>
                <Col xs={24} md={8}>
                  <Form.Item name="period" label="价格区间">
                    <Select options={periodOptions} />
                  </Form.Item>
                </Col>
                <Col xs={24} md={8}>
                  <Form.Item name="horizons" label="Forward 天数">
                    <Input placeholder="5,20,60" />
                  </Form.Item>
                </Col>
              </Row>
              <Row gutter={12}>
                <Col xs={12} md={6}>
                  <Form.Item name="macro_limit" label="宏观快照">
                    <InputNumber min={2} max={1000} precision={0} style={FULL_WIDTH_STYLE} />
                  </Form.Item>
                </Col>
                <Col xs={12} md={6}>
                  <Form.Item name="timeframe" label="另类周期">
                    <Select options={ALT_TIMEFRAME_OPTIONS} />
                  </Form.Item>
                </Col>
                <Col xs={12} md={6}>
                  <Form.Item name="alt_limit" label="另类记录">
                    <InputNumber min={1} max={1000} precision={0} style={FULL_WIDTH_STYLE} />
                  </Form.Item>
                </Col>
                <Col xs={12} md={6}>
                  <Form.Item name="half_life_days" label="半衰期">
                    <InputNumber min={1} max={365} precision={0} style={FULL_WIDTH_STYLE} />
                  </Form.Item>
                </Col>
              </Row>
              <Form.Item name="category" label="另类数据类别">
                <Select
                  allowClear
                  placeholder="全部类别"
                  options={ALT_CATEGORY_OPTIONS}
                />
              </Form.Item>
              <Button type="primary" htmlType="submit" loading={signalValidationLoading}>运行信号验证</Button>
            </Form>
          </Card>
        </Col>
        <Col xs={24} xl={12}>
          <Card title="实时回放与订单簿探测">
            <Form
              form={marketProbeForm}
              layout="vertical"
              initialValues={MARKET_PROBE_INITIAL_VALUES}
              onFinish={handleMarketProbe}
            >
              <Row gutter={12}>
                <Col xs={24} md={8}>
                  <Form.Item name="symbol" label="标的" rules={[{ required: true, message: '请输入标的' }]}>
                    <Input />
                  </Form.Item>
                </Col>
                <Col xs={24} md={8}>
                  <Form.Item name="replay_period" label="回放区间">
                    <Select options={REPLAY_PERIOD_OPTIONS} />
                  </Form.Item>
                </Col>
                <Col xs={24} md={8}>
                  <Form.Item name="replay_interval" label="频率">
                    <Select options={REPLAY_INTERVAL_OPTIONS} />
                  </Form.Item>
                </Col>
              </Row>
              <Form.Item name="compare_symbols" label="联动对比标的">
                <Input placeholder="最多 4 个，如 AAPL, MSFT, NVDA" />
              </Form.Item>
              <Row gutter={12}>
                <Col xs={12} md={8}>
                  <Form.Item name="replay_limit" label="回放点数">
                    <InputNumber min={5} max={500} precision={0} style={FULL_WIDTH_STYLE} />
                  </Form.Item>
                </Col>
                <Col xs={12} md={8}>
                  <Form.Item name="levels" label="盘口层数">
                    <InputNumber min={1} max={50} precision={0} style={FULL_WIDTH_STYLE} />
                  </Form.Item>
                </Col>
                <Col xs={12} md={8}>
                  <Form.Item name="z_window" label="Z-Score 窗口">
                    <InputNumber min={10} max={120} precision={0} style={FULL_WIDTH_STYLE} />
                  </Form.Item>
                </Col>
              </Row>
              <Row gutter={12}>
                <Col xs={12} md={6}>
                  <Form.Item name="return_z_threshold" label="收益阈值">
                    <InputNumber min={1} max={6} step={0.1} precision={1} style={FULL_WIDTH_STYLE} />
                  </Form.Item>
                </Col>
                <Col xs={12} md={6}>
                  <Form.Item name="volume_z_threshold" label="量能阈值">
                    <InputNumber min={1} max={6} step={0.1} precision={1} style={FULL_WIDTH_STYLE} />
                  </Form.Item>
                </Col>
                <Col xs={12} md={6}>
                  <Form.Item name="cusum_threshold_sigma" label="CUSUM σ">
                    <InputNumber min={1} max={6} step={0.1} precision={1} style={FULL_WIDTH_STYLE} />
                  </Form.Item>
                </Col>
                <Col xs={12} md={6}>
                  <Form.Item name="pattern_lookback" label="相似窗口">
                    <InputNumber min={3} max={15} precision={0} style={FULL_WIDTH_STYLE} />
                  </Form.Item>
                </Col>
              </Row>
              <Button type="primary" htmlType="submit" loading={marketProbeLoading}>探测行情深度</Button>
            </Form>
          </Card>
        </Col>
      </Row>

      {(signalValidationLoading || marketProbeLoading) ? <Spin size="large" /> : null}
      {!signalValidationLoading && macroValidationResult ? (
        <>
          <Alert
            type={macroValidationResult.status === 'ok' && !macroValidationResult.execution?.degraded ? 'success' : 'warning'}
            showIcon
            message={`宏观因子验证状态: ${macroValidationResult.status}`}
            description={[
              macroValidationResult.diagnostics?.note || macroValidationResult.message || '已完成历史快照与 forward return 对齐。',
              macroValidationResult.execution ? describeExecution(macroValidationResult.execution, '') : '',
            ].filter(Boolean).join('；')}
          />
          <Card title="宏观信号 Forward Return 验证">
            <Table
              size="small"
              pagination={false}
              dataSource={macroHorizonRows}
              columns={[
                { title: 'Horizon', dataIndex: 'horizon_days', render: (value) => `${value}D` },
                { title: '样本数', dataIndex: 'samples' },
                { title: '命中率', dataIndex: 'hit_rate', render: (value) => value === null || value === undefined ? '--' : formatPct(value) },
                { title: '平均收益', dataIndex: 'avg_forward_return', render: (value) => value === null || value === undefined ? '--' : formatPct(value) },
                { title: '方向收益', dataIndex: 'avg_signed_return', render: (value) => value === null || value === undefined ? '--' : formatPct(value) },
              ]}
            />
          </Card>
          {macroFactorRows.length ? (
            <Card title="宏观因子拆分命中率">
              <Table
                size="small"
                pagination={{ pageSize: 8 }}
                dataSource={macroFactorRows}
                columns={[
                  { title: '因子', dataIndex: 'factor' },
                  { title: 'Horizon', dataIndex: 'horizon_days', render: (value) => `${value}D` },
                  { title: '样本数', dataIndex: 'samples' },
                  { title: '命中率', dataIndex: 'hit_rate', render: (value) => formatPct(value || 0) },
                  { title: '方向收益', dataIndex: 'avg_signed_return', render: (value) => formatPct(value || 0) },
                ]}
              />
            </Card>
          ) : null}
        </>
      ) : null}
      {!signalValidationLoading && altSignalDiagnostics?.execution ? (
        <Alert
          showIcon
          type={executionAlertType(altSignalDiagnostics.execution)}
          message={altSignalDiagnostics.execution.degraded ? '另类信号诊断当前使用缓存/降级结果' : '另类信号诊断已刷新'}
          description={describeExecution(altSignalDiagnostics.execution, '为了避免重复打慢源，请求会优先复用最近一次诊断结果。')}
        />
      ) : null}
      {!signalValidationLoading && altSignalDiagnostics ? (
        <Row gutter={[16, 16]}>
          <Col xs={24} md={6}><Card><Statistic title="另类记录数" value={altSignalDiagnostics.record_count || 0} /></Card></Col>
          <Col xs={24} md={6}><Card><Statistic title="真实 Outcome" value={altSignalDiagnostics.realized_outcome_count || 0} /></Card></Col>
          <Col xs={24} md={6}><Card><Statistic title="整体命中率" value={altSignalDiagnostics.overall?.hit_rate === null || altSignalDiagnostics.overall?.hit_rate === undefined ? '--' : formatPct(altSignalDiagnostics.overall.hit_rate)} /></Card></Col>
          <Col xs={24} md={6}><Card><Statistic title="命中率类型" value={altSignalDiagnostics.overall?.hit_rate_type || '--'} /></Card></Col>
          <Col xs={24} xl={12}>
            <Card title="Provider 信号诊断">
              <Table
                size="small"
                pagination={false}
                dataSource={altProviderRows}
                columns={[
                  { title: 'Provider', dataIndex: 'provider' },
                  { title: '记录', dataIndex: 'count' },
                  { title: '平均强度', dataIndex: 'avg_abs_strength', render: (value) => Number(value || 0).toFixed(3) },
                  { title: '置信度', dataIndex: 'avg_confidence', render: (value) => formatPct(value || 0) },
                  { title: '命中率', dataIndex: 'hit_rate', render: (value) => value === null || value === undefined ? '--' : formatPct(value) },
                ]}
              />
            </Card>
          </Col>
          <Col xs={24} xl={12}>
            <Card title="信号衰减曲线">
              <Table
                size="small"
                pagination={{ pageSize: 6 }}
                dataSource={altDecayRows}
                columns={[
                  { title: 'Age', dataIndex: 'age_days', render: (value) => `${value}D` },
                  { title: '衰减权重', dataIndex: 'decay_weight', render: (value) => Number(value || 0).toFixed(4) },
                  { title: '平均衰减信号', dataIndex: 'avg_decayed_signal', render: (value) => Number(value || 0).toFixed(6) },
                ]}
              />
            </Card>
          </Col>
        </Row>
      ) : null}
      {!marketProbeLoading && (replayResult || orderbookResult || anomalyDiagnostics) ? (
        <Row gutter={[16, 16]}>
          <Col xs={24} xl={12}>
            <Card title="个股行情回放样本">
              <Table
                size="small"
                pagination={{ pageSize: 8 }}
                dataSource={replayRows}
                columns={[
                  { title: '时间', dataIndex: 'timestamp', render: formatDateTime },
                  { title: 'Open', dataIndex: 'open', render: (value) => Number(value || 0).toFixed(2) },
                  { title: 'Close', dataIndex: 'close', render: (value) => Number(value || 0).toFixed(2) },
                  { title: 'Volume', dataIndex: 'volume', render: (value) => Number(value || 0).toLocaleString() },
                ]}
              />
            </Card>
          </Col>
          <Col xs={24} xl={12}>
            <Card
              title="订单簿深度"
              extra={
                orderbookResult?.mode === 'provider_level2'
                  ? <Tag color="green">Provider L2</Tag>
                  : orderbookResult?.mode === 'provider_quote_proxy'
                    ? <Tag color="gold">Quote Proxy</Tag>
                    : <Tag color="orange">Synthetic</Tag>
              }
            >
              <Alert
                type={orderbookResult?.mode === 'provider_level2' ? 'success' : 'info'}
                showIcon
                style={{ marginBottom: 12 }}
                message={orderbookResult?.diagnostics?.message || '暂无盘口诊断'}
                description={(
                  <Space wrap size={[8, 4]}>
                    <Text type="secondary">来源: {orderbookResult?.source || '--'}</Text>
                    <Text type="secondary">模式: {orderbookResult?.mode || '--'}</Text>
                    <Text type="secondary">候选 Provider: {orderbookResult?.diagnostics?.provider_count ?? 0}</Text>
                  </Space>
                )}
              />
              <Row gutter={[12, 12]} style={{ marginBottom: 12 }}>
                <Col xs={12} md={6}><Statistic title="Best Bid" value={orderbookResult?.metrics?.best_bid ?? 0} precision={4} /></Col>
                <Col xs={12} md={6}><Statistic title="Best Ask" value={orderbookResult?.metrics?.best_ask ?? 0} precision={4} /></Col>
                <Col xs={12} md={6}><Statistic title="Spread (bps)" value={orderbookResult?.metrics?.spread_bps ?? 0} precision={2} /></Col>
                <Col xs={12} md={6}><Statistic title="Depth Imbalance" value={orderbookResult?.metrics?.depth_imbalance ?? 0} precision={4} /></Col>
              </Row>
              <Table
                size="small"
                pagination={false}
                dataSource={orderbookRows}
                columns={[
                  { title: 'Side', dataIndex: 'side', render: (value) => <Tag color={value === 'Bid' ? 'green' : 'red'}>{value}</Tag> },
                  { title: 'Price', dataIndex: 'price', render: (value) => Number(value || 0).toFixed(4) },
                  { title: 'Size', render: (_, record) => Number(record.size ?? record.quantity ?? record.volume ?? 0).toLocaleString() },
                  { title: 'Notional', dataIndex: 'notional', render: (value) => value === null || value === undefined ? '--' : formatMoney(value) },
                ]}
              />
              <Table
                size="small"
                style={{ marginTop: 12 }}
                pagination={false}
                dataSource={orderbookProviderRows}
                locale={{ emptyText: '暂无 provider 诊断' }}
                columns={[
                  { title: 'Provider', dataIndex: 'provider' },
                  { title: '状态', dataIndex: 'status', render: (value) => <Tag>{value || 'unknown'}</Tag> },
                  { title: '模式', dataIndex: 'mode', render: (value) => value || '--' },
                  { title: 'Native L2', dataIndex: 'supports_level2', render: (value) => value ? 'Yes' : 'No' },
                  { title: 'Quote Proxy', dataIndex: 'supports_quote_proxy', render: (value) => value ? 'Yes' : 'No' },
                  { title: '延迟(ms)', dataIndex: 'latency_ms', render: (value) => value === null || value === undefined ? '--' : Number(value).toFixed(2) },
                ]}
                expandable={{
                  expandedRowRender: (record) => <Text type="secondary">{record.detail || '无额外说明'}</Text>,
                  rowExpandable: (record) => Boolean(record.detail),
                }}
              />
            </Card>
          </Col>
          {anomalyDiagnostics ? (
            <Col xs={24}>
              <Card
                title="统计异常波动诊断"
                extra={anomalyDiagnostics.latest_signal?.is_anomaly ? <Tag color="red">当前存在异常</Tag> : <Tag color="green">当前平稳</Tag>}
              >
                <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
                  <Col xs={24} md={6}><Statistic title="异常点数" value={anomalyDiagnostics.summary?.anomaly_count || 0} /></Col>
                  <Col xs={24} md={6}><Statistic title="近期异常率" value={formatPct(anomalyDiagnostics.summary?.recent_anomaly_rate || 0)} /></Col>
                  <Col xs={24} md={6}><Statistic title="当前收益 Z" value={Number(anomalyDiagnostics.latest_signal?.return_zscore || 0).toFixed(2)} /></Col>
                  <Col xs={24} md={6}><Statistic title="当前量能 Z" value={Number(anomalyDiagnostics.latest_signal?.volume_zscore || 0).toFixed(2)} /></Col>
                </Row>
                <Row gutter={[16, 16]}>
                  <Col xs={24} xl={14}>
                    <Table
                      size="small"
                      pagination={{ pageSize: 6 }}
                      dataSource={anomalyRows}
                      columns={[
                        { title: '时间', dataIndex: 'timestamp', render: formatDateTime },
                        { title: '类型', dataIndex: 'anomaly_type' },
                        { title: '收益', dataIndex: 'return', render: (value) => formatPct(value || 0) },
                        { title: '收益 Z', dataIndex: 'return_zscore', render: (value) => Number(value || 0).toFixed(2) },
                        { title: '量能 Z', dataIndex: 'volume_zscore', render: (value) => Number(value || 0).toFixed(2) },
                        { title: '严重度', dataIndex: 'severity', render: (value) => Number(value || 0).toFixed(2) },
                      ]}
                    />
                  </Col>
                  <Col xs={24} xl={10}>
                    <Table
                      size="small"
                      pagination={false}
                      dataSource={anomalyPatternRows}
                      columns={[
                        { title: '历史相似时间', dataIndex: 'timestamp', render: formatDateTime },
                        { title: '相似度', dataIndex: 'similarity_score', render: (value) => Number(value || 0).toFixed(3) },
                        { title: '后 1 bar', dataIndex: 'next_1_bar_return', render: (value) => formatPct(value || 0) },
                        { title: '后 5 bar', dataIndex: 'next_5_bar_return', render: (value) => formatPct(value || 0) },
                      ]}
                    />
                  </Col>
                </Row>
              </Card>
            </Col>
          ) : null}
        </Row>
      ) : null}
      {!marketProbeLoading && linkedReplayRows.length ? (
        <Card title="多标的联动看板">
          <Table
            size="small"
            pagination={{ pageSize: 10 }}
            dataSource={linkedReplayRows}
            columns={[
              { title: '时间', dataIndex: 'timestamp', render: formatDateTime },
              ...((linkedReplayResult?.symbols || []).map((symbol) => ({
                title: symbol,
                dataIndex: symbol,
                render: (value) => value === null || value === undefined ? '--' : Number(value).toFixed(2),
              }))),
            ]}
          />
        </Card>
      ) : null}
    </Space>
  );
};

export default QuantLabSignalValidationPanel;
