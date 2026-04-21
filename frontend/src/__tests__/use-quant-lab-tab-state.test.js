import { act, renderHook } from '@testing-library/react';

import useQuantLabTabState from '../components/quant-lab/useQuantLabTabState';

describe('useQuantLabTabState', () => {
  test('tracks the active tab and keeps infrastructure mounted after first visit', () => {
    const { result } = renderHook(() => useQuantLabTabState());

    expect(result.current.activeTab).toBe('optimizer');
    expect(result.current.activeTabMeta.key).toBe('optimizer');
    expect(result.current.mountedInfrastructure).toBe(false);

    act(() => {
      result.current.handleTabChange('infrastructure');
    });

    expect(result.current.activeTab).toBe('infrastructure');
    expect(result.current.activeTabMeta.key).toBe('infrastructure');
    expect(result.current.mountedInfrastructure).toBe(true);

    act(() => {
      result.current.handleTabChange('optimizer');
    });

    expect(result.current.activeTab).toBe('optimizer');
    expect(result.current.mountedInfrastructure).toBe(true);
  });
});
