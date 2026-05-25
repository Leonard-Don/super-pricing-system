import React from 'react';
import { Tag } from 'antd';

import { ASSET_CLASS_LABELS } from './panelConstants';
import {
  formatExecutionChannel,
  formatVenue,
  getCapacityMeta,
  getLiquidityMeta,
} from './panelHelpers';
import { formatCurrency, formatPercentage, getValueColor } from '../../utils/formatting';

export function buildCorrelationColumns(results) {
  if (!results?.correlation_matrix?.columns) {
    return [];
  }
  return [
    {
      title: '资产代码',
      dataIndex: 'symbol',
      key: 'symbol',
      fixed: 'left',
    },
    ...results.correlation_matrix.columns.map((column) => ({
      title: column,
      dataIndex: column,
      key: column,
      render: (value) => Number(value).toFixed(3),
    })),
  ];
}

export function buildContributionColumns() {
  return [
    {
      title: '资产',
      dataIndex: 'symbol',
      key: 'symbol',
    },
    {
      title: '方向',
      dataIndex: 'side',
      key: 'side',
      render: (value) => <Tag color={value === 'long' ? 'green' : 'volcano'}>{value === 'long' ? '多头' : '空头'}</Tag>,
    },
    {
      title: '类别',
      dataIndex: 'asset_class',
      key: 'asset_class',
      render: (value) => ASSET_CLASS_LABELS[value] || value,
    },
    {
      title: '权重',
      dataIndex: 'weight',
      key: 'weight',
      render: (value) => formatPercentage(Number(value || 0)),
    },
    {
      title: '累计贡献',
      dataIndex: 'cumulative_return',
      key: 'cumulative_return',
      render: (value) => <span style={{ color: getValueColor(value) }}>{formatPercentage(Number(value || 0))}</span>,
    },
    {
      title: '波动率',
      dataIndex: 'volatility',
      key: 'volatility',
      render: (value) => formatPercentage(Number(value || 0)),
    },
  ];
}

export function buildExecutionBatchColumns() {
  return [
    {
      title: '执行通道',
      dataIndex: 'execution_channel',
      key: 'execution_channel',
      render: (value) => formatExecutionChannel(value),
    },
    {
      title: 'Venue',
      dataIndex: 'venue',
      key: 'venue',
      render: (value) => formatVenue(value),
    },
    {
      title: 'Provider',
      dataIndex: 'preferred_provider',
      key: 'preferred_provider',
      render: (value) => <Tag color="blue">{value || '-'}</Tag>,
    },
    {
      title: '订单数',
      dataIndex: 'order_count',
      key: 'order_count',
    },
    {
      title: '总权重',
      dataIndex: 'gross_weight',
      key: 'gross_weight',
      render: (value) => formatPercentage(Number(value || 0)),
    },
    {
      title: '目标资金',
      dataIndex: 'target_notional',
      key: 'target_notional',
      render: (value) => formatCurrency(Number(value || 0)),
    },
    {
      title: '预计成交',
      dataIndex: 'estimated_fill_notional',
      key: 'estimated_fill_notional',
      render: (value) => formatCurrency(Number(value || 0)),
    },
    {
      title: '容量',
      dataIndex: 'capacity_band',
      key: 'capacity_band',
      render: (value) => {
        const meta = getCapacityMeta(value);
        return <Tag color={meta.color}>{meta.label}</Tag>;
      },
    },
    {
      title: 'ADV 占用',
      dataIndex: 'adv_usage',
      key: 'adv_usage',
      render: (value) => formatPercentage(Number(value || 0)),
    },
    {
      title: '流动性',
      dataIndex: 'liquidity_band',
      key: 'liquidity_band',
      render: (value) => {
        const meta = getLiquidityMeta(value);
        return <Tag color={meta.color}>{meta.label}</Tag>;
      },
    },
    {
      title: '保证金',
      dataIndex: 'margin_requirement',
      key: 'margin_requirement',
      render: (value) => formatCurrency(Number(value || 0)),
    },
    {
      title: '标的',
      dataIndex: 'symbols',
      key: 'symbols',
      render: (value) => (value || []).join(', '),
    },
  ];
}
