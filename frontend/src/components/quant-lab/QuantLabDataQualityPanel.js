import React from 'react';
import {
  Card,
  Col,
  Empty,
  List,
  Row,
  Space,
  Statistic,
  Table,
  Tabs,
  Tag,
  Typography,
} from 'antd';

const { Text } = Typography;

const FULL_WIDTH_STYLE = { width: '100%' };

export const QuantLabDataQualityPanel = ({ dataQuality, formatPct, formatDateTime }) => (
  <Card title="数据质量可观测平台">
    {dataQuality?.providers ? (
      <Space direction="vertical" size="large" style={FULL_WIDTH_STYLE}>
        <Row gutter={[12, 12]}>
          <Col span={8}><Statistic title="平均质量分" value={formatPct(dataQuality.summary?.average_quality_score || 0)} /></Col>
          <Col span={8}><Statistic title="平均延迟(ms)" value={Number(dataQuality.summary?.average_latency_ms || 0).toFixed(1)} /></Col>
          <Col span={8}><Statistic title="平均完整性" value={formatPct(dataQuality.summary?.average_completeness || 0)} /></Col>
        </Row>
        <Row gutter={[12, 12]}>
          <Col span={8}><Statistic title="过期数据源" value={dataQuality.summary?.stale || 0} /></Col>
          <Col span={8}><Statistic title="可用性退化" value={(dataQuality.summary?.degraded || 0) + (dataQuality.summary?.down || 0)} /></Col>
          <Col span={8}><Statistic title="回测风险" value={dataQuality.backtest_quality_report?.risk_level || '--'} /></Col>
        </Row>
        <Card
          size="small"
          title="回测数据质量评估"
          extra={(
            <Tag
              color={dataQuality.backtest_quality_report?.risk_level === 'low'
                ? 'green'
                : dataQuality.backtest_quality_report?.risk_level === 'medium'
                  ? 'gold'
                  : 'red'}
            >
              {dataQuality.backtest_quality_report?.risk_level || 'unknown'}
            </Tag>
          )}
        >
          <Space direction="vertical" size="middle" style={FULL_WIDTH_STYLE}>
            <Text>{dataQuality.backtest_quality_report?.recommendation || '暂无评估结论'}</Text>
            <div>
              {(dataQuality.backtest_quality_report?.drivers || []).map((item) => (
                <Tag key={`${item.provider}-${item.status}`} color={item.status === 'available' ? 'blue' : 'red'}>
                  {`${item.provider} · ${formatPct(item.quality_score || 0)} · ${(item.flags || []).join(', ') || 'stable'}`}
                </Tag>
              ))}
            </div>
          </Space>
        </Card>
        <Tabs
          items={[
            {
              key: 'provider-health',
              label: 'Provider 健康',
              children: (
                <Table
                  size="small"
                  pagination={false}
                  rowKey="provider"
                  dataSource={dataQuality.providers}
                  columns={[
                    { title: 'Provider', dataIndex: 'provider' },
                    { title: '状态', dataIndex: 'status', render: (value) => <Tag color={value === 'available' ? 'green' : value === 'degraded' ? 'orange' : 'red'}>{value}</Tag> },
                    { title: '质量分', dataIndex: 'quality_score', render: (value) => formatPct(value) },
                    { title: '延迟(ms)', dataIndex: 'latency_ms', render: (value) => Number(value || 0).toFixed(1) },
                    { title: '完整性', dataIndex: 'completeness_score', render: (value) => value === null || value === undefined ? '--' : formatPct(value) },
                    {
                      title: '新鲜度',
                      dataIndex: 'freshness_label',
                      render: (value) => <Tag color={value === 'fresh' ? 'green' : value === 'recent' ? 'blue' : value === 'aging' ? 'gold' : 'red'}>{value || 'unknown'}</Tag>,
                    },
                    {
                      title: '审计标记',
                      dataIndex: 'audit_flags',
                      render: (value) => Array.isArray(value) && value.length ? value.map((item) => <Tag key={item}>{item}</Tag>) : <Tag color="green">stable</Tag>,
                    },
                  ]}
                />
              ),
            },
            {
              key: 'quality-audit',
              label: '审计与故障转移',
              children: (
                <Space direction="vertical" size="large" style={FULL_WIDTH_STYLE}>
                  <Card size="small" title="审计发现">
                    <List
                      size="small"
                      dataSource={dataQuality.audit_report?.findings || []}
                      renderItem={(item) => (
                        <List.Item>
                          <Space direction="vertical" size={2}>
                            <Space wrap>
                              <Tag color={item.severity === 'high' ? 'red' : item.severity === 'medium' ? 'gold' : 'green'}>{item.severity}</Tag>
                              <Text strong>{item.title}</Text>
                            </Space>
                            <Text type="secondary">{item.detail}</Text>
                          </Space>
                        </List.Item>
                      )}
                    />
                  </Card>
                  <Card size="small" title="故障热点与最弱链路">
                    <Space direction="vertical" size="middle" style={FULL_WIDTH_STYLE}>
                      <div>
                        <Text type="secondary">故障转移热点</Text>
                        <div style={{ marginTop: 8 }}>
                          {(dataQuality.audit_report?.failover_hotspots || []).map((item) => (
                            <Tag key={item.provider} color="red">{`${item.provider} ${item.count}`}</Tag>
                          ))}
                        </div>
                      </div>
                      <div>
                        <Text type="secondary">当前最弱 Provider</Text>
                        <div style={{ marginTop: 8 }}>
                          {dataQuality.audit_report?.weakest_provider ? (
                            <Space wrap>
                              <Tag color="red">{dataQuality.audit_report.weakest_provider.provider}</Tag>
                              <Tag>{`质量 ${formatPct(dataQuality.audit_report.weakest_provider.quality_score || 0)}`}</Tag>
                              {(dataQuality.audit_report.weakest_provider.audit_flags || []).map((item) => (
                                <Tag key={item}>{item}</Tag>
                              ))}
                            </Space>
                          ) : <Text type="secondary">暂无弱项</Text>}
                        </div>
                      </div>
                    </Space>
                  </Card>
                  <Card size="small" title="最近故障转移日志">
                    <Table
                      size="small"
                      pagination={{ pageSize: 4 }}
                      rowKey={(record) => `${record.provider || 'provider'}-${record.timestamp || 'na'}-${record.reason || 'reason'}`}
                      dataSource={dataQuality.failover_log || []}
                      columns={[
                        { title: '时间', dataIndex: 'timestamp', render: (value) => formatDateTime(value) },
                        { title: 'Provider', dataIndex: 'provider', render: (value) => <Tag color="red">{value}</Tag> },
                        { title: '原因', dataIndex: 'reason', ellipsis: true },
                      ]}
                    />
                  </Card>
                </Space>
              ),
            },
          ]}
        />
      </Space>
    ) : <Empty description="暂无数据质量快照" />}
  </Card>
);

export default QuantLabDataQualityPanel;
