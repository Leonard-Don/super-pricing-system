import { describe, it, expect } from 'vitest';
import { buildPricingResearchAuditPayload, buildPricingResearchReportHtml } from '@/features/pricing/lib/report';

const sample = { symbol: 'AAPL', period: '1y', gap: { gap_pct: -0.12 }, valuation: {}, factor_model: {} };

describe('report', () => {
  it('audit payload carries symbol + period', () => {
    const p = buildPricingResearchAuditPayload(sample as Parameters<typeof buildPricingResearchAuditPayload>[0]);
    expect(p.symbol).toBe('AAPL');
    expect(p.period).toBe('1y');
  });
  it('report html includes the symbol', () => {
    expect(buildPricingResearchReportHtml(sample as Parameters<typeof buildPricingResearchReportHtml>[0])).toContain('AAPL');
  });
});
