import { useCallback } from 'react';
import {
  diffConfigVersions,
  getConfigVersions,
  restoreConfigVersion,
  saveConfigVersion,
} from '../../services/api';

const buildConfigScope = (values) => ({
  ownerId: values.owner_id || 'default',
  configType: values.config_type,
  configKey: values.config_key,
});

const parseOptionalJson = (value) => (value ? JSON.parse(value) : {});

function useQuantLabConfigVersionActions({
  activeConfigScope,
  configVersions,
  message,
  setActiveConfigScope,
  setConfigDiff,
  setConfigVersionLoading,
  setConfigVersions,
}) {
  const handleLoadConfigVersions = useCallback(async (values) => {
    setConfigVersionLoading(true);
    try {
      const scope = buildConfigScope(values);
      const response = await getConfigVersions({ ...scope, limit: values.limit || 20 });
      setActiveConfigScope(scope);
      setConfigVersions(response.versions || []);
      setConfigDiff(null);
      message.success('配置版本历史已加载');
    } catch (error) {
      message.error(`加载配置版本失败: ${error.userMessage || error.message}`);
    } finally {
      setConfigVersionLoading(false);
    }
  }, [message, setActiveConfigScope, setConfigDiff, setConfigVersionLoading, setConfigVersions]);

  const handleSaveConfigVersion = useCallback(async (values) => {
    setConfigVersionLoading(true);
    try {
      const payload = parseOptionalJson(values.payload);
      const response = await saveConfigVersion({
        owner_id: values.owner_id || 'default',
        config_type: values.config_type,
        config_key: values.config_key,
        payload,
      });
      const scope = buildConfigScope(values);
      setActiveConfigScope(scope);
      const versions = await getConfigVersions({ ...scope, limit: 20 });
      setConfigVersions(versions.versions || []);
      setConfigDiff(null);
      message.success(`配置版本 v${response.payload?.version || ''} 已保存`);
    } catch (error) {
      message.error(`保存配置版本失败: ${error instanceof SyntaxError ? 'JSON 格式无效' : error.userMessage || error.message}`);
    } finally {
      setConfigVersionLoading(false);
    }
  }, [message, setActiveConfigScope, setConfigDiff, setConfigVersionLoading, setConfigVersions]);

  const handleDiffLatestConfigVersions = useCallback(async () => {
    const ordered = [...configVersions]
      .map((record) => record.payload)
      .filter(Boolean)
      .sort((a, b) => Number(b.version || 0) - Number(a.version || 0));
    if (ordered.length < 2) {
      message.warning('至少需要两个配置版本才能对比');
      return;
    }

    setConfigVersionLoading(true);
    try {
      const response = await diffConfigVersions({
        ...activeConfigScope,
        fromVersion: ordered[1].version,
        toVersion: ordered[0].version,
      });
      setConfigDiff(response);
      message.success('最新两版配置差异已生成');
    } catch (error) {
      message.error(`配置差异生成失败: ${error.userMessage || error.message}`);
    } finally {
      setConfigVersionLoading(false);
    }
  }, [activeConfigScope, configVersions, message, setConfigDiff, setConfigVersionLoading]);

  const handleRestoreConfigVersion = useCallback(async (record) => {
    const version = record?.payload?.version;
    if (!version) {
      message.warning('无法识别要恢复的版本');
      return;
    }

    setConfigVersionLoading(true);
    try {
      await restoreConfigVersion({
        owner_id: activeConfigScope.ownerId,
        config_type: activeConfigScope.configType,
        config_key: activeConfigScope.configKey,
        version,
      });
      const response = await getConfigVersions({ ...activeConfigScope, limit: 20 });
      setConfigVersions(response.versions || []);
      setConfigDiff(null);
      message.success(`已从 v${version} 恢复为新版本`);
    } catch (error) {
      message.error(`恢复配置版本失败: ${error.userMessage || error.message}`);
    } finally {
      setConfigVersionLoading(false);
    }
  }, [activeConfigScope, message, setConfigDiff, setConfigVersionLoading, setConfigVersions]);

  return {
    handleDiffLatestConfigVersions,
    handleLoadConfigVersions,
    handleRestoreConfigVersion,
    handleSaveConfigVersion,
  };
}

export default useQuantLabConfigVersionActions;
