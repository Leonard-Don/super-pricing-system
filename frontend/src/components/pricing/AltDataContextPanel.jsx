import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Card,
  Empty,
  List,
  Space,
  Spin,
  Tag,
  Typography,
} from 'antd';

import { getAltDataNarrative } from '../../services/api';

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

/**
 * Pricing-page context panel that surfaces "what alt-data is currently
 * saying about this stock's industry" alongside the CAPM/FF3/DCF/Gap
 * cards. Differs from the GodEye narrative tile in that it is scoped
 * (via the ``industry`` query param) to a single industry derived from
 * the ticker.
 */
export default function AltDataContextPanel({ ticker, industry }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const fetchNarrative = useCallback(async () => {
    // When no industry is provided we skip the network call entirely --
    // the panel renders the "industry unknown" empty state. This avoids
    // a spurious "global narrative" inside the per-stock context.
    if (!industry) {
      setData(null);
      setLoading(false);
      setError(null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const payload = await getAltDataNarrative({ industry });
      setData(payload || null);
    } catch (err) {
      setError(err?.userMessage || err?.message || '加载另类数据上下文失败');
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [industry]);

  useEffect(() => {
    fetchNarrative();
  }, [fetchNarrative]);

  const auditDocUrl = data?.audit_doc_url || 'docs/alt_data_audit.md';
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

  const hasContent = !!data && bullets.length > 0;
  const headerSubtitle = industry
    ? `行业：${industry}`
    : '未识别行业';

  return (
    <Card
      title="另类数据上下文"
      data-testid="pricing-alt-data-context"
      extra={(
        <Text type="secondary" data-testid="pricing-alt-data-context-scope">
          {headerSubtitle}
          {ticker ? ` · ${String(ticker).toUpperCase()}` : ''}
        </Text>
      )}
      styles={{ body: { minHeight: 180 } }}
    >
      {error ? (
        <Alert
          type="error"
          showIcon
          message="无法加载另类数据上下文"
          description={error}
          data-testid="pricing-alt-data-context-error"
        />
      ) : !industry ? (
        <Empty
          description="未能识别该股票的行业，无法拉取行业级另类数据上下文"
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          data-testid="pricing-alt-data-context-no-industry"
        />
      ) : loading && !data ? (
        <div
          style={{ minHeight: 160, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          data-testid="pricing-alt-data-context-loading"
        >
          <Spin size="large" />
        </div>
      ) : !hasContent ? (
        <Empty
          description={data?.summary || '本行业暂无显著另类数据信号'}
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          data-testid="pricing-alt-data-context-empty"
        />
      ) : (
        <>
          <Paragraph
            data-testid="pricing-alt-data-context-summary"
            style={{ fontSize: 14, lineHeight: 1.7, marginBottom: 12, color: '#f5f8fc' }}
          >
            {data.summary}
          </Paragraph>
          <List
            size="small"
            data-testid="pricing-alt-data-context-bullets"
            dataSource={bullets}
            renderItem={(item) => {
              const evidence = item.evidence || {};
              const stale = !!evidence.stale;
              const verdict = evidence.verdict || 'UNKNOWN';
              return (
                <List.Item
                  key={item.key}
                  style={{ paddingLeft: 0, paddingRight: 0 }}
                  data-testid={`pricing-alt-data-context-bullet-${verdict}`}
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
                          data-testid={`pricing-alt-data-context-stale-${stale ? 'stale' : 'fresh'}`}
                        >
                          {stale ? '[stale]' : '[fresh]'}
                        </Tag>
                        {evidence.snapshot_path && (
                          <a
                            href={evidence.snapshot_path}
                            target="_blank"
                            rel="noreferrer noopener"
                            data-testid={`pricing-alt-data-context-link-${evidence.component}`}
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
          <Space style={{ marginTop: 12, width: '100%', justifyContent: 'flex-end' }} wrap>
            <Text type="secondary">
              详尽审计见{' '}
              <a href={auditDocUrl} target="_blank" rel="noreferrer noopener">
                {auditDocUrl}
              </a>
            </Text>
          </Space>
        </>
      )}
    </Card>
  );
}
