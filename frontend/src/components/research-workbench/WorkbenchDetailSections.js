import React from 'react';
import {
  Alert,
  Button,
  Card,
  Col,
  Empty,
  Input,
  List,
  Row,
  Space,
  Tag,
  Timeline,
  Typography,
} from 'antd';
import {
  ClockCircleOutlined,
  CommentOutlined,
  HistoryOutlined,
  LinkOutlined,
  SaveOutlined,
} from '@ant-design/icons';

import { buildPricingLinkFromTask, navigateToAppUrl } from '../../utils/researchContext';
import SelectedTaskRefreshPanel from './SelectedTaskRefreshPanel';
import { SnapshotHistoryList, SnapshotSummary } from './SnapshotSummary';
import { formatContextValue } from './workbenchUtils';

const SCREENER_FILTER_LABELS = {
  filter: '筛选模式',
  sector_filter: '行业',
  min_score: '最小分',
  universe_size: '候选数',
  period: '周期',
};

const SCREENER_FILTER_ORDER = ['filter', 'sector_filter', 'min_score', 'universe_size', 'period'];

const formatScreenerFilterValue = (value) => {
  if (value === null || value === undefined || value === '') {
    return '-';
  }
  return String(value);
};

const { Text } = Typography;
const { TextArea } = Input;

export const WorkbenchTaskSummarySection = ({
  handleCopyViewLink,
  latestSnapshotComparison,
  selectedTask,
  selectedTaskRefreshSignal,
  workbenchViewSummary,
}) => {
  const screenerFilters = selectedTask?.context?.screener_filters;
  const hasScreenerFilters = screenerFilters && typeof screenerFilters === 'object'
    && Object.keys(screenerFilters).length > 0;
  const handleReopenPricing = () => {
    const url = buildPricingLinkFromTask(selectedTask);
    if (url) {
      navigateToAppUrl(url);
    }
  };
  return (
  <>
    {latestSnapshotComparison?.lead ? (
      <Alert
        type={latestSnapshotComparison.summary?.[0]?.includes('复核型结果') ? 'warning' : 'info'}
        showIcon
        message="最近两版变化摘要"
        description={latestSnapshotComparison.lead}
      />
    ) : null}

    <Row gutter={[12, 12]}>
      <Col xs={24} md={12}>
        <Card size="small" variant="borderless">
          <Text type="secondary">类型</Text>
          <div><Text strong>{selectedTask.type}</Text></div>
        </Card>
      </Col>
      <Col xs={24} md={12}>
        <Card size="small" variant="borderless">
          <Text type="secondary">来源</Text>
          <div><Text strong>{selectedTask.sourceLabel}</Text></div>
        </Card>
      </Col>
      <Col xs={24} md={12}>
        <Card size="small" variant="borderless">
          <Text type="secondary">Symbol</Text>
          <div><Text strong>{selectedTask.symbol || '-'}</Text></div>
        </Card>
      </Col>
      <Col xs={24} md={12}>
        <Card size="small" variant="borderless">
          <Text type="secondary">Template</Text>
          <div><Text strong>{selectedTask.template || '-'}</Text></div>
        </Card>
      </Col>
    </Row>

    <Card size="small" title="任务上下文" variant="borderless">
      <Space wrap>
        {Object.entries(selectedTask.context || {}).map(([key, value]) => (
          <Tag key={key}>
            {key}: {formatContextValue(value)}
          </Tag>
        ))}
      </Space>
    </Card>

    {hasScreenerFilters ? (
      <Card size="small" title="筛选来源" variant="borderless">
        <Space direction="vertical" size={8} style={{ width: '100%' }}>
          <Space wrap>
            {SCREENER_FILTER_ORDER
              .filter((key) => screenerFilters[key] !== undefined && screenerFilters[key] !== null && screenerFilters[key] !== '')
              .map((key) => (
                <Tag key={key} color="blue">
                  {SCREENER_FILTER_LABELS[key]}: {formatScreenerFilterValue(screenerFilters[key])}
                </Tag>
              ))}
          </Space>
          <Text type="secondary">
            这些筛选条件来自候选保存时的 Screener 视图，用于回溯触发本任务的市场切片。
          </Text>
          {selectedTask?.symbol ? (
            <Button
              type="link"
              size="small"
              icon={<LinkOutlined />}
              onClick={handleReopenPricing}
              style={{ alignSelf: 'flex-start', paddingInline: 0 }}
            >
              在定价中重开
            </Button>
          ) : null}
        </Space>
      </Card>
    ) : null}

    {workbenchViewSummary ? (
      <Card size="small" title="当前共享视图上下文" variant="borderless">
        <Space direction="vertical" size={8} style={{ width: '100%' }}>
          <Space wrap>
            <Tag color={workbenchViewSummary.hasActiveFilters ? 'blue' : 'default'}>
              {workbenchViewSummary.hasActiveFilters ? '已带筛选视角' : '完整工作台视图'}
            </Tag>
            <Text strong>{workbenchViewSummary.headline}</Text>
            {workbenchViewSummary.scopedTaskLabel ? (
              <Tag color="processing">{workbenchViewSummary.scopedTaskLabel}</Tag>
            ) : null}
          </Space>
          <Text type="secondary">{workbenchViewSummary.note}</Text>
          {handleCopyViewLink ? (
            <Button type="link" size="small" onClick={handleCopyViewLink} style={{ alignSelf: 'flex-start', paddingInline: 0 }}>
              复制当前视图链接
            </Button>
          ) : null}
        </Space>
      </Card>
    ) : null}

    {selectedTask.type === 'cross_market' || selectedTask.type === 'macro_mispricing' || selectedTask.type === 'trade_thesis' ? (
      <SelectedTaskRefreshPanel selectedTaskRefreshSignal={selectedTaskRefreshSignal} />
    ) : null}

    <Card size="small" title="当前快照" variant="borderless">
      <SnapshotSummary task={selectedTask} />
    </Card>

    <Card size="small" title="历史快照" variant="borderless">
      {latestSnapshotComparison?.lead ? (
        <Alert
          type={latestSnapshotComparison.summary?.[0]?.includes('复核型结果') ? 'warning' : 'info'}
          showIcon
          style={{ marginBottom: 12 }}
          message="最近两版变化摘要"
          description={latestSnapshotComparison.lead}
        />
      ) : null}
      <SnapshotHistoryList task={selectedTask} />
    </Card>
  </>
  );
};

export const WorkbenchTaskEditorSection = ({
  handleMetaSave,
  noteDraft,
  saving,
  setNoteDraft,
  setTitleDraft,
  titleDraft,
}) => (
  <Card size="small" title="任务信息" variant="borderless">
    <Space direction="vertical" size={12} style={{ width: '100%' }}>
      <Input value={titleDraft} onChange={(event) => setTitleDraft(event.target.value)} placeholder="任务标题" />
      <TextArea
        rows={3}
        value={noteDraft}
        onChange={(event) => setNoteDraft(event.target.value)}
        placeholder="补充备注或下一步计划"
      />
      <Button icon={<SaveOutlined />} onClick={handleMetaSave} loading={saving} style={{ alignSelf: 'flex-start' }}>
        保存备注
      </Button>
    </Space>
  </Card>
);

export const WorkbenchTaskActivitySection = ({
  commentDraft,
  handleAddComment,
  handleDeleteComment,
  handleRestoreArchived,
  handleStatusUpdate,
  saving,
  selectedTask,
  selectedTaskPriorityMeta,
  setCommentDraft,
  setShowAllTimeline,
  showAllTimeline,
  timeline,
  timelineItems,
}) => (
  <>
    {selectedTaskPriorityMeta ? (
      <Alert
        type={selectedTaskPriorityMeta.alertType}
        showIcon
        message={`当前自动排序原因：${selectedTaskPriorityMeta.reasonLabel}`}
        description={(
          <Space direction="vertical" size={4} style={{ width: '100%' }}>
            <Text>{selectedTaskPriorityMeta.lead}</Text>
            {selectedTaskPriorityMeta.detail ? <Text type="secondary">{selectedTaskPriorityMeta.detail}</Text> : null}
          </Space>
        )}
      />
    ) : null}

    <Card
      size="small"
      title={(
        <Space>
          <HistoryOutlined />
          <span>研究时间线</span>
        </Space>
      )}
      extra={
        timeline.length > 8 ? (
          <Button type="link" size="small" onClick={() => setShowAllTimeline((prev) => !prev)}>
            {showAllTimeline ? '收起' : '展开更多'}
          </Button>
        ) : null
      }
      variant="borderless"
    >
      {timeline.length ? (
        <Timeline
          items={timelineItems.map((event) => ({
            color: event.color,
            dot: event.dot === 'comment' ? <CommentOutlined /> : <ClockCircleOutlined />,
            children: (
              <Space direction="vertical" size={4} style={{ width: '100%' }}>
                <Space wrap>
                  <Text strong>{event.children.label}</Text>
                  <Tag color={event.children.color}>{event.children.type}</Tag>
                  {event.children.changeLabel ? (
                    <Tag color={event.children.changeColor}>{event.children.changeLabel}</Tag>
                  ) : null}
                  {event.children.snapshotViewSummary ? (
                    <Tag color="green">研究视角</Tag>
                  ) : null}
                  <Text type="secondary">{new Date(event.children.createdAt).toLocaleString()}</Text>
                </Space>
                {event.children.detail ? <Text type="secondary">{event.children.detail}</Text> : null}
                {event.children.snapshotViewSummary ? (
                  <Text type="secondary">工作台视角 {event.children.snapshotViewSummary}</Text>
                ) : null}
                {event.children.snapshotViewFocus ? (
                  <Text type="secondary">{event.children.snapshotViewFocus}</Text>
                ) : null}
                {event.children.snapshotViewNote ? (
                  <Text type="secondary">{event.children.snapshotViewNote}</Text>
                ) : null}
              </Space>
            ),
          }))}
        />
      ) : (
        <Empty description="暂无时间线事件" image={Empty.PRESENTED_IMAGE_SIMPLE} />
      )}
    </Card>

    <Card
      size="small"
      title={(
        <Space>
          <CommentOutlined />
          <span>评论</span>
        </Space>
      )}
      variant="borderless"
    >
      <Space direction="vertical" size={12} style={{ width: '100%' }}>
        <TextArea
          rows={3}
          value={commentDraft}
          onChange={(event) => setCommentDraft(event.target.value)}
          placeholder="记录这一步的判断、风险或下一步动作"
        />
        <Button
          type="primary"
          icon={<CommentOutlined />}
          onClick={handleAddComment}
          loading={saving}
          disabled={!commentDraft.trim()}
          style={{ alignSelf: 'flex-start' }}
        >
          添加评论
        </Button>

        {(selectedTask.comments || []).length ? (
          <List
            size="small"
            dataSource={selectedTask.comments}
            renderItem={(comment) => (
              <List.Item
                actions={[
                  <Button
                    key="delete"
                    type="link"
                    danger
                    size="small"
                    onClick={() => handleDeleteComment(comment.id)}
                  >
                    删除
                  </Button>,
                ]}
              >
                <List.Item.Meta
                  title={(
                    <Space wrap>
                      <Text strong>{comment.author || 'local'}</Text>
                      <Text type="secondary">{new Date(comment.created_at).toLocaleString()}</Text>
                    </Space>
                  )}
                  description={comment.body}
                />
              </List.Item>
            )}
          />
        ) : (
          <Empty description="暂无评论" image={Empty.PRESENTED_IMAGE_SIMPLE} />
        )}
      </Space>
    </Card>

    <Card size="small" title="状态流转" variant="borderless">
      <Space wrap>
        {selectedTask.status === 'archived' ? (
          <Button type="primary" onClick={() => handleRestoreArchived(selectedTask.id)} loading={saving}>
            恢复到新建
          </Button>
        ) : (
          <>
            <Button onClick={() => handleStatusUpdate('new')} loading={saving}>
              放回新建
            </Button>
            <Button onClick={() => handleStatusUpdate('in_progress')} loading={saving}>
              进行中
            </Button>
            <Button onClick={() => handleStatusUpdate('blocked')} loading={saving}>
              阻塞
            </Button>
            <Button type="primary" onClick={() => handleStatusUpdate('complete')} loading={saving}>
              完成
            </Button>
            <Button onClick={() => handleStatusUpdate('archived')} loading={saving}>
              归档
            </Button>
          </>
        )}
      </Space>
    </Card>
  </>
);
