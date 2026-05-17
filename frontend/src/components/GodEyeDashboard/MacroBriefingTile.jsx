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

import dayjs from '../../utils/dayjs';
import { getAltDataMacroBriefing } from '../../services/api';

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

export default function MacroBriefingTile() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

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

  useEffect(() => {
    fetchBriefing();
  }, [fetchBriefing]);

  const auditDocUrl = data?.audit_doc_url || 'docs/alt_data_audit.md';
  const generatedLabel = useMemo(
    () => formatBriefingGeneratedAt(data?.generated_at),
    [data?.generated_at],
  );

  const hasAnyBullet = useMemo(() => {
    if (!data) return false;
    return SECTION_DEFINITIONS.some(
      (def) => Array.isArray(data[def.key]) && data[def.key].length > 0,
    );
  }, [data]);

  return (
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
              icon={<ReloadOutlined />}
              onClick={fetchBriefing}
              loading={loading}
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
      ) : null}

      {/* expose machine-readable section-label map for downstream consumers
          that want to translate snake_case section keys to display labels */}
      <span hidden data-testid="macro-briefing-section-label-map">
        {JSON.stringify(SECTION_LABEL_BY_KEY)}
      </span>
    </Card>
  );
}
