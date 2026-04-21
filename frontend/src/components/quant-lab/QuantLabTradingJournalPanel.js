import React, { useState } from 'react';
import {
  Button,
  Card,
  Col,
  Empty,
  Form,
  Input,
  InputNumber,
  List,
  Row,
  Select,
  Space,
  Statistic,
  Table,
  Tabs,
  Tag,
  Typography,
} from 'antd';

const { Text } = Typography;

const FULL_WIDTH_STYLE = { width: '100%' };

const JOURNAL_STAGE_OPTIONS = [
  { value: 'discovered', label: '发现' },
  { value: 'backtesting', label: '回测' },
  { value: 'optimizing', label: '优化' },
  { value: 'paper', label: '模拟' },
  { value: 'live', label: '实盘' },
  { value: 'retired', label: '停用' },
];

const JOURNAL_STATUS_OPTIONS = [
  { value: 'active', label: '进行中' },
  { value: 'watching', label: '观察中' },
  { value: 'blocked', label: '阻塞' },
  { value: 'closed', label: '已关闭' },
];

const TRADE_SOURCE_OPTIONS = [
  { value: 'manual', label: '人工触发' },
  { value: 'signal', label: '策略信号' },
  { value: 'hedge', label: '对冲动作' },
];

const REASON_CATEGORY_OPTIONS = [
  { value: 'signal_entry', label: '信号入场' },
  { value: 'profit_taking', label: '止盈' },
  { value: 'risk_exit', label: '风险退出' },
];

const ERROR_CATEGORY_OPTIONS = [
  { value: 'none', label: '无' },
  { value: 'timing_error', label: '择时错误' },
  { value: 'oversized_position', label: '仓位过重' },
  { value: 'noise_trade', label: '噪音交易' },
];

const DEFAULT_LIFECYCLE_VALUES = {
  stage: 'discovered',
  status: 'active',
  owner: 'research',
  conviction: 0.5,
};

export const QuantLabTradingJournalPanel = ({
  tradingJournal,
  onSaveTradeNote,
  onAddLifecycleEntry,
  formatPct,
  formatMoney,
  formatDateTime,
  lifecycleStageColor,
  lifecycleStatusColor,
}) => {
  const [selectedTrade, setSelectedTrade] = useState(null);
  const [journalForm] = Form.useForm();
  const [lifecycleForm] = Form.useForm();

  const handleSelectTrade = (record) => {
    setSelectedTrade(record);
    journalForm.setFieldsValue({
      notes: record.notes,
      strategy_source: record.strategy_source,
      signal_strength: record.signal_strength,
      reason_category: record.reason_category,
      error_category: record.error_category,
    });
  };

  const handleSaveTradeNoteFinish = async (values) => {
    await onSaveTradeNote(selectedTrade?.id, values);
  };

  const handleAddLifecycleEntryFinish = async (values) => {
    await onAddLifecycleEntry(values);
    lifecycleForm.resetFields();
    lifecycleForm.setFieldsValue(DEFAULT_LIFECYCLE_VALUES);
  };

  return (
    <Card title="交易日志与绩效追踪">
      {tradingJournal?.summary ? (
        <Tabs
          items={[
            {
              key: 'journal-overview',
              label: '交易明细',
              children: (
                <Space direction="vertical" style={FULL_WIDTH_STYLE} size="large">
                  <Row gutter={[12, 12]}>
                    <Col span={12}><Statistic title="总交易数" value={tradingJournal.summary.total_trades || 0} /></Col>
                    <Col span={12}><Statistic title="已实现盈亏" value={formatMoney(tradingJournal.summary.realized_pnl || 0)} /></Col>
                    <Col span={12}><Statistic title="胜率" value={formatPct(tradingJournal.summary.win_rate || 0)} /></Col>
                    <Col span={12}><Statistic title="平均信号强度" value={formatPct(tradingJournal.summary.average_signal_strength || 0)} /></Col>
                  </Row>
                  <Row gutter={[12, 12]}>
                    <Col span={12}>
                      <Card size="small" title="认知偏差检测">
                        <List
                          size="small"
                          dataSource={tradingJournal.bias_detection || []}
                          renderItem={(item) => (
                            <List.Item>
                              <Space direction="vertical" size={2}>
                                <Text strong>{item.bias}</Text>
                                <Text type="secondary">{item.evidence}</Text>
                              </Space>
                            </List.Item>
                          )}
                        />
                      </Card>
                    </Col>
                    <Col span={12}>
                      <Card size="small" title="来源与风险桶">
                        <Space direction="vertical" size="middle" style={FULL_WIDTH_STYLE}>
                          <div>
                            <Text type="secondary">策略来源</Text>
                            <div style={{ marginTop: 8 }}>
                              {(tradingJournal.source_breakdown || []).map((item) => (
                                <Tag key={item.source}>{`${item.source} ${item.count}`}</Tag>
                              ))}
                            </div>
                          </div>
                          <div>
                            <Text type="secondary">风险桶分布</Text>
                            <div style={{ marginTop: 8 }}>
                              {(tradingJournal.risk_breakdown || []).map((item) => (
                                <Tag
                                  key={item.bucket}
                                  color={item.bucket === 'high' ? 'red' : item.bucket === 'medium' ? 'gold' : 'green'}
                                >
                                  {`${item.bucket} ${item.count}`}
                                </Tag>
                              ))}
                            </div>
                          </div>
                        </Space>
                      </Card>
                    </Col>
                  </Row>
                  <Table
                    size="small"
                    rowKey="id"
                    pagination={{ pageSize: 4 }}
                    dataSource={tradingJournal.trades || []}
                    onRow={(record) => ({
                      onClick: () => handleSelectTrade(record),
                      style: { cursor: 'pointer' },
                    })}
                    columns={[
                      { title: '时间', dataIndex: 'timestamp', render: (value) => formatDateTime(value) },
                      { title: '标的', dataIndex: 'symbol' },
                      { title: '动作', dataIndex: 'action', render: (value) => <Tag color={value === 'BUY' ? 'green' : 'red'}>{value}</Tag> },
                      { title: '来源', dataIndex: 'strategy_source', render: (value) => <Tag>{value || 'manual'}</Tag> },
                      { title: '信号', dataIndex: 'signal_strength', render: (value) => value === null || value === undefined ? '--' : formatPct(value) },
                      { title: 'PnL', dataIndex: 'pnl', render: (value) => value === null || value === undefined ? '--' : formatMoney(value) },
                    ]}
                  />
                  <Card size="small" title={selectedTrade ? `编辑交易备注 · ${selectedTrade.symbol}` : '选择交易后编辑备注'}>
                    <Form form={journalForm} layout="vertical" onFinish={handleSaveTradeNoteFinish}>
                      <Form.Item name="notes" label="交易备注">
                        <Input.TextArea rows={3} placeholder="记录买卖理由、执行偏差或复盘结论" />
                      </Form.Item>
                      <Row gutter={12}>
                        <Col span={12}>
                          <Form.Item name="strategy_source" label="策略来源">
                            <Select options={TRADE_SOURCE_OPTIONS} />
                          </Form.Item>
                        </Col>
                        <Col span={12}>
                          <Form.Item name="signal_strength" label="信号强度">
                            <InputNumber min={0} max={1} step={0.05} style={FULL_WIDTH_STYLE} />
                          </Form.Item>
                        </Col>
                      </Row>
                      <Row gutter={12}>
                        <Col span={12}>
                          <Form.Item name="reason_category" label="原因分类">
                            <Select options={REASON_CATEGORY_OPTIONS} />
                          </Form.Item>
                        </Col>
                        <Col span={12}>
                          <Form.Item name="error_category" label="错误分类">
                            <Select options={ERROR_CATEGORY_OPTIONS} />
                          </Form.Item>
                        </Col>
                      </Row>
                      <Button type="primary" htmlType="submit" disabled={!selectedTrade}>保存备注</Button>
                    </Form>
                  </Card>
                </Space>
              ),
            },
            {
              key: 'journal-reports',
              label: '日报与复盘',
              children: (
                <Space direction="vertical" style={FULL_WIDTH_STYLE} size="large">
                  <Card size="small" title="每日 / 每周绩效">
                    <Tabs
                      items={[
                        {
                          key: 'daily-report',
                          label: '日报',
                          children: (
                            <Table
                              size="small"
                              rowKey="period"
                              pagination={{ pageSize: 5 }}
                              dataSource={tradingJournal.daily_report || []}
                              columns={[
                                { title: '周期', dataIndex: 'period' },
                                { title: '交易数', dataIndex: 'trade_count' },
                                { title: '胜率', dataIndex: 'win_rate', render: (value) => formatPct(value) },
                                { title: '平均PnL', dataIndex: 'average_pnl', render: (value) => formatMoney(value) },
                                { title: '总PnL', dataIndex: 'realized_pnl', render: (value) => formatMoney(value) },
                              ]}
                            />
                          ),
                        },
                        {
                          key: 'weekly-report',
                          label: '周报',
                          children: (
                            <Table
                              size="small"
                              rowKey="period"
                              pagination={{ pageSize: 5 }}
                              dataSource={tradingJournal.weekly_report || []}
                              columns={[
                                { title: '周期', dataIndex: 'period' },
                                { title: '交易数', dataIndex: 'trade_count' },
                                { title: '胜率', dataIndex: 'win_rate', render: (value) => formatPct(value) },
                                { title: '平均PnL', dataIndex: 'average_pnl', render: (value) => formatMoney(value) },
                                { title: '总PnL', dataIndex: 'realized_pnl', render: (value) => formatMoney(value) },
                              ]}
                            />
                          ),
                        },
                      ]}
                    />
                  </Card>
                  <Card size="small" title="亏损交易归因">
                    <Table
                      size="small"
                      rowKey="category"
                      pagination={{ pageSize: 5 }}
                      dataSource={tradingJournal.loss_analysis || []}
                      columns={[
                        { title: '分类', dataIndex: 'category', render: (value) => <Tag color="red">{value}</Tag> },
                        { title: '次数', dataIndex: 'count' },
                        { title: '亏损占比', dataIndex: 'share_of_losses', render: (value) => formatPct(value) },
                        { title: '平均亏损', dataIndex: 'average_loss', render: (value) => formatMoney(value) },
                        { title: '平均仓位', dataIndex: 'average_size', render: (value) => formatMoney(value) },
                        {
                          title: '高频标的',
                          dataIndex: 'top_symbols',
                          render: (value) => Array.isArray(value) && value.length ? value.map((symbol) => <Tag key={symbol}>{symbol}</Tag>) : '--',
                        },
                      ]}
                    />
                  </Card>
                </Space>
              ),
            },
            {
              key: 'journal-lifecycle',
              label: '策略生命周期',
              children: (
                <Space direction="vertical" style={FULL_WIDTH_STYLE} size="large">
                  <Row gutter={[12, 12]}>
                    <Col span={8}><Statistic title="策略条目" value={tradingJournal.strategy_lifecycle_summary?.total || 0} /></Col>
                    <Col span={8}><Statistic title="进行中" value={tradingJournal.strategy_lifecycle_summary?.active || 0} /></Col>
                    <Col span={8}><Statistic title="平均信心" value={formatPct(tradingJournal.strategy_lifecycle_summary?.average_conviction || 0)} /></Col>
                  </Row>
                  <Card size="small" title="新增生命周期条目">
                    <Form
                      form={lifecycleForm}
                      layout="vertical"
                      initialValues={DEFAULT_LIFECYCLE_VALUES}
                      onFinish={handleAddLifecycleEntryFinish}
                    >
                      <Row gutter={12}>
                        <Col span={12}>
                          <Form.Item name="strategy" label="策略名称" rules={[{ required: true, message: '请输入策略名称' }]}>
                            <Input placeholder="如 Industry Rotation Alpha" />
                          </Form.Item>
                        </Col>
                        <Col span={12}>
                          <Form.Item name="owner" label="负责人">
                            <Input placeholder="research / pm / execution" />
                          </Form.Item>
                        </Col>
                      </Row>
                      <Row gutter={12}>
                        <Col span={8}>
                          <Form.Item name="stage" label="阶段">
                            <Select options={JOURNAL_STAGE_OPTIONS} />
                          </Form.Item>
                        </Col>
                        <Col span={8}>
                          <Form.Item name="status" label="状态">
                            <Select options={JOURNAL_STATUS_OPTIONS} />
                          </Form.Item>
                        </Col>
                        <Col span={8}>
                          <Form.Item name="conviction" label="信心度">
                            <InputNumber min={0} max={1} step={0.05} style={FULL_WIDTH_STYLE} />
                          </Form.Item>
                        </Col>
                      </Row>
                      <Form.Item name="next_action" label="下一步动作">
                        <Input placeholder="如 本周完成 walk-forward 验证并准备 paper trading" />
                      </Form.Item>
                      <Form.Item name="notes" label="阶段备注">
                        <Input.TextArea rows={3} placeholder="记录当前结论、阻塞点或验证结果" />
                      </Form.Item>
                      <Button type="primary" htmlType="submit">添加条目</Button>
                    </Form>
                  </Card>
                  <Card size="small" title="生命周期看板">
                    <Space direction="vertical" style={FULL_WIDTH_STYLE} size="middle">
                      <div>
                        {(tradingJournal.strategy_lifecycle_summary?.stage_breakdown || []).map((item) => (
                          <Tag key={item.stage} color={lifecycleStageColor(item.stage)}>{`${item.stage} ${item.count}`}</Tag>
                        ))}
                      </div>
                      <Table
                        size="small"
                        rowKey="id"
                        pagination={{ pageSize: 5 }}
                        dataSource={tradingJournal.strategy_lifecycle || []}
                        columns={[
                          { title: '策略', dataIndex: 'strategy' },
                          { title: '阶段', dataIndex: 'stage', render: (value) => <Tag color={lifecycleStageColor(value)}>{value}</Tag> },
                          { title: '状态', dataIndex: 'status', render: (value) => <Tag color={lifecycleStatusColor(value)}>{value}</Tag> },
                          { title: '负责人', dataIndex: 'owner' },
                          { title: '信心度', dataIndex: 'conviction', render: (value) => value === null || value === undefined ? '--' : formatPct(value) },
                          { title: '下一步', dataIndex: 'next_action', ellipsis: true },
                          { title: '更新时间', dataIndex: 'updated_at', render: (value) => formatDateTime(value) },
                        ]}
                        expandable={{
                          expandedRowRender: (record) => (
                            <Space direction="vertical" size={4}>
                              <Text type="secondary">{record.notes || '暂无备注'}</Text>
                            </Space>
                          ),
                        }}
                      />
                    </Space>
                  </Card>
                </Space>
              ),
            },
          ]}
        />
      ) : <Empty description="暂无交易日志数据" />}
    </Card>
  );
};

export default QuantLabTradingJournalPanel;
