import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';

// ---------------------------------------------------------------------------
// Mock both hooks + the preview drawer BEFORE importing the cluster.
//
// The cluster must own the single `useDailyBriefing` instance and drive the
// panel from it — the panel must NOT instantiate the hook a second time.
//
// vi.hoisted keeps the spies initialized before the hoisted vi.mock factories
// run; return values are wired per-test in beforeEach.
// ---------------------------------------------------------------------------

const { mockUseDailyBriefing, mockUseDailyBriefingSharing } = vi.hoisted(() => ({
  mockUseDailyBriefing: vi.fn(),
  mockUseDailyBriefingSharing: vi.fn(),
}));

vi.mock('@/features/workbench/hooks/useDailyBriefing', () => ({
  default: mockUseDailyBriefing,
}));

vi.mock('@/features/workbench/hooks/useDailyBriefingSharing', () => ({
  default: mockUseDailyBriefingSharing,
}));

// Stub the preview drawer so the test stays focused on hook wiring.
vi.mock('@/features/workbench/components/DailyBriefingPreviewDrawer', () => ({
  default: () => <div data-testid="preview-drawer-stub" />,
}));

// ---------------------------------------------------------------------------
// Import the component AFTER mocks
// ---------------------------------------------------------------------------

import DailyBriefingCluster from '../DailyBriefingCluster';

const briefingMock = {
  dailyBriefingDistributionEnabled: true,
  dailyBriefingDistributionTime: '09:00',
  dailyBriefingDistributionTimezone: 'Asia/Shanghai',
  dailyBriefingDistributionWeekdays: ['mon', 'tue', 'wed', 'thu', 'fri'],
  dailyBriefingEmailPresets: [
    { id: 'preset-1', name: '主要分发', toRecipients: 'main@example.com', ccRecipients: '' },
    { id: 'preset-2', name: '测试分发', toRecipients: 'test@example.com', ccRecipients: '' },
  ],
  dailyBriefingEmailRecipients: 'main@example.com',
  dailyBriefingEmailCcRecipients: 'cc@example.com',
  dailyBriefingTeamNote: 'note',
  dailyBriefingDryRunRunning: false,
  dailyBriefingSending: false,
  dailyBriefingLastOpStatus: { type: null, message: '' },
  activeDailyBriefingEmailPresetId: 'preset-1',
  dailyBriefingDefaultEmailPresetId: '',
  dailyBriefingPdfExporting: false,
  dailyBriefingPreviewSeed: null,
  setDailyBriefingPreviewSeed: vi.fn(),
  setDailyBriefingPdfExporting: vi.fn(),
  handleRunDailyBriefingDryRun: vi.fn(),
  handleSendDailyBriefing: vi.fn(),
  handleAddDailyBriefingEmailPreset: vi.fn(),
  handleSaveDailyBriefingEmailPreset: vi.fn(),
  handleDeleteDailyBriefingEmailPreset: vi.fn(),
  handleApplyDailyBriefingEmailPreset: vi.fn(),
  handleSetDefaultDailyBriefingEmailPreset: vi.fn(),
};

const sharingMock = {
  buildDailyBriefingShareArtifacts: vi.fn(() => ({})),
  handleOpenDailyBriefingPreviewDrawer: vi.fn(),
  handleCloseDailyBriefingPreviewDrawer: vi.fn(),
  handleRefreshDailyBriefingPreview: vi.fn(),
  handleCopyDailyBriefingHtml: vi.fn(),
  handleCopyDailyBriefingEmailBody: vi.fn(),
  handleCopyDailyBriefingEmailSubject: vi.fn(),
  handleDownloadDailyBriefingHtml: vi.fn(),
  handleOpenDailyBriefingEmailTemplatePage: vi.fn(),
  handleOpenDailyBriefingMailDraft: vi.fn(),
  handleExportDailyBriefingPdf: vi.fn(),
  dailyBriefingPreviewArtifacts: null,
  dailyBriefingPreviewMailDraftStatus: null,
  canOpenDailyBriefingPreviewMailDraft: false,
};

const defaultProps = {
  workbenchDailyBriefing: { headline: 'H', summary: 'S', chips: [], details: [] },
  workbenchViewSummary: { headline: 'All Tasks', scopedTaskLabel: '' },
  filteredTasks: [],
  filters: {} as never,
  autoRefreshSummary: {} as never,
};

describe('DailyBriefingCluster', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseDailyBriefing.mockReturnValue(briefingMock);
    mockUseDailyBriefingSharing.mockReturnValue(sharingMock);
  });

  it('instantiates useDailyBriefing exactly once for the whole cluster', () => {
    render(<DailyBriefingCluster {...defaultProps} />);
    // The panel must read from the cluster's instance — not call the hook itself.
    expect(mockUseDailyBriefing).toHaveBeenCalledTimes(1);
  });

  it('drives the panel from the cluster-owned briefing instance', () => {
    render(<DailyBriefingCluster {...defaultProps} />);
    // Presets supplied by the single briefing instance render inside the panel.
    expect(screen.getByTestId('daily-briefing-panel')).toBeInTheDocument();
    expect(screen.getByText('主要分发')).toBeInTheDocument();
    expect(screen.getByText('测试分发')).toBeInTheDocument();
  });

  it('feeds the sharing hook from the same briefing instance (preset edits stay connected)', () => {
    render(<DailyBriefingCluster {...defaultProps} />);
    // The sharing hook reads the recipients off the one shared instance, so
    // preset edits made in the panel flow into the email preview/share state.
    expect(mockUseDailyBriefingSharing).toHaveBeenCalledTimes(1);
    expect(mockUseDailyBriefingSharing).toHaveBeenCalledWith(
      expect.objectContaining({
        dailyBriefingEmailRecipients: briefingMock.dailyBriefingEmailRecipients,
        dailyBriefingEmailCcRecipients: briefingMock.dailyBriefingEmailCcRecipients,
        dailyBriefingTeamNote: briefingMock.dailyBriefingTeamNote,
      }),
    );
  });
});
