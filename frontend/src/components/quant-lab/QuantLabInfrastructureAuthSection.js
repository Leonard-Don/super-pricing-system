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
  loading = false,
}) => (
  <Card title="本地用户认证中心" loading={loading}>
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
