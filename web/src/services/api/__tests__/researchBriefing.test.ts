import { describe, it, expect, vi, beforeEach } from 'vitest';

const post = vi.fn().mockResolvedValue({ data: {} });
const get = vi.fn().mockResolvedValue({ data: {} });
const put = vi.fn().mockResolvedValue({ data: {} });

vi.mock('@/services/api/core', () => ({
  default: {
    post: (...a: unknown[]) => post(...a),
    get: (...a: unknown[]) => get(...a),
    put: (...a: unknown[]) => put(...a),
  },
  api: {
    post: (...a: unknown[]) => post(...a),
    get: (...a: unknown[]) => get(...a),
    put: (...a: unknown[]) => put(...a),
  },
  withTimeoutProfile: (_p: string, c: object = {}) => c,
  API_TIMEOUT_PROFILES: { analysis: 120000, standard: 30000, dashboard: 45000, default: 300000, workbench: 30000 },
}));

import type { components } from '@/generated/api-types';
import {
  getResearchBriefingDistribution,
  updateResearchBriefingDistribution,
  runResearchBriefingDryRun,
  sendResearchBriefing,
  listAltDataCandidates,
  refreshAltDataCandidates,
  convertAltDataCandidate,
  dismissAltDataCandidate,
  snoozeAltDataCandidate,
} from '@/services/api/research';

// Minimal valid payloads matching the generated schemas.
const minDistributionPayload: components['schemas']['ResearchBriefingDistributionRequest'] = {
  enabled: false,
  send_time: '09:00',
  timezone: 'Asia/Shanghai',
  default_preset_id: '',
  to_recipients: '',
  cc_recipients: '',
  team_note: '',
};

const minBriefingBody: components['schemas']['ResearchBriefingDryRunRequest'] = {
  subject: '',
  body: '',
  current_view: '',
  headline: '',
  summary: '',
  to_recipients: '',
  cc_recipients: '',
  team_note: '',
  task_count: 0,
  channel: 'email',
};

const minSendBody: components['schemas']['ResearchBriefingSendRequest'] = {
  subject: '',
  body: '',
  current_view: '',
  headline: '',
  summary: '',
  to_recipients: '',
  cc_recipients: '',
  team_note: '',
  task_count: 0,
  channel: 'email',
};

describe('research briefing + alt-data-candidates API', () => {
  beforeEach(() => {
    post.mockClear();
    get.mockClear();
    put.mockClear();
  });

  // ---- getResearchBriefingDistribution ----
  it('getResearchBriefingDistribution GETs /research-workbench/briefing/distribution', async () => {
    await getResearchBriefingDistribution();
    expect(get.mock.calls[0][0]).toBe('/research-workbench/briefing/distribution');
  });

  it('getResearchBriefingDistribution returns response.data', async () => {
    const mockEnvelope = { success: true, data: { channels: [] }, error: null };
    get.mockResolvedValueOnce({ data: mockEnvelope });
    const result = await getResearchBriefingDistribution();
    expect(result).toEqual(mockEnvelope);
  });

  // ---- updateResearchBriefingDistribution ----
  it('updateResearchBriefingDistribution PUTs to /research-workbench/briefing/distribution', async () => {
    await updateResearchBriefingDistribution(minDistributionPayload);
    expect(put.mock.calls[0][0]).toBe('/research-workbench/briefing/distribution');
  });

  it('updateResearchBriefingDistribution sends payload', async () => {
    await updateResearchBriefingDistribution(minDistributionPayload);
    expect(put.mock.calls[0][1]).toEqual(minDistributionPayload);
  });

  // ---- runResearchBriefingDryRun ----
  it('runResearchBriefingDryRun POSTs to /research-workbench/briefing/dry-run', async () => {
    await runResearchBriefingDryRun(minBriefingBody);
    expect(post.mock.calls[0][0]).toBe('/research-workbench/briefing/dry-run');
  });

  // ---- sendResearchBriefing ----
  it('sendResearchBriefing POSTs to /research-workbench/briefing/send', async () => {
    await sendResearchBriefing(minSendBody);
    expect(post.mock.calls[0][0]).toBe('/research-workbench/briefing/send');
  });

  it('sendResearchBriefing sends payload', async () => {
    await sendResearchBriefing(minSendBody);
    expect(post.mock.calls[0][1]).toEqual(minSendBody);
  });

  // ---- listAltDataCandidates ----
  it('listAltDataCandidates GETs /research-workbench/alt-data-candidates', async () => {
    await listAltDataCandidates();
    expect(get.mock.calls[0][0]).toBe('/research-workbench/alt-data-candidates');
  });

  it('listAltDataCandidates appends state param when provided', async () => {
    await listAltDataCandidates({ state: 'pending' });
    expect(get.mock.calls[0][0]).toContain('state=pending');
  });

  // ---- refreshAltDataCandidates ----
  it('refreshAltDataCandidates POSTs to /research-workbench/alt-data-candidates/refresh', async () => {
    await refreshAltDataCandidates();
    expect(post.mock.calls[0][0]).toBe('/research-workbench/alt-data-candidates/refresh');
  });

  // ---- convertAltDataCandidate ----
  it('convertAltDataCandidate POSTs to /research-workbench/alt-data-candidates/:id/convert', async () => {
    await convertAltDataCandidate('cand-42');
    expect(post.mock.calls[0][0]).toBe('/research-workbench/alt-data-candidates/cand-42/convert');
  });

  it('convertAltDataCandidate encodes special chars in id', async () => {
    await convertAltDataCandidate('a/b');
    expect(post.mock.calls[0][0]).toBe('/research-workbench/alt-data-candidates/a%2Fb/convert');
  });

  // ---- dismissAltDataCandidate ----
  it('dismissAltDataCandidate POSTs to /research-workbench/alt-data-candidates/:id/dismiss', async () => {
    await dismissAltDataCandidate('cand-99');
    expect(post.mock.calls[0][0]).toBe('/research-workbench/alt-data-candidates/cand-99/dismiss');
  });

  // ---- snoozeAltDataCandidate ----
  it('snoozeAltDataCandidate POSTs to /research-workbench/alt-data-candidates/:id/snooze', async () => {
    await snoozeAltDataCandidate('cand-77', 48);
    expect(post.mock.calls[0][0]).toBe('/research-workbench/alt-data-candidates/cand-77/snooze');
  });

  it('snoozeAltDataCandidate sends hours in body', async () => {
    await snoozeAltDataCandidate('cand-77', 48);
    expect(post.mock.calls[0][1]).toEqual({ hours: 48 });
  });
});
