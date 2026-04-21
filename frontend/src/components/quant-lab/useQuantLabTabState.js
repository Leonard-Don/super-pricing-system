import { startTransition, useCallback, useState } from 'react';
import { QUANT_LAB_TAB_META, QUANT_LAB_TAB_META_MAP } from './quantLabShared';

function useQuantLabTabState() {
  const [activeTab, setActiveTab] = useState('optimizer');
  const [mountedTabKeys, setMountedTabKeys] = useState(() => ({ optimizer: true }));

  const handleTabChange = useCallback((nextKey) => {
    startTransition(() => {
      setMountedTabKeys((current) => (
        current[nextKey]
          ? current
          : { ...current, [nextKey]: true }
      ));
      setActiveTab(nextKey);
    });
  }, []);

  return {
    activeTab,
    activeTabMeta: QUANT_LAB_TAB_META_MAP[activeTab] || QUANT_LAB_TAB_META[0],
    handleTabChange,
    mountedInfrastructure: Boolean(mountedTabKeys.infrastructure),
    mountedOperations: Boolean(mountedTabKeys.ops),
  };
}

export default useQuantLabTabState;
