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
  Statistic,
  Table,
  Tag,
  Typography,
} from 'antd';

const { Text } = Typography;

const FULL_WIDTH_STYLE = { width: '100%' };

export const QuantLabInfrastructureOverviewSection = ({
  authToken,
  handleCreateTask,
  handleCreateToken,
  handleDeleteNotificationChannel,
  handleSaveNotificationChannel,
  handleTestNotification,
  infrastructureStatus,
  loadInfrastructure,
  notificationChannelForm,
  notificationForm,
  taskForm,
  tokenForm,
}) => (
  <>
    <Row gutter={[16, 16]}>
      <Col xs={24} md={6}><Card><Statistic title="持久化模式" value={infrastructureStatus.persistence?.mode || '--'} /></Card></Col>
      <Col xs={24} md={6}><Card><Statistic title="任务队列" value={infrastructureStatus.task_queue?.mode || '--'} /></Card></Col>
      <Col xs={24} md={6}><Card><Statistic title="运行中任务" value={infrastructureStatus.task_queue?.queued_or_running || 0} /></Card></Col>
      <Col xs={24} md={6}><Card><Statistic title="通知通道" value={(infrastructureStatus.notifications?.channels || []).length} /></Card></Col>
    </Row>
    <Row gutter={[16, 16]}>
      <Col xs={24} md={6}><Card><Statistic title="已完成任务" value={infrastructureStatus.task_queue?.completed || 0} /></Card></Col>
      <Col xs={24} md={6}><Card><Statistic title="失败任务" value={infrastructureStatus.task_queue?.failed || 0} /></Card></Col>
      <Col xs={24} md={6}><Card><Statistic title="已取消任务" value={infrastructureStatus.task_queue?.cancelled || 0} /></Card></Col>
      <Col xs={24} md={6}><Card><Statistic title="平均时长(s)" value={infrastructureStatus.task_queue?.average_duration_seconds ?? '--'} /></Card></Col>
    </Row>
    <Row gutter={[16, 16]}>
      <Col xs={24} md={6}><Card><Statistic title="持久化任务" value={infrastructureStatus.task_queue?.persisted_tasks || 0} /></Card></Col>
      <Col xs={24} md={6}><Card><Statistic title="Redis" value={infrastructureStatus.task_queue?.redis_configured ? '已配置' : '未配置'} /></Card></Col>
      <Col xs={24} md={6}><Card><Statistic title="Celery" value={infrastructureStatus.task_queue?.celery_importable ? '可用' : '未启用'} /></Card></Col>
      <Col xs={24} md={6}><Card><Statistic title="后端路由" value={(infrastructureStatus.task_queue?.execution_backends || []).join(', ') || '--'} /></Card></Col>
    </Row>
    <Card size="small" title="Broker 状态观测">
      <Space wrap>
        {Array.isArray(infrastructureStatus.task_queue?.broker_states) && infrastructureStatus.task_queue.broker_states.length ? (
          infrastructureStatus.task_queue.broker_states.map((item) => (
            <Tag key={item} color={item === 'SUCCESS' ? 'green' : item === 'FAILURE' ? 'red' : item === 'REVOKED' ? 'default' : 'blue'}>
              {item}
            </Tag>
          ))
        ) : (
          <Text type="secondary">当前没有 broker 状态样本</Text>
        )}
      </Space>
    </Card>
    <Card size="small" title="Worker 运行时">
      <Space direction="vertical" size={6} style={FULL_WIDTH_STYLE}>
        <Space wrap>
          <Tag color={infrastructureStatus.task_queue?.worker_running ? 'green' : 'default'}>
            {infrastructureStatus.task_queue?.worker_running ? 'running' : 'stopped'}
          </Tag>
          <Tag color={infrastructureStatus.task_queue?.celery_importable ? 'blue' : 'orange'}>
            {infrastructureStatus.task_queue?.celery_importable ? 'celery import ready' : 'celery missing'}
          </Tag>
          {infrastructureStatus.task_queue?.worker_pid ? (
            <Tag>{`PID ${infrastructureStatus.task_queue.worker_pid}`}</Tag>
          ) : null}
        </Space>
        <Text type="secondary">启动命令: {infrastructureStatus.task_queue?.worker_command || './scripts/start_celery_worker.sh'}</Text>
        <Text type="secondary">PID File: {infrastructureStatus.task_queue?.worker_pid_file || '--'}</Text>
        <Text type="secondary">Log File: {infrastructureStatus.task_queue?.worker_log_file || '--'}</Text>
      </Space>
    </Card>
    <Alert
      type={infrastructureStatus.persistence?.timescale_ready ? 'success' : 'warning'}
      showIcon
      message={infrastructureStatus.persistence?.timescale_ready ? 'PostgreSQL / TimescaleDB 已就绪' : '当前使用本地 SQLite 降级持久化'}
      description={infrastructureStatus.persistence?.note}
    />
    <Row gutter={[16, 16]}>
      <Col xs={24} xl={8}>
        <Card title="提交异步任务">
          <Form form={taskForm} layout="vertical" onFinish={handleCreateTask} initialValues={{ name: 'research_batch', execution_backend: 'auto', payload: '{"sleep_seconds": 1.2, "steps": 4}' }}>
            <Form.Item name="name" label="任务名称" rules={[{ required: true, message: '请输入任务名称' }]}>
              <Input />
            </Form.Item>
            <Form.Item name="execution_backend" label="执行后端">
              <Select
                options={[
                  { value: 'auto', label: 'Auto · 优先 Celery，失败回退本地' },
                  { value: 'local', label: 'Local Executor' },
                  { value: 'celery', label: 'Celery Worker' },
                ]}
              />
            </Form.Item>
            <Form.Item name="payload" label="任务参数 JSON">
              <Input.TextArea rows={4} />
            </Form.Item>
            <Button type="primary" htmlType="submit">提交任务</Button>
            <Alert
              style={{ marginTop: 12 }}
              showIcon
              type={infrastructureStatus.task_queue?.worker_running ? 'success' : infrastructureStatus.task_queue?.celery_importable ? 'warning' : 'info'}
              message={infrastructureStatus.task_queue?.worker_running ? 'Celery worker 正在运行' : infrastructureStatus.task_queue?.celery_importable ? 'Celery 已可用，但 worker 未启动' : '当前仅本地执行器可用'}
              description={infrastructureStatus.task_queue?.worker_running ? infrastructureStatus.task_queue?.worker_log_file : (infrastructureStatus.task_queue?.worker_command || infrastructureStatus.task_queue?.note)}
            />
          </Form>
        </Card>
      </Col>
      <Col xs={24} xl={8}>
        <Card title="签发研究令牌">
          <Form form={tokenForm} layout="vertical" onFinish={handleCreateToken} initialValues={{ subject: 'researcher', role: 'researcher', expires_in_seconds: 86400 }}>
            <Form.Item name="subject" label="Subject">
              <Input />
            </Form.Item>
            <Form.Item name="role" label="Role">
              <Input />
            </Form.Item>
            <Form.Item name="expires_in_seconds" label="有效秒数">
              <InputNumber min={60} max={2592000} precision={0} style={FULL_WIDTH_STYLE} />
            </Form.Item>
            <Button type="primary" htmlType="submit">生成令牌</Button>
          </Form>
          {authToken ? (
            <Input.TextArea style={{ marginTop: 12 }} rows={4} value={authToken} readOnly />
          ) : null}
          <Text type="secondary" style={{ display: 'block', marginTop: 8 }}>
            手工签发仍是 access token 模式；OAuth2 登录会额外返回 refresh token。
          </Text>
        </Card>
      </Col>
      <Col xs={24} xl={8}>
        <Card title="通知通道测试">
          <Form form={notificationForm} layout="vertical" onFinish={handleTestNotification} initialValues={{ channel: 'dry_run', severity: 'info', title: 'Quant Lab 通知测试', message: '基础设施通知通道已打通' }}>
            <Form.Item name="channel" label="通道">
              <Select options={(infrastructureStatus.notifications?.channels || []).map((channel) => ({ value: channel.id, label: `${channel.label || channel.id} · ${channel.type}` }))} />
            </Form.Item>
            <Form.Item name="severity" label="级别">
              <Select options={[{ value: 'info', label: 'Info' }, { value: 'warning', label: 'Warning' }, { value: 'critical', label: 'Critical' }]} />
            </Form.Item>
            <Form.Item name="title" label="标题">
              <Input />
            </Form.Item>
            <Form.Item name="message" label="内容">
              <Input.TextArea rows={3} />
            </Form.Item>
            <Button type="primary" htmlType="submit">发送测试</Button>
          </Form>
          <Card size="small" title="登记通知渠道" style={{ marginTop: 16 }}>
            <Form
              form={notificationChannelForm}
              layout="vertical"
              onFinish={handleSaveNotificationChannel}
              initialValues={{
                id: 'research_webhook',
                type: 'webhook',
                label: 'Research Webhook',
                enabled: true,
                settings: '{"url": "https://example.com/webhook"}',
              }}
            >
              <Row gutter={12}>
                <Col xs={24} md={12}>
                  <Form.Item name="id" label="渠道 ID" rules={[{ required: true, message: '请输入渠道 ID' }]}>
                    <Input />
                  </Form.Item>
                </Col>
                <Col xs={24} md={12}>
                  <Form.Item name="type" label="类型">
                    <Select options={[{ value: 'webhook', label: 'Webhook' }, { value: 'wecom', label: '企业微信' }, { value: 'email', label: 'Email' }, { value: 'dry_run', label: 'Dry Run' }]} />
                  </Form.Item>
                </Col>
              </Row>
              <Form.Item name="label" label="显示名称">
                <Input />
              </Form.Item>
              <Form.Item name="settings" label="渠道设置 JSON">
                <Input.TextArea rows={3} placeholder='Webhook: {"url":"..."}；Email: {"host":"smtp.example.com","from":"...","to":"..."}' />
              </Form.Item>
              <Button htmlType="submit">保存渠道</Button>
            </Form>
          </Card>
          <Table
            style={{ marginTop: 16 }}
            size="small"
            pagination={false}
            rowKey="id"
            dataSource={infrastructureStatus.notifications?.channels || []}
            columns={[
              { title: 'ID', dataIndex: 'id' },
              { title: '类型', dataIndex: 'type' },
              { title: '来源', dataIndex: 'source' },
              { title: '启用', dataIndex: 'enabled', render: (value) => <Tag color={value ? 'green' : 'default'}>{value ? '是' : '否'}</Tag> },
              {
                title: '操作',
                render: (_, record) => record.source === 'stored' ? (
                  <Button size="small" danger onClick={() => handleDeleteNotificationChannel(record.id)}>删除</Button>
                ) : '--',
              },
            ]}
          />
        </Card>
      </Col>
    </Row>
  </>
);
