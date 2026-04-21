import React from 'react';
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

const BOOLEAN_OPTIONS = [
  { value: true, label: '是' },
  { value: false, label: '否' },
];

const ALERT_SOURCE_MODULE_OPTIONS = [
  { value: 'manual', label: 'manual' },
  { value: 'realtime', label: 'realtime' },
  { value: 'composite', label: 'composite' },
  { value: 'pricing', label: 'pricing' },
  { value: 'godeye', label: 'godeye' },
];

const ALERT_SEVERITY_OPTIONS = [
  { value: 'info', label: 'info' },
  { value: 'warning', label: 'warning' },
  { value: 'critical', label: 'critical' },
];

const WORKBENCH_TASK_TYPE_OPTIONS = [
  { value: 'cross_market', label: 'cross_market' },
  { value: 'pricing', label: 'pricing' },
  { value: 'macro_mispricing', label: 'macro_mispricing' },
  { value: 'trade_thesis', label: 'trade_thesis' },
];

const WORKBENCH_STATUS_OPTIONS = [
  { value: 'new', label: 'new' },
  { value: 'in_progress', label: 'in_progress' },
  { value: 'blocked', label: 'blocked' },
];

const DEFAULT_ALERT_EVENT_VALUES = {
  source_module: 'manual',
  severity: 'warning',
  create_workbench_task: true,
  workbench_task_type: 'cross_market',
  workbench_status: 'new',
  persist_event_record: true,
  cascade_actions_json: '',
};

export const QuantLabAlertOrchestrationPanel = ({
  alertOrchestration,
  onAddCompositeRule,
  onPublishAlertEvent,
  onReviewAlertHistory,
  formatPct,
  formatDateTime,
}) => {
  const [alertForm] = Form.useForm();
  const [alertEventForm] = Form.useForm();

  const handleAddCompositeRuleFinish = async (values) => {
    await onAddCompositeRule(values);
    alertForm.resetFields();
  };

  const handlePublishAlertEventFinish = async (values) => {
    await onPublishAlertEvent(values);
    alertEventForm.resetFields();
    alertEventForm.setFieldsValue(DEFAULT_ALERT_EVENT_VALUES);
  };

  return (
    <Card title="智能告警编排中心">
      {alertOrchestration?.summary ? (
        <Space direction="vertical" style={FULL_WIDTH_STYLE} size="large">
          <Row gutter={[12, 12]}>
            <Col span={8}><Statistic title="实时规则" value={alertOrchestration.summary.realtime_rules || 0} /></Col>
            <Col span={8}><Statistic title="复合规则" value={alertOrchestration.summary.composite_rules || 0} /></Col>
            <Col span={8}><Statistic title="事件总线" value={alertOrchestration.summary.alert_history_events || 0} /></Col>
          </Row>
          <Row gutter={[12, 12]}>
            <Col span={8}><Statistic title="已复盘事件" value={alertOrchestration.summary.reviewed_events || 0} /></Col>
            <Col span={8}><Statistic title="误报率" value={formatPct(alertOrchestration.summary.false_positive_rate || 0)} /></Col>
            <Col span={8}><Statistic title="平均响应(分钟)" value={alertOrchestration.summary.average_response_minutes ?? '--'} /></Col>
          </Row>
          <Row gutter={[12, 12]}>
            <Col span={8}><Statistic title="级联事件" value={alertOrchestration.summary.cascaded_events || 0} /></Col>
            <Col span={8}><Statistic title="通知触发" value={alertOrchestration.summary.notified_events || 0} /></Col>
            <Col span={8}><Statistic title="工作台任务" value={alertOrchestration.summary.workbench_tasks_created || 0} /></Col>
          </Row>
          <Row gutter={[12, 12]}>
            <Col span={8}><Statistic title="基础设施任务" value={alertOrchestration.summary.infra_tasks_created || 0} /></Col>
            <Col span={8}><Statistic title="时序写入" value={alertOrchestration.summary.timeseries_points_written || 0} /></Col>
            <Col span={8}><Statistic title="配置快照" value={alertOrchestration.summary.config_snapshots_created || 0} /></Col>
          </Row>
          <Tabs
            items={[
              {
                key: 'alert-rules',
                label: '规则编排',
                children: (
                  <Space direction="vertical" style={FULL_WIDTH_STYLE} size="large">
                    <Form form={alertForm} layout="vertical" onFinish={handleAddCompositeRuleFinish}>
                      <Form.Item name="name" label="规则名称" rules={[{ required: true, message: '请输入规则名称' }]}>
                        <Input placeholder="如 跨市场对冲信号" />
                      </Form.Item>
                      <Form.Item name="condition_summary" label="复合条件" rules={[{ required: true, message: '请输入条件摘要' }]}>
                        <Input.TextArea rows={2} placeholder="如 A股走弱 + 商品走强 + 情绪转空" />
                      </Form.Item>
                      <Form.Item name="action" label="触发动作">
                        <Input placeholder="如 保存到研究工作台 + Webhook" />
                      </Form.Item>
                      <Form.Item
                        name="cascade_actions_json"
                        label="级联动作 JSON"
                        extra="支持 create_infra_task / persist_timeseries / save_config_version 等动作"
                      >
                        <Input.TextArea
                          rows={4}
                          placeholder='[{"type":"persist_timeseries","series_name":"alert_bus.manual"},{"type":"save_config_version","config_type":"alert_playbook","config_key":"macro_defense"}]'
                        />
                      </Form.Item>
                      <Button type="primary" htmlType="submit">新增复合规则</Button>
                    </Form>
                    <Card size="small" title="发布事件到统一总线">
                      <Form
                        form={alertEventForm}
                        layout="vertical"
                        onFinish={handlePublishAlertEventFinish}
                        initialValues={DEFAULT_ALERT_EVENT_VALUES}
                      >
                        <Row gutter={12}>
                          <Col span={12}>
                            <Form.Item name="source_module" label="来源模块">
                              <Select options={ALERT_SOURCE_MODULE_OPTIONS} />
                            </Form.Item>
                          </Col>
                          <Col span={12}>
                            <Form.Item name="severity" label="级别">
                              <Select options={ALERT_SEVERITY_OPTIONS} />
                            </Form.Item>
                          </Col>
                        </Row>
                        <Form.Item name="rule_name" label="事件名称" rules={[{ required: true, message: '请输入事件名称' }]}>
                          <Input placeholder="如 跨市场防御切换" />
                        </Form.Item>
                        <Row gutter={12}>
                          <Col span={12}>
                            <Form.Item name="symbol" label="标的">
                              <Input placeholder="如 SPY" />
                            </Form.Item>
                          </Col>
                          <Col span={12}>
                            <Form.Item name="rule_ids" label="匹配规则 ID">
                              <Input placeholder="可选，空格或逗号分隔" />
                            </Form.Item>
                          </Col>
                        </Row>
                        <Form.Item name="condition_summary" label="条件摘要">
                          <Input.TextArea rows={2} placeholder="如 A股走弱 + 商品走强 + 波动率抬升" />
                        </Form.Item>
                        <Form.Item name="message" label="事件说明">
                          <Input.TextArea rows={2} placeholder="如 建议切换到防御 / 对冲研究流程" />
                        </Form.Item>
                        <Row gutter={12}>
                          <Col span={12}>
                            <Form.Item name="trigger_value" label="触发值">
                              <InputNumber style={FULL_WIDTH_STYLE} />
                            </Form.Item>
                          </Col>
                          <Col span={12}>
                            <Form.Item name="threshold" label="阈值">
                              <InputNumber style={FULL_WIDTH_STYLE} />
                            </Form.Item>
                          </Col>
                        </Row>
                        <Form.Item name="notify_channels" label="通知通道">
                          <Input placeholder="如 dry_run webhook research_webhook" />
                        </Form.Item>
                        <Row gutter={12}>
                          <Col span={8}>
                            <Form.Item name="create_workbench_task" label="创建工作台任务">
                              <Select options={BOOLEAN_OPTIONS} />
                            </Form.Item>
                          </Col>
                          <Col span={8}>
                            <Form.Item name="workbench_task_type" label="任务类型">
                              <Select options={WORKBENCH_TASK_TYPE_OPTIONS} />
                            </Form.Item>
                          </Col>
                          <Col span={8}>
                            <Form.Item name="workbench_status" label="任务状态">
                              <Select options={WORKBENCH_STATUS_OPTIONS} />
                            </Form.Item>
                          </Col>
                        </Row>
                        <Form.Item name="persist_event_record" label="持久化事件记录">
                          <Select options={BOOLEAN_OPTIONS} />
                        </Form.Item>
                        <Form.Item
                          name="cascade_actions_json"
                          label="额外级联动作 JSON"
                          extra="支持 create_infra_task / persist_timeseries / save_config_version；留空则只执行上面的基础动作"
                        >
                          <Input.TextArea
                            rows={5}
                            placeholder={'[{"type":"create_infra_task","task_name":"quant_strategy_optimizer","payload":{"symbol":"AAPL","strategy":"moving_average"}},{"type":"persist_timeseries","series_name":"alert.signal_strength"},{"type":"save_config_version","config_type":"alert_playbook","config_key":"cross_market_hedge"}]'}
                          />
                        </Form.Item>
                        <Button type="primary" htmlType="submit">发布事件</Button>
                      </Form>
                    </Card>
                    <Table
                      size="small"
                      pagination={{ pageSize: 4 }}
                      rowKey={(record) => record.id || record.name}
                      dataSource={alertOrchestration.composite_rules || []}
                      columns={[
                        { title: '规则', dataIndex: 'name' },
                        { title: '条件', dataIndex: 'condition_summary', ellipsis: true },
                        { title: '动作', dataIndex: 'action', ellipsis: true },
                        { title: '级联动作', dataIndex: 'cascade_actions', render: (value) => Array.isArray(value) ? value.length : 0 },
                      ]}
                    />
                    <Card size="small" title="规则命中画像">
                      <Table
                        size="small"
                        pagination={{ pageSize: 4 }}
                        rowKey={(record) => `${record.rule_name}-${record.source_module}`}
                        dataSource={alertOrchestration.history_stats?.rule_stats || []}
                        columns={[
                          { title: '规则', dataIndex: 'rule_name', ellipsis: true },
                          { title: '模块', dataIndex: 'source_module', render: (value) => <Tag>{value}</Tag> },
                          { title: '命中数', dataIndex: 'hit_count' },
                          { title: '复盘数', dataIndex: 'reviewed_count' },
                          { title: '误报率', dataIndex: 'false_positive_rate', render: (value) => formatPct(value) },
                          { title: '最近触发', dataIndex: 'last_trigger_time', render: (value) => value ? formatDateTime(value) : '--' },
                        ]}
                      />
                    </Card>
                  </Space>
                ),
              },
              {
                key: 'alert-history',
                label: '历史与复盘',
                children: (
                  <Space direction="vertical" style={FULL_WIDTH_STYLE} size="large">
                    <Card size="small" title="模块统计">
                      <Table
                        size="small"
                        pagination={false}
                        rowKey="module"
                        dataSource={alertOrchestration.history_stats?.module_stats || []}
                        columns={[
                          { title: '模块', dataIndex: 'module', render: (value) => <Tag>{value}</Tag> },
                          { title: '事件数', dataIndex: 'event_count' },
                          { title: '待处理', dataIndex: 'pending_count' },
                          { title: '已复盘', dataIndex: 'reviewed_count' },
                          { title: '误报率', dataIndex: 'false_positive_rate', render: (value) => formatPct(value) },
                        ]}
                      />
                    </Card>
                    <Card size="small" title="级联动作统计">
                      <Table
                        size="small"
                        pagination={false}
                        rowKey="action_type"
                        dataSource={alertOrchestration.history_stats?.cascade_stats || []}
                        columns={[
                          { title: '动作', dataIndex: 'action_type', render: (value) => <Tag color="purple">{value}</Tag> },
                          { title: '总次数', dataIndex: 'count' },
                          { title: '成功', dataIndex: 'success_count' },
                          { title: '失败', dataIndex: 'failure_count' },
                        ]}
                      />
                    </Card>
                    <Card size="small" title="近期告警历史">
                      <Table
                        size="small"
                        pagination={{ pageSize: 5 }}
                        rowKey="id"
                        dataSource={alertOrchestration.event_bus?.history || []}
                        columns={[
                          { title: '时间', dataIndex: 'trigger_time', render: (value) => formatDateTime(value) },
                          { title: '模块', dataIndex: 'source_module', render: (value) => <Tag>{value}</Tag> },
                          { title: '规则', dataIndex: 'rule_name', ellipsis: true },
                          { title: '标的', dataIndex: 'symbol', render: (value) => value || '--' },
                          {
                            title: '分发',
                            dataIndex: 'dispatch_status',
                            render: (value) => <Tag color={value === 'dispatched' ? 'green' : value === 'degraded' ? 'red' : 'gold'}>{value || 'pending'}</Tag>,
                          },
                          {
                            title: '状态',
                            dataIndex: 'review_status',
                            render: (value) => <Tag color={value === 'resolved' ? 'green' : value === 'false_positive' ? 'red' : 'gold'}>{value || 'pending'}</Tag>,
                          },
                          {
                            title: '响应(分钟)',
                            dataIndex: 'response_minutes',
                            render: (value) => value === null || value === undefined ? '--' : Number(value).toFixed(1),
                          },
                          {
                            title: '操作',
                            render: (_, record) => (
                              <Space wrap>
                                <Button
                                  size="small"
                                  type={record.review_status === 'resolved' ? 'primary' : 'default'}
                                  onClick={() => onReviewAlertHistory(record, 'resolved')}
                                >
                                  已处理
                                </Button>
                                <Button
                                  size="small"
                                  danger
                                  type={record.review_status === 'false_positive' ? 'primary' : 'default'}
                                  onClick={() => onReviewAlertHistory(record, 'false_positive')}
                                >
                                  误报
                                </Button>
                              </Space>
                            ),
                          },
                        ]}
                        expandable={{
                          expandedRowRender: (record) => (
                            <Space direction="vertical" size={4}>
                              <Text type="secondary">命中规则: {(record.matched_rule_names || []).join(', ') || '--'}</Text>
                              <Text type="secondary">通知通道: {(record.dispatched_channels || []).join(', ') || '--'}</Text>
                              <Text type="secondary">工作台任务: {(record.workbench_task_ids || []).join(', ') || '--'}</Text>
                              <Text type="secondary">基础设施任务: {(record.infra_task_ids || []).join(', ') || '--'}</Text>
                              <Text type="secondary">
                                时序写入: {(record.timeseries_points || []).map((item) => `${item.series_name || 'unknown'}@${item.timestamp || '--'}`).join(', ') || '--'}
                              </Text>
                              <Text type="secondary">
                                配置快照: {(record.config_snapshots || []).map((item) => `${item.config_type || 'config'}/${item.config_key || 'default'} v${item.version || '?'}`).join(', ') || '--'}
                              </Text>
                              <Text code>{JSON.stringify(record.cascade_results || [], null, 2)}</Text>
                            </Space>
                          ),
                        }}
                      />
                    </Card>
                    <Card size="small" title="待处理队列">
                      {(alertOrchestration.history_stats?.pending_queue || []).length ? (
                        <List
                          size="small"
                          dataSource={alertOrchestration.history_stats?.pending_queue || []}
                          renderItem={(item) => (
                            <List.Item
                              actions={[
                                <Button key="resolve" size="small" type="link" onClick={() => onReviewAlertHistory(item, 'resolved')}>处理</Button>,
                                <Button key="false-positive" size="small" type="link" danger onClick={() => onReviewAlertHistory(item, 'false_positive')}>误报</Button>,
                              ]}
                            >
                              <List.Item.Meta
                                title={<Space wrap><Tag>{item.source_module}</Tag><Text strong>{item.rule_name}</Text></Space>}
                                description={`${item.symbol || '--'} · ${formatDateTime(item.trigger_time)}`}
                              />
                            </List.Item>
                          )}
                        />
                      ) : <Empty description="暂无待处理告警事件" />}
                    </Card>
                  </Space>
                ),
              },
            ]}
          />
        </Space>
      ) : <Empty description="暂无告警编排数据" />}
    </Card>
  );
};

export default QuantLabAlertOrchestrationPanel;
