import React from 'react';
import { AutoComplete, Button, Card, Input, Space } from 'antd';
import { SearchOutlined } from '@ant-design/icons';

const RealtimeTopControlBar = ({
  addSymbol,
  autoCompleteOptions,
  globalJumpOptions,
  globalJumpQuery,
  handleGlobalJumpSearch,
  handleGlobalJumpSelect,
  handleSearch,
  handleSelect,
  marketSentiment,
  overviewPrimaryStats,
  overviewSummary,
  searchSymbol,
}) => {
  return (
    <div className="app-page-section-block">
      <div className="app-page-section-kicker">工作台工具</div>
      <div className="realtime-overview-grid">
        <Card
          className="realtime-search-card"
          style={{
            borderRadius: 24,
            border: '1px solid var(--border-color)',
            boxShadow: '0 14px 34px rgba(15, 23, 42, 0.06)',
          }}
        >
          <div className="realtime-block-title">添加跟踪标的</div>
          <div className="realtime-block-subtitle">把新增标的与快速跳转合并在同一层，减少从搜索到看盘的路径长度。</div>
          <div className="realtime-search-grid">
            <div className="realtime-search-panel">
              <div className="realtime-search-panel__title">添加跟踪</div>
              <div className="realtime-search-panel__hint">支持代码、英文名和中文名，添加后会自动进入对应分组。</div>
              <Space.Compact style={{ width: '100%', marginTop: 14 }}>
                <AutoComplete
                  style={{ flex: 1 }}
                  options={autoCompleteOptions}
                  value={searchSymbol}
                  onChange={handleSearch}
                  onSelect={handleSelect}
                >
                  <Input
                    aria-label="添加跟踪标的搜索"
                    name="tracked_symbol_search"
                    autoComplete="off"
                    placeholder="搜索... (支持指数、美股、A股、加密货币、债券等)"
                    prefix={<SearchOutlined />}
                    allowClear
                    size="large"
                    onPressEnter={() => addSymbol(searchSymbol)}
                  />
                </AutoComplete>
                <Button type="primary" size="large" onClick={() => addSymbol(searchSymbol)}>
                  添加
                </Button>
              </Space.Compact>
            </div>

            <div className="realtime-search-panel">
              <div className="realtime-search-panel__title">全局跳转</div>
              <div className="realtime-search-panel__hint">输入已跟踪标的可直接切组并打开详情，未跟踪标的则直接加入工作台。</div>
              <Space.Compact style={{ width: '100%', marginTop: 14 }}>
                <AutoComplete
                  style={{ flex: 1 }}
                  options={globalJumpOptions}
                  value={globalJumpQuery}
                  onChange={handleGlobalJumpSearch}
                  onSelect={handleGlobalJumpSelect}
                >
                  <Input
                    aria-label="全局跳转搜索"
                    name="global_jump_search"
                    autoComplete="off"
                    placeholder="全局搜索并跳转... (例如 AAPL / BTC-USD / 纳指)"
                    prefix={<SearchOutlined />}
                    allowClear
                    size="large"
                    onPressEnter={() => handleGlobalJumpSelect(globalJumpQuery)}
                  />
                </AutoComplete>
                <Button size="large" onClick={() => handleGlobalJumpSelect(globalJumpQuery)}>
                  跳转
                </Button>
              </Space.Compact>
            </div>
          </div>
        </Card>

        <Card
          className="realtime-overview-card"
          style={{
            borderRadius: 24,
            border: '1px solid var(--border-color)',
            boxShadow: '0 14px 34px rgba(15, 23, 42, 0.06)',
          }}
        >
          <div className="realtime-block-title">市场概览</div>
          <div className="realtime-block-subtitle">先看覆盖面、涨跌分布与情绪状态，再进入主看盘区处理细节。</div>
          <div className="realtime-overview-brief">
            <div className="realtime-overview-brief__label">市场情绪</div>
            <div className="realtime-overview-brief__value">{marketSentiment.label}</div>
            <div className="realtime-overview-brief__detail">{overviewSummary}</div>
          </div>
          <div className="realtime-overview-stats realtime-overview-stats--compact">
            {overviewPrimaryStats.map((item) => (
              <div key={item.key} className={`realtime-overview-stat realtime-overview-stat--${item.tone}`}>
                <div className="realtime-overview-stat__label">{item.label}</div>
                <div className="realtime-overview-stat__value">{item.value}</div>
                <div className="realtime-overview-stat__detail">{item.detail}</div>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
};

export default RealtimeTopControlBar;
