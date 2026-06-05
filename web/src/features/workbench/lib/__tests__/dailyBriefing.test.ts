/**
 * TDD: daily-briefing builder tests.
 * Written BEFORE the implementation files exist — they should fail until ported.
 */
import { describe, it, expect, afterEach } from 'vitest';

import {
  buildWorkbenchDailyBriefingText,
  buildWorkbenchDailyBriefingMarkdown,
  buildWorkbenchDailyBriefingEmailSubject,
  buildWorkbenchDailyBriefingEmailText,
  buildWorkbenchDailyBriefingEmailHtml,
  buildWorkbenchDailyBriefingEmailDocument,
  buildWorkbenchDailyBriefingMailtoUrl,
  buildWorkbenchDailyBriefingShareHtml,
  buildWorkbenchDailyBriefingShareDocument,
  buildWorkbenchDailyBriefingFilename,
  formatWorkbenchDailyBriefingExportedAt,
} from '../dailyBriefing';

import { mountDailyBriefingShareContainer } from '../dailyBriefingHelpers';

// ---------------------------------------------------------------------------
// Minimal briefing payload used across tests
// ---------------------------------------------------------------------------
const minimalBriefing = {
  headline: '今日聚焦跨市场定价',
  summary: '当前工作台共 3 个新任务待处理。',
  chips: [
    { label: '新任务', value: 3 },
    { label: '进行中', value: 7 },
  ],
  details: ['重新评估 AAPL 估值模型', '跟进 SPY 宏观对冲论点'],
};

// ---------------------------------------------------------------------------
// formatWorkbenchDailyBriefingExportedAt
// ---------------------------------------------------------------------------
describe('formatWorkbenchDailyBriefingExportedAt', () => {
  it('formats a known date correctly', () => {
    const date = new Date(2026, 5, 5, 9, 7); // 2026-06-05 09:07
    expect(formatWorkbenchDailyBriefingExportedAt(date)).toBe('2026-06-05 09:07');
  });

  it('returns empty string for invalid date', () => {
    expect(formatWorkbenchDailyBriefingExportedAt(new Date('invalid'))).toBe('');
  });
});

// ---------------------------------------------------------------------------
// buildWorkbenchDailyBriefingText
// ---------------------------------------------------------------------------
describe('buildWorkbenchDailyBriefingText', () => {
  it('returns empty string when briefing is null', () => {
    expect(buildWorkbenchDailyBriefingText({ briefing: null })).toBe('');
  });

  it('includes headline and summary', () => {
    const result = buildWorkbenchDailyBriefingText({
      briefing: minimalBriefing,
      brandLabel: 'SPS',
      exportedAtLabel: '2026-06-05 09:00',
    });
    expect(result).toContain('今日聚焦跨市场定价');
    expect(result).toContain('当前工作台共 3 个新任务待处理。');
  });

  it('includes metric line', () => {
    const result = buildWorkbenchDailyBriefingText({ briefing: minimalBriefing });
    expect(result).toContain('新任务 3');
    expect(result).toContain('进行中 7');
  });

  it('includes detail items numbered', () => {
    const result = buildWorkbenchDailyBriefingText({ briefing: minimalBriefing });
    expect(result).toContain('1. 重新评估 AAPL 估值模型');
    expect(result).toContain('2. 跟进 SPY 宏观对冲论点');
  });

  it('includes optional labels when provided', () => {
    const result = buildWorkbenchDailyBriefingText({
      briefing: minimalBriefing,
      morningPresetLabel: '晨会',
      currentViewLabel: '全部任务',
      focusLabel: 'AAPL',
      teamNote: '今日复盘重点',
      url: 'https://sps.example.com/workbench',
    });
    expect(result).toContain('晨间视图：晨会');
    expect(result).toContain('当前视图：全部任务');
    expect(result).toContain('当前焦点：AAPL');
    expect(result).toContain('团队备注：今日复盘重点');
    expect(result).toContain('打开工作台：https://sps.example.com/workbench');
  });
});

// ---------------------------------------------------------------------------
// buildWorkbenchDailyBriefingMarkdown
// ---------------------------------------------------------------------------
describe('buildWorkbenchDailyBriefingMarkdown', () => {
  it('returns empty string when briefing is null', () => {
    expect(buildWorkbenchDailyBriefingMarkdown({ briefing: null })).toBe('');
  });

  it('starts with the main heading', () => {
    const result = buildWorkbenchDailyBriefingMarkdown({ briefing: minimalBriefing });
    expect(result).toContain('# 研究工作台每日简报');
  });

  it('includes headline as h2', () => {
    const result = buildWorkbenchDailyBriefingMarkdown({ briefing: minimalBriefing });
    expect(result).toContain('## 今日聚焦跨市场定价');
  });

  it('includes metrics section', () => {
    const result = buildWorkbenchDailyBriefingMarkdown({ briefing: minimalBriefing });
    expect(result).toContain('### 指标');
    expect(result).toContain('- 新任务: 3');
    expect(result).toContain('- 进行中: 7');
  });

  it('includes details section', () => {
    const result = buildWorkbenchDailyBriefingMarkdown({ briefing: minimalBriefing });
    expect(result).toContain('### 要点');
    expect(result).toContain('- 重新评估 AAPL 估值模型');
  });

  it('includes url as markdown link', () => {
    const result = buildWorkbenchDailyBriefingMarkdown({
      briefing: minimalBriefing,
      url: 'https://sps.example.com/workbench',
    });
    expect(result).toContain('[打开工作台](https://sps.example.com/workbench)');
  });
});

// ---------------------------------------------------------------------------
// buildWorkbenchDailyBriefingEmailSubject
// ---------------------------------------------------------------------------
describe('buildWorkbenchDailyBriefingEmailSubject', () => {
  it('returns empty string when briefing is null', () => {
    expect(buildWorkbenchDailyBriefingEmailSubject({ briefing: null })).toBe('');
  });

  it('combines brand label and headline', () => {
    const result = buildWorkbenchDailyBriefingEmailSubject({
      briefing: minimalBriefing,
      brandLabel: 'SPS',
    });
    expect(result).toBe('SPS | 今日聚焦跨市场定价');
  });

  it('uses default brand prefix when no brandLabel', () => {
    const result = buildWorkbenchDailyBriefingEmailSubject({ briefing: minimalBriefing });
    expect(result).toContain('Super Pricing System');
    expect(result).toContain('今日聚焦跨市场定价');
  });
});

// ---------------------------------------------------------------------------
// buildWorkbenchDailyBriefingEmailText
// ---------------------------------------------------------------------------
describe('buildWorkbenchDailyBriefingEmailText', () => {
  it('returns empty string when briefing is null', () => {
    expect(buildWorkbenchDailyBriefingEmailText({ briefing: null })).toBe('');
  });

  it('contains greeting and sign-off', () => {
    const result = buildWorkbenchDailyBriefingEmailText({ briefing: minimalBriefing });
    expect(result).toContain('各位好，');
    expect(result).toContain('谢谢。');
  });

  it('includes detail points', () => {
    const result = buildWorkbenchDailyBriefingEmailText({ briefing: minimalBriefing });
    expect(result).toContain('重新评估 AAPL 估值模型');
  });
});

// ---------------------------------------------------------------------------
// buildWorkbenchDailyBriefingEmailHtml
// ---------------------------------------------------------------------------
describe('buildWorkbenchDailyBriefingEmailHtml', () => {
  it('returns empty string when briefing is null', () => {
    expect(buildWorkbenchDailyBriefingEmailHtml({ briefing: null })).toBe('');
  });

  it('contains share-card section', () => {
    const result = buildWorkbenchDailyBriefingEmailHtml({ briefing: minimalBriefing });
    expect(result).toContain('share-card');
  });

  it('includes headline and summary (html-escaped)', () => {
    const result = buildWorkbenchDailyBriefingEmailHtml({
      briefing: minimalBriefing,
      brandLabel: 'SPS',
    });
    expect(result).toContain('今日聚焦跨市场定价');
    expect(result).toContain('当前工作台共 3 个新任务待处理。');
  });

  it('escapes XSS characters in labels', () => {
    const xssBriefing = {
      ...minimalBriefing,
      headline: '<script>alert(1)</script>',
    };
    const result = buildWorkbenchDailyBriefingEmailHtml({ briefing: xssBriefing });
    expect(result).not.toContain('<script>alert(1)</script>');
    expect(result).toContain('&lt;script&gt;');
  });

  it('includes recipients section when provided', () => {
    const result = buildWorkbenchDailyBriefingEmailHtml({
      briefing: minimalBriefing,
      toRecipients: 'alice@example.com',
      ccRecipients: 'bob@example.com',
    });
    expect(result).toContain('alice@example.com');
    expect(result).toContain('bob@example.com');
  });
});

// ---------------------------------------------------------------------------
// buildWorkbenchDailyBriefingEmailDocument
// ---------------------------------------------------------------------------
describe('buildWorkbenchDailyBriefingEmailDocument', () => {
  it('returns a full HTML document string', () => {
    const result = buildWorkbenchDailyBriefingEmailDocument({ briefing: minimalBriefing });
    expect(result).toContain('<!DOCTYPE html>');
    expect(result).toContain('研究工作台邮件模板');
  });
});

// ---------------------------------------------------------------------------
// buildWorkbenchDailyBriefingMailtoUrl
// ---------------------------------------------------------------------------
describe('buildWorkbenchDailyBriefingMailtoUrl', () => {
  it('builds a basic mailto url', () => {
    const url = buildWorkbenchDailyBriefingMailtoUrl({
      toRecipients: 'alice@example.com',
      emailSubject: '今日简报',
    });
    expect(url).toMatch(/^mailto:/);
    expect(url).toContain('alice%40example.com');
    expect(url).toContain('subject=');
  });

  it('includes cc when provided', () => {
    const url = buildWorkbenchDailyBriefingMailtoUrl({
      toRecipients: 'alice@example.com',
      ccRecipients: 'bob@example.com',
      emailSubject: '简报',
      emailBody: 'body text',
    });
    expect(url).toContain('cc=');
    expect(url).toContain('bob%40example.com');
  });

  it('handles multiple recipients separated by comma', () => {
    const url = buildWorkbenchDailyBriefingMailtoUrl({
      toRecipients: 'a@a.com,b@b.com',
    });
    expect(url).toMatch(/^mailto:/);
  });
});

// ---------------------------------------------------------------------------
// buildWorkbenchDailyBriefingShareHtml
// ---------------------------------------------------------------------------
describe('buildWorkbenchDailyBriefingShareHtml', () => {
  it('returns empty string when briefing is null', () => {
    expect(buildWorkbenchDailyBriefingShareHtml({ briefing: null })).toBe('');
  });

  it('includes headline and summary', () => {
    const result = buildWorkbenchDailyBriefingShareHtml({ briefing: minimalBriefing });
    expect(result).toContain('今日聚焦跨市场定价');
    expect(result).toContain('当前工作台共 3 个新任务待处理。');
  });

  it('includes detail cards', () => {
    const result = buildWorkbenchDailyBriefingShareHtml({ briefing: minimalBriefing });
    expect(result).toContain('要点 1');
    expect(result).toContain('重新评估 AAPL 估值模型');
  });
});

// ---------------------------------------------------------------------------
// buildWorkbenchDailyBriefingShareDocument
// ---------------------------------------------------------------------------
describe('buildWorkbenchDailyBriefingShareDocument', () => {
  it('returns a full HTML document with DOCTYPE', () => {
    const result = buildWorkbenchDailyBriefingShareDocument({ briefing: minimalBriefing });
    expect(result).toContain('<!DOCTYPE html>');
    expect(result).toContain('研究工作台每日简报');
  });
});

// ---------------------------------------------------------------------------
// buildWorkbenchDailyBriefingFilename
// ---------------------------------------------------------------------------
describe('buildWorkbenchDailyBriefingFilename', () => {
  it('returns a dated filename with default extension', () => {
    const date = new Date(2026, 5, 5); // 2026-06-05
    const result = buildWorkbenchDailyBriefingFilename({ date });
    expect(result).toMatch(/research-workbench-daily-briefing-2026-06-05\.html$/);
  });

  it('includes sanitized symbol when provided', () => {
    const date = new Date(2026, 5, 5);
    const result = buildWorkbenchDailyBriefingFilename({ date, symbol: 'AAPL US' });
    expect(result).toContain('aapl-us');
  });

  it('uses taskId as fallback for subject part', () => {
    const date = new Date(2026, 5, 5);
    const result = buildWorkbenchDailyBriefingFilename({ date, taskId: 'task-123' });
    expect(result).toContain('task-123');
  });

  it('respects custom extension', () => {
    const date = new Date(2026, 5, 5);
    const result = buildWorkbenchDailyBriefingFilename({ date, extension: 'pdf' });
    expect(result).toMatch(/\.pdf$/);
  });

  it('always starts with the prefix', () => {
    const result = buildWorkbenchDailyBriefingFilename({ date: new Date() });
    expect(result).toMatch(/^research-workbench-daily-briefing/);
  });
});

// ---------------------------------------------------------------------------
// mountDailyBriefingShareContainer — DOMPurify XSS fix
// ---------------------------------------------------------------------------
describe('mountDailyBriefingShareContainer (DOMPurify sanitization)', () => {
  let cleanup: (() => void) | undefined;

  afterEach(() => {
    cleanup?.();
    cleanup = undefined;
  });

  it('mounts a container and returns a cleanup function', () => {
    const documentHtml = '<html><body><p>Hello</p></body></html>';
    cleanup = mountDailyBriefingShareContainer(documentHtml);
    const container = document.querySelector('[data-testid="daily-briefing-pdf-source"]');
    expect(container).not.toBeNull();
    expect(typeof cleanup).toBe('function');
  });

  it('removes the container when cleanup is called', () => {
    const documentHtml = '<html><body><p>Hello</p></body></html>';
    const unmount = mountDailyBriefingShareContainer(documentHtml);
    unmount();
    const container = document.querySelector('[data-testid="daily-briefing-pdf-source"]');
    expect(container).toBeNull();
  });

  it('strips <script> tags via DOMPurify before assigning to innerHTML', () => {
    const maliciousHtml = '<html><body><div id="content"><script>window.__xss=true;</script><p>safe text</p></div></body></html>';
    cleanup = mountDailyBriefingShareContainer(maliciousHtml);
    const container = document.querySelector('[data-testid="daily-briefing-pdf-source"]');
    expect(container).not.toBeNull();
    // Script element must NOT appear in the mounted container
    expect(container!.querySelector('script')).toBeNull();
    // Safe content must still be present
    expect(container!.textContent).toContain('safe text');
  });

  it('strips onerror event attributes via DOMPurify', () => {
    const xssPayload = '<html><body><img src="x" onerror="window.__xss2=true" /></body></html>';
    cleanup = mountDailyBriefingShareContainer(xssPayload);
    const container = document.querySelector('[data-testid="daily-briefing-pdf-source"]');
    expect(container).not.toBeNull();
    const img = container!.querySelector('img');
    // onerror attribute must be stripped
    if (img) {
      expect(img.getAttribute('onerror')).toBeNull();
    }
  });
});
