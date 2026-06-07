import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

// ---------------------------------------------------------------------------
// Mock API modules BEFORE importing the hook
// ---------------------------------------------------------------------------

const mockGetResearchBriefingDistribution = vi.fn();
const mockUpdateResearchBriefingDistribution = vi.fn();
const mockRunResearchBriefingDryRun = vi.fn();
const mockSendResearchBriefing = vi.fn();

vi.mock('@/services/api/research', () => ({
  getResearchBriefingDistribution: (...args: unknown[]) =>
    mockGetResearchBriefingDistribution(...args),
  updateResearchBriefingDistribution: (...args: unknown[]) =>
    mockUpdateResearchBriefingDistribution(...args),
  runResearchBriefingDryRun: (...args: unknown[]) => mockRunResearchBriefingDryRun(...args),
  sendResearchBriefing: (...args: unknown[]) => mockSendResearchBriefing(...args),
  getResearchTasks: vi.fn(),
  getResearchTaskStats: vi.fn(),
  getResearchTask: vi.fn(),
  getResearchTaskTimeline: vi.fn(),
  updateResearchTask: vi.fn(),
  addResearchTaskComment: vi.fn(),
  deleteResearchTaskComment: vi.fn(),
  createResearchTask: vi.fn(),
  deleteResearchTask: vi.fn(),
  addResearchTaskSnapshot: vi.fn(),
  reorderResearchBoard: vi.fn(),
  bulkUpdateResearchTasks: vi.fn(),
  listAltDataCandidates: vi.fn(),
  refreshAltDataCandidates: vi.fn(),
  convertAltDataCandidate: vi.fn(),
  dismissAltDataCandidate: vi.fn(),
  snoozeAltDataCandidate: vi.fn(),
}));

const mockGetInfrastructureStatus = vi.fn();

vi.mock('@/services/api/infrastructure', () => ({
  getInfrastructureStatus: (...args: unknown[]) => mockGetInfrastructureStatus(...args),
}));

// ---------------------------------------------------------------------------
// Import hook AFTER mocks
// ---------------------------------------------------------------------------

import useDailyBriefing from '../useDailyBriefing';
import { resetInfrastructureStatusCache } from '@/services/api/infrastructureStatusCache';
import { resetResearchBriefingDistributionCache } from '@/services/api/researchBriefingDistributionCache';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const defaultDistributionResponse = {
  success: true,
  data: {
    distribution: {
      enabled: true,
      send_time: '08:30',
      timezone: 'Asia/Shanghai',
      weekdays: ['mon', 'tue', 'wed', 'thu', 'fri'],
      notification_channels: ['email'],
      default_preset_id: '',
      presets: [],
      to_recipients: 'test@example.com',
      cc_recipients: '',
      team_note: 'Morning briefing',
    },
    delivery_history: [],
    schedule: {
      enabled: true,
      status: 'active',
      timezone: 'Asia/Shanghai',
      send_time: '08:30',
      weekdays: ['mon', 'tue', 'wed', 'thu', 'fri'],
      next_run_at: '2026-06-06T00:30:00Z',
      next_run_label: '明日 08:30',
      reason: '',
    },
  },
};

const defaultInfraResponse = {
  success: true,
  data: {
    notifications: {
      channels: [
        { id: 'email', type: 'email', label: 'Email', enabled: true, source: 'smtp' },
        { id: 'dry_run', type: 'dry_run', label: 'Dry Run', enabled: true, source: 'builtin' },
      ],
    },
  },
};

const makeProps = (overrides = {}) => ({
  workbenchDailyBriefing: { headline: 'Briefing Headline', summary: 'Summary text', chips: [], details: [] },
  workbenchViewSummary: { headline: 'All Tasks', scopedTaskLabel: '' },
  filteredTasks: [{ id: 'task-1', symbol: 'AAPL' }],
  buildShareArtifactsRef: { current: () => ({
    emailSubject: 'Daily Briefing',
    emailBody: 'Body text',
    toRecipients: 'test@example.com',
    ccRecipients: '',
    teamNote: '',
  }) },
  ...overrides,
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('useDailyBriefing', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // The shared infrastructure-status / distribution caches are module-level;
    // reset them so each renderHook triggers a fresh fetch and tests stay isolated.
    resetInfrastructureStatusCache();
    resetResearchBriefingDistributionCache();
    mockGetResearchBriefingDistribution.mockResolvedValue(defaultDistributionResponse);
    mockGetInfrastructureStatus.mockResolvedValue(defaultInfraResponse);
    mockUpdateResearchBriefingDistribution.mockResolvedValue({ success: true, data: {} });
    mockRunResearchBriefingDryRun.mockResolvedValue({
      success: true,
      data: { delivery_history: [], schedule: {} },
    });
    mockSendResearchBriefing.mockResolvedValue({
      success: true,
      data: { delivery_history: [], schedule: {}, record: { status: 'sent' } },
    });
    // Clear localStorage stubs
    vi.stubGlobal('localStorage', {
      getItem: vi.fn().mockReturnValue(null),
      setItem: vi.fn(),
      removeItem: vi.fn(),
    });
  });

  // -------------------------------------------------------------------------
  // Distribution loading
  // -------------------------------------------------------------------------

  it('loads distribution config on mount', async () => {
    const { result } = renderHook(() => useDailyBriefing(makeProps()));

    // Initially, defaults
    expect(result.current.dailyBriefingDistributionEnabled).toBe(false);

    // Flush all microtasks + state updates
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });

    expect(mockGetResearchBriefingDistribution).toHaveBeenCalledOnce();
    expect(mockGetInfrastructureStatus).toHaveBeenCalledOnce();
    expect(result.current.dailyBriefingDistributionEnabled).toBe(true);
    expect(result.current.dailyBriefingDistributionTime).toBe('08:30');
    expect(result.current.dailyBriefingEmailRecipients).toBe('test@example.com');
    expect(result.current.dailyBriefingTeamNote).toBe('Morning briefing');
  });

  it('loads notification channel options from infrastructure status', async () => {
    const { result } = renderHook(() => useDailyBriefing(makeProps()));

    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });

    const channelIds = result.current.dailyBriefingNotificationChannelOptions.map((o) => o.id);
    expect(channelIds).toContain('email');
    expect(channelIds).toContain('dry_run');
  });

  it('handles failed distribution load gracefully (keeps defaults)', async () => {
    mockGetResearchBriefingDistribution.mockResolvedValue({ success: false, data: null });

    const { result } = renderHook(() => useDailyBriefing(makeProps()));

    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });

    // Should remain at defaults
    expect(result.current.dailyBriefingDistributionEnabled).toBe(false);
    expect(result.current.dailyBriefingDistributionTime).toBe('09:00');
  });

  // -------------------------------------------------------------------------
  // Preset CRUD
  // -------------------------------------------------------------------------

  it('adds a custom email preset', async () => {
    const { result } = renderHook(() => useDailyBriefing(makeProps()));

    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });

    const initialCount = result.current.dailyBriefingEmailPresets.length;

    act(() => {
      result.current.handleAddDailyBriefingEmailPreset();
    });

    expect(result.current.dailyBriefingEmailPresets).toHaveLength(initialCount + 1);
    const newPreset = result.current.dailyBriefingEmailPresets[result.current.dailyBriefingEmailPresets.length - 1];
    expect(newPreset.id).toMatch(/^custom_/);
    expect(newPreset.name).toMatch(/自定义分发/);
  });

  it('saves current recipients into a preset', async () => {
    const { result } = renderHook(() => useDailyBriefing(makeProps()));

    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });

    // Add a custom preset first
    act(() => {
      result.current.handleAddDailyBriefingEmailPreset();
    });

    const addedPreset = result.current.dailyBriefingEmailPresets[result.current.dailyBriefingEmailPresets.length - 1];

    // Set recipients
    act(() => {
      result.current.setDailyBriefingEmailRecipients('saved@example.com');
      result.current.setDailyBriefingEmailCcRecipients('cc@example.com');
    });

    // Save the preset
    act(() => {
      result.current.handleSaveDailyBriefingEmailPreset(addedPreset.id);
    });

    const savedPreset = result.current.dailyBriefingEmailPresets.find((p) => p.id === addedPreset.id);
    expect(savedPreset?.toRecipients).toBe('saved@example.com');
    expect(savedPreset?.ccRecipients).toBe('cc@example.com');
  });

  it('deletes a custom email preset', async () => {
    const { result } = renderHook(() => useDailyBriefing(makeProps()));

    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });

    act(() => {
      result.current.handleAddDailyBriefingEmailPreset();
    });

    const addedPreset = result.current.dailyBriefingEmailPresets[result.current.dailyBriefingEmailPresets.length - 1];
    const countAfterAdd = result.current.dailyBriefingEmailPresets.length;

    act(() => {
      result.current.handleDeleteDailyBriefingEmailPreset(addedPreset.id);
    });

    expect(result.current.dailyBriefingEmailPresets).toHaveLength(countAfterAdd - 1);
    expect(result.current.dailyBriefingEmailPresets.find((p) => p.id === addedPreset.id)).toBeUndefined();
  });

  it('does not delete default presets', async () => {
    const { result } = renderHook(() => useDailyBriefing(makeProps()));

    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });

    const initialCount = result.current.dailyBriefingEmailPresets.length;
    const defaultPresetId = result.current.dailyBriefingEmailPresets[0].id;

    act(() => {
      result.current.handleDeleteDailyBriefingEmailPreset(defaultPresetId);
    });

    expect(result.current.dailyBriefingEmailPresets).toHaveLength(initialCount);
  });

  it('applies email preset recipients', async () => {
    const { result } = renderHook(() => useDailyBriefing(makeProps()));

    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });

    // Add and save a preset with known recipients
    act(() => {
      result.current.handleAddDailyBriefingEmailPreset();
    });
    const addedPreset = result.current.dailyBriefingEmailPresets[result.current.dailyBriefingEmailPresets.length - 1];

    act(() => {
      result.current.setDailyBriefingEmailRecipients('preset@example.com');
      result.current.setDailyBriefingEmailCcRecipients('');
    });
    act(() => {
      result.current.handleSaveDailyBriefingEmailPreset(addedPreset.id);
    });

    // Clear recipients
    act(() => {
      result.current.setDailyBriefingEmailRecipients('');
    });

    // Apply preset
    act(() => {
      result.current.handleApplyDailyBriefingEmailPreset(addedPreset.id);
    });

    expect(result.current.dailyBriefingEmailRecipients).toBe('preset@example.com');
  });

  // -------------------------------------------------------------------------
  // Dry-run
  // -------------------------------------------------------------------------

  it('calls updateResearchBriefingDistribution + runResearchBriefingDryRun on dry-run', async () => {
    const { result } = renderHook(() => useDailyBriefing(makeProps()));

    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });

    await act(async () => {
      await result.current.handleRunDailyBriefingDryRun();
    });

    expect(mockUpdateResearchBriefingDistribution).toHaveBeenCalledOnce();
    expect(mockRunResearchBriefingDryRun).toHaveBeenCalledOnce();
    const dryRunPayload = mockRunResearchBriefingDryRun.mock.calls[0][0];
    expect(dryRunPayload).toMatchObject({ channel: 'email' });
  });

  it('sets dryRunRunning flag during dry-run', async () => {
    let resolveCall!: (v: unknown) => void;
    const pendingPromise = new Promise((resolve) => {
      resolveCall = resolve;
    });
    // updateResearchBriefingDistribution resolves immediately; dry-run is pending
    mockUpdateResearchBriefingDistribution.mockResolvedValue({ success: true, data: {} });
    mockRunResearchBriefingDryRun.mockReturnValue(pendingPromise);

    const { result } = renderHook(() => useDailyBriefing(makeProps()));

    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });

    // Start async operation but don't await it yet
    let runPromise: Promise<void>;
    act(() => {
      runPromise = result.current.handleRunDailyBriefingDryRun();
    });

    // setDailyBriefingDryRunRunning(true) was called synchronously inside the handler
    expect(result.current.dailyBriefingDryRunRunning).toBe(true);

    // Resolve the pending dry-run and wait for all state updates
    await act(async () => {
      resolveCall({ success: true, data: { delivery_history: [], schedule: {} } });
      await runPromise;
    });

    expect(result.current.dailyBriefingDryRunRunning).toBe(false);
  });

  // -------------------------------------------------------------------------
  // Send
  // -------------------------------------------------------------------------

  it('calls updateResearchBriefingDistribution + sendResearchBriefing on send', async () => {
    const { result } = renderHook(() => useDailyBriefing(makeProps()));

    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });

    await act(async () => {
      await result.current.handleSendDailyBriefing();
    });

    expect(mockUpdateResearchBriefingDistribution).toHaveBeenCalledOnce();
    expect(mockSendResearchBriefing).toHaveBeenCalledOnce();
    const sendPayload = mockSendResearchBriefing.mock.calls[0][0];
    expect(sendPayload).toMatchObject({ channel: 'email' });
  });

  it('updates delivery history after successful send', async () => {
    const deliveryHistory = [{ id: 'rec-1', status: 'sent', created_at: '2026-06-05T09:00:00Z' }];
    mockSendResearchBriefing.mockResolvedValue({
      success: true,
      data: { delivery_history: deliveryHistory, schedule: {}, record: { status: 'sent' } },
    });

    const { result } = renderHook(() => useDailyBriefing(makeProps()));

    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });

    await act(async () => {
      await result.current.handleSendDailyBriefing();
    });

    expect(result.current.dailyBriefingDeliveryHistory).toEqual(deliveryHistory);
  });

  // -------------------------------------------------------------------------
  // computeds / memos
  // -------------------------------------------------------------------------

  it('exposes dailyBriefingDistributionConfig memo', async () => {
    const { result } = renderHook(() => useDailyBriefing(makeProps()));

    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });

    expect(result.current.dailyBriefingDistributionConfig).toMatchObject({
      enabled: true,
      sendTime: '08:30',
      timezone: 'Asia/Shanghai',
    });
  });

  it('activeDailyBriefingEmailPresetId is empty when no preset matches', async () => {
    const { result } = renderHook(() => useDailyBriefing(makeProps()));

    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });

    // No preset has to_recipients='test@example.com' by default
    expect(result.current.activeDailyBriefingEmailPresetId).toBe('');
  });
});
