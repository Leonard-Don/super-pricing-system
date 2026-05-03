import React from 'react';
import { Button, Input, Radio, Select, Space, Tag } from 'antd';
import {
    ReloadOutlined,
    SearchOutlined,
    FullscreenOutlined,
    FullscreenExitOutlined,
} from '@ant-design/icons';

const IndustryHeatmapControls = ({
    isCompactMobile,
    timeframe,
    setTimeframe,
    onTimeframeChange,
    sizeMetric,
    setSizeMetric,
    onSizeMetricChange,
    colorMetric,
    setColorMetric,
    onColorMetricChange,
    displayCount,
    setDisplayCount,
    onDisplayCountChange,
    searchTerm,
    setSearchTerm,
    onSearchTermChange,
    refreshSec,
    setRefreshSec,
    focusControlKey,
    replaySnapshot,
    loadSource,
    loading,
    onToggleFullscreen,
    isFullscreen,
    loadData,
}) => {
    const timeframeOptions = [
        { value: 1, label: '1日' },
        { value: 5, label: '5日' },
        { value: 10, label: '10日' },
        { value: 20, label: '20日' },
        { value: 60, label: '60日' },
    ];
    const sizeMetricOptions = [
        { value: 'market_cap', label: '按市值' },
        { value: 'net_inflow', label: '按净流入' },
        { value: 'turnover', label: '按成交额(估)' },
    ];
    const colorMetricOptions = [
        { value: 'change_pct', label: '看涨跌' },
        { value: 'net_inflow_ratio', label: '看净流入%' },
        { value: 'turnover_rate', label: '看换手率' },
        { value: 'pe_ttm', label: '看市盈率' },
        { value: 'pb', label: '看市净率' },
    ];
    const displayCountOptions = [
        { value: 30, label: 'Top 30' },
        { value: 50, label: 'Top 50' },
        { value: 0, label: '全部' },
    ];
    const refreshOptions = [
        { value: 0, label: isCompactMobile ? '关闭' : '不自动刷新' },
        { value: 60, label: isCompactMobile ? '60秒' : '⏱ 60秒' },
        { value: 120, label: isCompactMobile ? '2分钟' : '⏱ 2分钟' },
        { value: 300, label: isCompactMobile ? '5分钟' : '⏱ 5分钟' },
    ];

    if (isCompactMobile) {
        return (
            <div className="industry-heatmap-controls industry-heatmap-controls--compact">
                {(replaySnapshot?.data || (loadSource === 'history' && !replaySnapshot?.data)) && (
                    <div className="industry-heatmap-controls__badges">
                        {replaySnapshot?.data && (
                            <Tag color="processing" style={{ margin: 0, borderRadius: 999 }}>
                                回放中 {replaySnapshot?.timeframe ? `${replaySnapshot.timeframe}日` : ''}
                            </Tag>
                        )}
                        {loadSource === 'history' && !replaySnapshot?.data && (
                            <Tag color="gold" style={{ margin: 0, borderRadius: 999 }}>
                                最近快照
                            </Tag>
                        )}
                    </div>
                )}
                <div className="industry-heatmap-controls__row">
                    <Select
                        className="heatmap-control-timeframe"
                        value={timeframe}
                        onChange={(value) => {
                            setTimeframe(value);
                            onTimeframeChange?.(value);
                        }}
                        size="small"
                        style={{
                            width: 88,
                            boxShadow: focusControlKey === 'timeframe' ? 'var(--industry-focus-ring)' : 'none',
                            borderRadius: 8,
                        }}
                        options={timeframeOptions}
                        aria-label="选择行业热力图统计时间范围"
                    />
                    <Select
                        className="heatmap-control-display-count"
                        value={displayCount}
                        onChange={(value) => {
                            setDisplayCount(value);
                            onDisplayCountChange?.(value);
                        }}
                        size="small"
                        style={{
                            width: 92,
                            boxShadow: focusControlKey === 'display_count' ? 'var(--industry-focus-ring)' : 'none',
                            borderRadius: 8,
                        }}
                        options={displayCountOptions}
                        aria-label="选择行业热力图显示范围"
                    />
                    <Input
                        className="heatmap-control-search"
                        placeholder="行业筛选…"
                        value={searchTerm}
                        prefix={<SearchOutlined style={{ color: 'var(--text-muted)' }} />}
                        onChange={e => {
                            setSearchTerm(e.target.value);
                            onSearchTermChange?.(e.target.value);
                        }}
                        style={{
                            flex: '1 1 0',
                            minWidth: 0,
                            borderRadius: 4,
                            backgroundColor: 'var(--bg-secondary)',
                            border: '1px solid var(--border-color)',
                            color: 'var(--text-primary)',
                            boxShadow: focusControlKey === 'search' ? 'var(--industry-focus-ring)' : 'none',
                        }}
                        allowClear
                        size="small"
                        aria-label="按行业名称筛选热力图"
                        name="industry-heatmap-search"
                    />
                </div>
                <div className="industry-heatmap-controls__row">
                    <Select
                        className="heatmap-control-size-metric"
                        value={sizeMetric}
                        onChange={(value) => {
                            setSizeMetric(value);
                            onSizeMetricChange?.(value);
                        }}
                        size="small"
                        style={{
                            width: 96,
                            boxShadow: focusControlKey === 'size_metric' ? 'var(--industry-focus-ring)' : 'none',
                            borderRadius: 8,
                        }}
                        options={sizeMetricOptions}
                        aria-label="选择行业热力图方块大小指标"
                    />
                    <Select
                        className="heatmap-control-color-metric"
                        value={colorMetric}
                        onChange={(value) => {
                            setColorMetric(value);
                            onColorMetricChange?.(value);
                        }}
                        size="small"
                        style={{
                            width: 108,
                            boxShadow: focusControlKey === 'color_metric' ? 'var(--industry-focus-ring)' : 'none',
                            borderRadius: 8,
                        }}
                        options={colorMetricOptions}
                        aria-label="选择行业热力图颜色指标"
                    />
                    <Select
                        value={refreshSec}
                        onChange={setRefreshSec}
                        size="small"
                        style={{ width: 82 }}
                        options={refreshOptions}
                        aria-label="选择行业热力图自动刷新频率"
                    />
                    <div className="industry-heatmap-controls__actions">
                        <Button
                            type="text"
                            data-testid="heatmap-fullscreen-toggle"
                            icon={isFullscreen ? <FullscreenExitOutlined /> : <FullscreenOutlined />}
                            onClick={onToggleFullscreen}
                            style={{ color: 'var(--text-secondary)' }}
                            aria-label={isFullscreen ? '退出行业热力图全屏' : '进入行业热力图全屏'}
                        />
                        <Button
                            type="text"
                            icon={<ReloadOutlined />}
                            onClick={loadData}
                            loading={loading}
                            disabled={Boolean(replaySnapshot?.data)}
                            style={{ color: 'var(--text-secondary)' }}
                            aria-label="刷新行业热力图数据"
                        />
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
            alignItems: 'flex-end'
        }}>
            <Space size={8} wrap>
                <Radio.Group
                    className="heatmap-control-timeframe"
                    value={timeframe}
                    onChange={e => {
                        setTimeframe(e.target.value);
                        onTimeframeChange?.(e.target.value);
                    }}
                    size="small"
                    optionType="button"
                    buttonStyle="solid"
                    style={{
                        boxShadow: focusControlKey === 'timeframe' ? 'var(--industry-focus-ring)' : 'none',
                        borderRadius: 8,
                    }}
                    aria-label="选择行业热力图统计时间范围"
                >
                    <Radio value={1}>1日</Radio>
                    <Radio value={5}>5日</Radio>
                    <Radio value={10}>10日</Radio>
                    <Radio value={20}>20日</Radio>
                    <Radio value={60}>60日</Radio>
                </Radio.Group>
                <Select
                    className="heatmap-control-size-metric"
                    value={sizeMetric}
                    onChange={(value) => {
                        setSizeMetric(value);
                        onSizeMetricChange?.(value);
                    }}
                    size="small"
                    style={{
                        width: 100,
                        boxShadow: focusControlKey === 'size_metric' ? 'var(--industry-focus-ring)' : 'none',
                        borderRadius: 8,
                    }}
                    options={sizeMetricOptions}
                    aria-label="选择行业热力图方块大小指标"
                />
                <Select
                    className="heatmap-control-color-metric"
                    value={colorMetric}
                    onChange={(value) => {
                        setColorMetric(value);
                        onColorMetricChange?.(value);
                    }}
                    size="small"
                    style={{
                        width: 110,
                        boxShadow: focusControlKey === 'color_metric' ? 'var(--industry-focus-ring)' : 'none',
                        borderRadius: 8,
                    }}
                    options={colorMetricOptions}
                    aria-label="选择行业热力图颜色指标"
                />
            </Space>
            <Space size={8} wrap>
                {replaySnapshot?.data && (
                    <Tag color="processing" style={{ margin: 0, borderRadius: 999 }}>
                        回放中 {replaySnapshot?.timeframe ? `${replaySnapshot.timeframe}日` : ''}
                    </Tag>
                )}
                {loadSource === 'history' && !replaySnapshot?.data && (
                    <Tag color="gold" style={{ margin: 0, borderRadius: 999 }}>
                        已切换到最近快照
                    </Tag>
                )}
                <Radio.Group
                    className="heatmap-control-display-count"
                    value={displayCount}
                    onChange={e => {
                        setDisplayCount(e.target.value);
                        onDisplayCountChange?.(e.target.value);
                    }}
                    size="small"
                    buttonStyle="solid"
                    style={{
                        boxShadow: focusControlKey === 'display_count' ? 'var(--industry-focus-ring)' : 'none',
                        borderRadius: 8,
                    }}
                    aria-label="选择行业热力图显示范围"
                >
                    <Radio.Button value={30}>Top 30</Radio.Button>
                    <Radio.Button value={50}>Top 50</Radio.Button>
                    <Radio.Button value={0}>全部</Radio.Button>
                </Radio.Group>
                <Input
                    className="heatmap-control-search"
                    placeholder="行业筛选…"
                    value={searchTerm}
                    prefix={<SearchOutlined style={{ color: 'var(--text-muted)' }} />}
                    onChange={e => {
                        setSearchTerm(e.target.value);
                        onSearchTermChange?.(e.target.value);
                    }}
                    style={{
                        width: 150,
                        borderRadius: 4,
                        backgroundColor: 'var(--bg-secondary)',
                        border: '1px solid var(--border-color)',
                        color: 'var(--text-primary)',
                        boxShadow: focusControlKey === 'search' ? 'var(--industry-focus-ring)' : 'none',
                    }}
                    allowClear
                    size="small"
                    aria-label="按行业名称筛选热力图"
                    name="industry-heatmap-search"
                />
                <Select
                    value={refreshSec}
                    onChange={setRefreshSec}
                    size="small"
                    style={{ width: 100 }}
                    options={refreshOptions}
                    aria-label="选择行业热力图自动刷新频率"
                />
                <Button
                    type="text"
                    data-testid="heatmap-fullscreen-toggle"
                    icon={isFullscreen ? <FullscreenExitOutlined /> : <FullscreenOutlined />}
                    onClick={onToggleFullscreen}
                    style={{ color: 'var(--text-secondary)' }}
                    aria-label={isFullscreen ? '退出行业热力图全屏' : '进入行业热力图全屏'}
                />
                <Button
                    type="text"
                    icon={<ReloadOutlined />}
                    onClick={loadData}
                    loading={loading}
                    disabled={Boolean(replaySnapshot?.data)}
                    style={{ color: 'var(--text-secondary)' }}
                    aria-label="刷新行业热力图数据"
                />
            </Space>
        </div>
    );
};

export default IndustryHeatmapControls;
