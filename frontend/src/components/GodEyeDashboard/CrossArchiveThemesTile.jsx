import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Button,
  Card,
  Empty,
  List,
  Space,
  Spin,
  Tag,
  Typography,
} from 'antd';
import { ReloadOutlined } from '@ant-design/icons';

import { getAltDataCrossArchiveThemes } from '../../services/api';

const { Text } = Typography;

// Conviction tier → coloured tag for the headline + stars for compact
// rendering. Keeps the visual language identical to the upstream
// CompositeSignalTile so an analyst can scan the dashboard without
// re-learning the per-tile glyph vocabulary.
const CONVICTION_TAG_COLOR = {
  high: 'green',
  medium: 'gold',
  low: 'orange',
};

const CONVICTION_STARS = {
  high: '★★★',
  medium: '★★',
  low: '★',
};

// Trend direction → coloured tag. ``mixed`` shows up when the composite
// archive saw bullish + bearish rows for the same industry over the
// window, which is itself a useful signal.
const DIRECTION_TAG_COLOR = {
  bullish: 'green',
  bearish: 'red',
  mixed: 'gold',
  neutral: 'default',
};

const DIRECTION_LABEL = {
  bullish: '看多',
  bearish: '看空',
  mixed: '多空互现',
  neutral: '方向中性',
};

// Friendly labels for the archive keys we surface inline. The detector
// returns the raw archive keys; the UI translates them so analysts who
// haven't read the Phase F4.1 / F5.2 architecture writeups still grok
// which underlying surface contributed.
const ARCHIVE_LABEL = {
  narrative: '叙事归档',
  composite: '复合信号归档',
  macro_briefing: '宏观日报归档',
};

const TILE_HEADER_STYLE = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
};

function ThemeRow({ theme, index }) {
  const conviction = theme?.conviction || 'low';
  const direction = theme?.trend_direction || 'neutral';
  const archives = Array.isArray(theme?.supporting_archives)
    ? theme.supporting_archives
    : [];
  const rowKey = `cross-archive-theme-${theme?.industry || 'unknown'}-${index}`;
  return (
    <div
      key={rowKey}
      data-testid={`cross-archive-theme-row-${index}`}
      style={{
        padding: '10px 0',
        borderBottom: '1px solid rgba(245, 248, 252, 0.08)',
      }}
    >
      <Space size="middle" wrap>
        <Text strong style={{ color: '#f5f8fc', fontSize: 16 }}>
          {theme?.industry || '—'}
        </Text>
        <Tag
          color={CONVICTION_TAG_COLOR[conviction] || 'default'}
          data-testid={`cross-archive-conviction-${conviction}`}
        >
          {CONVICTION_STARS[conviction] || '★'} {String(conviction).toUpperCase()}
        </Tag>
        <Tag color={DIRECTION_TAG_COLOR[direction] || 'default'}>
          {DIRECTION_LABEL[direction] || direction}
        </Tag>
        <Text type="secondary">
          综合可见 {Number(theme?.days_in_narrative || 0) +
            Number(theme?.days_in_composite || 0) +
            Number(theme?.days_in_macro_briefing || 0)} 天
        </Text>
      </Space>
      <div style={{ marginTop: 6 }}>
        <Space size="small" wrap>
          <Tag
            data-testid={`cross-archive-days-narrative-${index}`}
            style={{ marginInlineEnd: 0 }}
          >
            叙事 {theme?.days_in_narrative || 0} 天
          </Tag>
          <Tag
            data-testid={`cross-archive-days-composite-${index}`}
            style={{ marginInlineEnd: 0 }}
          >
            复合 {theme?.days_in_composite || 0} 天
          </Tag>
          <Tag
            data-testid={`cross-archive-days-macro-${index}`}
            style={{ marginInlineEnd: 0 }}
          >
            日报 {theme?.days_in_macro_briefing || 0} 天
          </Tag>
        </Space>
      </div>
      {archives.length > 0 ? (
        <div style={{ marginTop: 6 }}>
          <Text type="secondary" style={{ fontSize: 12 }}>
            来源:{' '}
            {archives
              .map((archive) => ARCHIVE_LABEL[archive] || archive)
              .join(' · ')}
          </Text>
        </div>
      ) : null}
    </div>
  );
}

export default function CrossArchiveThemesTile() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [data, setData] = useState(null);

  const fetchThemes = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // Always request the full "low or better" set so the UI can render
      // every tier inline; the tile only displays the top slice but keeps
      // the lower-tier rows available for the tier-summary footer.
      const payload = await getAltDataCrossArchiveThemes({
        days_window: 14,
        min_conviction: 'low',
      });
      setData(payload || null);
    } catch (err) {
      setError(err?.userMessage || err?.message || '加载跨归档主题失败');
      setData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchThemes();
  }, [fetchThemes]);

  const auditDocUrl = data?.audit_doc_url || 'docs/alt_data_audit.md';
  const tierSummary = data?.tier_summary || null;

  const { highThemes, mediumThemes, lowThemes } = useMemo(() => {
    if (!data) {
      return { highThemes: [], mediumThemes: [], lowThemes: [] };
    }
    const list = Array.isArray(data.themes) ? data.themes : [];
    return {
      highThemes: list.filter((t) => t?.conviction === 'high').slice(0, 5),
      mediumThemes: list.filter((t) => t?.conviction === 'medium').slice(0, 5),
      lowThemes: list.filter((t) => t?.conviction === 'low').slice(0, 5),
    };
  }, [data]);

  const hasContent =
    highThemes.length > 0 || mediumThemes.length > 0 || lowThemes.length > 0;

  return (
    <Card
      title={
        <div style={TILE_HEADER_STYLE}>
          <Space>
            <Text strong style={{ color: '#f5f8fc' }}>
              跨归档高置信叙事
            </Text>
            {tierSummary ? (
              <Space size={6}>
                <Tag color="green" data-testid="cross-archive-tier-high">
                  HIGH {tierSummary.high}
                </Tag>
                <Tag color="gold" data-testid="cross-archive-tier-medium">
                  MED {tierSummary.medium}
                </Tag>
                <Tag data-testid="cross-archive-tier-low">
                  LOW {tierSummary.low}
                </Tag>
              </Space>
            ) : null}
          </Space>
          <Space>
            <Button
              size="small"
              icon={<ReloadOutlined />}
              onClick={fetchThemes}
              loading={loading}
              data-testid="cross-archive-themes-refresh"
            >
              刷新
            </Button>
            <a href={auditDocUrl} target="_blank" rel="noreferrer">
              审计文档
            </a>
          </Space>
        </div>
      }
      data-testid="cross-archive-themes-tile"
      styles={{ body: { paddingTop: 8 } }}
    >
      {error ? (
        <Alert
          type="error"
          message="加载跨归档主题失败"
          description={error}
          showIcon
          data-testid="cross-archive-themes-error"
        />
      ) : null}
      {loading && !data ? (
        <div style={{ textAlign: 'center', padding: 24 }}>
          <Spin data-testid="cross-archive-themes-spinner" />
        </div>
      ) : null}
      {!loading && !error && !hasContent ? (
        <Empty
          description="当前 3 个归档暂未在多档共振出长期叙事"
          data-testid="cross-archive-themes-empty"
        />
      ) : null}
      {hasContent ? (
        <>
          {highThemes.length > 0 ? (
            <div
              data-testid="cross-archive-themes-section-high"
              style={{ marginBottom: 12 }}
            >
              <Text strong style={{ color: '#52c41a' }}>
                高置信（HIGH · 3 档共振）
              </Text>
              <List
                size="small"
                dataSource={highThemes}
                renderItem={(theme, idx) => (
                  <List.Item style={{ padding: 0, border: 'none' }}>
                    <ThemeRow theme={theme} index={idx} />
                  </List.Item>
                )}
              />
            </div>
          ) : null}
          {mediumThemes.length > 0 ? (
            <div
              data-testid="cross-archive-themes-section-medium"
              style={{ marginBottom: 12 }}
            >
              <Text strong style={{ color: '#faad14' }}>
                中等（MEDIUM · 2 档共振）
              </Text>
              <List
                size="small"
                dataSource={mediumThemes}
                renderItem={(theme, idx) => (
                  <List.Item style={{ padding: 0, border: 'none' }}>
                    <ThemeRow theme={theme} index={idx + highThemes.length} />
                  </List.Item>
                )}
              />
            </div>
          ) : null}
          {lowThemes.length > 0 ? (
            <div data-testid="cross-archive-themes-section-low">
              <Text type="secondary">单档持续（LOW · 仅 1 档但 ≥5 天）</Text>
              <List
                size="small"
                dataSource={lowThemes}
                renderItem={(theme, idx) => (
                  <List.Item style={{ padding: 0, border: 'none' }}>
                    <ThemeRow
                      theme={theme}
                      index={idx + highThemes.length + mediumThemes.length}
                    />
                  </List.Item>
                )}
              />
            </div>
          ) : null}
        </>
      ) : null}
    </Card>
  );
}
