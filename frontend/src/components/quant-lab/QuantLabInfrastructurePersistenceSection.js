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
  Typography,
} from 'antd';

const { Text } = Typography;

const FULL_WIDTH_STYLE = { width: '100%' };

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
  loading = false,
}) => (
  <Card title="持久化记录与时序数据" loading={loading}>
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
