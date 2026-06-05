import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { components } from '@/generated/api-types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type AltDataCandidate = components['schemas']['AltDataCandidate'];

// ---------------------------------------------------------------------------
// Mock useAltDataCandidates BEFORE importing the component
// ---------------------------------------------------------------------------

const mockConvert = vi.fn();
const mockDismiss = vi.fn();
const mockSnooze = vi.fn();
const mockRefresh = vi.fn();

const makeCandidate = (id: string, overrides: Partial<AltDataCandidate> = {}): AltDataCandidate => ({
  candidate_id: id,
  source_component: 'test-source',
  signal_type: 'sentiment',
  industry: '科技',
  headline: `候选标题 ${id}`,
  impact_score: 0.8,
  mentions: 5,
  generated_at: '2026-06-05T08:00:00Z',
  state: 'pending',
  last_seen_at: '2026-06-05T08:00:00Z',
  ...overrides,
});

const defaultCandidates: AltDataCandidate[] = [
  makeCandidate('cand-1'),
  makeCandidate('cand-2', { headline: '另一候选', industry: '金融' }),
];

const defaultHookReturn = {
  candidates: defaultCandidates,
  loading: false,
  error: null as string | null,
  convert: mockConvert,
  dismiss: mockDismiss,
  snooze: mockSnooze,
  refresh: mockRefresh,
};

vi.mock('@/features/workbench/hooks/useAltDataCandidates', () => ({
  default: vi.fn(() => defaultHookReturn),
}));

// ---------------------------------------------------------------------------
// Import component AFTER mocks
// ---------------------------------------------------------------------------

import AltDataCandidateQueue from '../AltDataCandidateQueue';

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('AltDataCandidateQueue', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockConvert.mockResolvedValue(undefined);
    mockDismiss.mockResolvedValue(undefined);
    mockSnooze.mockResolvedValue(undefined);
    mockRefresh.mockResolvedValue(undefined);
  });

  // -------------------------------------------------------------------------
  // Rendering candidates
  // -------------------------------------------------------------------------

  it('renders the candidate queue container', () => {
    render(<AltDataCandidateQueue />);
    expect(screen.getByTestId('alt-data-candidate-queue')).toBeInTheDocument();
  });

  it('renders all candidate rows', () => {
    render(<AltDataCandidateQueue />);
    expect(screen.getByTestId('candidate-row-cand-1')).toBeInTheDocument();
    expect(screen.getByTestId('candidate-row-cand-2')).toBeInTheDocument();
  });

  it('renders candidate headline text', () => {
    render(<AltDataCandidateQueue />);
    expect(screen.getByText('候选标题 cand-1')).toBeInTheDocument();
    expect(screen.getByText('另一候选')).toBeInTheDocument();
  });

  // -------------------------------------------------------------------------
  // Action buttons — convert
  // -------------------------------------------------------------------------

  it('renders convert button for each candidate', () => {
    render(<AltDataCandidateQueue />);
    expect(screen.getByTestId('candidate-convert-cand-1')).toBeInTheDocument();
    expect(screen.getByTestId('candidate-convert-cand-2')).toBeInTheDocument();
  });

  it('calls convert with candidate_id when convert button clicked', async () => {
    render(<AltDataCandidateQueue />);
    await userEvent.click(screen.getByTestId('candidate-convert-cand-1'));
    expect(mockConvert).toHaveBeenCalledWith('cand-1');
  });

  // -------------------------------------------------------------------------
  // Action buttons — dismiss
  // -------------------------------------------------------------------------

  it('renders dismiss button for each candidate', () => {
    render(<AltDataCandidateQueue />);
    expect(screen.getByTestId('candidate-dismiss-cand-1')).toBeInTheDocument();
    expect(screen.getByTestId('candidate-dismiss-cand-2')).toBeInTheDocument();
  });

  it('calls dismiss with candidate_id when dismiss button clicked', async () => {
    render(<AltDataCandidateQueue />);
    await userEvent.click(screen.getByTestId('candidate-dismiss-cand-2'));
    expect(mockDismiss).toHaveBeenCalledWith('cand-2');
  });

  // -------------------------------------------------------------------------
  // Action buttons — snooze
  // -------------------------------------------------------------------------

  it('renders snooze button for each candidate', () => {
    render(<AltDataCandidateQueue />);
    expect(screen.getByTestId('candidate-snooze-cand-1')).toBeInTheDocument();
    expect(screen.getByTestId('candidate-snooze-cand-2')).toBeInTheDocument();
  });

  it('calls snooze with candidate_id when snooze button clicked', async () => {
    render(<AltDataCandidateQueue />);
    await userEvent.click(screen.getByTestId('candidate-snooze-cand-1'));
    expect(mockSnooze).toHaveBeenCalledWith('cand-1');
  });

  // -------------------------------------------------------------------------
  // Refresh button
  // -------------------------------------------------------------------------

  it('renders refresh button', () => {
    render(<AltDataCandidateQueue />);
    expect(screen.getByTestId('alt-data-refresh-btn')).toBeInTheDocument();
  });

  it('calls refresh when refresh button clicked', async () => {
    render(<AltDataCandidateQueue />);
    await userEvent.click(screen.getByTestId('alt-data-refresh-btn'));
    expect(mockRefresh).toHaveBeenCalledOnce();
  });

  // -------------------------------------------------------------------------
  // Loading state
  // -------------------------------------------------------------------------

  it('renders loading state when loading=true and candidates empty', async () => {
    const useAltDataCandidatesModule = await import(
      '@/features/workbench/hooks/useAltDataCandidates'
    );
    vi.mocked(useAltDataCandidatesModule.default).mockReturnValueOnce({
      ...defaultHookReturn,
      candidates: [],
      loading: true,
    });

    render(<AltDataCandidateQueue />);
    expect(screen.getByTestId('alt-data-candidate-loading')).toBeInTheDocument();
  });

  // -------------------------------------------------------------------------
  // Empty state
  // -------------------------------------------------------------------------

  it('renders empty state when no candidates and not loading', async () => {
    const useAltDataCandidatesModule = await import(
      '@/features/workbench/hooks/useAltDataCandidates'
    );
    vi.mocked(useAltDataCandidatesModule.default).mockReturnValueOnce({
      ...defaultHookReturn,
      candidates: [],
      loading: false,
    });

    render(<AltDataCandidateQueue />);
    expect(screen.getByTestId('alt-data-candidate-empty')).toBeInTheDocument();
  });

  // -------------------------------------------------------------------------
  // Error state
  // -------------------------------------------------------------------------

  it('renders error message when error is non-null', async () => {
    const useAltDataCandidatesModule = await import(
      '@/features/workbench/hooks/useAltDataCandidates'
    );
    vi.mocked(useAltDataCandidatesModule.default).mockReturnValueOnce({
      ...defaultHookReturn,
      candidates: [],
      loading: false,
      error: '加载失败',
    });

    render(<AltDataCandidateQueue />);
    expect(screen.getByTestId('alt-data-candidate-error')).toHaveTextContent('加载失败');
  });
});
