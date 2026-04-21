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
} from 'antd';

const FULL_WIDTH_STYLE = { width: '100%' };

const FACTOR_INITIAL_VALUES = {
  symbol: 'AAPL',
  period: '1y',
  expression: 'rank(close / sma(close, 20)) + rank(volume / sma(volume, 20))',
  preview_rows: 30,
};

const QuantLabFactorPanel = ({
  factorForm,
  factorLoading,
  factorQueueLoading,
  factorResult,
  handleFactorExpression,
  handleQueueFactorExpression,
  periodOptions,
}) => {
  const factorPreviewRows = useMemo(
    () => (
      Array.isArray(factorResult?.preview)
        ? factorResult.preview.map((item) => ({ ...item, key: item.date }))
        : []
    ),
    [factorResult],
  );

  return (
    <Space direction="vertical" size="large" style={FULL_WIDTH_STYLE}>
      <Card>
        <Form
          form={factorForm}
          layout="vertical"
          initialValues={FACTOR_INITIAL_VALUES}
          onFinish={handleFactorExpression}
        >
          <Row gutter={16}>
            <Col xs={24} md={5}>
              <Form.Item name="symbol" label="标的代码" rules={[{ required: true, message: '请输入标的代码' }]}>
                <Input />
              </Form.Item>
            </Col>
            <Col xs={24} md={5}>
              <Form.Item name="period" label="历史区间">
                <Select options={periodOptions} />
              </Form.Item>
            </Col>
            <Col xs={24} md={4}>
              <Form.Item name="preview_rows" label="预览行数">
                <InputNumber min={5} max={120} precision={0} style={FULL_WIDTH_STYLE} />
              </Form.Item>
            </Col>
            <Col xs={24} md={10}>
              <Form.Item name="expression" label="因子表达式" rules={[{ required: true, message: '请输入因子表达式' }]}>
                <Input.TextArea rows={3} />
              </Form.Item>
            </Col>
          </Row>
          <Space wrap>
            <Button type="primary" htmlType="submit" loading={factorLoading}>计算因子</Button>
            <Button onClick={handleQueueFactorExpression} loading={factorQueueLoading}>异步排队</Button>
          </Space>
        </Form>
      </Card>
      <Alert
        type="info"
        showIcon
        message="表达式使用安全白名单解析"
        description="支持 close/open/high/low/volume 字段，以及 rank、zscore、sma、ema、rolling_std、pct_change、delay、clip 等函数。表达式只解析数学和白名单函数，不执行任意代码。"
      />
      {factorLoading ? <Spin size="large" /> : null}
      {!factorLoading && factorResult ? (
        <>
          <Row gutter={[16, 16]}>
            <Col xs={24} md={8}><Card><Statistic title="最新因子值" value={factorResult.latest_value === null || factorResult.latest_value === undefined ? '--' : Number(factorResult.latest_value).toFixed(4)} /></Card></Col>
            <Col xs={24} md={8}><Card><Statistic title="有效点数" value={factorResult.diagnostics?.non_null_factor_points || 0} /></Card></Col>
            <Col xs={24} md={8}><Card><Statistic title="样本行数" value={factorResult.diagnostics?.rows || 0} /></Card></Col>
          </Row>
          <Card title="因子预览">
            <Table
              size="small"
              pagination={{ pageSize: 10 }}
              dataSource={factorPreviewRows}
              columns={[
                { title: '日期', dataIndex: 'date' },
                { title: '因子值', dataIndex: 'factor', render: (value) => value === null || value === undefined ? '--' : Number(value).toFixed(6) },
              ]}
            />
          </Card>
        </>
      ) : null}
    </Space>
  );
};

export default QuantLabFactorPanel;
