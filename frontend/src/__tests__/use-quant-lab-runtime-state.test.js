import { act, renderHook } from '@testing-library/react';

import useQuantLabRuntimeState from '../components/quant-lab/useQuantLabRuntimeState';
import {
  getApiAuthToken,
  getApiRefreshToken,
} from '../services/api';

jest.mock('../services/api', () => ({
  getApiAuthToken: jest.fn(),
  getApiRefreshToken: jest.fn(),
}));

describe('useQuantLabRuntimeState', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    getApiAuthToken.mockReturnValue('seed-access-token');
    getApiRefreshToken.mockReturnValue('seed-refresh-token');
  });

  test('hydrates auth tokens from the api cache and exposes grouped setters', () => {
    const { result } = renderHook(() => useQuantLabRuntimeState());

    expect(result.current.authState.authToken).toBe('seed-access-token');
    expect(result.current.authState.refreshToken).toBe('seed-refresh-token');
    expect(result.current.strategyState.strategies).toEqual([]);
    expect(result.current.infrastructureState.infrastructureStatus.task_queue.broker_states).toEqual([]);

    act(() => {
      result.current.strategyState.setStrategies([{ name: 'moving_average' }]);
      result.current.authState.setAuthSession({ user: { subject: 'researcher' } });
      result.current.experimentState.setOptimizerLoading(true);
      result.current.operationsState.setDataQuality({ summary: { degraded: 1 } });
    });

    expect(result.current.strategyState.strategies).toEqual([{ name: 'moving_average' }]);
    expect(result.current.authState.authSession).toEqual({ user: { subject: 'researcher' } });
    expect(result.current.experimentState.optimizerLoading).toBe(true);
    expect(result.current.operationsState.dataQuality).toEqual({ summary: { degraded: 1 } });
  });
});
