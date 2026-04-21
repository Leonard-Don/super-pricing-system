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
  Tabs,
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

export const QuantLabInfrastructureAuthSection = ({
  authLoginForm,
  authPolicyForm,
  authProviders,
  authSession,
  authUserForm,
  authUsers,
  formatDateTime,
  handleDiagnoseOAuthProvider,
  handleExchangeOAuthCode,
  handleLoginInfrastructureUser,
  handleRevokeRefreshSession,
  handleSaveAuthUser,
  handleSaveOAuthProvider,
  handleStartOAuthLogin,
  handleSyncOAuthProvidersFromEnv,
  handleUpdateAuthPolicy,
  infrastructureStatus,
  oauthDiagnostics,
  oauthExchangeForm,
  oauthLaunchContext,
  oauthProviderForm,
  refreshSessions,
  refreshToken,
}) => (
  <Card title="本地用户认证中心">
    <Space direction="vertical" size="large" style={FULL_WIDTH_STYLE}>
      <Row gutter={[12, 12]}>
        <Col xs={24} md={6}><Statistic title="本地用户数" value={infrastructureStatus.auth?.local_user_count || 0} /></Col>
        <Col xs={24} md={6}><Statistic title="已启用用户" value={infrastructureStatus.auth?.enabled_users || 0} /></Col>
        <Col xs={24} md={6}><Statistic title="OAuth Provider" value={infrastructureStatus.auth?.oauth_enabled_providers || 0} /></Col>
        <Col xs={24} md={6}><Statistic title="认证模式" value={infrastructureStatus.auth?.required ? 'Required' : 'Optional'} /></Col>
      </Row>
      <Row gutter={[12, 12]}>
        <Col xs={24} md={12}>
          <Card size="small">
            <Text strong>Bootstrap</Text>
            <div style={{ marginTop: 8 }}>
              <Tag color={infrastructureStatus.auth?.bootstrap_required ? 'orange' : 'green'}>
                {infrastructureStatus.auth?.bootstrap_required ? '需要首个管理员' : '已完成初始化'}
              </Tag>
            </div>
          </Card>
        </Col>
        <Col xs={24} md={12}>
          <Card size="small">
            <Text strong>OAuth Env</Text>
            <div style={{ marginTop: 8 }}>
              <Tag color={(infrastructureStatus.auth?.oauth_env_candidates || 0) > 0 ? 'green' : 'default'}>
                {`候选 ${infrastructureStatus.auth?.oauth_env_candidates || 0}`}
              </Tag>
              <Tag color="blue">{`活跃 Session ${infrastructureStatus.auth?.active_refresh_sessions || 0}`}</Tag>
            </div>
          </Card>
        </Col>
      </Row>
      <Row gutter={[16, 16]}>
        <Col xs={24} xl={8}>
          <Card size="small" title="创建 / 更新本地用户">
            <Form
              form={authUserForm}
              layout="vertical"
              onFinish={handleSaveAuthUser}
              initialValues={{
                subject: 'admin',
                display_name: 'Quant Admin',
                role: 'admin',
                enabled: true,
                scopes: 'quant:read quant:write infra:admin',
                metadata: '{"desk": "research"}',
              }}
            >
              <Row gutter={12}>
                <Col span={12}>
                  <Form.Item name="subject" label="用户名" rules={[{ required: true, message: '请输入用户名' }]}>
                    <Input />
                  </Form.Item>
                </Col>
                <Col span={12}>
                  <Form.Item name="display_name" label="显示名称">
                    <Input />
                  </Form.Item>
                </Col>
              </Row>
              <Row gutter={12}>
                <Col span={12}>
                  <Form.Item name="role" label="角色">
                    <Select options={[{ value: 'admin', label: 'Admin' }, { value: 'researcher', label: 'Researcher' }, { value: 'viewer', label: 'Viewer' }, { value: 'service', label: 'Service' }]} />
                  </Form.Item>
                </Col>
                <Col span={12}>
                  <Form.Item name="enabled" label="状态">
                    <Select options={[{ value: true, label: '启用' }, { value: false, label: '禁用' }]} />
                  </Form.Item>
                </Col>
              </Row>
              <Form.Item name="password" label="密码">
                <Input.Password placeholder="新建用户必填；留空表示保留旧密码" />
              </Form.Item>
              <Form.Item name="scopes" label="Scopes">
                <Input placeholder="空格或逗号分隔" />
              </Form.Item>
              <Form.Item name="metadata" label="元数据 JSON">
                <Input.TextArea rows={3} />
              </Form.Item>
              <Button type="primary" htmlType="submit">保存用户</Button>
            </Form>
          </Card>
        </Col>
        <Col xs={24} xl={8}>
          <Card size="small" title="用户登录">
            <Form
              form={authLoginForm}
              layout="vertical"
              onFinish={handleLoginInfrastructureUser}
              initialValues={{ subject: 'admin', expires_in_seconds: 86400, refresh_expires_in_seconds: 2592000 }}
            >
              <Form.Item name="subject" label="用户名" rules={[{ required: true, message: '请输入用户名' }]}>
                <Input />
              </Form.Item>
              <Form.Item name="password" label="密码" rules={[{ required: true, message: '请输入密码' }]}>
                <Input.Password />
              </Form.Item>
              <Form.Item name="expires_in_seconds" label="登录后令牌有效秒数">
                <InputNumber min={60} max={2592000} precision={0} style={FULL_WIDTH_STYLE} />
              </Form.Item>
              <Form.Item name="refresh_expires_in_seconds" label="Refresh Token 有效秒数">
                <InputNumber min={3600} max={15552000} precision={0} style={FULL_WIDTH_STYLE} />
              </Form.Item>
              <Button type="primary" htmlType="submit">登录并签发令牌</Button>
            </Form>
            {authSession?.user ? (
              <Card size="small" style={{ marginTop: 16 }}>
                <Space direction="vertical" size={4}>
                  <Text strong>{authSession.user.display_name || authSession.user.subject}</Text>
                  <Text type="secondary">角色: {authSession.user.role}</Text>
                  <Text type="secondary">登录方式: {authSession.oauth_provider ? `oauth:${authSession.oauth_provider}` : 'local'}</Text>
                  <Text type="secondary">Scopes: {(authSession.user.scopes || []).join(', ') || '--'}</Text>
                  <Text type="secondary">累计登录: {authSession.user.login_count || 0}</Text>
                  <Text type="secondary">Access TTL: {authSession.expires_in_seconds || '--'}s</Text>
                  <Text type="secondary">Refresh TTL: {authSession.refresh_expires_in_seconds || '--'}s</Text>
                </Space>
              </Card>
            ) : null}
            {refreshToken ? (
              <Input.TextArea style={{ marginTop: 12 }} rows={3} value={refreshToken} readOnly />
            ) : null}
          </Card>
        </Col>
        <Col xs={24} xl={8}>
          <Card size="small" title="认证策略">
            <Form form={authPolicyForm} layout="vertical" onFinish={handleUpdateAuthPolicy}>
              <Form.Item name="required" label="访问策略">
                <Select options={[{ value: false, label: 'Optional · 允许匿名研究访问' }, { value: true, label: 'Required · 强制登录' }]} />
              </Form.Item>
              <Button type="primary" htmlType="submit">更新策略</Button>
            </Form>
            <Alert
              style={{ marginTop: 16 }}
              showIcon
              type={infrastructureStatus.auth?.required ? 'warning' : 'info'}
              message={infrastructureStatus.auth?.policy?.note || '认证策略说明'}
              description={`支持方式: ${(infrastructureStatus.auth?.supported || []).join(' / ')}`}
            />
          </Card>
        </Col>
      </Row>
      <Row gutter={[16, 16]}>
        <Col xs={24} xl={12}>
          <Card size="small" title="OAuth Provider 配置">
            <Space style={{ marginBottom: 12 }}>
              <Button onClick={handleSyncOAuthProvidersFromEnv}>从环境同步 GitHub / Google</Button>
            </Space>
            <Form
              form={oauthProviderForm}
              layout="vertical"
              onFinish={handleSaveOAuthProvider}
              initialValues={{
                provider_id: 'github',
                label: 'GitHub',
                provider_type: 'github',
                enabled: true,
                client_id: '',
                scopes: 'read:user user:email',
                auto_create_user: true,
                default_role: 'researcher',
                default_scopes: 'quant:read quant:write',
                frontend_origin: typeof window !== 'undefined' ? window.location.origin : '',
                extra_params: '{"allow_signup":"true"}',
                metadata: '{"team":"research"}',
              }}
            >
              <Row gutter={12}>
                <Col span={12}>
                  <Form.Item name="provider_id" label="Provider ID" rules={[{ required: true, message: '请输入 Provider ID' }]}>
                    <Input />
                  </Form.Item>
                </Col>
                <Col span={12}>
                  <Form.Item name="provider_type" label="Provider 类型">
                    <Select options={[{ value: 'github', label: 'GitHub' }, { value: 'google', label: 'Google' }, { value: 'generic', label: 'Generic OAuth2' }]} />
                  </Form.Item>
                </Col>
              </Row>
              <Row gutter={12}>
                <Col span={12}>
                  <Form.Item name="label" label="显示名称">
                    <Input />
                  </Form.Item>
                </Col>
                <Col span={12}>
                  <Form.Item name="enabled" label="状态">
                    <Select options={[{ value: true, label: '启用' }, { value: false, label: '禁用' }]} />
                  </Form.Item>
                </Col>
              </Row>
              <Form.Item name="client_id" label="Client ID" rules={[{ required: true, message: '请输入 Client ID' }]}>
                <Input />
              </Form.Item>
              <Form.Item name="client_secret" label="Client Secret">
                <Input.Password placeholder="留空表示保留已有 secret" />
              </Form.Item>
              <Row gutter={12}>
                <Col span={8}>
                  <Form.Item name="default_role" label="默认角色">
                    <Select options={[{ value: 'admin', label: 'Admin' }, { value: 'researcher', label: 'Researcher' }, { value: 'viewer', label: 'Viewer' }]} />
                  </Form.Item>
                </Col>
                <Col span={8}>
                  <Form.Item name="auto_create_user" label="自动建用户">
                    <Select options={[{ value: true, label: '是' }, { value: false, label: '否' }]} />
                  </Form.Item>
                </Col>
                <Col span={8}>
                  <Form.Item name="frontend_origin" label="前端 Origin">
                    <Input />
                  </Form.Item>
                </Col>
              </Row>
              <Form.Item name="scopes" label="OAuth Scopes">
                <Input placeholder="空格或逗号分隔" />
              </Form.Item>
              <Form.Item name="default_scopes" label="本地默认 Scopes">
                <Input placeholder="空格或逗号分隔" />
              </Form.Item>
              <Form.Item name="redirect_uri" label="固定 Redirect URI">
                <Input placeholder="留空则自动生成 backend callback URL" />
              </Form.Item>
              <Form.Item name="auth_url" label="Auth URL">
                <Input placeholder="Generic Provider 必填；GitHub/Google 可留空走预置" />
              </Form.Item>
              <Form.Item name="token_url" label="Token URL">
                <Input placeholder="Generic Provider 必填；GitHub/Google 可留空走预置" />
              </Form.Item>
              <Form.Item name="userinfo_url" label="UserInfo URL">
                <Input placeholder="Generic Provider 必填；GitHub/Google 可留空走预置" />
              </Form.Item>
              <Row gutter={12}>
                <Col span={8}>
                  <Form.Item name="subject_field" label="Subject Field">
                    <Input placeholder="如 sub / login" />
                  </Form.Item>
                </Col>
                <Col span={8}>
                  <Form.Item name="display_name_field" label="Display Field">
                    <Input placeholder="如 name" />
                  </Form.Item>
                </Col>
                <Col span={8}>
                  <Form.Item name="email_field" label="Email Field">
                    <Input placeholder="如 email" />
                  </Form.Item>
                </Col>
              </Row>
              <Form.Item name="extra_params" label="额外授权参数 JSON">
                <Input.TextArea rows={3} />
              </Form.Item>
              <Form.Item name="metadata" label="元数据 JSON">
                <Input.TextArea rows={3} />
              </Form.Item>
              <Button type="primary" htmlType="submit">保存 Provider</Button>
            </Form>
          </Card>
        </Col>
        <Col xs={24} xl={12}>
          <Card size="small" title="OAuth 登录与回调">
            <Space direction="vertical" size="middle" style={FULL_WIDTH_STYLE}>
              <div>
                <Text strong>快捷发起</Text>
                <div style={{ marginTop: 8 }}>
                  <Space wrap>
                    {(authProviders || []).filter((item) => item.enabled).map((provider) => (
                      <Button key={provider.provider_id} onClick={() => handleStartOAuthLogin(provider.provider_id)}>
                        {`登录 ${provider.label || provider.provider_id}`}
                      </Button>
                    ))}
                  </Space>
                </div>
              </div>
              {oauthLaunchContext ? (
                <Alert
                  showIcon
                  type="info"
                  message={`已生成 ${oauthLaunchContext.provider?.label || oauthLaunchContext.provider?.provider_id} 授权请求`}
                  description={(
                    <Space direction="vertical" size={4}>
                      <Text type="secondary">State: <Text code>{oauthLaunchContext.state}</Text></Text>
                      <Text type="secondary">Redirect: {oauthLaunchContext.redirect_uri}</Text>
                      <Text type="secondary">若弹窗被拦截，可手动打开下面的授权链接。</Text>
                      <Input.TextArea rows={3} value={oauthLaunchContext.authorization_url} readOnly />
                    </Space>
                  )}
                />
              ) : null}
              <Form
                form={oauthExchangeForm}
                layout="vertical"
                onFinish={handleExchangeOAuthCode}
                initialValues={{
                  provider_id: 'github',
                  expires_in_seconds: 86400,
                  refresh_expires_in_seconds: 2592000,
                }}
              >
                <Row gutter={12}>
                  <Col span={12}>
                    <Form.Item name="provider_id" label="Provider" rules={[{ required: true, message: '请选择 Provider' }]}>
                      <Select options={(authProviders || []).map((item) => ({ value: item.provider_id, label: item.label || item.provider_id }))} />
                    </Form.Item>
                  </Col>
                  <Col span={12}>
                    <Form.Item name="state" label="State" rules={[{ required: true, message: '请输入 state' }]}>
                      <Input />
                    </Form.Item>
                  </Col>
                </Row>
                <Form.Item name="code" label="Authorization Code" rules={[{ required: true, message: '请输入授权码' }]}>
                  <Input.TextArea rows={3} />
                </Form.Item>
                <Form.Item name="redirect_uri" label="Redirect URI">
                  <Input placeholder="留空则沿用自动生成的 callback" />
                </Form.Item>
                <Row gutter={12}>
                  <Col span={12}>
                    <Form.Item name="expires_in_seconds" label="Access TTL">
                      <InputNumber min={60} max={2592000} precision={0} style={FULL_WIDTH_STYLE} />
                    </Form.Item>
                  </Col>
                  <Col span={12}>
                    <Form.Item name="refresh_expires_in_seconds" label="Refresh TTL">
                      <InputNumber min={3600} max={15552000} precision={0} style={FULL_WIDTH_STYLE} />
                    </Form.Item>
                  </Col>
                </Row>
                <Button type="primary" htmlType="submit">手动交换授权码</Button>
              </Form>
              {oauthDiagnostics ? (
                <Card
                  size="small"
                  title={`Provider 诊断 · ${oauthDiagnostics.provider?.label || oauthDiagnostics.provider?.provider_id || '--'}`}
                >
                  <Space direction="vertical" size={6} style={FULL_WIDTH_STYLE}>
                    <div>
                      <Tag color={oauthDiagnostics.ready ? 'green' : 'gold'}>
                        {oauthDiagnostics.ready ? 'ready' : 'needs_attention'}
                      </Tag>
                      <Tag>{`Redirect ${oauthDiagnostics.expected_redirect_uri || '--'}`}</Tag>
                    </div>
                    <div>
                      {(oauthDiagnostics.findings || []).length ? (
                        <Space wrap>
                          {(oauthDiagnostics.findings || []).map((item, index) => (
                            <Tag key={`${item.severity}-${index}`} color={item.severity === 'high' ? 'red' : item.severity === 'medium' ? 'gold' : 'blue'}>
                              {item.message}
                            </Tag>
                          ))}
                        </Space>
                      ) : <Text type="secondary">未发现明显配置问题</Text>}
                    </div>
                  </Space>
                </Card>
              ) : null}
            </Space>
          </Card>
        </Col>
      </Row>
      <Table
        size="small"
        rowKey="provider_id"
        pagination={false}
        dataSource={authProviders}
        columns={[
          { title: 'Provider', dataIndex: 'provider_id' },
          { title: '类型', dataIndex: 'provider_type', render: (value) => <Tag color="purple">{value}</Tag> },
          { title: '显示名', dataIndex: 'label' },
          { title: 'Client ID', dataIndex: 'client_id', render: (value) => <Text code>{String(value || '').slice(0, 18)}</Text> },
          { title: 'Scopes', dataIndex: 'scopes', render: (value) => (value || []).length ? <Space wrap>{(value || []).map((scope) => <Tag key={scope}>{scope}</Tag>)}</Space> : '--' },
          { title: 'Secret', dataIndex: 'client_secret_configured', render: (value) => <Tag color={value ? 'green' : 'default'}>{value ? 'configured' : 'missing'}</Tag> },
          { title: '状态', dataIndex: 'enabled', render: (value) => <Tag color={value ? 'green' : 'default'}>{value ? '启用' : '禁用'}</Tag> },
          {
            title: '操作',
            render: (_, record) => (
              <Space wrap>
                <Button size="small" onClick={() => handleDiagnoseOAuthProvider(record.provider_id)}>诊断</Button>
                <Button size="small" onClick={() => handleStartOAuthLogin(record.provider_id)} disabled={!record.enabled}>登录</Button>
              </Space>
            ),
          },
        ]}
      />
      <Table
        size="small"
        rowKey="subject"
        pagination={false}
        dataSource={authUsers}
        columns={[
          { title: '用户', dataIndex: 'subject' },
          { title: '显示名', dataIndex: 'display_name' },
          { title: '角色', dataIndex: 'role', render: (value) => <Tag color={value === 'admin' ? 'red' : value === 'service' ? 'purple' : 'blue'}>{value}</Tag> },
          { title: '状态', dataIndex: 'enabled', render: (value) => <Tag color={value ? 'green' : 'default'}>{value ? '启用' : '禁用'}</Tag> },
          { title: 'Scopes', dataIndex: 'scopes', render: (value) => (value || []).length ? <Space wrap>{(value || []).map((scope) => <Tag key={scope}>{scope}</Tag>)}</Space> : '--' },
          { title: '最近登录', dataIndex: 'last_login_at', render: (value) => value ? formatDateTime(new Date(Number(value) * 1000).toISOString()) : '--' },
          { title: '登录次数', dataIndex: 'login_count' },
        ]}
      />
      <Alert
        showIcon
        type="info"
        message={`当前活跃 refresh sessions: ${infrastructureStatus.auth?.active_refresh_sessions || 0}`}
        description="前端现在会在 access token 过期后自动尝试 refresh；管理员也可以在下表撤销单个 session。"
      />
      <Table
        size="small"
        rowKey="session_id"
        pagination={{ pageSize: 5 }}
        dataSource={refreshSessions}
        columns={[
          { title: 'Session', dataIndex: 'session_id', render: (value) => <Text code>{String(value || '').slice(0, 12)}</Text> },
          { title: '用户', dataIndex: 'subject' },
          { title: 'Grant', dataIndex: 'grant_type', render: (value) => <Tag>{value || '--'}</Tag> },
          { title: '签发', dataIndex: 'issued_at', render: (value) => value ? formatDateTime(new Date(Number(value) * 1000).toISOString()) : '--' },
          { title: '过期', dataIndex: 'expires_at', render: (value) => value ? formatDateTime(new Date(Number(value) * 1000).toISOString()) : '--' },
          { title: '状态', render: (_, record) => <Tag color={record.revoked_at ? 'default' : 'green'}>{record.revoked_at ? 'revoked' : 'active'}</Tag> },
          {
            title: '操作',
            render: (_, record) => (
              <Button
                size="small"
                danger
                disabled={Boolean(record.revoked_at)}
                onClick={() => handleRevokeRefreshSession(record.session_id)}
              >
                撤销
              </Button>
            ),
          },
        ]}
      />
    </Space>
  </Card>
);

export const QuantLabInfrastructureRateLimitsSection = ({
  formatDateTime,
  handleUpdateRateLimits,
  infrastructureStatus,
  rateLimitForm,
}) => (
  <Card title="精细化限流">
    <Space direction="vertical" size="large" style={FULL_WIDTH_STYLE}>
      <Row gutter={[12, 12]}>
        <Col xs={24} md={6}><Statistic title="默认 RPM" value={infrastructureStatus.rate_limits?.default_rule?.requests_per_minute || 0} /></Col>
        <Col xs={24} md={6}><Statistic title="默认 Burst" value={infrastructureStatus.rate_limits?.default_rule?.burst_size || 0} /></Col>
        <Col xs={24} md={6}><Statistic title="追踪桶" value={infrastructureStatus.rate_limits?.tracked_buckets || 0} /></Col>
        <Col xs={24} md={6}><Statistic title="最近阻断" value={(infrastructureStatus.rate_limits?.recent_blocks || []).length} /></Col>
      </Row>
      <Row gutter={[16, 16]}>
        <Col xs={24} xl={10}>
          <Form form={rateLimitForm} layout="vertical" onFinish={handleUpdateRateLimits}>
            <Row gutter={12}>
              <Col span={12}>
                <Form.Item name="default_requests_per_minute" label="默认每分钟请求数" rules={[{ required: true, message: '请输入默认 RPM' }]}>
                  <InputNumber min={1} max={10000} precision={0} style={FULL_WIDTH_STYLE} />
                </Form.Item>
              </Col>
              <Col span={12}>
                <Form.Item name="default_burst_size" label="默认突发容量" rules={[{ required: true, message: '请输入默认 Burst' }]}>
                  <InputNumber min={1} max={10000} precision={0} style={FULL_WIDTH_STYLE} />
                </Form.Item>
              </Col>
            </Row>
            <Form.Item name="rules_json" label="端点规则 JSON">
              <Input.TextArea rows={12} placeholder='[{"pattern":"/api/v1/backtest*","requests_per_minute":24,"burst_size":36,"enabled":true}]' />
            </Form.Item>
            <Button type="primary" htmlType="submit">更新限流规则</Button>
          </Form>
        </Col>
        <Col xs={24} xl={14}>
          <Space direction="vertical" size="large" style={FULL_WIDTH_STYLE}>
            <Card size="small" title="按端点统计">
              <Table
                size="small"
                pagination={{ pageSize: 5 }}
                rowKey="endpoint"
                dataSource={infrastructureStatus.rate_limits?.top_endpoints || []}
                columns={[
                  { title: '端点', dataIndex: 'endpoint', ellipsis: true },
                  { title: '规则', dataIndex: 'rule_pattern', ellipsis: true },
                  { title: '放行', dataIndex: 'allowed' },
                  { title: '阻断', dataIndex: 'blocked' },
                  { title: '最近访问', dataIndex: 'last_seen', render: (value) => value ? formatDateTime(value) : '--' },
                ]}
              />
            </Card>
            <Card size="small" title="最近阻断事件">
              <Table
                size="small"
                pagination={{ pageSize: 4 }}
                rowKey={(record) => `${record.subject || 'unknown'}-${record.timestamp || 'na'}-${record.endpoint || 'endpoint'}`}
                dataSource={infrastructureStatus.rate_limits?.recent_blocks || []}
                columns={[
                  { title: '时间', dataIndex: 'timestamp', render: (value) => formatDateTime(value) },
                  { title: '端点', dataIndex: 'endpoint', ellipsis: true },
                  { title: '身份', dataIndex: 'identity_type', render: (value) => <Tag color="red">{value}</Tag> },
                  { title: '重试(s)', dataIndex: 'retry_after' },
                ]}
              />
            </Card>
          </Space>
        </Col>
      </Row>
    </Space>
  </Card>
);

export const QuantLabInfrastructurePersistenceSection = ({
  formatDateTime,
  handleBootstrapPersistence,
  handleLoadPersistenceExplorer,
  handlePreviewPersistenceMigration,
  handleRunPersistenceMigration,
  handleSavePersistenceRecord,
  handleSaveTimeseries,
  infrastructureStatus,
  persistenceBootstrapForm,
  persistenceBootstrapLoading,
  persistenceDiagnostics,
  persistenceMigrationForm,
  persistenceMigrationLoading,
  persistenceMigrationPreview,
  persistenceQueryForm,
  persistenceRecordForm,
  persistenceRecords,
  persistenceTimeseries,
  timeseriesForm,
}) => (
  <Card title="持久化记录与时序数据">
    <Space direction="vertical" size="large" style={FULL_WIDTH_STYLE}>
      <Card size="small" title="数据库接入中心">
        <Space direction="vertical" size="large" style={FULL_WIDTH_STYLE}>
          <Row gutter={[12, 12]}>
            <Col xs={24} md={6}><Statistic title="连接状态" value={persistenceDiagnostics?.connection_ok ? 'Connected' : 'Unavailable'} /></Col>
            <Col xs={24} md={6}><Statistic title="数据库" value={persistenceDiagnostics?.database_name || '--'} /></Col>
            <Col xs={24} md={6}><Statistic title="Timescale 扩展" value={persistenceDiagnostics?.timescale_extension_installed ? 'Installed' : 'Missing'} /></Col>
            <Col xs={24} md={6}><Statistic title="Hypertable 数" value={(persistenceDiagnostics?.hypertables || []).length} /></Col>
          </Row>
          <Alert
            showIcon
            type={persistenceDiagnostics?.connection_ok ? (persistenceDiagnostics?.timescale_extension_installed ? 'success' : 'warning') : 'info'}
            message={persistenceDiagnostics?.connection_ok ? 'PostgreSQL 连接诊断已就绪' : '当前未接入 PostgreSQL / TimescaleDB'}
            description={persistenceDiagnostics?.error || (persistenceDiagnostics?.recommended_next_steps || []).join('；') || '可使用下方引导初始化持久化结构'}
          />
          <Row gutter={[16, 16]}>
            <Col xs={24} xl={10}>
              <Form
                form={persistenceBootstrapForm}
                layout="vertical"
                onFinish={handleBootstrapPersistence}
                initialValues={{ enable_timescale_schema: true }}
              >
                <Form.Item name="enable_timescale_schema" label="初始化范围">
                  <Select
                    options={[
                      { value: true, label: 'Infra + Timescale 研究 Schema' },
                      { value: false, label: '仅 Infra 基础表' },
                    ]}
                  />
                </Form.Item>
                <Button type="primary" htmlType="submit" loading={persistenceBootstrapLoading}>执行 Bootstrap</Button>
              </Form>
            </Col>
            <Col xs={24} xl={14}>
              <Card size="small" title="数据库诊断">
                <Space direction="vertical" size={6}>
                  <Text type="secondary">Driver: {persistenceDiagnostics?.driver || '--'}</Text>
                  <Text type="secondary">Latency: {persistenceDiagnostics?.connection_latency_ms ?? '--'} ms</Text>
                  <Text type="secondary">Current User: {persistenceDiagnostics?.current_user || '--'}</Text>
                  <Text type="secondary">Schema File: {persistenceDiagnostics?.schema_file?.exists ? persistenceDiagnostics.schema_file.path : 'missing'}</Text>
                  <Text type="secondary">Tables: {(persistenceDiagnostics?.tables || []).join(', ') || '--'}</Text>
                  <Text type="secondary">Hypertables: {(persistenceDiagnostics?.hypertables || []).join(', ') || '--'}</Text>
                </Space>
              </Card>
            </Col>
          </Row>
        </Space>
      </Card>
      <Card size="small" title="SQLite -> PostgreSQL 迁移">
        <Space direction="vertical" size="large" style={FULL_WIDTH_STYLE}>
          <Row gutter={[12, 12]}>
            <Col xs={24} md={6}><Statistic title="迁移状态" value={persistenceMigrationPreview?.status || '--'} /></Col>
            <Col xs={24} md={6}><Statistic title="SQLite Records" value={persistenceMigrationPreview?.source?.record_count || 0} /></Col>
            <Col xs={24} md={6}><Statistic title="SQLite 时序" value={persistenceMigrationPreview?.source?.timeseries_count || 0} /></Col>
            <Col xs={24} md={6}><Statistic title="目标连接" value={persistenceMigrationPreview?.target?.connection_ok ? 'Ready' : 'Blocked'} /></Col>
          </Row>
          <Alert
            showIcon
            type={persistenceMigrationPreview?.status === 'ready' ? 'success' : 'warning'}
            message={persistenceMigrationPreview?.status === 'ready' ? 'SQLite fallback 数据可迁移到 PostgreSQL' : '目标 PostgreSQL 尚未满足迁移条件'}
            description={
              persistenceMigrationPreview?.status === 'ready'
                ? `策略: ${persistenceMigrationPreview?.plan?.record_strategy || 'upsert'} / ${persistenceMigrationPreview?.plan?.timeseries_strategy || 'dedupe'}`
                : (persistenceMigrationPreview?.recommended_next_steps || []).join('；') || '请先完成 PostgreSQL 连接与 schema bootstrap'
            }
          />
          <Row gutter={[16, 16]}>
            <Col xs={24} xl={10}>
              <Form
                form={persistenceMigrationForm}
                layout="vertical"
                onFinish={handleRunPersistenceMigration}
                initialValues={{
                  sqlite_path: '',
                  dry_run: true,
                  include_records: true,
                  include_timeseries: true,
                  dedupe_timeseries: true,
                }}
              >
                <Form.Item name="sqlite_path" label="SQLite 源路径">
                  <Input placeholder={persistenceMigrationPreview?.source?.path || '默认使用本地 fallback store'} />
                </Form.Item>
                <Row gutter={12}>
                  <Col span={12}>
                    <Form.Item name="dry_run" label="执行模式">
                      <Select
                        options={[
                          { value: true, label: 'Dry Run 预演' },
                          { value: false, label: 'Apply 正式迁移' },
                        ]}
                      />
                    </Form.Item>
                  </Col>
                  <Col span={12}>
                    <Form.Item name="dedupe_timeseries" label="时序去重">
                      <Select
                        options={[
                          { value: true, label: 'Exact Match 去重' },
                          { value: false, label: '允许重复写入' },
                        ]}
                      />
                    </Form.Item>
                  </Col>
                </Row>
                <Row gutter={12}>
                  <Col span={12}>
                    <Form.Item name="include_records" label="迁移 Records">
                      <Select options={[{ value: true, label: '是' }, { value: false, label: '否' }]} />
                    </Form.Item>
                  </Col>
                  <Col span={12}>
                    <Form.Item name="include_timeseries" label="迁移时序">
                      <Select options={[{ value: true, label: '是' }, { value: false, label: '否' }]} />
                    </Form.Item>
                  </Col>
                </Row>
                <Row gutter={12}>
                  <Col span={12}>
                    <Form.Item name="record_limit" label="Record Limit">
                      <InputNumber min={1} max={100000} precision={0} style={FULL_WIDTH_STYLE} />
                    </Form.Item>
                  </Col>
                  <Col span={12}>
                    <Form.Item name="timeseries_limit" label="Timeseries Limit">
                      <InputNumber min={1} max={100000} precision={0} style={FULL_WIDTH_STYLE} />
                    </Form.Item>
                  </Col>
                </Row>
                <Space>
                  <Button loading={persistenceMigrationLoading} onClick={() => handlePreviewPersistenceMigration(persistenceMigrationForm.getFieldsValue())}>
                    刷新预览
                  </Button>
                  <Button type="primary" htmlType="submit" loading={persistenceMigrationLoading}>
                    执行迁移
                  </Button>
                </Space>
              </Form>
            </Col>
            <Col xs={24} xl={14}>
              <Space direction="vertical" size="middle" style={FULL_WIDTH_STYLE}>
                <Card size="small" title="迁移预览">
                  <Space direction="vertical" size={6}>
                    <Text type="secondary">SQLite Path: {persistenceMigrationPreview?.source?.path || '--'}</Text>
                    <Text type="secondary">Latest Record: {persistenceMigrationPreview?.source?.latest_record_updated_at || '--'}</Text>
                    <Text type="secondary">Latest Timeseries: {persistenceMigrationPreview?.source?.latest_timeseries_timestamp || '--'}</Text>
                    <Text type="secondary">Target DB: {persistenceMigrationPreview?.target?.database_name || '--'}</Text>
                    <Text type="secondary">Hypertables: {(persistenceMigrationPreview?.target?.hypertables || []).join(', ') || '--'}</Text>
                    <Text type="secondary">CLI: python3 scripts/migrate_infra_store.py --apply</Text>
                  </Space>
                </Card>
                <Card size="small" title="源数据分布">
                  <Row gutter={[16, 16]}>
                    <Col xs={24} md={12}>
                      <Table
                        size="small"
                        pagination={false}
                        rowKey={(record) => record.record_type}
                        dataSource={persistenceMigrationPreview?.source?.record_types || []}
                        columns={[
                          { title: 'Record Type', dataIndex: 'record_type' },
                          { title: '数量', dataIndex: 'count' },
                        ]}
                      />
                    </Col>
                    <Col xs={24} md={12}>
                      <Table
                        size="small"
                        pagination={false}
                        rowKey={(record) => record.series_name}
                        dataSource={persistenceMigrationPreview?.source?.series_names || []}
                        columns={[
                          { title: 'Series', dataIndex: 'series_name' },
                          { title: '数量', dataIndex: 'count' },
                        ]}
                      />
                    </Col>
                  </Row>
                </Card>
              </Space>
            </Col>
          </Row>
        </Space>
      </Card>
      <Row gutter={[12, 12]}>
        <Col xs={24} md={8}><Statistic title="Record 总数" value={infrastructureStatus.persistence?.record_count || 0} /></Col>
        <Col xs={24} md={8}><Statistic title="时序样本" value={infrastructureStatus.persistence?.timeseries_count || 0} /></Col>
        <Col xs={24} md={8}><Statistic title="序列数量" value={infrastructureStatus.persistence?.distinct_series || 0} /></Col>
      </Row>
      <Row gutter={[16, 16]}>
        <Col xs={24} xl={8}>
          <Card size="small" title="写入 Record">
            <Form
              form={persistenceRecordForm}
              layout="vertical"
              onFinish={handleSavePersistenceRecord}
              initialValues={{
                record_type: 'research_snapshot',
                record_key: 'daily-alpha',
                payload: '{"summary":"alpha watch","score":0.72}',
              }}
            >
              <Form.Item name="record_type" label="Record Type" rules={[{ required: true, message: '请输入类型' }]}>
                <Input />
              </Form.Item>
              <Form.Item name="record_key" label="Record Key" rules={[{ required: true, message: '请输入键' }]}>
                <Input />
              </Form.Item>
              <Form.Item name="payload" label="Payload JSON">
                <Input.TextArea rows={4} />
              </Form.Item>
              <Button htmlType="submit">写入 Record</Button>
            </Form>
          </Card>
        </Col>
        <Col xs={24} xl={8}>
          <Card size="small" title="写入 Timeseries">
            <Form
              form={timeseriesForm}
              layout="vertical"
              onFinish={handleSaveTimeseries}
              initialValues={{
                series_name: 'research.alpha_score',
                symbol: 'SPY',
                timestamp: new Date().toISOString(),
                value: 0.68,
                payload: '{"source":"quant_lab","window":"1d"}',
              }}
            >
              <Row gutter={12}>
                <Col span={12}>
                  <Form.Item name="series_name" label="Series" rules={[{ required: true, message: '请输入序列名' }]}>
                    <Input />
                  </Form.Item>
                </Col>
                <Col span={12}>
                  <Form.Item name="symbol" label="Symbol" rules={[{ required: true, message: '请输入标的' }]}>
                    <Input />
                  </Form.Item>
                </Col>
              </Row>
              <Form.Item name="timestamp" label="Timestamp">
                <Input />
              </Form.Item>
              <Form.Item name="value" label="Value">
                <InputNumber style={FULL_WIDTH_STYLE} />
              </Form.Item>
              <Form.Item name="payload" label="Payload JSON">
                <Input.TextArea rows={3} />
              </Form.Item>
              <Button htmlType="submit">写入 Timeseries</Button>
            </Form>
          </Card>
        </Col>
        <Col xs={24} xl={8}>
          <Card size="small" title="查询过滤器">
            <Form
              form={persistenceQueryForm}
              layout="vertical"
              onFinish={handleLoadPersistenceExplorer}
              initialValues={{ record_type: '', series_name: '', symbol: '', record_limit: 12, timeseries_limit: 12 }}
            >
              <Form.Item name="record_type" label="Record Type">
                <Input placeholder="如 research_snapshot" />
              </Form.Item>
              <Form.Item name="series_name" label="Series">
                <Input placeholder="如 research.alpha_score" />
              </Form.Item>
              <Form.Item name="symbol" label="Symbol">
                <Input placeholder="如 SPY" />
              </Form.Item>
              <Row gutter={12}>
                <Col span={12}>
                  <Form.Item name="record_limit" label="Record 数量">
                    <InputNumber min={1} max={200} precision={0} style={FULL_WIDTH_STYLE} />
                  </Form.Item>
                </Col>
                <Col span={12}>
                  <Form.Item name="timeseries_limit" label="时序数量">
                    <InputNumber min={1} max={500} precision={0} style={FULL_WIDTH_STYLE} />
                  </Form.Item>
                </Col>
              </Row>
              <Button type="primary" htmlType="submit">刷新视图</Button>
            </Form>
          </Card>
        </Col>
      </Row>
      <Tabs
        items={[
          {
            key: 'persistence-records',
            label: 'Records',
            children: (
              <Table
                size="small"
                pagination={{ pageSize: 5 }}
                rowKey="id"
                dataSource={persistenceRecords}
                columns={[
                  { title: 'Type', dataIndex: 'record_type', ellipsis: true },
                  { title: 'Key', dataIndex: 'record_key', ellipsis: true },
                  { title: '更新时间', dataIndex: 'updated_at', render: (value) => formatDateTime(value) },
                ]}
                expandable={{
                  expandedRowRender: (record) => <Text code>{JSON.stringify(record.payload || {}, null, 2)}</Text>,
                }}
              />
            ),
          },
          {
            key: 'persistence-timeseries',
            label: 'Timeseries',
            children: (
              <Table
                size="small"
                pagination={{ pageSize: 5 }}
                rowKey="id"
                dataSource={persistenceTimeseries}
                columns={[
                  { title: 'Series', dataIndex: 'series_name', ellipsis: true },
                  { title: 'Symbol', dataIndex: 'symbol' },
                  { title: 'Value', dataIndex: 'value', render: (value) => value === null || value === undefined ? '--' : Number(value).toFixed(4) },
                  { title: '时间', dataIndex: 'timestamp', render: (value) => formatDateTime(value) },
                ]}
                expandable={{
                  expandedRowRender: (record) => <Text code>{JSON.stringify(record.payload || {}, null, 2)}</Text>,
                }}
              />
            ),
          },
        ]}
      />
    </Space>
  </Card>
);

export const QuantLabInfrastructureConfigSection = ({
  configDiff,
  configDiffRows,
  configLookupForm,
  configVersionForm,
  configVersionLoading,
  configVersionRows,
  handleDiffLatestConfigVersions,
  handleLoadConfigVersions,
  handleRestoreConfigVersion,
  handleSaveConfigVersion,
}) => (
  <Card
    title="配置版本化与回滚"
    extra={<Button size="small" onClick={handleDiffLatestConfigVersions} disabled={configVersionRows.length < 2} loading={configVersionLoading}>对比最新两版</Button>}
  >
    <Row gutter={[16, 16]}>
      <Col xs={24} xl={10}>
        <Form
          form={configVersionForm}
          layout="vertical"
          onFinish={handleSaveConfigVersion}
          initialValues={{
            owner_id: 'default',
            config_type: 'strategy',
            config_key: 'moving_average',
            payload: '{"short_window": 20, "long_window": 60, "risk_budget": 0.12}',
          }}
        >
          <Row gutter={12}>
            <Col xs={24} md={8}>
              <Form.Item name="owner_id" label="Owner">
                <Input />
              </Form.Item>
            </Col>
            <Col xs={24} md={8}>
              <Form.Item name="config_type" label="配置类型" rules={[{ required: true, message: '请输入配置类型' }]}>
                <Input />
              </Form.Item>
            </Col>
            <Col xs={24} md={8}>
              <Form.Item name="config_key" label="配置键" rules={[{ required: true, message: '请输入配置键' }]}>
                <Input />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item name="payload" label="配置 JSON">
            <Input.TextArea rows={5} />
          </Form.Item>
          <Button type="primary" htmlType="submit" loading={configVersionLoading}>保存新版本</Button>
        </Form>
      </Col>
      <Col xs={24} xl={14}>
        <Form
          form={configLookupForm}
          layout="inline"
          onFinish={handleLoadConfigVersions}
          initialValues={{ owner_id: 'default', config_type: 'strategy', config_key: 'moving_average', limit: 20 }}
          style={{ marginBottom: 12 }}
        >
          <Form.Item name="owner_id" label="Owner">
            <Input style={{ width: 110 }} />
          </Form.Item>
          <Form.Item name="config_type" label="类型">
            <Input style={{ width: 120 }} />
          </Form.Item>
          <Form.Item name="config_key" label="键">
            <Input style={{ width: 150 }} />
          </Form.Item>
          <Form.Item name="limit" label="数量">
            <InputNumber min={1} max={200} precision={0} style={{ width: 90 }} />
          </Form.Item>
          <Button htmlType="submit" loading={configVersionLoading}>读取历史</Button>
        </Form>
        <Table
          size="small"
          pagination={{ pageSize: 5 }}
          dataSource={configVersionRows}
          columns={[
            { title: '版本', render: (_, record) => `v${record.payload?.version || '--'}` },
            { title: '创建者', render: (_, record) => record.payload?.created_by || '--' },
            { title: '恢复自', render: (_, record) => record.payload?.restored_from ? `v${record.payload.restored_from}` : '--' },
            { title: '更新时间', dataIndex: 'updated_at', render: (value) => String(value || '').slice(0, 19).replace('T', ' ') },
            {
              title: '操作',
              render: (_, record) => (
                <Button size="small" onClick={() => handleRestoreConfigVersion(record)} loading={configVersionLoading}>
                  恢复为新版本
                </Button>
              ),
            },
          ]}
          expandable={{
            expandedRowRender: (record) => (
              <Text code>{JSON.stringify(record.payload?.payload || {}, null, 2)}</Text>
            ),
          }}
        />
      </Col>
    </Row>
    {configDiff ? (
      <Card size="small" title={`配置差异 v${configDiff.from_version} → v${configDiff.to_version}`} style={{ marginTop: 16 }}>
        <Table
          size="small"
          pagination={{ pageSize: 6 }}
          dataSource={configDiffRows}
          columns={[
            { title: '路径', dataIndex: 'path' },
            { title: '变更', dataIndex: 'change', render: (value) => <Tag color={value === 'added' ? 'green' : value === 'removed' ? 'red' : 'blue'}>{value}</Tag> },
            { title: 'Before', dataIndex: 'before', ellipsis: true, render: (value) => JSON.stringify(value) },
            { title: 'After', dataIndex: 'after', ellipsis: true, render: (value) => JSON.stringify(value) },
          ]}
        />
      </Card>
    ) : null}
  </Card>
);

export const QuantLabInfrastructureTaskQueueSection = ({
  formatDateTime,
  formatPct,
  handleCancelTask,
  handleLoadTaskResult,
  infrastructureTaskRows,
}) => (
  <Card title="任务队列">
    <Table
      size="small"
      pagination={{ pageSize: 8 }}
      dataSource={infrastructureTaskRows}
      columns={[
        { title: 'ID', dataIndex: 'id', ellipsis: true },
        { title: '任务', dataIndex: 'name' },
        { title: '后端', dataIndex: 'execution_backend', render: (value) => <Tag color={value === 'celery' ? 'purple' : 'blue'}>{value || 'local'}</Tag> },
        { title: 'Broker', dataIndex: 'broker_state', render: (value) => value ? <Tag color={value === 'SUCCESS' ? 'green' : value === 'FAILURE' ? 'red' : value === 'REVOKED' ? 'default' : 'processing'}>{value}</Tag> : '--' },
        { title: '状态', dataIndex: 'status', render: (value) => <Tag color={value === 'completed' ? 'green' : value === 'failed' ? 'red' : value === 'cancelled' ? 'default' : 'blue'}>{value}</Tag> },
        { title: '阶段', dataIndex: 'stage', render: (value) => value || '--' },
        { title: '进度', dataIndex: 'progress', render: (value) => formatPct(value || 0) },
        { title: '创建时间', dataIndex: 'created_at', render: (value) => String(value || '').slice(0, 19).replace('T', ' ') },
        {
          title: '操作',
          render: (_, record) => (
            <Space wrap>
              {record.status === 'queued' || record.status === 'running' ? (
                <Button size="small" danger onClick={() => handleCancelTask(record.id)}>取消</Button>
              ) : null}
              {record.status === 'completed' && (String(record.name || '').startsWith('quant_') || String(record.name || '').startsWith('backtest_')) ? (
                <Button size="small" onClick={() => handleLoadTaskResult(record)}>载入结果</Button>
              ) : null}
              {record.status !== 'queued' && record.status !== 'running' && !(record.status === 'completed' && (String(record.name || '').startsWith('quant_') || String(record.name || '').startsWith('backtest_'))) ? '--' : null}
            </Space>
          ),
        },
      ]}
      expandable={{
        expandedRowRender: (record) => (
          <Space direction="vertical" size={4}>
            <Text type="secondary">{record.error || record.result?.message || '暂无额外结果'}</Text>
            <Text type="secondary">Broker Task ID: {record.broker_task_id || '--'}</Text>
            <Text type="secondary">Broker 状态刷新: {record.broker_checked_at ? formatDateTime(record.broker_checked_at) : '--'}</Text>
            <Text code>{JSON.stringify(record.payload || {}, null, 2)}</Text>
          </Space>
        ),
      }}
    />
  </Card>
);
