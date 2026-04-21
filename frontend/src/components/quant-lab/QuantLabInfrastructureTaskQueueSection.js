import React from 'react';
import {
  Button,
  Card,
  Select,
  Space,
  Table,
  Tag,
  Typography,
} from 'antd';

const { Text } = Typography;

export const QuantLabInfrastructureTaskQueueSection = ({
  formatDateTime,
  formatPct,
  handleCancelTask,
  handleLoadTaskResult,
  infrastructureTaskFilters,
  infrastructureTaskPagination,
  infrastructureTaskRows = [],
  loadMoreInfrastructureTasks,
  onInfrastructureTaskFilterChange,
  persistedTaskTotal = 0,
  loading = false,
}) => (
  <Card
    loading={loading}
    title="任务队列"
    extra={(
      <Space wrap>
        <Select
          size="small"
          style={{ minWidth: 120 }}
          value={infrastructureTaskFilters?.taskView || 'active'}
          onChange={(value) => onInfrastructureTaskFilterChange?.({ taskView: value })}
          options={[
            { value: 'active', label: '最近活跃' },
            { value: 'all', label: '全部任务' },
          ]}
        />
        <Select
          size="small"
          style={{ minWidth: 120 }}
          value={`${infrastructureTaskFilters?.sortBy || 'activity'}:${infrastructureTaskFilters?.sortDirection || 'desc'}`}
          onChange={(value) => {
            const [sortBy, sortDirection] = String(value || 'activity:desc').split(':');
            onInfrastructureTaskFilterChange?.({ sortBy, sortDirection });
          }}
          options={[
            { value: 'activity:desc', label: '优先处理' },
            { value: 'updated_at:desc', label: '最近更新' },
            { value: 'updated_at:asc', label: '最早更新' },
            { value: 'created_at:desc', label: '最近创建' },
            { value: 'created_at:asc', label: '最早创建' },
          ]}
        />
        <Select
          size="small"
          style={{ minWidth: 120 }}
          value={infrastructureTaskFilters?.status || 'all'}
          onChange={(value) => onInfrastructureTaskFilterChange?.({ status: value })}
          options={[
            { value: 'all', label: '全部状态' },
            { value: 'queued', label: '排队中' },
            { value: 'running', label: '运行中' },
            { value: 'completed', label: '已完成' },
            { value: 'failed', label: '失败' },
            { value: 'cancelled', label: '已取消' },
          ]}
        />
        <Select
          size="small"
          style={{ minWidth: 120 }}
          value={infrastructureTaskFilters?.executionBackend || 'all'}
          onChange={(value) => onInfrastructureTaskFilterChange?.({ executionBackend: value })}
          options={[
            { value: 'all', label: '全部后端' },
            { value: 'local', label: '仅本地' },
            { value: 'celery', label: '仅 Celery' },
          ]}
        />
        <Text type="secondary">
          {(infrastructureTaskPagination?.total ?? persistedTaskTotal) > 0
            ? `已加载 ${infrastructureTaskRows.length}/${infrastructureTaskPagination?.total ?? persistedTaskTotal}`
            : `已加载 ${infrastructureTaskRows.length} 条`}
        </Text>
        {infrastructureTaskPagination?.hasMore ? (
          <Button
            size="small"
            onClick={loadMoreInfrastructureTasks}
            loading={infrastructureTaskPagination?.loadingMore}
          >
            加载更多任务
          </Button>
        ) : null}
      </Space>
    )}
  >
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
