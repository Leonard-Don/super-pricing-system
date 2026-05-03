import React from 'react';
import {
  BankOutlined,
  BarChartOutlined,
  FundOutlined,
  PropertySafetyOutlined,
  StockOutlined,
  ThunderboltOutlined,
} from '@ant-design/icons';

export const REALTIME_TABS = [
  { key: 'index', label: '指数', icon: <BarChartOutlined /> },
  { key: 'us', label: '美股', icon: <StockOutlined /> },
  { key: 'cn', label: 'A股', icon: <StockOutlined /> },
  { key: 'crypto', label: '加密', icon: <ThunderboltOutlined /> },
  { key: 'bond', label: '债券', icon: <BankOutlined /> },
  { key: 'future', label: '期货', icon: <PropertySafetyOutlined /> },
  { key: 'option', label: '期权', icon: <FundOutlined /> },
];
