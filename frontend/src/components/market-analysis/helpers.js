export const DISPLAY_EMPTY = '--';

export const DEFAULT_VOLUME_TREND = {
    trend: 'unknown',
    direction: 'neutral',
    volume_ratio: 0,
    avg_volume_5d: 0,
    avg_volume_20d: 0,
    current_volume: 0
};

export const normalizeVolumeTrend = (value) => {
    if (!value) return { ...DEFAULT_VOLUME_TREND };
    if (typeof value === 'string') {
        return { ...DEFAULT_VOLUME_TREND, trend: value };
    }
    return { ...DEFAULT_VOLUME_TREND, ...value };
};

export const formatDisplayNumber = (value, digits = 2, suffix = '') => {
    if (value === null || value === undefined || Number.isNaN(Number(value))) {
        return DISPLAY_EMPTY;
    }
    return `${Number(value).toFixed(digits)}${suffix}`;
};

export const formatDisplayPercent = (value, digits = 2, valueIsRatio = false) => {
    if (value === null || value === undefined || Number.isNaN(Number(value))) {
        return DISPLAY_EMPTY;
    }
    const numericValue = valueIsRatio ? Number(value) * 100 : Number(value);
    return `${numericValue.toFixed(digits)}%`;
};

export const formatMetaTime = (timestamp) => {
    if (!timestamp) {
        return DISPLAY_EMPTY;
    }

    return new Intl.DateTimeFormat('zh-CN', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
    }).format(timestamp);
};
