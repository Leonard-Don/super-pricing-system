import { useEffect } from 'react';
import { getStrategies } from '../../services/api';

function useQuantLabStrategyCatalog({
  message,
  setStrategies,
}) {
  useEffect(() => {
    let cancelled = false;

    getStrategies()
      .then((payload) => {
        if (!cancelled) {
          setStrategies(payload);
        }
      })
      .catch((error) => {
        if (!cancelled) {
          message.error(`加载策略定义失败: ${error.userMessage || error.message}`);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [message, setStrategies]);
}

export default useQuantLabStrategyCatalog;
