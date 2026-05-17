import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Badge,
  Button,
  Card,
  Dropdown,
  Empty,
  List,
  Space,
  Spin,
  Tag,
  Tooltip,
  Typography,
  message as antdMessage,
} from 'antd';
import { ReloadOutlined } from '@ant-design/icons';

import dayjs from '../../utils/dayjs';
import { getApiErrorMessage } from '../../utils/messageApi';
import {
  convertAltDataCandidate,
  dismissAltDataCandidate,
  listAltDataCandidates,
  refreshAltDataCandidates,
  snoozeAltDataCandidate,
} from '../../services/api/research';

const { Text, Title } = Typography;

const SOURCE_TAG_COLOR = {
  policy_radar: 'gold',
  macro_hf: 'cyan',
};

function formatGeneratedAt(value) {
  if (!value) {
    return '—';
  }
  const parsed = dayjs(value);
  if (!parsed.isValid()) {
    return String(value);
  }
  const diffMin = Math.max(0, dayjs().diff(parsed, 'minute'));
  if (diffMin < 1) {
    return 'just now';
  }
  if (diffMin < 60) {
    return `${diffMin} min ago`;
  }
  if (diffMin < 60 * 24) {
    return `${Math.floor(diffMin / 60)} hr ago`;
  }
  const days = Math.floor(diffMin / (60 * 24));
  return `${days} day${days === 1 ? '' : 's'} ago`;
}

function formatImpact(candidate) {
  const score = Number(candidate.impact_score || 0);
  if (candidate.source_component === 'macro_hf') {
    return `${score >= 0 ? '+' : ''}${score.toFixed(2)}% 周环比`;
  }
  return `avg_impact=${score >= 0 ? '+' : ''}${score.toFixed(2)}`;
}

function sourceTag(candidate) {
  const color = SOURCE_TAG_COLOR[candidate.source_component] || 'default';
  return (
    <Tag color={color} data-testid={`alt-data-candidate-source-${candidate.source_component}`}>
      {candidate.source_component}
    </Tag>
  );
}

function AltDataCandidateQueue({
  onTaskCreated,
  apiOverrides,
  messageApi,
}) {
  const message = messageApi || antdMessage;
  const apis = useMemo(
    () => ({
      list: apiOverrides?.list || listAltDataCandidates,
      refresh: apiOverrides?.refresh || refreshAltDataCandidates,
      convert: apiOverrides?.convert || convertAltDataCandidate,
      dismiss: apiOverrides?.dismiss || dismissAltDataCandidate,
      snooze: apiOverrides?.snooze || snoozeAltDataCandidate,
    }),
    [apiOverrides],
  );

  const [candidates, setCandidates] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [pendingActionId, setPendingActionId] = useState(null);

  const loadCandidates = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await apis.list({ state: 'pending' });
      const data = Array.isArray(result?.data) ? result.data : [];
      setCandidates(data);
    } catch (exc) {
      setError(getApiErrorMessage(exc, '加载另类数据候选失败'));
    } finally {
      setLoading(false);
    }
  }, [apis]);

  useEffect(() => {
    loadCandidates();
  }, [loadCandidates]);

  const handleRefresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await apis.refresh();
      const data = Array.isArray(result?.data?.pending) ? result.data.pending : [];
      setCandidates(data);
      const stats = result?.data?.stats || {};
      const summary = `新增 ${stats.added || 0} / 更新 ${stats.updated || 0} / 清理 ${stats.pruned || 0}`;
      if (message?.success) {
        message.success(`另类数据候选已刷新：${summary}`);
      }
    } catch (exc) {
      setError(getApiErrorMessage(exc, '刷新另类数据候选失败'));
    } finally {
      setLoading(false);
    }
  }, [apis, message]);

  const handleConvert = useCallback(
    async (candidate) => {
      setPendingActionId(candidate.candidate_id);
      try {
        const result = await apis.convert(candidate.candidate_id);
        const taskId = result?.data?.task_id || '';
        if (message?.success) {
          message.success(`已生成研究卡 ${taskId || ''}`);
        }
        if (onTaskCreated) {
          onTaskCreated(result?.data?.task || null, candidate);
        }
        await loadCandidates();
      } catch (exc) {
        const detail = getApiErrorMessage(exc, '转为研究卡失败');
        if (message?.error) {
          message.error(detail);
        }
        setError(detail);
      } finally {
        setPendingActionId(null);
      }
    },
    [apis, loadCandidates, message, onTaskCreated],
  );

  const handleDismiss = useCallback(
    async (candidate) => {
      setPendingActionId(candidate.candidate_id);
      try {
        await apis.dismiss(candidate.candidate_id);
        if (message?.success) {
          message.success('已忽略该候选');
        }
        await loadCandidates();
      } catch (exc) {
        const detail = getApiErrorMessage(exc, '忽略候选失败');
        if (message?.error) {
          message.error(detail);
        }
        setError(detail);
      } finally {
        setPendingActionId(null);
      }
    },
    [apis, loadCandidates, message],
  );

  const handleSnooze = useCallback(
    async (candidate, hours) => {
      setPendingActionId(candidate.candidate_id);
      try {
        await apis.snooze(candidate.candidate_id, hours);
        if (message?.success) {
          message.success(`已延后 ${hours} 小时`);
        }
        await loadCandidates();
      } catch (exc) {
        const detail = getApiErrorMessage(exc, '延后候选失败');
        if (message?.error) {
          message.error(detail);
        }
        setError(detail);
      } finally {
        setPendingActionId(null);
      }
    },
    [apis, loadCandidates, message],
  );

  const candidateCount = candidates.length;

  return (
    <Card
      data-testid="alt-data-candidate-queue"
      className="workbench-alt-data-candidate-queue"
      variant="borderless"
      title={
        <Space size={8} align="center">
          <Title level={5} style={{ margin: 0 }}>
            另类数据候选
          </Title>
          <Badge
            count={candidateCount}
            showZero
            style={{ backgroundColor: candidateCount ? '#fa8c16' : '#bfbfbf' }}
            data-testid="alt-data-candidate-queue-count"
          />
        </Space>
      }
      extra={
        <Tooltip title="刷新候选队列（基于最新另类数据信号）">
          <Button
            size="small"
            icon={<ReloadOutlined />}
            onClick={handleRefresh}
            loading={loading}
            data-testid="alt-data-candidate-queue-refresh"
          >
            刷新
          </Button>
        </Tooltip>
      }
    >
      {error ? (
        <Alert
          type="error"
          showIcon
          message={error}
          data-testid="alt-data-candidate-queue-error"
          style={{ marginBottom: 12 }}
        />
      ) : null}

      {loading && !candidates.length ? (
        <div style={{ textAlign: 'center', padding: '24px 0' }}>
          <Spin />
        </div>
      ) : null}

      {!loading && !candidates.length && !error ? (
        <Empty
          description="暂无另类数据候选 — 等待下一次信号生成"
          data-testid="alt-data-candidate-queue-empty"
        />
      ) : null}

      <List
        dataSource={candidates}
        locale={{ emptyText: null }}
        renderItem={(candidate) => {
          const isBusy = pendingActionId === candidate.candidate_id;
          return (
            <List.Item
              key={candidate.candidate_id}
              data-testid={`alt-data-candidate-row-${candidate.candidate_id}`}
              actions={[
                <Button
                  key="convert"
                  type="primary"
                  size="small"
                  disabled={isBusy}
                  onClick={() => handleConvert(candidate)}
                  data-testid={`alt-data-candidate-convert-${candidate.candidate_id}`}
                >
                  转研究卡
                </Button>,
                <Button
                  key="dismiss"
                  size="small"
                  disabled={isBusy}
                  onClick={() => handleDismiss(candidate)}
                  data-testid={`alt-data-candidate-dismiss-${candidate.candidate_id}`}
                >
                  忽略
                </Button>,
                <Dropdown
                  key="snooze"
                  trigger={['click']}
                  menu={{
                    items: [
                      {
                        key: 'snooze-1h',
                        label: '延后 1 小时',
                        'data-testid': `alt-data-candidate-snooze-1h-${candidate.candidate_id}`,
                        onClick: () => handleSnooze(candidate, 1),
                      },
                      {
                        key: 'snooze-24h',
                        label: '延后 24 小时',
                        'data-testid': `alt-data-candidate-snooze-24h-${candidate.candidate_id}`,
                        onClick: () => handleSnooze(candidate, 24),
                      },
                    ],
                  }}
                >
                  <Button
                    size="small"
                    disabled={isBusy}
                    data-testid={`alt-data-candidate-snooze-${candidate.candidate_id}`}
                  >
                    snooze
                  </Button>
                </Dropdown>,
              ]}
            >
              <List.Item.Meta
                title={
                  <Space size={6} wrap>
                    {sourceTag(candidate)}
                    <Text strong>{candidate.headline}</Text>
                  </Space>
                }
                description={
                  <Space size={12} wrap>
                    <Text type="secondary" data-testid={`alt-data-candidate-impact-${candidate.candidate_id}`}>
                      {formatImpact(candidate)}
                    </Text>
                    <Text type="secondary" data-testid={`alt-data-candidate-mentions-${candidate.candidate_id}`}>
                      mentions={candidate.mentions}
                    </Text>
                    <Text type="secondary" data-testid={`alt-data-candidate-generated-${candidate.candidate_id}`}>
                      {formatGeneratedAt(candidate.generated_at)}
                    </Text>
                  </Space>
                }
              />
            </List.Item>
          );
        }}
      />
    </Card>
  );
}

export default AltDataCandidateQueue;
