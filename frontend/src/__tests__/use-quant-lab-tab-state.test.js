import { act, renderHook } from '@testing-library/react';

import useQuantLabTabState from '../components/quant-lab/useQuantLabTabState';

describe('useQuantLabTabState', () => {
  test('tracks the active tab and keeps deferred support tabs mounted after first visit', () => {
    const { result } = renderHook(() => useQuantLabTabState());

    expect(result.current.activeTab).toBe('valuation');
    expect(result.current.activeTabMeta.key).toBe('valuation');
    expect(result.current.mountedInfrastructure).toBe(false);
    expect(result.current.mountedOperations).toBe(false);

    act(() => {
      result.current.handleTabChange('infrastructure');
    });

    expect(result.current.activeTab).toBe('infrastructure');
    expect(result.current.activeTabMeta.key).toBe('infrastructure');
    expect(result.current.mountedInfrastructure).toBe(true);

    act(() => {
      result.current.handleTabChange('valuation');
    });

    expect(result.current.activeTab).toBe('valuation');
    expect(result.current.mountedInfrastructure).toBe(true);

    act(() => {
      result.current.handleTabChange('ops');
    });

    expect(result.current.activeTab).toBe('ops');
    expect(result.current.mountedOperations).toBe(true);

    act(() => {
      result.current.handleTabChange('factor');
    });

    expect(result.current.activeTab).toBe('factor');
    expect(result.current.mountedInfrastructure).toBe(true);
    expect(result.current.mountedOperations).toBe(true);
  });
});
