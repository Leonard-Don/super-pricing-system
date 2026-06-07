import { describe, it, expect } from 'vitest';
import {
  buildPricingLink,
  buildWorkbenchLink,
  buildGodEyeLink,
  buildCrossMarketLink,
} from '@/features/godeye/lib/researchContext';

// The v5 router is path-based (/pricing, /godeye, /workbench). CTA links must
// target those paths, NOT the legacy `/?view=...` shell (which the path-based
// router redirects to the index, dropping the task/template context).
describe('researchContext link builders → path-based router', () => {
  it('buildPricingLink targets /pricing and carries context, no ?view=', () => {
    const url = buildPricingLink('AAPL');
    expect(url.startsWith('/pricing')).toBe(true);
    expect(url).not.toContain('view=');
    expect(url).toContain('AAPL');
  });

  it('buildWorkbenchLink targets /workbench, no ?view=', () => {
    const url = buildWorkbenchLink({ refresh: '1', taskId: 't1' });
    expect(url.startsWith('/workbench')).toBe(true);
    expect(url).not.toContain('view=');
  });

  it('buildGodEyeLink targets /godeye', () => {
    expect(buildGodEyeLink().startsWith('/godeye')).toBe(true);
  });

  it('buildCrossMarketLink (cross-market draft) targets /workbench, no ?view=', () => {
    const url = buildCrossMarketLink('tmpl-1');
    expect(url.startsWith('/workbench')).toBe(true);
    expect(url).not.toContain('view=');
  });
});
