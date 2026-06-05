import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import WorkbenchFilters from '../WorkbenchFilters';
import type { WorkbenchFiltersProps } from '../WorkbenchFilters';

const emptyFilters = {
  type: '',
  source: '',
  refresh: '',
  reason: '',
  snapshotView: '',
  snapshotFingerprint: '',
  snapshotSummary: '',
  keyword: '',
};

const defaultRefreshStats = {
  high: 2,
  medium: 3,
  low: 1,
  resonance: 0,
  biasQualityCore: 0,
  selectionQualityActive: 0,
  reviewContext: 1,
  structuralDecayRadar: 0,
  priorityNew: 0,
  priorityEscalated: 0,
  peopleLayer: 0,
  departmentChaos: 0,
  selectionQuality: 0,
  snapshotViewFiltered: 0,
  snapshotViewScoped: 0,
};

const defaultProps: WorkbenchFiltersProps = {
  filters: emptyFilters,
  setFilters: vi.fn(),
  sourceOptions: [
    { label: '全部来源', value: '' },
    { label: 'GodEye', value: 'godeye' },
  ],
  refreshStats: defaultRefreshStats,
  morningPresetActive: false,
  morningPresetCandidate: null,
  onApplyMorningPreset: vi.fn(),
};

describe('WorkbenchFilters', () => {
  it('renders keyword search input', () => {
    render(<WorkbenchFilters {...defaultProps} />);
    expect(screen.getByPlaceholderText(/关键词/i)).toBeInTheDocument();
  });

  it('renders type filter control', () => {
    render(<WorkbenchFilters {...defaultProps} />);
    // base-ui Select renders a combobox trigger button
    const combos = screen.getAllByRole('combobox');
    // At minimum: type, source, refresh = 3 selects
    expect(combos.length).toBeGreaterThanOrEqual(3);
  });

  it('renders refresh signal stats', () => {
    render(<WorkbenchFilters {...defaultProps} />);
    // refreshStats.high = 2
    expect(screen.getByTestId('refresh-stat-high')).toHaveTextContent('2');
    // refreshStats.medium = 3
    expect(screen.getByTestId('refresh-stat-medium')).toHaveTextContent('3');
  });

  it('calls setFilters when keyword changes', async () => {
    const setFilters = vi.fn();
    render(<WorkbenchFilters {...defaultProps} setFilters={setFilters} />);
    const input = screen.getByPlaceholderText(/关键词/i);
    await userEvent.type(input, 'T');
    expect(setFilters).toHaveBeenCalled();
  });

  it('renders morning-preset button when candidate is present', () => {
    render(
      <WorkbenchFilters
        {...defaultProps}
        morningPresetCandidate={{ label: '晨间预设', filters: {} }}
        morningPresetActive={false}
      />,
    );
    expect(
      screen.getByRole('button', { name: /晨间默认视图/i }),
    ).toBeInTheDocument();
  });

  it('morning-preset button is disabled when preset is already active', () => {
    render(
      <WorkbenchFilters
        {...defaultProps}
        morningPresetCandidate={{ label: '晨间预设', filters: {} }}
        morningPresetActive={true}
      />,
    );
    expect(
      screen.getByRole('button', { name: /晨间默认视图已生效/i }),
    ).toBeDisabled();
  });

  it('calls onApplyMorningPreset when the button is clicked', async () => {
    const onApplyMorningPreset = vi.fn();
    render(
      <WorkbenchFilters
        {...defaultProps}
        morningPresetCandidate={{ label: '晨间预设', filters: {} }}
        morningPresetActive={false}
        onApplyMorningPreset={onApplyMorningPreset}
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: /切回晨间默认视图/i }));
    expect(onApplyMorningPreset).toHaveBeenCalledOnce();
  });

  it('does not render morning-preset button when no candidate', () => {
    render(<WorkbenchFilters {...defaultProps} morningPresetCandidate={null} />);
    expect(screen.queryByRole('button', { name: /晨间默认视图/i })).not.toBeInTheDocument();
  });
});
