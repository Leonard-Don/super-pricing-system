import React from 'react';
import {
  Alert,
  Button,
  Card,
  Input,
  Progress,
  Select,
  Slider,
  Space,
  Table,
  Tag,
  Tooltip,
  Typography,
} from 'antd';
import { ThunderboltOutlined } from '@ant-design/icons';

import {
  ALIGNMENT_TAG_COLORS,
  DISPLAY_EMPTY,
} from '../../utils/pricingSectionConstants';
import {
  parsePricingUniverseInput,
  SCREENING_PRESETS,
} from '../../utils/pricingResearch';

const { Option } = Select;
const { Text: AntText, Paragraph: AntParagraph } = Typography;

const PricingScreenerCard = ({
  value,
  onChange,
  onRun,
  onInspect,
  loading,
  error,
  period,
  results,
  meta,
  progress,
  filter,
  onFilterChange,
  sectorFilter,
  onSectorFilterChange,
  minScore,
  onMinScoreChange,
  sectorOptions,
  onApplyPreset,
  onExport,
}) => {
  const candidateCount = parsePricingUniverseInput(value).length;

  return (
    <Card data-testid="pricing-screener-card" size="small" style={{ marginBottom: 16 }} title={<><ThunderboltOutlined style={{ marginRight: 8 }} />Mispricing 候选池筛选</>} extra={<Tag>{`窗口 ${period}`}</Tag>}>
      <AntParagraph type="secondary" style={{ marginBottom: 12 }}>
        一次跑一组候选标的，按偏差幅度、置信度和证据共振综合排序；点“深入分析”会回到单标的研究视图。
      </AntParagraph>
      <Input.TextArea data-testid="pricing-screener-input" rows={4} value={value} onChange={(event) => onChange(event.target.value)} placeholder="输入多个股票代码，支持换行、逗号或空格分隔" style={{ marginBottom: 12 }} />
      <Space wrap size={8} style={{ marginBottom: 12 }}>
        <AntText type="secondary">预设候选池:</AntText>
        {SCREENING_PRESETS.map((preset) => (
          <Tag key={preset.key} color="blue" style={{ cursor: 'pointer' }} onClick={() => onApplyPreset(preset.symbols)}>
            {preset.label}
          </Tag>
        ))}
      </Space>
      <Space wrap size="middle" style={{ marginBottom: 12 }}>
        <Button data-testid="pricing-screener-run-button" type="default" icon={<ThunderboltOutlined />} loading={loading} onClick={onRun}>批量筛选</Button>
        <Button onClick={onExport} disabled={!results?.length}>导出 CSV</Button>
        <AntText type="secondary">{`候选 ${candidateCount} 个`}</AntText>
        {meta ? <AntText type="secondary">{`已分析 ${meta.analyzedCount}/${meta.totalInput} · 失败 ${meta.failureCount}`}</AntText> : null}
      </Space>
      {progress?.total ? (
        <div style={{ marginBottom: 12 }}>
          <Progress percent={Math.round((Number(progress.completed || 0) / Number(progress.total || 1)) * 100)} status={progress.running ? 'active' : 'normal'} format={() => `${progress.completed}/${progress.total}`} />
        </div>
      ) : null}
      <Space wrap size={8} style={{ marginBottom: 12 }}>
        <AntText type="secondary">筛选视图:</AntText>
        <Select value={filter} onChange={onFilterChange} style={{ width: 180 }}>
          <Option value="all">全部结果</Option>
          <Option value="undervalued">只看低估</Option>
          <Option value="high-confidence">只看高置信度</Option>
          <Option value="aligned">只看证据同向</Option>
          <Option value="governance-risk">只看治理风险高</Option>
          <Option value="governance-support">只看执行支撑强</Option>
        </Select>
        <Select value={sectorFilter} onChange={onSectorFilterChange} style={{ width: 180 }}>
          <Option value="all">全部板块</Option>
          {(sectorOptions || []).map((sector) => <Option key={sector} value={sector}>{sector}</Option>)}
        </Select>
        <div style={{ minWidth: 220 }}>
          <AntText type="secondary" style={{ fontSize: 12 }}>{`机会分阈值 >= ${Number(minScore || 0).toFixed(0)}`}</AntText>
          <Slider min={0} max={40} step={1} value={minScore} onChange={onMinScoreChange} />
        </div>
      </Space>
      {error ? <Alert type="error" showIcon message={error} style={{ marginBottom: 12 }} /> : null}
      {results?.length ? (
        <Table
          data-testid="pricing-screener-results"
          size="small"
          rowKey="symbol"
          pagination={false}
          dataSource={results}
          columns={[
            { title: '#', dataIndex: 'rank', key: 'rank', width: 56 },
            {
              title: '标的',
              dataIndex: 'symbol',
              key: 'symbol',
              render: (value, record) => (
                <div>
                  <AntText strong>{value}</AntText>
                  {record.company_name ? <div style={{ fontSize: 12, color: '#8c8c8c' }}>{record.company_name}</div> : null}
                  {record.sector ? <div style={{ fontSize: 12, color: '#bfbfbf' }}>{record.sector}</div> : null}
                </div>
              ),
            },
            { title: '机会分', dataIndex: 'screening_score', key: 'screening_score', width: 100, render: (value) => <AntText strong>{Number(value || 0).toFixed(1)}</AntText> },
            { title: '偏差', dataIndex: 'gap_pct', key: 'gap_pct', width: 96, render: (value) => (value === null || value === undefined ? DISPLAY_EMPTY : `${value > 0 ? '+' : ''}${Number(value).toFixed(1)}%`) },
            {
              title: '治理折扣',
              dataIndex: 'people_governance_discount_pct',
              key: 'people_governance_discount_pct',
              width: 128,
              render: (value, record) => {
                if (value === null || value === undefined) return DISPLAY_EMPTY;
                const numeric = Number(value || 0);
                const color = numeric >= 6 ? 'red' : numeric > 0 ? 'gold' : numeric <= -3 ? 'green' : 'blue';
                return (
                  <Tooltip title={record.people_governance_summary || record.people_governance_label || ''}>
                    <Tag color={color}>
                      {numeric >= 0 ? `-${numeric.toFixed(1)}%` : `+${Math.abs(numeric).toFixed(1)}%`}
                    </Tag>
                  </Tooltip>
                );
              },
            },
            { title: '观点', dataIndex: 'primary_view', key: 'primary_view', width: 88, render: (value) => <Tag color={value === '低估' ? 'green' : value === '高估' ? 'red' : 'default'}>{value || '合理'}</Tag> },
            { title: '置信度', dataIndex: 'confidence_score', key: 'confidence_score', width: 110, render: (value, record) => <div><Tag>{record.confidence || 'medium'}</Tag><div style={{ fontSize: 12, color: '#8c8c8c' }}>{Number(value || 0).toFixed(2)}</div></div> },
            { title: '证据共振', dataIndex: 'factor_alignment_label', key: 'factor_alignment_label', width: 110, render: (value, record) => <Tag color={ALIGNMENT_TAG_COLORS[record.factor_alignment_status] || 'default'}>{value || '待确认'}</Tag> },
            { title: '主驱动', dataIndex: 'primary_driver', key: 'primary_driver', render: (value) => value || DISPLAY_EMPTY },
            {
              title: '操作',
              key: 'action',
              width: 100,
              render: (_, record) => (
                <Button
                  data-testid={`pricing-screener-inspect-${record.symbol}`}
                  type="link"
                  onClick={() => onInspect(record)}
                >
                  深入分析
                </Button>
              ),
            },
          ]}
        />
      ) : null}
    </Card>
  );
};

export default PricingScreenerCard;
