import dayjs from './dayjs';

/**
 * 共享的中文相对时间格式化工具，供 alt-data / macro briefing / narrative
 * 等 tile 共用，避免每个组件维护各自的英文 fallback 文案。
 *
 * 此前的 4 处实现都返回 `'just now' / 'N min ago' / 'N hr ago' / 'N day(s)
 * ago'`，对中文使用者读起来像没本地化的英文 stub。本 util 统一返回中文，
 * 并新增 `stale` 状态用于 alt-data 健康清单的判定。
 *
 * 阈值（与原 AltDataHealthTile 实现保持一致）：
 *   - < 60s         → '刚刚'
 *   - < 60min       → 'N 分钟前'
 *   - < 24h         → 'N 小时前'
 *   - < STALE 阈值  → 'N 天前'
 *   - ≥ STALE 阈值  → '已过期 N 天'
 *
 * @param {string | number | Date | null | undefined} value
 * @param {object} [options]
 * @param {Date}    [options.now]                 - 注入当前时间，便于测试。
 * @param {number}  [options.staleThresholdMinutes] - 转为 stale 的最小分钟数；
 *                                                    默认 24 * 60（24 小时）。
 * @param {number}  [options.freshThresholdMinutes] - 视为 fresh 的最大分钟数；
 *                                                    默认 6 * 60（6 小时）。
 * @returns {{ label: string, tone: 'fresh' | 'warn' | 'stale' | 'placeholder' }}
 */
export function formatRelativeRefresh(value, options = {}) {
  const {
    now = new Date(),
    staleThresholdMinutes = 24 * 60,
    freshThresholdMinutes = 6 * 60,
  } = options;

  if (!value) {
    return { label: '—', tone: 'placeholder' };
  }
  const parsed = dayjs(value);
  if (!parsed.isValid()) {
    return { label: String(value), tone: 'placeholder' };
  }

  const diffMinutes = Math.max(0, dayjs(now).diff(parsed, 'minute'));
  let label;
  if (diffMinutes < 1) {
    label = '刚刚';
  } else if (diffMinutes < 60) {
    label = `${diffMinutes} 分钟前`;
  } else if (diffMinutes < 60 * 24) {
    label = `${Math.floor(diffMinutes / 60)} 小时前`;
  } else {
    const days = Math.floor(diffMinutes / (60 * 24));
    label = `${days} 天前`;
  }

  let tone;
  if (diffMinutes >= staleThresholdMinutes) {
    tone = 'stale';
    const days = Math.floor(diffMinutes / (60 * 24));
    label = `已过期 ${days} 天`;
  } else if (diffMinutes <= freshThresholdMinutes) {
    tone = 'fresh';
  } else {
    tone = 'warn';
  }

  return { label, tone };
}

/**
 * 同 ``formatRelativeRefresh``，但只返回 label 字符串。供不需要 tone
 * 颜色分级的场景（briefing / narrative / candidate queue）使用。
 *
 * @param {string | number | Date | null | undefined} value
 * @param {Date} [now]
 * @returns {string}
 */
export function formatRelativeRefreshLabel(value, now = new Date()) {
  return formatRelativeRefresh(value, { now }).label;
}
