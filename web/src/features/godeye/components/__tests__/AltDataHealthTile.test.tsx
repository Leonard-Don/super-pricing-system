// ---------------------------------------------------------------------------
// AltDataHealthTile tests — TDD: write first → run → fail → implement → pass
// Self-fetching tile; mocks @/services/api/altDataAndMacro
// ---------------------------------------------------------------------------

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';

// ---------------------------------------------------------------------------
// Mock API before importing component
// ---------------------------------------------------------------------------

vi.mock('@/services/api/altDataAndMacro', () => ({
  getAltDataHealth: vi.fn(),
}));

import AltDataHealthTile from '../AltDataHealthTile';
import * as altDataApi from '@/services/api/altDataAndMacro';

// ---------------------------------------------------------------------------
// Minimal payload
// ---------------------------------------------------------------------------

const minimalHealthPayload = {
  total_components: 2,
  production_count: 1,
  working_prototype_count: 1,
  scaffolding_only_count: 0,
  dead_count: 0,
  generated_at: '2026-06-05T10:00:00Z',
  audit_doc_url: 'docs/alt_data_audit.md',
  manifest: [
    {
      name: 'narrative',
      sub_package: 'narrative',
      verdict: 'PRODUCTION',
      last_refresh_at: '2026-06-05T09:00:00Z',
      audit_section_ref: null,
    },
    {
      name: 'composite_signal',
      sub_package: 'composite',
      verdict: 'WORKING-PROTOTYPE',
      last_refresh_at: null,
      audit_section_ref: null,
    },
  ],
};

describe('AltDataHealthTile', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(altDataApi.getAltDataHealth).mockResolvedValue(minimalHealthPayload);
  });

  it('renders card title 另类数据健康', async () => {
    render(<AltDataHealthTile />);
    await waitFor(() => expect(screen.getByText('另类数据健康')).toBeDefined());
  });

  it('renders PRODUCTION verdict badge after load', async () => {
    render(<AltDataHealthTile />);
    await waitFor(() =>
      expect(screen.getByTestId('alt-data-health-verdict-PRODUCTION')).toBeDefined(),
    );
  });

  it('renders WORKING-PROTOTYPE verdict badge after load', async () => {
    render(<AltDataHealthTile />);
    await waitFor(() =>
      expect(screen.getByTestId('alt-data-health-verdict-WORKING-PROTOTYPE')).toBeDefined(),
    );
  });

  it('renders summary stat cards', async () => {
    render(<AltDataHealthTile />);
    await waitFor(() =>
      expect(screen.getByTestId('alt-data-health-summary')).toBeDefined(),
    );
  });

  it('renders total component count in footer', async () => {
    render(<AltDataHealthTile />);
    await waitFor(() => expect(screen.getByText(/共.*2.*个组件/)).toBeDefined());
  });

  it('shows error state when API rejects', async () => {
    vi.mocked(altDataApi.getAltDataHealth).mockRejectedValue(new Error('网络错误'));
    render(<AltDataHealthTile />);
    await waitFor(() =>
      expect(screen.getByTestId('alt-data-health-error')).toBeDefined(),
    );
  });

  it('shows empty state when manifest is empty', async () => {
    vi.mocked(altDataApi.getAltDataHealth).mockResolvedValue({
      ...minimalHealthPayload,
      manifest: [],
      total_components: 0,
    });
    render(<AltDataHealthTile />);
    await waitFor(() =>
      expect(screen.getByTestId('alt-data-health-empty')).toBeDefined(),
    );
  });

  it('renders refresh button', async () => {
    render(<AltDataHealthTile />);
    await waitFor(() =>
      expect(screen.getByTestId('alt-data-health-refresh')).toBeDefined(),
    );
  });
});
