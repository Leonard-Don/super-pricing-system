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
  Tabs,
  Tag,
  Timeline,
  Typography,
} from 'antd';
import {
  ArrowDownOutlined,
  ArrowUpOutlined,
  HistoryOutlined,
  ReloadOutlined,
} from '@ant-design/icons';

import dayjs from '../../utils/dayjs';
import {
  getAltDataMacroBriefing,
  getAltDataMacroBriefingDelta,
  getAltDataMacroBriefingHistory,
} from '../../services/api';

const { Paragraph, Text } = Typography;

const SECTION_DEFINITIONS = [
  { key: 'policy_section', title: '政策面', dataTestid: 'macro-briefing-section-policy' },
  {
    key: 'capital_flow_section',
    title: '资金面',
    dataTestid: 'macro-briefing-section-capital-flow',
  },
  {
    key: 'commodity_section',
    title: '商品面',
    dataTestid: 'macro-briefing-section-commodity',
  },
  {
    key: 'governance_section',
    title: '治理面',
    dataTestid: 'macro-briefing-section-governance',
  },
  {
    key: 'composite_section',
    title: '综合面',
    dataTestid: 'macro-briefing-section-composite',
  },
];

const DELTA_SECTION_DEFINITIONS = [
  {
    key: 'policy_deltas',
    title: '政策面变化',
    dataTestid: 'macro-briefing-delta-section-policy',
  },
  {
    key: 'capital_flow_deltas',
    title: '资金面变化',
    dataTestid: 'macro-briefing-delta-section-capital-flow',
  },
  {
    key: 'commodity_deltas',
    title: '商品面变化',
    dataTestid: 'macro-briefing-delta-section-commodity',
  },
  {
    key: 'governance_deltas',
    title: '治理面变化',
    dataTestid: 'macro-briefing-delta-section-governance',
  },
  {
    key: 'composite_deltas',
    title: '综合面变化',
    dataTestid: 'macro-briefing-delta-section-composite',
  },
];

const SECTION_LABEL_BY_KEY = SECTION_DEFINITIONS.reduce((acc, item) => {
  acc[item.key.replace('_section', '')] = item.title;
  return acc;
}, {});

const TILE_HEADER_STYLE = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
};

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

// Direction → color + icon for the delta tile. Bullish / softened-bullish
// surface as green; bearish / softened-bearish red; categorical (new /
// dropped / reversed) yellow so the eye lands there first.
const DELTA_DIRECTION_PRESETS = {
  intensified_bullish: { color: '#52c41a', icon: ArrowUpOutlined, label: '加强看多' },
  intensified_bearish: { color: '#ff4d4f', icon: ArrowDownOutlined, label: '加深看空' },
  softened_bullish: { color: '#82c43c', icon: ArrowDownOutlined, label: '看多减弱' },
  softened_bearish: { color: '#ff7875', icon: ArrowUpOutlined, label: '看空缓解' },
  reversed_to_bullish: { color: '#faad14', icon: ArrowUpOutlined, label: '反转看多' },
  reversed_to_bearish: { color: '#faad14', icon: ArrowDownOutlined, label: '反转看空' },
  new_today: { color: '#1890ff', icon: ArrowUpOutlined, label: '新增今日' },
  dropped_today: { color: '#bfbfbf', icon: ArrowDownOutlined, label: '昨日已退出' },
  stable: { color: '#bfbfbf', icon: ArrowUpOutlined, label: '稳定' },
};

export function formatBriefingGeneratedAt(value, now = new Date()) {
  if (!value) return '—';
  const parsed = dayjs(value);
  if (!parsed.isValid()) return String(value);
  const diffMin = Math.max(0, dayjs(now).diff(parsed, 'minute'));
  if (diffMin < 1) return 'just now';
  if (diffMin < 60) return `${diffMin} min ago`;
  if (diffMin < 60 * 24) return `${Math.floor(diffMin / 60)} hr ago`;
  return `${Math.floor(diffMin / (60 * 24))} day(s) ago`;
}

function SectionBlock({ definition, bullets, evidenceLinks }) {
  const hasBullets = Array.isArray(bullets) && bullets.length > 0;
  const sectionLinks = (evidenceLinks || []).filter(
    (link) => link?.section === definition.key.replace('_section', ''),
  );
  return (
    <div data-testid={definition.dataTestid} style={{ marginBottom: 16 }}>
      <Space size="small" align="center" style={{ marginBottom: 4 }}>
        <Text strong style={{ color: '#f5f8fc' }}>
          {definition.title}
        </Text>
        {sectionLinks.map((link) => {
          const style = link.stale ? STALE_TAG_STYLE : FRESH_TAG_STYLE;
          return (
            <Tag
              key={`${definition.key}-${link.component}`}
              style={style}
              data-testid={`macro-briefing-evidence-${link.component}`}
            >
              {link.component}
              {link.stale ? ' [stale]' : ''}
            </Tag>
          );
        })}
      </Space>
      {hasBullets ? (
        <List
          size="small"
          dataSource={bullets}
          renderItem={(item, idx) => (
            <List.Item
              key={`${definition.key}-bullet-${idx}`}
              style={{ paddingBlock: 4, color: '#cfd8e3' }}
              data-testid={`${definition.dataTestid}-bullet-${idx}`}
            >
              {item}
            </List.Item>
          )}
        />
      ) : (
        <Text type="secondary">本节暂无信号</Text>
      )}
    </div>
  );
}

function DeltaSectionBlock({ definition, deltas }) {
  const hasDeltas = Array.isArray(deltas) && deltas.length > 0;
  return (
    <div data-testid={definition.dataTestid} style={{ marginBottom: 16 }}>
      <Space size="small" align="center" style={{ marginBottom: 4 }}>
        <Text strong style={{ color: '#f5f8fc' }}>
          {definition.title}
        </Text>
        <Tag>{hasDeltas ? `${deltas.length} 条变化` : '0 条变化'}</Tag>
      </Space>
      {hasDeltas ? (
        <List
          size="small"
          dataSource={deltas}
          renderItem={(item, idx) => {
            const preset =
              DELTA_DIRECTION_PRESETS[item?.direction] ||
              DELTA_DIRECTION_PRESETS.stable;
            const IconComponent = preset.icon;
            return (
              <List.Item
                key={`${definition.key}-delta-${idx}`}
                style={{ paddingBlock: 4, color: '#cfd8e3' }}
                data-testid={`${definition.dataTestid}-delta-${idx}`}
              >
                <Space size="small" align="start">
                  <IconComponent style={{ color: preset.color, marginTop: 4 }} />
                  <span>
                    <Tag
                      style={{
                        color: preset.color,
                        borderColor: preset.color,
                        backgroundColor: 'transparent',
                        marginRight: 6,
                      }}
                    >
                      {preset.label}
                    </Tag>
                    {item?.headline || ''}
                  </span>
                </Space>
              </List.Item>
            );
          }}
        />
      ) : (
        <Text type="secondary">本节昨日至今日无显著变化</Text>
      )}
    </div>
  );
}

function TodayPane({ data }) {
  const hasAnyBullet = useMemo(() => {
    if (!data) return false;
    return SECTION_DEFINITIONS.some(
      (def) => Array.isArray(data[def.key]) && data[def.key].length > 0,
    );
  }, [data]);

  if (!data) return null;

  return (
    <>
      <Paragraph
        data-testid="macro-briefing-summary"
        style={{ color: '#f5f8fc', marginBottom: 16 }}
      >
        {data.summary_paragraph}
      </Paragraph>
      {!hasAnyBullet ? (
        <Empty
          description="所有 section 当前均无内容"
          data-testid="macro-briefing-empty"
        />
      ) : (
        <div>
          {SECTION_DEFINITIONS.map((def) => (
            <SectionBlock
              key={def.key}
              definition={def}
              bullets={data[def.key]}
              evidenceLinks={data.evidence_links}
            />
          ))}
        </div>
      )}
    </>
  );
}

function DeltaPane({ delta, loading, error, onRetry }) {
  if (error) {
    return (
      <Alert
        type="error"
        message="加载日报变化失败"
        description={error}
        showIcon
        data-testid="macro-briefing-delta-error"
        action={
          <Button size="small" onClick={onRetry}>
            重试
          </Button>
        }
      />
    );
  }
  if (loading && !delta) {
    return (
      <div style={{ textAlign: 'center', padding: 24 }}>
        <Spin data-testid="macro-briefing-delta-spinner" />
      </div>
    );
  }
  if (!delta) {
    return (
      <Empty
        description="尚未加载日报变化"
        data-testid="macro-briefing-delta-placeholder"
      />
    );
  }
  if (delta.has_baseline === false) {
    return (
      <Alert
        type="info"
        showIcon
        message={delta.summary_delta || '无昨日 briefing 可对比'}
        description="首日基线或归档缺失时，差分视图将延后启用。"
        data-testid="macro-briefing-delta-cold-start"
      />
    );
  }
  return (
    <>
      <Paragraph
        data-testid="macro-briefing-delta-summary"
        style={{ color: '#f5f8fc', marginBottom: 16 }}
      >
        {delta.summary_delta}
      </Paragraph>
      <div>
        {DELTA_SECTION_DEFINITIONS.map((def) => (
          <DeltaSectionBlock
            key={def.key}
            definition={def}
            deltas={delta[def.key]}
          />
        ))}
      </div>
    </>
  );
}

function buildHistoryEntryKey(entry, occurrence = 0) {
  const archivedAt = entry?.archived_at || 'no-archived-at';
  const originalGeneratedAt =
    entry?.original_generated_at || 'no-original-generated-at';
  const baseKey = `macro-briefing-history|${archivedAt}|${originalGeneratedAt}`;
  return occurrence > 0 ? `${baseKey}|${occurrence}` : baseKey;
}

export default function MacroBriefingTile() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Phase F5.1: delta state (loaded lazily when the user opens the tab).
  const [delta, setDelta] = useState(null);
  const [deltaLoading, setDeltaLoading] = useState(false);
  const [deltaError, setDeltaError] = useState(null);
  const [activeTab, setActiveTab] = useState('today');

  // Phase F5.2: history drawer state. Lazy-loaded only when the user
  // opens the drawer so the tile's initial paint stays fast.
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState(null);
  const [historyData, setHistoryData] = useState(null);

  const fetchBriefing = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const payload = await getAltDataMacroBriefing();
      setData(payload || null);
    } catch (err) {
      setError(err?.userMessage || err?.message || '加载宏观日报失败');
      setData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchDelta = useCallback(async () => {
    setDeltaLoading(true);
    setDeltaError(null);
    try {
      const payload = await getAltDataMacroBriefingDelta();
      setDelta(payload || null);
    } catch (err) {
      setDeltaError(err?.userMessage || err?.message || '加载日报变化失败');
      setDelta(null);
    } finally {
      setDeltaLoading(false);
    }
  }, []);

  const fetchHistory = useCallback(async () => {
    setHistoryLoading(true);
    setHistoryError(null);
    try {
      const payload = await getAltDataMacroBriefingHistory({ days: 7 });
      setHistoryData(payload || null);
    } catch (err) {
      setHistoryError(
        err?.userMessage || err?.message || '加载宏观日报历史失败',
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
    fetchBriefing();
  }, [fetchBriefing]);

  // Lazy-load the delta the first time the user clicks the "vs 昨日" tab.
  useEffect(() => {
    if (activeTab === 'delta' && delta === null && !deltaLoading) {
      fetchDelta();
    }
  }, [activeTab, delta, deltaLoading, fetchDelta]);

  const handleRefresh = useCallback(() => {
    if (activeTab === 'delta') {
      fetchDelta();
    } else {
      fetchBriefing();
    }
  }, [activeTab, fetchBriefing, fetchDelta]);

  const auditDocUrl = data?.audit_doc_url || 'docs/alt_data_audit.md';
  const generatedLabel = useMemo(
    () => formatBriefingGeneratedAt(data?.generated_at),
    [data?.generated_at],
  );

  // Build the Antd Timeline items from the history payload. The backend
  // sorts newest-first; this only re-shapes for rendering.
  const historyTimelineItems = useMemo(() => {
    if (!historyData) return [];
    const archives = Array.isArray(historyData.archives) ? historyData.archives : [];
    const seenKeys = new Map();
    return archives.map((entry, idx) => {
      const archivedAt = entry?.archived_at;
      const parsed = archivedAt ? dayjs(archivedAt) : null;
      const stamp =
        parsed && parsed.isValid() ? parsed.format('YYYY-MM-DD HH:mm') : '—';
      const summary = entry?.summary_paragraph || '（无摘要）';
      const window = entry?.time_window_days ?? 7;
      const evidenceCount =
        typeof entry?.evidence_links_count === 'number'
          ? entry.evidence_links_count
          : Array.isArray(entry?.evidence_links)
            ? entry.evidence_links.length
            : 0;
      const baseKey = buildHistoryEntryKey(entry);
      const occurrence = seenKeys.get(baseKey) || 0;
      seenKeys.set(baseKey, occurrence + 1);
      return {
        key: buildHistoryEntryKey(entry, occurrence),
        children: (
          <div data-testid={`macro-briefing-history-entry-${idx}`}>
            <Space size="small" wrap>
              <Text strong style={{ color: '#f5f8fc' }}>
                {stamp}
              </Text>
              <Tag>窗口 {window} 天</Tag>
              <Text type="secondary">证据 {evidenceCount} 条</Text>
            </Space>
            <Paragraph
              style={{ color: '#cfd8e3', marginTop: 6, marginBottom: 0 }}
              ellipsis={{ rows: 3, tooltip: summary }}
            >
              {summary}
            </Paragraph>
          </div>
        ),
      };
    });
  }, [historyData]);

  const historyHasContent = historyTimelineItems.length > 0;

  const tabItems = useMemo(
    () => [
      {
        key: 'today',
        label: <span data-testid="macro-briefing-tab-today">今日</span>,
        children: <TodayPane data={data} />,
      },
      {
        key: 'delta',
        label: <span data-testid="macro-briefing-tab-delta">vs 昨日</span>,
        children: (
          <DeltaPane
            delta={delta}
            loading={deltaLoading}
            error={deltaError}
            onRetry={fetchDelta}
          />
        ),
      },
    ],
    [data, delta, deltaLoading, deltaError, fetchDelta],
  );

  return (
    <>
    <Card
      title={
        <div style={TILE_HEADER_STYLE}>
          <Space>
            <Text strong style={{ color: '#f5f8fc' }}>
              另类数据宏观日报
            </Text>
            <Tag>窗口 {data?.time_window_days ?? 7} 天</Tag>
            <Text type="secondary">生成于 {generatedLabel}</Text>
          </Space>
          <Space>
            <Button
              size="small"
              icon={<HistoryOutlined />}
              onClick={openHistory}
              data-testid="macro-briefing-history-button"
            >
              查看本周历史
            </Button>
            <Button
              size="small"
              icon={<ReloadOutlined />}
              onClick={handleRefresh}
              loading={loading || deltaLoading}
              data-testid="macro-briefing-refresh"
            >
              刷新
            </Button>
            <a href={auditDocUrl} target="_blank" rel="noreferrer">
              审计文档
            </a>
          </Space>
        </div>
      }
      data-testid="alt-data-macro-briefing-tile"
      styles={{ body: { paddingTop: 8 } }}
    >
      {error ? (
        <Alert
          type="error"
          message="加载宏观日报失败"
          description={error}
          showIcon
          data-testid="macro-briefing-error"
        />
      ) : null}

      {loading && !data ? (
        <div style={{ textAlign: 'center', padding: 24 }}>
          <Spin data-testid="macro-briefing-spinner" />
        </div>
      ) : null}

      {data ? (
        <Tabs
          activeKey={activeTab}
          onChange={setActiveTab}
          items={tabItems}
          data-testid="macro-briefing-tabs"
        />
      ) : null}

      {/* expose machine-readable section-label map for downstream consumers
          that want to translate snake_case section keys to display labels */}
      <span hidden data-testid="macro-briefing-section-label-map">
        {JSON.stringify(SECTION_LABEL_BY_KEY)}
      </span>
    </Card>
    <Drawer
      title="另类数据宏观日报 · 本周历史"
      placement="right"
      width={520}
      open={historyOpen}
      onClose={closeHistory}
      data-testid="macro-briefing-history-drawer"
      destroyOnClose
    >
      {historyError ? (
        <Alert
          type="error"
          showIcon
          message="无法加载历史归档"
          description={historyError}
          data-testid="macro-briefing-history-error"
        />
      ) : historyLoading ? (
        <div
          style={{
            minHeight: 200,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Spin size="large" />
        </div>
      ) : !historyHasContent ? (
        <Empty
          description="尚无历史归档"
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          data-testid="macro-briefing-history-empty"
        />
      ) : (
        <Timeline
          mode="left"
          data-testid="macro-briefing-history-timeline"
          items={historyTimelineItems}
        />
      )}
    </Drawer>
    </>
  );
}
