import React from 'react';
import {
  Alert,
  Card,
  Col,
  Descriptions,
  Divider,
  Row,
  Space,
  Statistic,
  Table,
  Tag,
  Tooltip,
  Typography,
} from 'antd';
import {
  DollarOutlined,
  FundOutlined,
  InfoCircleOutlined,
} from '@ant-design/icons';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  XAxis,
  YAxis,
} from 'recharts';

import { RANGE_BASIS_LABELS } from '../../utils/pricingSectionConstants';

const { Paragraph, Text } = Typography;

const FF3_EXPOSURE_META = [
  { key: 'market', subject: '市场', factor: 'Mkt-RF', color: '#1677ff' },
  { key: 'size', subject: '规模', factor: 'SMB', color: '#13c2c2' },
  { key: 'value', subject: '价值', factor: 'HML', color: '#fa8c16' },
];

const toFiniteNumber = (value) => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
};

const formatSignedExposure = (value) => {
  const numeric = toFiniteNumber(value);
  return `${numeric > 0 ? '+' : ''}${numeric.toFixed(3)}`;
};

const formatPValue = (value) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 'n/a';
  if (numeric > 0 && numeric < 0.001) return '<0.001';
  return numeric.toFixed(3);
};

const buildFactorExposureData = (ff3 = {}) => (
  FF3_EXPOSURE_META.map((item) => {
    const exposure = toFiniteNumber(ff3.factor_loadings?.[item.key]);
    const pValue = ff3.significance?.[`${item.key}_p_value`];
    return {
      ...item,
      exposure,
      direction: exposure > 0 ? '顺向' : exposure < 0 ? '反向' : '中性',
      pValue,
      significant: Number.isFinite(Number(pValue)) && Number(pValue) <= 0.1,
    };
  })
);

const getSymmetricExposureDomain = (items) => {
  const largestAbs = Math.max(0.4, ...items.map((item) => Math.abs(item.exposure || 0)));
  const bound = Math.ceil(largestAbs * 10) / 10;
  return [-bound, bound];
};

export const FactorModelCard = ({ data }) => {
  if (!data) return null;
  const capm = data.capm || {};
  const ff3 = data.fama_french || {};
  const ff5 = data.fama_french_five_factor || {};
  const attribution = data.attribution || {};
  const factorSource = data.factor_source || {};
  const fiveFactorSource = data.five_factor_source || {};

  const hasCAPM = !capm.error;
  const hasFF3 = !ff3.error;
  const hasFF5 = !ff5.error;
  const factorExposureData = hasFF3 ? buildFactorExposureData(ff3) : [];
  const factorExposureDomain = getSymmetricExposureDomain(factorExposureData);
  const dominantExposure = factorExposureData.reduce((current, item) => (
    Math.abs(item.exposure) > Math.abs(current?.exposure || 0) ? item : current
  ), factorExposureData[0]);
  const attributionChartData = attribution.components
    ? Object.values(attribution.components).map((item) => ({
        name: item.label.replace('贡献', ''),
        pct: Number(item.pct || 0),
      }))
    : [];
  const residualChartData = [
    {
      model: 'CAPM',
      lag1: Number(capm.residual_diagnostics?.autocorr_lag1 || 0),
      dw: Number(capm.residual_diagnostics?.durbin_watson || 0),
    },
    {
      model: 'FF3',
      lag1: Number(ff3.residual_diagnostics?.autocorr_lag1 || 0),
      dw: Number(ff3.residual_diagnostics?.durbin_watson || 0),
    },
    {
      model: 'FF5',
      lag1: Number(ff5.residual_diagnostics?.autocorr_lag1 || 0),
      dw: Number(ff5.residual_diagnostics?.durbin_watson || 0),
    },
  ].filter((item) => item.dw || item.lag1);

  return (
    <Card
      data-testid="pricing-factor-card"
      title={<><FundOutlined style={{ marginRight: 8 }} />因子模型分析</>}
      extra={
        <Space size={6}>
          <Tag>{data.period || '1y'}</Tag>
          {data.data_points ? <Tag>{`样本 ${data.data_points}`}</Tag> : null}
          {factorSource.is_proxy ? <Tag color="orange">代理因子</Tag> : null}
        </Space>
      }
    >
      {factorSource.warning ? (
        <Alert
          type={factorSource.is_proxy ? 'warning' : 'info'}
          showIcon
          message={`因子来源：${factorSource.label}`}
          description={factorSource.warning}
          style={{ marginBottom: 12 }}
        />
      ) : null}
      {fiveFactorSource.warning && fiveFactorSource.warning !== factorSource.warning ? (
        <Alert
          type={fiveFactorSource.is_proxy ? 'warning' : 'info'}
          showIcon
          message={`五因子来源：${fiveFactorSource.label}`}
          description={fiveFactorSource.warning}
          style={{ marginBottom: 12 }}
        />
      ) : null}
      <Divider orientation="left" style={{ fontSize: 13 }}>CAPM 模型</Divider>
      {hasCAPM ? (
        <>
          <Row gutter={16}>
            <Col span={8}>
              <Statistic
                title="Alpha (年化)"
                value={capm.alpha_pct || 0}
                suffix="%"
                precision={2}
                valueStyle={{ color: (capm.alpha_pct || 0) > 0 ? '#3f8600' : '#cf1322' }}
              />
            </Col>
            <Col span={8}>
              <Statistic title="Beta" value={capm.beta || 0} precision={3} />
            </Col>
            <Col span={8}>
              <Statistic title="R²" value={(capm.r_squared || 0) * 100} suffix="%" precision={1} />
            </Col>
          </Row>
          {capm.significance ? (
            <Space wrap size={8} style={{ marginTop: 8 }}>
              <Tag>{`Alpha t=${capm.significance.alpha_t_stat}`}</Tag>
              <Tag>{`Alpha p=${capm.significance.alpha_p_value}`}</Tag>
              <Tag>{`Beta t=${capm.significance.beta_t_stat}`}</Tag>
              <Tag>{`DW=${capm.residual_diagnostics?.durbin_watson || 0}`}</Tag>
            </Space>
          ) : null}
          {capm.interpretation && (
            <div style={{ marginTop: 12 }}>
              {Object.entries(capm.interpretation).map(([key, val]) => (
                <Paragraph key={key} style={{ marginBottom: 4, fontSize: 12 }}>
                  <InfoCircleOutlined style={{ marginRight: 4, color: '#1890ff' }} />
                  {val}
                </Paragraph>
              ))}
            </div>
          )}
        </>
      ) : <Text type="secondary">{capm.error}</Text>}

      <Divider orientation="left" style={{ fontSize: 13 }}>Fama-French 三因子</Divider>
      {hasFF3 ? (
        <>
          <Row gutter={16}>
            <Col span={6}>
              <Statistic
                title="FF3 Alpha"
                value={ff3.alpha_pct || 0}
                suffix="%"
                precision={2}
                valueStyle={{ color: (ff3.alpha_pct || 0) > 0 ? '#3f8600' : '#cf1322' }}
              />
            </Col>
            <Col span={6}>
              <Tooltip title="市场因子暴露度 (Mkt-RF)">
                <Statistic title="市场" value={ff3.factor_loadings?.market || 0} precision={3} />
              </Tooltip>
            </Col>
            <Col span={6}>
              <Tooltip title="规模因子暴露度 (SMB)">
                <Statistic title="规模" value={ff3.factor_loadings?.size || 0} precision={3} />
              </Tooltip>
            </Col>
            <Col span={6}>
              <Tooltip title="价值因子暴露度 (HML)">
                <Statistic title="价值" value={ff3.factor_loadings?.value || 0} precision={3} />
              </Tooltip>
            </Col>
          </Row>
          <div style={{ marginTop: 8 }}>
            <Text type="secondary" style={{ fontSize: 12 }}>
              R² = {((ff3.r_squared || 0) * 100).toFixed(1)}%
            </Text>
          </div>
          {ff3.significance ? (
            <Space wrap size={8} style={{ marginTop: 8 }}>
              <Tag>{`Alpha p=${ff3.significance.alpha_p_value}`}</Tag>
              <Tag>{`市场 p=${ff3.significance.market_p_value}`}</Tag>
              <Tag>{`规模 p=${ff3.significance.size_p_value}`}</Tag>
              <Tag>{`价值 p=${ff3.significance.value_p_value}`}</Tag>
            </Space>
          ) : null}
          {factorExposureData.length ? (
            <div className="pricing-factor-exposure-chart" data-testid="ff3-exposure-chart">
              <div className="pricing-factor-exposure-chart__header">
                <div>
                  <Text strong>因子暴露分解</Text>
                  <div className="pricing-factor-exposure-chart__subtitle">
                    0 为中性，正值表示顺向暴露，负值表示反向暴露
                  </div>
                </div>
                <Space size={6} wrap>
                  {dominantExposure ? (
                    <Tag color={dominantExposure.significant ? 'blue' : 'default'}>
                      {`${dominantExposure.subject}因子主导`}
                    </Tag>
                  ) : null}
                  <Tag>{`R² ${((ff3.r_squared || 0) * 100).toFixed(1)}%`}</Tag>
                </Space>
              </div>
              <div className="pricing-factor-exposure-chart__canvas">
                <ResponsiveContainer>
                  <BarChart data={factorExposureData} margin={{ top: 16, right: 12, left: -8, bottom: 4 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="subject" tickLine={false} />
                    <YAxis
                      domain={factorExposureDomain}
                      tickFormatter={(value) => Number(value).toFixed(1)}
                      tickLine={false}
                      width={42}
                    />
                    <ReferenceLine y={0} stroke="rgba(148, 163, 184, 0.86)" strokeDasharray="4 4" />
                    <RechartsTooltip
                      formatter={(value, name, item) => [
                        formatSignedExposure(value),
                        `${item?.payload?.factor || 'FF3'} ${item?.payload?.direction || ''}暴露`,
                      ]}
                      labelFormatter={(label) => `${label}因子`}
                    />
                    <Bar
                      dataKey="exposure"
                      name="因子暴露"
                      radius={[7, 7, 7, 7]}
                      barSize={54}
                      isAnimationActive={false}
                    >
                      {factorExposureData.map((item) => (
                        <Cell
                          key={item.key}
                          fill={item.exposure >= 0 ? item.color : '#ff7875'}
                          stroke={item.significant ? item.color : 'rgba(148, 163, 184, 0.56)'}
                          strokeWidth={item.significant ? 2 : 1}
                        />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div className="pricing-factor-exposure-chart__legend">
                {factorExposureData.map((item) => (
                  <div key={item.key} className="pricing-factor-exposure-chart__legend-item">
                    <span className="pricing-factor-exposure-chart__swatch" style={{ background: item.exposure >= 0 ? item.color : '#ff7875' }} />
                    <span className="pricing-factor-exposure-chart__legend-label">{`${item.subject} ${item.factor}`}</span>
                    <span className="pricing-factor-exposure-chart__legend-value">
                      {`${formatSignedExposure(item.exposure)} · ${item.direction} · p=${formatPValue(item.pValue)}`}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
          {ff3.interpretation && (
            <div style={{ marginTop: 8 }}>
              {Object.entries(ff3.interpretation).map(([key, val]) => (
                <Paragraph key={key} style={{ marginBottom: 4, fontSize: 12 }}>
                  <InfoCircleOutlined style={{ marginRight: 4, color: '#722ed1' }} />
                  {val}
                </Paragraph>
              ))}
            </div>
          )}
        </>
      ) : <Text type="secondary">{ff3.error}</Text>}

      <Divider orientation="left" style={{ fontSize: 13 }}>Fama-French 五因子</Divider>
      {hasFF5 ? (
        <>
          <Row gutter={16}>
            <Col span={6}>
              <Statistic
                title="FF5 Alpha"
                value={ff5.alpha_pct || 0}
                suffix="%"
                precision={2}
                valueStyle={{ color: (ff5.alpha_pct || 0) > 0 ? '#3f8600' : '#cf1322' }}
              />
            </Col>
            <Col span={6}>
              <Statistic title="盈利能力" value={ff5.factor_loadings?.profitability || 0} precision={3} />
            </Col>
            <Col span={6}>
              <Statistic title="投资" value={ff5.factor_loadings?.investment || 0} precision={3} />
            </Col>
            <Col span={6}>
              <Statistic title="R²" value={(ff5.r_squared || 0) * 100} suffix="%" precision={1} />
            </Col>
          </Row>
          {ff5.significance ? (
            <Space wrap size={8} style={{ marginTop: 8 }}>
              <Tag>{`盈利 p=${ff5.significance.profitability_p_value}`}</Tag>
              <Tag>{`投资 p=${ff5.significance.investment_p_value}`}</Tag>
            </Space>
          ) : null}
          {ff5.interpretation ? (
            <div style={{ marginTop: 8 }}>
              {Object.entries(ff5.interpretation).slice(3).map(([key, val]) => (
                <Paragraph key={key} style={{ marginBottom: 4, fontSize: 12 }}>
                  <InfoCircleOutlined style={{ marginRight: 4, color: '#13c2c2' }} />
                  {val}
                </Paragraph>
              ))}
            </div>
          ) : null}
        </>
      ) : <Text type="secondary">{ff5.error}</Text>}

      {attribution.components && (
        <>
          <Divider orientation="left" style={{ fontSize: 13 }}>因子归因</Divider>
          {attributionChartData.length ? (
            <div style={{ width: '100%', height: 220, marginBottom: 12 }}>
              <ResponsiveContainer>
                <BarChart data={attributionChartData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" />
                  <YAxis />
                  <RechartsTooltip formatter={(value) => [`${Number(value).toFixed(2)}%`, '贡献']} />
                  <Bar dataKey="pct">
                    {attributionChartData.map((item) => (
                      <Cell key={item.name} fill={item.pct >= 0 ? '#52c41a' : '#ff4d4f'} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : null}
          <Table
            size="small"
            pagination={false}
            dataSource={Object.entries(attribution.components).map(([k, v]) => ({ key: k, ...v }))}
            columns={[
              { title: '因子', dataIndex: 'label', key: 'label' },
              {
                title: '贡献',
                dataIndex: 'pct',
                key: 'pct',
                render: (v) => (
                  <span style={{ color: v > 0 ? '#3f8600' : v < 0 ? '#cf1322' : undefined }}>
                    {v > 0 ? '+' : ''}{v}%
                  </span>
                ),
              },
            ]}
          />
        </>
      )}

      {residualChartData.length ? (
        <>
          <Divider orientation="left" style={{ fontSize: 13 }}>残差诊断</Divider>
          <Space wrap size={8} style={{ marginBottom: 8 }}>
            {capm.idiosyncratic_risk ? (
              <Tag>{`CAPM 特质波动 ${(Number(capm.idiosyncratic_risk) * 100).toFixed(1)}%`}</Tag>
            ) : null}
            {ff3.residual_diagnostics?.durbin_watson ? (
              <Tag>{`FF3 DW=${ff3.residual_diagnostics.durbin_watson}`}</Tag>
            ) : null}
            {ff5.residual_diagnostics?.durbin_watson ? (
              <Tag>{`FF5 DW=${ff5.residual_diagnostics.durbin_watson}`}</Tag>
            ) : null}
          </Space>
          <div style={{ width: '100%', height: 220 }}>
            <ResponsiveContainer>
              <BarChart data={residualChartData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="model" />
                <YAxis />
                <RechartsTooltip
                  formatter={(value, name) => [Number(value).toFixed(2), name === 'lag1' ? 'Lag1 自相关' : 'Durbin-Watson']}
                />
                <ReferenceLine y={0} stroke="#8c8c8c" strokeDasharray="4 4" />
                <Bar dataKey="lag1" fill="#faad14" radius={[6, 6, 0, 0]} />
                <Bar dataKey="dw" fill="#1677ff" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </>
      ) : null}
    </Card>
  );
};

export const ValuationCard = ({ data }) => {
  if (!data) return null;
  const dcf = data.dcf || {};
  const monteCarlo = data.monte_carlo || {};
  const comparable = data.comparable || {};
  const fairValue = data.fair_value || {};
  const dcfScenarios = dcf.scenarios || [];
  const projectedFcfs = dcf.projected_fcfs || [];
  const fairValueBand = fairValue.mid ? [
    { name: '下沿', value: Number(fairValue.low || 0) },
    { name: '中值', value: Number(fairValue.mid || 0) },
    { name: '上沿', value: Number(fairValue.high || 0) },
  ] : [];

  const hasDCF = !dcf.error;
  const hasComparable = !comparable.error;
  const monteCarloDistribution = monteCarlo.distribution || [];

  return (
    <Card
      data-testid="pricing-valuation-card"
      title={<><DollarOutlined style={{ marginRight: 8 }} />内在价值估值</>}
      extra={data.sector && <Tag color="purple">{data.sector}</Tag>}
    >
      {fairValue.mid && (
        <div
          style={{
            textAlign: 'center',
            padding: '12px 0',
            marginBottom: 16,
            background: 'var(--bg-secondary, #fafafa)',
            borderRadius: 8,
          }}
        >
          <div style={{ color: '#8c8c8c', fontSize: 12, marginBottom: 4 }}>综合公允价值</div>
          <div style={{ fontSize: 28, fontWeight: 700, color: '#1890ff' }}>${fairValue.mid}</div>
          <div style={{ fontSize: 12, color: '#8c8c8c' }}>
            区间: ${fairValue.low} ~ ${fairValue.high}
          </div>
          <div style={{ fontSize: 11, color: '#8c8c8c', marginTop: 4 }}>方法: {fairValue.method}</div>
          {fairValue.range_basis ? (
            <div style={{ fontSize: 11, color: '#8c8c8c', marginTop: 2 }}>
              区间依据: {RANGE_BASIS_LABELS[fairValue.range_basis] || fairValue.range_basis}
            </div>
          ) : null}
          {fairValueBand.length ? (
            <div style={{ width: '100%', height: 120, marginTop: 10 }}>
              <ResponsiveContainer>
                <LineChart data={fairValueBand}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" />
                  <YAxis hide />
                  <RechartsTooltip formatter={(value) => [`$${Number(value).toFixed(2)}`, '估值']} />
                  <Line type="monotone" dataKey="value" stroke="#1677ff" strokeWidth={3} dot={{ r: 5 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          ) : null}
        </div>
      )}

      <Divider orientation="left" style={{ fontSize: 13 }}>DCF 现金流折现</Divider>
      {hasDCF ? (
        <>
          <Descriptions size="small" column={2}>
            <Descriptions.Item label="DCF 内在价值">
              <Text strong>${dcf.intrinsic_value}</Text>
            </Descriptions.Item>
            <Descriptions.Item label="溢价/折价">
              <Text style={{ color: (dcf.premium_discount || 0) > 0 ? '#cf1322' : '#3f8600' }}>
                {dcf.premium_discount > 0 ? '+' : ''}{dcf.premium_discount}%
              </Text>
            </Descriptions.Item>
            <Descriptions.Item label="WACC">
              {((dcf.assumptions?.wacc || 0) * 100).toFixed(1)}%
            </Descriptions.Item>
            <Descriptions.Item label="终值占比">{dcf.terminal_pct}%</Descriptions.Item>
          </Descriptions>
          {projectedFcfs.length ? (
            <div style={{ width: '100%', height: 220, marginTop: 12 }}>
              <ResponsiveContainer>
                <AreaChart data={projectedFcfs}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="year" />
                  <YAxis />
                  <Legend />
                  <RechartsTooltip formatter={(value) => [`${Number(value).toFixed(0)}`, '']} />
                  <Area
                    type="monotone"
                    dataKey="fcf"
                    name="预测 FCF"
                    stroke="#1677ff"
                    fill="#91caff"
                    fillOpacity={0.5}
                  />
                  <Line type="monotone" dataKey="pv" name="折现现值" stroke="#fa8c16" strokeWidth={2} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          ) : null}
          {dcfScenarios.length ? (
            <>
              <Divider orientation="left" style={{ fontSize: 13 }}>DCF 情景分析</Divider>
              <Table
                size="small"
                pagination={false}
                rowKey="name"
                dataSource={dcfScenarios}
                columns={[
                  { title: '情景', dataIndex: 'label', key: 'label', width: 90 },
                  {
                    title: '公允价值',
                    dataIndex: 'intrinsic_value',
                    key: 'intrinsic_value',
                    render: (value) => `$${Number(value || 0).toFixed(2)}`,
                  },
                  {
                    title: 'WACC',
                    dataIndex: ['assumptions', 'wacc'],
                    key: 'wacc',
                    render: (value) => `${(Number(value || 0) * 100).toFixed(1)}%`,
                  },
                  {
                    title: '初始增长',
                    dataIndex: ['assumptions', 'initial_growth'],
                    key: 'initial_growth',
                    render: (value) => `${(Number(value || 0) * 100).toFixed(1)}%`,
                  },
                  {
                    title: '溢价/折价',
                    dataIndex: 'premium_discount',
                    key: 'premium_discount',
                    render: (value) => (
                      value === null || value === undefined
                        ? '—'
                        : (
                          <span style={{ color: value > 0 ? '#cf1322' : '#3f8600' }}>
                            {value > 0 ? '+' : ''}{value}%
                          </span>
                        )
                    ),
                  },
                ]}
              />
            </>
          ) : null}
          {monteCarloDistribution.length ? (
            <>
              <Divider orientation="left" style={{ fontSize: 13 }}>Monte Carlo 估值分布</Divider>
              <Space wrap size={8} style={{ marginBottom: 8 }}>
                <Tag>{`样本 ${monteCarlo.sample_count || 0}`}</Tag>
                <Tag>{`P10 $${Number(monteCarlo.p10 || 0).toFixed(2)}`}</Tag>
                <Tag>{`P50 $${Number(monteCarlo.p50 || 0).toFixed(2)}`}</Tag>
                <Tag>{`P90 $${Number(monteCarlo.p90 || 0).toFixed(2)}`}</Tag>
              </Space>
              <div style={{ width: '100%', height: 220, marginTop: 12 }}>
                <ResponsiveContainer>
                  <BarChart data={monteCarloDistribution}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="bucket" hide />
                    <YAxis />
                    <RechartsTooltip formatter={(value) => [Number(value).toFixed(0), '样本数']} />
                    <Bar dataKey="count" fill="#36cfc9" radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </>
          ) : null}
        </>
      ) : <Text type="secondary">{dcf.error}</Text>}

      <Divider orientation="left" style={{ fontSize: 13 }}>可比公司估值</Divider>
      {hasComparable ? (
        <>
          {comparable.warnings?.length ? (
            <Alert
              type="warning"
              showIcon
              message="可比估值提醒"
              description={comparable.warnings.join(' ')}
              style={{ marginBottom: 12 }}
            />
          ) : null}
          <Table
            size="small"
            pagination={false}
            dataSource={(comparable.methods || []).map((m, i) => ({ key: i, ...m }))}
            columns={[
              { title: '方法', dataIndex: 'method', key: 'method', width: 130 },
              { title: '当前倍数', dataIndex: 'current_multiple', key: 'cur', render: (v) => v?.toFixed(1) },
              { title: '行业基准', dataIndex: 'benchmark_multiple', key: 'bench', render: (v) => v?.toFixed(1) },
              {
                title: '公允价值',
                dataIndex: 'fair_value',
                key: 'fv',
                render: (v) => (v ? `$${v.toFixed(2)}` : '-'),
              },
            ]}
          />
          <Space wrap size={8} style={{ marginTop: 8 }}>
            <Tag>{`权重 DCF ${Math.round(Number(fairValue.dcf_weight || 0) * 100)}%`}</Tag>
            <Tag>{`权重 可比 ${Math.round(Number(fairValue.comparable_weight || 0) * 100)}%`}</Tag>
            {comparable.benchmark_source ? <Tag>{`基准来源 ${comparable.benchmark_source}`}</Tag> : null}
            {comparable.benchmark_peer_count ? <Tag>{`同行样本 ${comparable.benchmark_peer_count}`}</Tag> : null}
            {comparable.benchmark_peer_symbols?.length ? (
              <Tag>{`参考同行 ${comparable.benchmark_peer_symbols.join(', ')}`}</Tag>
            ) : null}
          </Space>
        </>
      ) : <Text type="secondary">{comparable.error}</Text>}
    </Card>
  );
};
