import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Button,
  Card,
  Col,
  Empty,
  Row,
  Space,
  Spin,
  Tag,
  Typography,
} from 'antd';
import { ReloadOutlined } from '@ant-design/icons';

import { getCompositeSignals } from '../../services/api';

const { Text } = Typography;

const CONVICTION_TAG_COLOR = {
  high: 'green',
  medium: 'gold',
  low: 'orange',
};

const DIRECTION_TAG_COLOR = {
  bullish: 'green',
  bearish: 'red',
};

const CONVICTION_STARS = {
  high: '★★★',
  medium: '★★',
  low: '★',
};

const TILE_HEADER_STYLE = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
};

function ComponentList({ components }) {
  if (!Array.isArray(components) || components.length === 0) {
    return <Text type="secondary">无支撑组件</Text>;
  }
  return (
    <Space size={4} wrap>
      {components.map((entry) => (
        <Tag key={entry.component} style={{ marginInlineEnd: 0 }}>
          {entry.component}
        </Tag>
      ))}
    </Space>
  );
}

function CompositeRow({ signal, index, side }) {
  const conviction = signal?.conviction || 'low';
  const direction = signal?.direction || 'bullish';
  const components = Array.isArray(signal?.supporting_components)
    ? signal.supporting_components
    : [];
  const rowKey = `${side}-${signal?.target || 'unknown'}-${index}`;
  return (
    <div
      key={rowKey}
      data-testid={`composite-signal-row-${side}-${index}`}
      style={{
        padding: '8px 0',
        borderBottom: '1px solid rgba(245, 248, 252, 0.08)',
      }}
    >
      <Space size="middle" wrap>
        <Text strong style={{ color: '#f5f8fc' }}>
          {signal?.target || '—'}
        </Text>
        <Tag color={DIRECTION_TAG_COLOR[direction] || 'default'}>
          {direction === 'bullish' ? '看多' : '看空'}
        </Tag>
        <Tag
          color={CONVICTION_TAG_COLOR[conviction] || 'default'}
          data-testid={`composite-signal-conviction-${conviction}`}
        >
          {CONVICTION_STARS[conviction] || '★'} {conviction}
        </Tag>
        <Text type="secondary">
          强度 {Number(signal?.aggregate_strength || 0).toFixed(2)}
        </Text>
      </Space>
      <div style={{ marginTop: 4 }}>
        <ComponentList components={components} />
      </div>
    </div>
  );
}

export default function CompositeSignalTile() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [data, setData] = useState(null);

  const fetchSignals = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // Always request the full "low or better" set so we can render both
      // bullish + bearish ladders even when only a couple of high-conviction
      // signals are present. The UI then renders the top 5 of each side.
      const payload = await getCompositeSignals({
        min_conviction: 'low',
        limit: 50,
      });
      setData(payload || null);
    } catch (err) {
      setError(err?.userMessage || err?.message || '加载复合信号失败');
      setData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSignals();
  }, [fetchSignals]);

  const auditDocUrl = data?.audit_doc_url || 'docs/alt_data_audit.md';

  const { topBullish, topBearish, tierSummary } = useMemo(() => {
    if (!data) {
      return { topBullish: [], topBearish: [], tierSummary: null };
    }
    const list = Array.isArray(data.composite_signals) ? data.composite_signals : [];
    // We only want the top 5 high-conviction-first slice for each side.
    // The endpoint already returns ordered (conviction desc → strength desc).
    const bullish = list.filter((s) => s?.direction === 'bullish').slice(0, 5);
    const bearish = list.filter((s) => s?.direction === 'bearish').slice(0, 5);
    return {
      topBullish: bullish,
      topBearish: bearish,
      tierSummary: data.tier_summary || null,
    };
  }, [data]);

  const hasContent = topBullish.length > 0 || topBearish.length > 0;

  return (
    <Card
      title={
        <div style={TILE_HEADER_STYLE}>
          <Space>
            <Text strong style={{ color: '#f5f8fc' }}>
              跨组件复合信号
            </Text>
            {tierSummary ? (
              <Space size={6}>
                <Tag color="green" data-testid="composite-tier-high">
                  HIGH {tierSummary.high}
                </Tag>
                <Tag color="gold" data-testid="composite-tier-medium">
                  MED {tierSummary.medium}
                </Tag>
                <Tag data-testid="composite-tier-low">LOW {tierSummary.low}</Tag>
              </Space>
            ) : null}
          </Space>
          <Space>
            <Button
              size="small"
              icon={<ReloadOutlined />}
              onClick={fetchSignals}
              loading={loading}
              data-testid="composite-signal-refresh"
            >
              刷新
            </Button>
            <a href={auditDocUrl} target="_blank" rel="noreferrer">
              审计文档
            </a>
          </Space>
        </div>
      }
      data-testid="composite-signal-tile"
      bodyStyle={{ paddingTop: 8 }}
    >
      {error ? (
        <Alert
          type="error"
          message="加载复合信号失败"
          description={error}
          showIcon
          data-testid="composite-signal-error"
        />
      ) : null}
      {loading && !data ? (
        <div style={{ textAlign: 'center', padding: 24 }}>
          <Spin />
        </div>
      ) : null}
      {!loading && !error && !hasContent ? (
        <Empty
          description="当前 alt-data 层未触发跨组件复合信号"
          data-testid="composite-signal-empty"
        />
      ) : null}
      {hasContent ? (
        <Row gutter={[16, 16]}>
          <Col xs={24} md={12}>
            <Text
              type="secondary"
              data-testid="composite-signal-bullish-header"
              style={{ display: 'block', marginBottom: 4 }}
            >
              看多 Top {topBullish.length}
            </Text>
            {topBullish.length === 0 ? (
              <Text type="secondary">暂无看多复合信号</Text>
            ) : (
              topBullish.map((signal, idx) => (
                <CompositeRow
                  key={`bullish-${signal?.target}-${idx}`}
                  signal={signal}
                  index={idx}
                  side="bullish"
                />
              ))
            )}
          </Col>
          <Col xs={24} md={12}>
            <Text
              type="secondary"
              data-testid="composite-signal-bearish-header"
              style={{ display: 'block', marginBottom: 4 }}
            >
              看空 Top {topBearish.length}
            </Text>
            {topBearish.length === 0 ? (
              <Text type="secondary">暂无看空复合信号</Text>
            ) : (
              topBearish.map((signal, idx) => (
                <CompositeRow
                  key={`bearish-${signal?.target}-${idx}`}
                  signal={signal}
                  index={idx}
                  side="bearish"
                />
              ))
            )}
          </Col>
        </Row>
      ) : null}
    </Card>
  );
}
