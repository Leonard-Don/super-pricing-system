import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// ---------------------------------------------------------------------------
// Mock useDailyBriefing BEFORE importing the component
// ---------------------------------------------------------------------------

const mockHandleRunDailyBriefingDryRun = vi.fn();
const mockHandleSendDailyBriefing = vi.fn();
const mockHandleAddDailyBriefingEmailPreset = vi.fn();
const mockHandleSaveDailyBriefingEmailPreset = vi.fn();
const mockHandleDeleteDailyBriefingEmailPreset = vi.fn();
const mockHandleApplyDailyBriefingEmailPreset = vi.fn();
const mockHandleSetDefaultDailyBriefingEmailPreset = vi.fn();
const mockHandleSaveDailyBriefingDistribution = vi.fn();
const mockSetDailyBriefingDistributionEnabled = vi.fn();
const mockSetDailyBriefingEmailRecipients = vi.fn();
const mockSetDailyBriefingEmailCcRecipients = vi.fn();

const defaultHookReturn = {
  dailyBriefingDistributionConfig: {
    enabled: true,
    sendTime: '09:00',
    timezone: 'Asia/Shanghai',
    weekdays: ['mon', 'tue', 'wed', 'thu', 'fri'],
    notificationChannels: 'email',
  },
  dailyBriefingEmailPresets: [
    { id: 'preset-1', name: '主要分发', toRecipients: 'main@example.com', ccRecipients: '' },
    { id: 'preset-2', name: '测试分发', toRecipients: 'test@example.com', ccRecipients: '' },
  ],
  dailyBriefingEmailRecipients: 'main@example.com',
  dailyBriefingEmailCcRecipients: '',
  dailyBriefingTeamNote: '',
  dailyBriefingDistributionEnabled: true,
  dailyBriefingDistributionTime: '09:00',
  dailyBriefingDistributionTimezone: 'Asia/Shanghai',
  dailyBriefingDistributionWeekdays: ['mon', 'tue', 'wed', 'thu', 'fri'],
  dailyBriefingNotificationChannels: 'email',
  dailyBriefingNotificationChannelOptions: [
    { id: 'email', label: 'Email', type: 'email', enabled: true, source: 'smtp' },
    { id: 'dry_run', label: 'Dry Run', type: 'dry_run', enabled: true, source: 'builtin' },
  ],
  dailyBriefingDryRunRunning: false,
  dailyBriefingSending: false,
  dailyBriefingDistributionSaving: false,
  dailyBriefingLastOpStatus: { type: null as null, message: '' },
  dailyBriefingSchedule: {
    enabled: true,
    status: 'active' as const,
    timezone: 'Asia/Shanghai',
    sendTime: '09:00',
    weekdays: ['mon', 'tue', 'wed', 'thu', 'fri'],
    nextRunAt: '',
    nextRunLabel: '明日 09:00',
    reason: '',
  },
  dailyBriefingDeliveryHistory: [],
  activeDailyBriefingEmailPresetId: 'preset-1',
  dailyBriefingDefaultEmailPresetId: '',
  dailyBriefingPdfExporting: false,
  dailyBriefingPreviewSeed: null,
  dailyBriefingRetryingRecordId: '',
  setDailyBriefingDistributionEnabled: mockSetDailyBriefingDistributionEnabled,
  setDailyBriefingDistributionTime: vi.fn(),
  setDailyBriefingDistributionTimezone: vi.fn(),
  setDailyBriefingDistributionWeekdays: vi.fn(),
  setDailyBriefingNotificationChannels: vi.fn(),
  setDailyBriefingEmailRecipients: mockSetDailyBriefingEmailRecipients,
  setDailyBriefingEmailCcRecipients: mockSetDailyBriefingEmailCcRecipients,
  setDailyBriefingTeamNote: vi.fn(),
  setDailyBriefingPdfExporting: vi.fn(),
  setDailyBriefingPreviewSeed: vi.fn(),
  handleRunDailyBriefingDryRun: mockHandleRunDailyBriefingDryRun,
  handleSendDailyBriefing: mockHandleSendDailyBriefing,
  handleAddDailyBriefingEmailPreset: mockHandleAddDailyBriefingEmailPreset,
  handleSaveDailyBriefingEmailPreset: mockHandleSaveDailyBriefingEmailPreset,
  handleDeleteDailyBriefingEmailPreset: mockHandleDeleteDailyBriefingEmailPreset,
  handleApplyDailyBriefingEmailPreset: mockHandleApplyDailyBriefingEmailPreset,
  handleSetDefaultDailyBriefingEmailPreset: mockHandleSetDefaultDailyBriefingEmailPreset,
  handleSaveDailyBriefingDistribution: mockHandleSaveDailyBriefingDistribution,
  handleChangeDailyBriefingEmailPresetName: vi.fn(),
  handleMoveDailyBriefingEmailPreset: vi.fn(),
  handleRetryDailyBriefingDelivery: vi.fn(),
};

vi.mock('@/features/workbench/hooks/useDailyBriefing', () => ({
  default: vi.fn(() => defaultHookReturn),
}));

// ---------------------------------------------------------------------------
// Import component AFTER mocks
// ---------------------------------------------------------------------------

import DailyBriefingPanel from '../DailyBriefingPanel';

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('DailyBriefingPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockHandleRunDailyBriefingDryRun.mockResolvedValue(undefined);
    mockHandleSendDailyBriefing.mockResolvedValue(undefined);
    mockHandleSaveDailyBriefingEmailPreset.mockResolvedValue(undefined);
  });

  const defaultProps = {
    workbenchDailyBriefing: { headline: 'Test Headline', summary: 'Test summary', chips: [], details: [] },
    workbenchViewSummary: { headline: 'All Tasks', scopedTaskLabel: '' },
    filteredTasks: [],
    onOpenPreview: vi.fn(),
  };

  // -------------------------------------------------------------------------
  // Distribution config rendering
  // -------------------------------------------------------------------------

  it('renders distribution config section', () => {
    render(<DailyBriefingPanel {...defaultProps} />);
    expect(screen.getByTestId('briefing-distribution-config')).toBeInTheDocument();
  });

  it('renders distribution enabled indicator', () => {
    render(<DailyBriefingPanel {...defaultProps} />);
    // enabled = true; label or toggle should be present
    expect(screen.getByTestId('briefing-distribution-enabled')).toBeInTheDocument();
  });

  it('renders send time and timezone', () => {
    render(<DailyBriefingPanel {...defaultProps} />);
    expect(screen.getByText(/09:00/)).toBeInTheDocument();
    expect(screen.getByText(/Asia\/Shanghai/)).toBeInTheDocument();
  });

  // -------------------------------------------------------------------------
  // Email preset list
  // -------------------------------------------------------------------------

  it('renders preset list with both presets', () => {
    render(<DailyBriefingPanel {...defaultProps} />);
    expect(screen.getByTestId('briefing-preset-list')).toBeInTheDocument();
    expect(screen.getByText('主要分发')).toBeInTheDocument();
    expect(screen.getByText('测试分发')).toBeInTheDocument();
  });

  it('renders add-preset button', () => {
    render(<DailyBriefingPanel {...defaultProps} />);
    expect(screen.getByTestId('briefing-add-preset-btn')).toBeInTheDocument();
  });

  it('calls handleAddDailyBriefingEmailPreset when add-preset clicked', async () => {
    render(<DailyBriefingPanel {...defaultProps} />);
    await userEvent.click(screen.getByTestId('briefing-add-preset-btn'));
    expect(mockHandleAddDailyBriefingEmailPreset).toHaveBeenCalledOnce();
  });

  it('renders apply button for each preset', () => {
    render(<DailyBriefingPanel {...defaultProps} />);
    const applyBtns = screen.getAllByTestId(/briefing-preset-apply-/);
    expect(applyBtns).toHaveLength(2);
  });

  it('calls handleApplyDailyBriefingEmailPreset with correct id when apply clicked', async () => {
    render(<DailyBriefingPanel {...defaultProps} />);
    await userEvent.click(screen.getByTestId('briefing-preset-apply-preset-1'));
    expect(mockHandleApplyDailyBriefingEmailPreset).toHaveBeenCalledWith('preset-1');
  });

  it('renders save button for each preset', () => {
    render(<DailyBriefingPanel {...defaultProps} />);
    const saveBtns = screen.getAllByTestId(/briefing-preset-save-/);
    expect(saveBtns).toHaveLength(2);
  });

  it('calls handleSaveDailyBriefingEmailPreset with correct id when save clicked', async () => {
    render(<DailyBriefingPanel {...defaultProps} />);
    await userEvent.click(screen.getByTestId('briefing-preset-save-preset-1'));
    expect(mockHandleSaveDailyBriefingEmailPreset).toHaveBeenCalledWith('preset-1');
  });

  it('renders delete button for each preset', () => {
    render(<DailyBriefingPanel {...defaultProps} />);
    const deleteBtns = screen.getAllByTestId(/briefing-preset-delete-/);
    expect(deleteBtns).toHaveLength(2);
  });

  it('calls handleDeleteDailyBriefingEmailPreset with correct id when delete clicked', async () => {
    render(<DailyBriefingPanel {...defaultProps} />);
    await userEvent.click(screen.getByTestId('briefing-preset-delete-preset-1'));
    expect(mockHandleDeleteDailyBriefingEmailPreset).toHaveBeenCalledWith('preset-1');
  });

  it('renders set-default button for each preset', () => {
    render(<DailyBriefingPanel {...defaultProps} />);
    const defaultBtns = screen.getAllByTestId(/briefing-preset-setdefault-/);
    expect(defaultBtns).toHaveLength(2);
  });

  it('calls handleSetDefaultDailyBriefingEmailPreset with correct id', async () => {
    render(<DailyBriefingPanel {...defaultProps} />);
    await userEvent.click(screen.getByTestId('briefing-preset-setdefault-preset-2'));
    expect(mockHandleSetDefaultDailyBriefingEmailPreset).toHaveBeenCalledWith('preset-2');
  });

  // -------------------------------------------------------------------------
  // Dry-run button
  // -------------------------------------------------------------------------

  it('renders dry-run button', () => {
    render(<DailyBriefingPanel {...defaultProps} />);
    expect(screen.getByTestId('briefing-dryrun-btn')).toBeInTheDocument();
  });

  it('calls handleRunDailyBriefingDryRun when dry-run button clicked', async () => {
    render(<DailyBriefingPanel {...defaultProps} />);
    await userEvent.click(screen.getByTestId('briefing-dryrun-btn'));
    expect(mockHandleRunDailyBriefingDryRun).toHaveBeenCalledOnce();
  });

  it('disables dry-run button while running', async () => {
    const useDailyBriefingModule = await import('@/features/workbench/hooks/useDailyBriefing');
    vi.mocked(useDailyBriefingModule.default).mockReturnValueOnce({
      ...defaultHookReturn,
      dailyBriefingDryRunRunning: true,
    });

    render(<DailyBriefingPanel {...defaultProps} />);
    expect(screen.getByTestId('briefing-dryrun-btn')).toBeDisabled();
  });

  // -------------------------------------------------------------------------
  // Send button
  // -------------------------------------------------------------------------

  it('renders send button', () => {
    render(<DailyBriefingPanel {...defaultProps} />);
    expect(screen.getByTestId('briefing-send-btn')).toBeInTheDocument();
  });

  it('calls handleSendDailyBriefing when send button clicked', async () => {
    render(<DailyBriefingPanel {...defaultProps} />);
    await userEvent.click(screen.getByTestId('briefing-send-btn'));
    expect(mockHandleSendDailyBriefing).toHaveBeenCalledOnce();
  });

  it('disables send button while sending', async () => {
    const useDailyBriefingModule = await import('@/features/workbench/hooks/useDailyBriefing');
    vi.mocked(useDailyBriefingModule.default).mockReturnValueOnce({
      ...defaultHookReturn,
      dailyBriefingSending: true,
    });

    render(<DailyBriefingPanel {...defaultProps} />);
    expect(screen.getByTestId('briefing-send-btn')).toBeDisabled();
  });

  // -------------------------------------------------------------------------
  // Preview trigger
  // -------------------------------------------------------------------------

  it('renders preview trigger button', () => {
    render(<DailyBriefingPanel {...defaultProps} />);
    expect(screen.getByTestId('briefing-preview-btn')).toBeInTheDocument();
  });

  it('calls onOpenPreview when preview button clicked', async () => {
    const onOpenPreview = vi.fn();
    render(<DailyBriefingPanel {...defaultProps} onOpenPreview={onOpenPreview} />);
    await userEvent.click(screen.getByTestId('briefing-preview-btn'));
    expect(onOpenPreview).toHaveBeenCalledOnce();
  });

  // -------------------------------------------------------------------------
  // Status display
  // -------------------------------------------------------------------------

  it('renders status message when lastOpStatus has a message', async () => {
    const useDailyBriefingModule = await import('@/features/workbench/hooks/useDailyBriefing');
    vi.mocked(useDailyBriefingModule.default).mockReturnValueOnce({
      ...defaultHookReturn,
      dailyBriefingLastOpStatus: { type: 'success', message: '已发送' },
    });

    render(<DailyBriefingPanel {...defaultProps} />);
    expect(screen.getByTestId('briefing-status-message')).toHaveTextContent('已发送');
  });

  it('does not render status message when type is null', () => {
    render(<DailyBriefingPanel {...defaultProps} />);
    expect(screen.queryByTestId('briefing-status-message')).not.toBeInTheDocument();
  });
});
