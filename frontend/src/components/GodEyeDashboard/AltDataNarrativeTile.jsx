import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Button,
  Card,
  Drawer,
  Empty,
  List,
  Space,
  Spin,
  Tag,
  Timeline,
  Typography,
} from 'antd';
import { HistoryOutlined, ReloadOutlined } from '@ant-design/icons';

import dayjs from '../../utils/dayjs';
import {
  getAltDataNarrative,
  getAltDataNarrativeHistory,
} from '../../services/api';

const { Paragraph, Text } = Typography;

const STALE_TAG_STYLE = {
  backgroundColor: 'rgba(255, 77, 79, 0.18)',
  color: '#ff4d4f',
  borderColor: '#ff4d4f',
};

const FRESH_TAG_STYLE = {
  backgroundColor: 'rgba(82, 196, 26, 0.18)',
  color: '#52c41a',
  borderColor: '#52c41a',
};

const VERDICT_COLOR = {
  PRODUCTION: 'green',
  'WORKING-PROTOTYPE': 'gold',
  'SCAFFOLDING-ONLY': 'orange',
  DEAD: 'red',
  DERIVED: 'blue',
};

export function formatGeneratedAt(value, now = new Date()) {
  if (!value) {
    return '—';
  }
  const parsed = dayjs(value);
  if (!parsed.isValid()) {
    return String(value);
  }
  const diffMinutes = Math.max(0, dayjs(now).diff(parsed, 'minute'));
  if (diffMinutes < 1) {
    return 'just now';
  }
  if (diffMinutes < 60) {
    return `${diffMinutes} min ago`;
  }
  if (diffMinutes < 60 * 24) {
    return `${Math.floor(diffMinutes / 60)} hr ago`;
  }
  const days = Math.floor(diffMinutes / (60 * 24));
  return `${days} day${days === 1 ? '' : 's'} ago`;
}

function normalizeHistoryKeyPart(value, fallback) {
  const text = value === null || value === undefined ? '' : String(value).trim();
  return text || fallback;
}

export function buildNarrativeHistoryEntryKey(entry = {}, occurrence = 0) {
  const baseKey = [
    'narrative-history',
    normalizeHistoryKeyPart(entry?.archived_at, 'no-archived-at'),
    normalizeHistoryKeyPart(entry?.original_generated_at, 'no-original-generated-at'),
    normalizeHistoryKeyPart(entry?.industry, 'global'),
    normalizeHistoryKeyPart(entry?.summary, 'no-summary'),
  ].join('|');
  return occurrence > 0 ? `${baseKey}|${occurrence}` : baseKey;
}

export default function AltDataNarrativeTile() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Phase E4: history drawer state. Lazy-loaded only when the user opens
  // the drawer so the tile's initial paint stays fast.
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState(null);
  const [historyData, setHistoryData] = useState(null);

  const fetchNarrative = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const payload = await getAltDataNarrative();
      setData(payload || null);
    } catch (err) {
      setError(err?.userMessage || err?.message || '加载另类数据要点摘要失败');
      setData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchHistory = useCallback(async () => {
    setHistoryLoading(true);
    setHistoryError(null);
    try {
      const payload = await getAltDataNarrativeHistory({ days: 14 });
      setHistoryData(payload || null);
    } catch (err) {
      setHistoryError(
        err?.userMessage || err?.message || '加载另类数据要点摘要历史失败'
      );
      setHistoryData(null);
    } finally {
      setHistoryLoading(false);
    }
  }, []);

  const openHistory = useCallback(() => {
    setHistoryOpen(true);
    fetchHistory();
  }, [fetchHistory]);

  const closeHistory = useCallback(() => {
    setHistoryOpen(false);
  }, []);

  useEffect(() => {
    fetchNarrative();
  }, [fetchNarrative]);

  const auditDocUrl = data?.audit_doc_url || 'docs/alt_data_audit.md';
  const generatedAtLabel = useMemo(
    () => formatGeneratedAt(data?.generated_at),
    [data?.generated_at]
  );

  const bullets = useMemo(() => {
    if (!data) return [];
    const list = Array.isArray(data.bullets) ? data.bullets : [];
    const links = Array.isArray(data.evidence_links) ? data.evidence_links : [];
    return list.map((text, idx) => ({
      key: `bullet-${idx}`,
      text,
      evidence: links[idx] || null,
    }));
  }, [data]);

  const hasContent = !!data && (data.bullets || []).length > 0;

  // Build the Antd Timeline items from the history payload. Sorted
  // newest-first by the backend; this only re-shapes for rendering.
  const historyTimelineItems = useMemo(() => {
    if (!historyData) return [];
    const archives = Array.isArray(historyData.archives) ? historyData.archives : [];
    const seenKeys = new Map();
    return archives.map((entry, idx) => {
      const archivedAt = entry?.archived_at;
      const parsed = archivedAt ? dayjs(archivedAt) : null;
      const stamp =
        parsed && parsed.isValid() ? parsed.format('YYYY-MM-DD HH:mm') : '—';
      const industryLabel = entry?.industry || '全局';
      const baseKey = buildNarrativeHistoryEntryKey(entry);
      const occurrence = seenKeys.get(baseKey) || 0;
      seenKeys.set(baseKey, occurrence + 1);
      return {
        key: buildNarrativeHistoryEntryKey(entry, occurrence),
        children: (
          <div data-testid={`alt-data-narrative-history-entry-${idx}`}>
            <Text strong style={{ color: '#f5f8fc' }}>
              {stamp}
            </Text>
            <Tag style={{ marginLeft: 8 }}>{industryLabel}</Tag>
            <div style={{ marginTop: 6, color: '#cfd8e3' }}>
              {entry?.summary || ''}
            </div>
          </div>
        ),
      };
    });
  }, [historyData]);

  const historyHasContent = historyTimelineItems.length > 0;

  return (
    <>
    <Card
      title="今日另类数据要点"
      data-testid="alt-data-narrative-tile"
      extra={(
        <Space>
          {data?.generated_at && (
            <Text type="secondary" data-testid="alt-data-narrative-generated">
              生成于 {generatedAtLabel}
            </Text>
          )}
          <Button
            icon={<HistoryOutlined />}
            size="small"
            onClick={openHistory}
            data-testid="alt-data-narrative-history-button"
          >
            查看历史
          </Button>
          <Button
            icon={<ReloadOutlined />}
            size="small"
            onClick={fetchNarrative}
            loading={loading}
            data-testid="alt-data-narrative-refresh"
          >
            刷新
          </Button>
        </Space>
      )}
      styles={{ body: { minHeight: 200 } }}
    >
      {error ? (
        <Alert
          type="error"
          showIcon
          message="无法加载另类数据要点摘要"
          description={error}
          data-testid="alt-data-narrative-error"
        />
      ) : loading && !data ? (
        <div style={{ minHeight: 160, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Spin size="large" />
        </div>
      ) : !hasContent ? (
        <Empty description="alt-data 暂无信号" image={Empty.PRESENTED_IMAGE_SIMPLE} />
      ) : (
        <>
          <Paragraph
            data-testid="alt-data-narrative-summary"
            style={{ fontSize: 15, lineHeight: 1.7, marginBottom: 16, color: '#f5f8fc' }}
          >
            {data.summary}
          </Paragraph>
          {bullets.length > 0 && (
            <List
              size="small"
              data-testid="alt-data-narrative-bullets"
              dataSource={bullets}
              renderItem={(item) => {
                const evidence = item.evidence || {};
                const stale = !!evidence.stale;
                const verdict = evidence.verdict || 'UNKNOWN';
                return (
                  <List.Item
                    key={item.key}
                    style={{ paddingLeft: 0, paddingRight: 0 }}
                    data-testid={`alt-data-narrative-bullet-${verdict}`}
                  >
                    <Space direction="vertical" size={4} style={{ width: '100%' }}>
                      <Text style={{ color: '#f5f8fc' }}>{item.text}</Text>
                      {evidence.component && (
                        <Space size={8} wrap>
                          <Tag color={VERDICT_COLOR[verdict] || 'default'}>
                            {verdict}
                          </Tag>
                          <Tag
                            style={stale ? STALE_TAG_STYLE : FRESH_TAG_STYLE}
                            data-testid={`alt-data-narrative-stale-${stale ? 'stale' : 'fresh'}`}
                          >
                            {stale ? '[stale]' : '[fresh]'}
                          </Tag>
                          {evidence.snapshot_path && (
                            <a
                              href={evidence.snapshot_path}
                              target="_blank"
                              rel="noreferrer noopener"
                              data-testid={`alt-data-narrative-link-${evidence.component}`}
                            >
                              {evidence.component} 证据链路
                            </a>
                          )}
                        </Space>
                      )}
                    </Space>
                  </List.Item>
                );
              }}
            />
          )}
          <Space style={{ marginTop: 12, width: '100%', justifyContent: 'flex-end' }} wrap>
            <Text type="secondary">
              完整审计见{' '}
              <a href={auditDocUrl} target="_blank" rel="noreferrer noopener">
                {auditDocUrl}
              </a>
            </Text>
          </Space>
        </>
      )}
    </Card>
    <Drawer
      title="另类数据要点摘要 · 14 日趋势"
      placement="right"
      width={520}
      open={historyOpen}
      onClose={closeHistory}
      data-testid="alt-data-narrative-history-drawer"
      destroyOnClose
    >
      {historyError ? (
        <Alert
          type="error"
          showIcon
          message="无法加载历史归档"
          description={historyError}
          data-testid="alt-data-narrative-history-error"
        />
      ) : historyLoading ? (
        <div style={{ minHeight: 200, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Spin size="large" />
        </div>
      ) : !historyHasContent ? (
        <Empty
          description="尚无历史归档"
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          data-testid="alt-data-narrative-history-empty"
        />
      ) : (
        <Timeline
          mode="left"
          data-testid="alt-data-narrative-history-timeline"
          items={historyTimelineItems}
        />
      )}
    </Drawer>
    </>
  );
}
