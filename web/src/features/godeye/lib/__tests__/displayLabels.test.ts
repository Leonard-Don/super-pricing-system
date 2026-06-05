import { describe, it, expect } from 'vitest';
import {
  localizeGodEyeText,
  getGodEyeTemplateLabel,
  getGodEyeExecutionPostureLabel,
  getGodEyeTemplateTheme,
  getGodEyeTemplateDescription,
  getGodEyeGroupLabel,
  getGodEyeDepartmentLabel,
  getGodEyeSourceLabel,
  getGodEyePolicyTitleLabel,
  getGodEyeAnomalyTypeLabel,
  getGodEyeStatusLabel,
  getGodEyeStructuralRadarLabel,
  getGodEyeSourceModeLabel,
  getGodEyeStalenessLabel,
  formatGodEyeSnapshotTimestamp,
} from '@/features/godeye/lib/displayLabels';
import {
  buildDisplayTier,
  buildDisplayTone,
  formatFactorName,
  formatTemplateName,
} from '@/features/godeye/lib/viewModelShared';

// ---------------------------------------------------------------------------
// localizeGodEyeText
// ---------------------------------------------------------------------------
describe('localizeGodEyeText', () => {
  it('returns empty string for empty input', () => {
    expect(localizeGodEyeText('')).toBe('');
  });

  it('replaces 模板 with 方案', () => {
    expect(localizeGodEyeText('这是一个模板')).toBe('这是一个方案');
  });

  it('replaces 跨市场模板 with 跨市场方案 (longer match first)', () => {
    // The replacement table has 跨市场模板 before 模板
    expect(localizeGodEyeText('跨市场模板详情')).toBe('跨市场方案详情');
  });

  it('replaces Structural Decay (case-insensitive) with 结构衰败', () => {
    expect(localizeGodEyeText('Structural Decay analysis')).toBe('结构衰败 analysis');
  });

  it('replaces \\bDecay\\b with 衰败 (and \\bwatch\\b at end-of-string with 观察)', () => {
    // \bwatch\b at end-of-string matches the word-boundary lookahead (?=...|$)
    // so the OLD implementation also localizes 'watch' → '观察'
    expect(localizeGodEyeText('Decay watch')).toBe('衰败 观察');
  });

  it('normalises pipe separators to ｜', () => {
    expect(localizeGodEyeText('foo | bar')).toBe('foo ｜ bar');
  });

  it('replaces official-led with 官方/披露主导 (case-insensitive)', () => {
    expect(localizeGodEyeText('official-led')).toBe('官方/披露主导');
  });

  it('replaces fallback-heavy with 回退源偏多', () => {
    expect(localizeGodEyeText('fallback-heavy')).toBe('回退源偏多');
  });
});

// ---------------------------------------------------------------------------
// getGodEyeTemplateLabel
// ---------------------------------------------------------------------------
describe('getGodEyeTemplateLabel', () => {
  it('returns mapped label for known template id', () => {
    expect(getGodEyeTemplateLabel({ id: 'utilities_vs_growth' })).toBe(
      '公用事业防御 vs 成长 beta',
    );
  });

  it('returns localized display_name when id not in map', () => {
    expect(getGodEyeTemplateLabel({ id: 'unknown_id', display_name: '模板名称' })).toBe(
      '方案名称',
    );
  });

  it('returns fallback text when no info', () => {
    expect(getGodEyeTemplateLabel({})).toBe('等待方案信号汇聚');
  });
});

// ---------------------------------------------------------------------------
// getGodEyeExecutionPostureLabel
// ---------------------------------------------------------------------------
describe('getGodEyeExecutionPostureLabel', () => {
  it('returns mapped Chinese label for known posture', () => {
    expect(getGodEyeExecutionPostureLabel('defensive_spread')).toBe('防御价差');
  });

  it('returns 待确认 for empty posture', () => {
    expect(getGodEyeExecutionPostureLabel('')).toBe('待确认');
  });

  it('returns underscore-converted string for unknown posture', () => {
    expect(getGodEyeExecutionPostureLabel('some_unknown_posture')).toBe('some / unknown / posture');
  });
});

// ---------------------------------------------------------------------------
// getGodEyeTemplateTheme
// ---------------------------------------------------------------------------
describe('getGodEyeTemplateTheme', () => {
  it('returns mapped theme for known id', () => {
    expect(getGodEyeTemplateTheme({ id: 'copper_vs_semis' })).toBe(
      '实体瓶颈 vs 半导体 beta',
    );
  });

  it('returns localized theme for unknown id', () => {
    expect(getGodEyeTemplateTheme({ id: 'unknown', theme: 'Structural Decay' })).toBe(
      '结构衰败',
    );
  });
});

// ---------------------------------------------------------------------------
// getGodEyeTemplateDescription
// ---------------------------------------------------------------------------
describe('getGodEyeTemplateDescription', () => {
  it('returns mapped description for known id', () => {
    const result = getGodEyeTemplateDescription({ id: 'energy_vs_ai_apps' });
    expect(result).toContain('能源底座');
  });

  it('returns localized description field for unknown id', () => {
    expect(getGodEyeTemplateDescription({ id: 'x', description: '一个模板描述' })).toBe(
      '一个方案描述',
    );
  });
});

// ---------------------------------------------------------------------------
// getGodEyeGroupLabel
// ---------------------------------------------------------------------------
describe('getGodEyeGroupLabel', () => {
  it('maps Supply Chain to 供应链', () => {
    expect(getGodEyeGroupLabel('Supply Chain')).toBe('供应链');
  });

  it('maps Macro HF to 宏观高频', () => {
    expect(getGodEyeGroupLabel('Macro HF')).toBe('宏观高频');
  });

  it('returns original string for unknown group', () => {
    expect(getGodEyeGroupLabel('Equities')).toBe('Equities');
  });
});

// ---------------------------------------------------------------------------
// getGodEyeDepartmentLabel
// ---------------------------------------------------------------------------
describe('getGodEyeDepartmentLabel', () => {
  it('returns department_zh when present', () => {
    expect(getGodEyeDepartmentLabel({ department_zh: '国家能源局' })).toBe('国家能源局');
  });

  it('returns 政策主体 for empty object', () => {
    expect(getGodEyeDepartmentLabel({})).toBe('政策主体');
  });

  it('handles string input via localizeGodEyeText', () => {
    expect(getGodEyeDepartmentLabel('ndrc')).toBe('发改委');
  });
});

// ---------------------------------------------------------------------------
// getGodEyeSourceLabel
// ---------------------------------------------------------------------------
describe('getGodEyeSourceLabel', () => {
  it('returns 未知来源 for empty', () => {
    expect(getGodEyeSourceLabel('')).toBe('未知来源');
  });

  it('maps known token policy_radar', () => {
    expect(getGodEyeSourceLabel('policy_radar')).toBe('政策雷达');
  });

  it('splits colon and maps each token', () => {
    expect(getGodEyeSourceLabel('fed:ecb')).toBe('美联储 / 欧洲央行');
  });
});

// ---------------------------------------------------------------------------
// getGodEyePolicyTitleLabel
// ---------------------------------------------------------------------------
describe('getGodEyePolicyTitleLabel', () => {
  it('returns 未命名政策事件 for empty', () => {
    expect(getGodEyePolicyTitleLabel('')).toBe('未命名政策事件');
  });

  it('matches and replaces "Federal Reserve Board names" pattern', () => {
    const raw =
      'Federal Reserve Board names John Smith as chair pro tempore; effective immediately';
    const result = getGodEyePolicyTitleLabel(raw);
    expect(result).toBe('美联储任命 John Smith 为临时主席，直至新主席宣誓就任');
  });

  it('falls back to localizeGodEyeText for non-matched titles', () => {
    // Old implementation: \bDecay\b → 衰败, then \bpolicy\b → 政策
    expect(getGodEyePolicyTitleLabel('Decay policy update')).toBe('衰败 政策 update');
  });
});

// ---------------------------------------------------------------------------
// getGodEyeAnomalyTypeLabel
// ---------------------------------------------------------------------------
describe('getGodEyeAnomalyTypeLabel', () => {
  it('maps alert → 告警', () => {
    expect(getGodEyeAnomalyTypeLabel('alert')).toBe('告警');
  });
  it('maps hot → 升温', () => {
    expect(getGodEyeAnomalyTypeLabel('hot')).toBe('升温');
  });
  it('returns original for unknown type', () => {
    expect(getGodEyeAnomalyTypeLabel('unknown_type')).toBe('unknown_type');
  });
});

// ---------------------------------------------------------------------------
// getGodEyeStatusLabel
// ---------------------------------------------------------------------------
describe('getGodEyeStatusLabel', () => {
  it('maps peopleLayer/stable → 稳定', () => {
    expect(getGodEyeStatusLabel('peopleLayer', 'stable')).toBe('稳定');
  });

  it('maps departmentChaos/chaotic → 混乱', () => {
    expect(getGodEyeStatusLabel('departmentChaos', 'chaotic')).toBe('混乱');
  });

  it('returns 未知 for empty status', () => {
    expect(getGodEyeStatusLabel('peopleLayer', '')).toBe('未知');
  });

  it('falls back to localizeGodEyeText for unknown domain/status', () => {
    // 'stable' has a word-boundary replacement to '稳定' in the text replacements
    expect(getGodEyeStatusLabel('unknownDomain', 'stable')).toBe('稳定');
  });
});

// ---------------------------------------------------------------------------
// getGodEyeStructuralRadarLabel
// ---------------------------------------------------------------------------
describe('getGodEyeStructuralRadarLabel', () => {
  it('returns display_label if present', () => {
    expect(getGodEyeStructuralRadarLabel({ display_label: '自定义标签' })).toBe('自定义标签');
  });

  it('maps label stable → 稳定', () => {
    expect(getGodEyeStructuralRadarLabel({ label: 'stable' })).toBe('稳定');
  });

  it('maps label decay_watch → 衰败观察', () => {
    expect(getGodEyeStructuralRadarLabel({ label: 'decay_watch' })).toBe('衰败观察');
  });

  it('returns 稳定 for empty object', () => {
    expect(getGodEyeStructuralRadarLabel({})).toBe('稳定');
  });
});

// ---------------------------------------------------------------------------
// getGodEyeSourceModeLabel
// ---------------------------------------------------------------------------
describe('getGodEyeSourceModeLabel', () => {
  it('maps official-led from display_label', () => {
    expect(getGodEyeSourceModeLabel({ display_label: 'official-led' })).toBe(
      '官方/披露主导',
    );
  });

  it('maps fallback-heavy from label', () => {
    expect(getGodEyeSourceModeLabel({ label: 'fallback-heavy' })).toBe('回退源偏多');
  });

  it('maps dominant=mixed via SOURCE_MODE_LABELS since dominant is read as raw', () => {
    // The old implementation reads: raw = display_label ?? label ?? dominant = 'mixed'
    // Then SOURCE_MODE_LABELS['mixed'] = '混合来源' — it does NOT fall through to getSourceModeLabel
    // getSourceModeLabel is only called when raw is empty
    expect(getGodEyeSourceModeLabel({ dominant: 'mixed' })).toBe('混合来源');
  });

  it('splits slash-delimited display_label and maps each part', () => {
    expect(getGodEyeSourceModeLabel({ display_label: 'official-led/mixed' })).toBe(
      '官方/披露主导 / 混合来源',
    );
  });
});

// ---------------------------------------------------------------------------
// getGodEyeStalenessLabel
// ---------------------------------------------------------------------------
describe('getGodEyeStalenessLabel', () => {
  it('maps fresh → 新鲜', () => {
    expect(getGodEyeStalenessLabel({ label: 'fresh' })).toBe('新鲜');
  });

  it('maps stale → 轻微陈旧', () => {
    expect(getGodEyeStalenessLabel({ label: 'stale' })).toBe('轻微陈旧');
  });

  it('returns 未知 for empty', () => {
    expect(getGodEyeStalenessLabel({})).toBe('未知');
  });
});

// ---------------------------------------------------------------------------
// formatGodEyeSnapshotTimestamp
// ---------------------------------------------------------------------------
describe('formatGodEyeSnapshotTimestamp', () => {
  it('returns 未刷新 display for empty input', () => {
    expect(formatGodEyeSnapshotTimestamp('')).toEqual({
      date: '未刷新',
      time: '',
      display: '未刷新',
    });
  });

  it('parses ISO datetime string correctly', () => {
    const result = formatGodEyeSnapshotTimestamp('2024-03-15T10:30:00Z');
    expect(result.date).toBe('2024/03/15');
    expect(result.time).toBe('10:30:00');
    expect(result.display).toBe('2024/03/15 10:30:00');
  });

  it('handles date-only string', () => {
    const result = formatGodEyeSnapshotTimestamp('2024-03-15');
    expect(result.date).toBe('2024/03/15');
    expect(result.time).toBe('');
    expect(result.display).toBe('2024/03/15');
  });
});

// ---------------------------------------------------------------------------
// viewModelShared — buildDisplayTier / buildDisplayTone
// ---------------------------------------------------------------------------
describe('buildDisplayTier', () => {
  it('returns 优先部署 for score >= 2.6', () => {
    expect(buildDisplayTier(2.6)).toBe('优先部署');
    expect(buildDisplayTier(3.0)).toBe('优先部署');
  });

  it('returns 重点跟踪 for score in [1.4, 2.6)', () => {
    expect(buildDisplayTier(1.4)).toBe('重点跟踪');
    expect(buildDisplayTier(2.5)).toBe('重点跟踪');
  });

  it('returns 候选方案 for score < 1.4', () => {
    expect(buildDisplayTier(0)).toBe('候选方案');
    expect(buildDisplayTier(1.3)).toBe('候选方案');
  });
});

describe('buildDisplayTone', () => {
  it('returns volcano for score >= 2.6', () => {
    expect(buildDisplayTone(2.6)).toBe('volcano');
  });

  it('returns gold for score in [1.4, 2.6)', () => {
    expect(buildDisplayTone(1.4)).toBe('gold');
  });

  it('returns blue for score < 1.4', () => {
    expect(buildDisplayTone(0)).toBe('blue');
  });
});

// ---------------------------------------------------------------------------
// viewModelShared — formatFactorName / formatTemplateName
// ---------------------------------------------------------------------------
describe('formatFactorName', () => {
  it('maps bureaucratic_friction to Chinese', () => {
    expect(formatFactorName('bureaucratic_friction')).toBe('官僚摩擦');
  });

  it('replaces underscores for unknown names', () => {
    expect(formatFactorName('some_unknown_factor')).toBe('some unknown factor');
  });
});

describe('formatTemplateName', () => {
  it('converts snake_case to Title Case', () => {
    expect(formatTemplateName('utilities_vs_growth')).toBe('Utilities Vs Growth');
  });
});
