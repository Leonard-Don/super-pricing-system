import { useEffect, useMemo, useRef, useState } from 'react';

import {
  getInfrastructureStatus,
  getResearchBriefingDistribution,
  runResearchBriefingDryRun,
  sendResearchBriefing,
  updateResearchBriefingDistribution,
} from '../../services/api';
import {
  DAILY_BRIEFING_CC_STORAGE_KEY,
  DAILY_BRIEFING_DEFAULT_EMAIL_PRESET_STORAGE_KEY,
  DAILY_BRIEFING_EMAIL_PRESETS_STORAGE_KEY,
  DAILY_BRIEFING_EMAIL_PRESET_NAME_MAX_LENGTH,
  DAILY_BRIEFING_NOTE_STORAGE_KEY,
  DAILY_BRIEFING_RECIPIENTS_STORAGE_KEY,
  DEFAULT_DAILY_BRIEFING_DISTRIBUTION_WEEKDAYS,
  DEFAULT_DAILY_BRIEFING_EMAIL_PRESETS,
  buildDailyBriefingCustomPresetId,
  buildNextCustomDailyBriefingPresetName,
  isDefaultDailyBriefingEmailPresetId,
  matchesDailyBriefingEmailPreset,
  moveDailyBriefingCustomPresetOrder,
  normalizeDailyBriefingEmailPresets,
  normalizeDailyBriefingNotificationChannelOptions,
  normalizeDailyBriefingSchedule,
  normalizeServerDailyBriefingDistribution,
  parseDailyBriefingNotificationChannels,
  readDailyBriefingEmailPresets,
  readDailyBriefingLocalValue,
  readDailyBriefingTeamNote,
} from './dailyBriefingHelpers';

function useDailyBriefing({
  message,
  workbenchDailyBriefing,
  workbenchViewSummary,
  filteredTasks,
  buildShareArtifactsRef,
}) {
  const buildShareArtifacts = (referenceDate) => {
    const buildShareArtifactsImpl = buildShareArtifactsRef?.current;
    if (typeof buildShareArtifactsImpl !== 'function') {
      return {};
    }
    return buildShareArtifactsImpl(referenceDate);
  };
  const [dailyBriefingDefaultEmailPresetResolved, setDailyBriefingDefaultEmailPresetResolved] = useState(false);
  const [dailyBriefingDefaultEmailPresetId, setDailyBriefingDefaultEmailPresetId] = useState(() => readDailyBriefingLocalValue(DAILY_BRIEFING_DEFAULT_EMAIL_PRESET_STORAGE_KEY));
  const [dailyBriefingPdfExporting, setDailyBriefingPdfExporting] = useState(false);
  const [dailyBriefingPreviewSeed, setDailyBriefingPreviewSeed] = useState(null);
  const [dailyBriefingEmailCcRecipients, setDailyBriefingEmailCcRecipients] = useState(() => readDailyBriefingLocalValue(DAILY_BRIEFING_CC_STORAGE_KEY));
  const [dailyBriefingEmailPresets, setDailyBriefingEmailPresets] = useState(() => readDailyBriefingEmailPresets());
  const [dailyBriefingEmailRecipients, setDailyBriefingEmailRecipients] = useState(() => readDailyBriefingLocalValue(DAILY_BRIEFING_RECIPIENTS_STORAGE_KEY));
  const [dailyBriefingTeamNote, setDailyBriefingTeamNote] = useState(() => readDailyBriefingTeamNote());
  const [dailyBriefingDeliveryHistory, setDailyBriefingDeliveryHistory] = useState([]);
  const [dailyBriefingDistributionEnabled, setDailyBriefingDistributionEnabled] = useState(false);
  const [dailyBriefingDistributionSaving, setDailyBriefingDistributionSaving] = useState(false);
  const [dailyBriefingDistributionTime, setDailyBriefingDistributionTime] = useState('09:00');
  const [dailyBriefingDistributionTimezone, setDailyBriefingDistributionTimezone] = useState('Asia/Shanghai');
  const [dailyBriefingDistributionWeekdays, setDailyBriefingDistributionWeekdays] = useState(DEFAULT_DAILY_BRIEFING_DISTRIBUTION_WEEKDAYS);
  const [dailyBriefingDryRunRunning, setDailyBriefingDryRunRunning] = useState(false);
  const [dailyBriefingNotificationChannelOptions, setDailyBriefingNotificationChannelOptions] = useState(() => (
    normalizeDailyBriefingNotificationChannelOptions()
  ));
  const [dailyBriefingNotificationChannels, setDailyBriefingNotificationChannels] = useState('dry_run');
  const [dailyBriefingSchedule, setDailyBriefingSchedule] = useState(() => normalizeDailyBriefingSchedule());
  const [dailyBriefingRetryingRecordId, setDailyBriefingRetryingRecordId] = useState('');
  const [dailyBriefingSending, setDailyBriefingSending] = useState(false);

  const activeDailyBriefingEmailPresetId = useMemo(
    () => dailyBriefingEmailPresets.find((preset) => matchesDailyBriefingEmailPreset(
      preset,
      dailyBriefingEmailRecipients,
      dailyBriefingEmailCcRecipients
    ))?.id || '',
    [dailyBriefingEmailCcRecipients, dailyBriefingEmailPresets, dailyBriefingEmailRecipients]
  );
  const dailyBriefingDistributionConfig = useMemo(() => ({
    enabled: dailyBriefingDistributionEnabled,
    sendTime: dailyBriefingDistributionTime,
    timezone: dailyBriefingDistributionTimezone,
    weekdays: dailyBriefingDistributionWeekdays,
    notificationChannels: dailyBriefingNotificationChannels,
  }), [
    dailyBriefingDistributionEnabled,
    dailyBriefingDistributionTime,
    dailyBriefingDistributionTimezone,
    dailyBriefingDistributionWeekdays,
    dailyBriefingNotificationChannels,
  ]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    try {
      window.localStorage.setItem(DAILY_BRIEFING_NOTE_STORAGE_KEY, dailyBriefingTeamNote);
    } catch (error) {
      // Ignore local persistence failures and keep the workbench interactive.
    }
  }, [dailyBriefingTeamNote]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    try {
      window.localStorage.setItem(DAILY_BRIEFING_RECIPIENTS_STORAGE_KEY, dailyBriefingEmailRecipients);
    } catch (error) {
      // Ignore local persistence failures and keep the workbench interactive.
    }
  }, [dailyBriefingEmailRecipients]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    try {
      window.localStorage.setItem(DAILY_BRIEFING_CC_STORAGE_KEY, dailyBriefingEmailCcRecipients);
    } catch (error) {
      // Ignore local persistence failures and keep the workbench interactive.
    }
  }, [dailyBriefingEmailCcRecipients]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    try {
      window.localStorage.setItem(
        DAILY_BRIEFING_EMAIL_PRESETS_STORAGE_KEY,
        JSON.stringify(normalizeDailyBriefingEmailPresets(dailyBriefingEmailPresets))
      );
    } catch (error) {
      // Ignore local persistence failures and keep the workbench interactive.
    }
  }, [dailyBriefingEmailPresets]);

  useEffect(() => {
    if (!dailyBriefingDefaultEmailPresetId) {
      return;
    }

    if (!dailyBriefingEmailPresets.some((preset) => preset.id === dailyBriefingDefaultEmailPresetId)) {
      setDailyBriefingDefaultEmailPresetId('');
    }
  }, [dailyBriefingDefaultEmailPresetId, dailyBriefingEmailPresets]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    try {
      if (dailyBriefingDefaultEmailPresetId) {
        window.localStorage.setItem(DAILY_BRIEFING_DEFAULT_EMAIL_PRESET_STORAGE_KEY, dailyBriefingDefaultEmailPresetId);
      } else {
        window.localStorage.removeItem(DAILY_BRIEFING_DEFAULT_EMAIL_PRESET_STORAGE_KEY);
      }
    } catch (error) {
      // Ignore local persistence failures and keep the workbench interactive.
    }
  }, [dailyBriefingDefaultEmailPresetId]);

  useEffect(() => {
    if (dailyBriefingDefaultEmailPresetResolved) {
      return;
    }

    if (dailyBriefingEmailRecipients.trim() || dailyBriefingEmailCcRecipients.trim()) {
      setDailyBriefingDefaultEmailPresetResolved(true);
      return;
    }

    if (!dailyBriefingDefaultEmailPresetId) {
      setDailyBriefingDefaultEmailPresetResolved(true);
      return;
    }

    const defaultPreset = dailyBriefingEmailPresets.find((preset) => preset.id === dailyBriefingDefaultEmailPresetId);
    if (!defaultPreset) {
      setDailyBriefingDefaultEmailPresetResolved(true);
      return;
    }

    setDailyBriefingEmailRecipients(defaultPreset.toRecipients || '');
    setDailyBriefingEmailCcRecipients(defaultPreset.ccRecipients || '');
    setDailyBriefingDefaultEmailPresetResolved(true);
  }, [
    dailyBriefingDefaultEmailPresetId,
    dailyBriefingDefaultEmailPresetResolved,
    dailyBriefingEmailCcRecipients,
    dailyBriefingEmailPresets,
    dailyBriefingEmailRecipients,
  ]);

  useEffect(() => {
    let mounted = true;

    const loadDailyBriefingDistribution = async () => {
      const [distributionResult, infrastructureResult] = await Promise.allSettled([
        getResearchBriefingDistribution(),
        getInfrastructureStatus(),
      ]);

      if (!mounted) {
        return;
      }

      try {
        if (infrastructureResult.status === 'fulfilled' && infrastructureResult.value?.success) {
          setDailyBriefingNotificationChannelOptions(
            normalizeDailyBriefingNotificationChannelOptions(
              infrastructureResult.value.data?.notifications?.channels || []
            )
          );
        }

        if (distributionResult.status !== 'fulfilled' || !distributionResult.value?.success) {
          return;
        }
        const response = distributionResult.value;
        const distribution = normalizeServerDailyBriefingDistribution(response.data?.distribution || {});
        setDailyBriefingDistributionEnabled(distribution.enabled);
        setDailyBriefingDistributionTime(distribution.sendTime || '09:00');
        setDailyBriefingDistributionTimezone(distribution.timezone || 'Asia/Shanghai');
        setDailyBriefingDistributionWeekdays(distribution.weekdays?.length ? distribution.weekdays : DEFAULT_DAILY_BRIEFING_DISTRIBUTION_WEEKDAYS);
        setDailyBriefingNotificationChannels((distribution.notificationChannels || ['dry_run']).join(' '));
        setDailyBriefingDeliveryHistory(response.data?.delivery_history || []);
        setDailyBriefingSchedule(normalizeDailyBriefingSchedule(response.data?.schedule || {}));

        if ((response.data?.distribution?.presets || []).length) {
          setDailyBriefingEmailPresets(distribution.presets);
        }
        if (distribution.defaultPresetId) {
          setDailyBriefingDefaultEmailPresetId(distribution.defaultPresetId);
        }
        if (distribution.toRecipients.trim()) {
          setDailyBriefingEmailRecipients(distribution.toRecipients);
        }
        if (distribution.ccRecipients.trim()) {
          setDailyBriefingEmailCcRecipients(distribution.ccRecipients);
        }
        if (distribution.teamNote.trim()) {
          setDailyBriefingTeamNote(distribution.teamNote);
        }
      } catch (error) {
        // Keep local briefing controls usable when the optional distribution state is unavailable.
      }
    };

    loadDailyBriefingDistribution();
    return () => {
      mounted = false;
    };
  }, []);

  const handleApplyDailyBriefingEmailPreset = (presetId) => {
    const targetPreset = dailyBriefingEmailPresets.find((preset) => preset.id === presetId);
    if (!targetPreset) {
      return;
    }

    setDailyBriefingEmailRecipients(targetPreset.toRecipients || '');
    setDailyBriefingEmailCcRecipients(targetPreset.ccRecipients || '');
    message.success(`已切换到分发预设：${targetPreset.name || '未命名预设'}`);
  };

  const handleSetDefaultDailyBriefingEmailPreset = (presetId) => {
    const targetPreset = dailyBriefingEmailPresets.find((preset) => preset.id === presetId);
    if (!targetPreset) {
      return;
    }

    const presetName = targetPreset.name || '未命名预设';
    if (dailyBriefingDefaultEmailPresetId === presetId) {
      setDailyBriefingDefaultEmailPresetId('');
      message.success(`已取消默认分发预设：${presetName}`);
      return;
    }

    setDailyBriefingDefaultEmailPresetId(presetId);
    if (!dailyBriefingEmailRecipients.trim() && !dailyBriefingEmailCcRecipients.trim()) {
      setDailyBriefingEmailRecipients(targetPreset.toRecipients || '');
      setDailyBriefingEmailCcRecipients(targetPreset.ccRecipients || '');
    }
    message.success(`已设为默认分发预设：${presetName}`);
  };

  const handleAddDailyBriefingEmailPreset = () => {
    const nextPresetName = buildNextCustomDailyBriefingPresetName(dailyBriefingEmailPresets);
    const nextPresetId = buildDailyBriefingCustomPresetId();

    setDailyBriefingEmailPresets((prev) => [...prev, {
      id: nextPresetId,
      name: nextPresetName,
      toRecipients: '',
      ccRecipients: '',
    }]);
    message.success(`已新增自定义分发预设：${nextPresetName}`);
  };

  const handleChangeDailyBriefingEmailPresetName = (presetId, nextName = '') => {
    setDailyBriefingEmailPresets((prev) => prev.map((preset) => (
      preset.id === presetId
        ? {
          ...preset,
          name: String(nextName || '').slice(0, DAILY_BRIEFING_EMAIL_PRESET_NAME_MAX_LENGTH),
        }
        : preset
    )));
  };

  const handleSaveDailyBriefingEmailPreset = (presetId) => {
    const currentPreset = dailyBriefingEmailPresets.find((preset) => preset.id === presetId);
    const fallbackName = DEFAULT_DAILY_BRIEFING_EMAIL_PRESETS.find((item) => item.id === presetId)?.name || '未命名预设';
    const savedPresetName = String(currentPreset?.name || '').trim().slice(0, DAILY_BRIEFING_EMAIL_PRESET_NAME_MAX_LENGTH) || fallbackName;

    setDailyBriefingEmailPresets((prev) => prev.map((preset) => {
      if (preset.id !== presetId) {
        return preset;
      }

      return {
        ...preset,
        name: savedPresetName,
        ccRecipients: dailyBriefingEmailCcRecipients,
        toRecipients: dailyBriefingEmailRecipients,
      };
    }));

    message.success(`已保存分发预设：${savedPresetName}`);
  };

  const handleMoveDailyBriefingEmailPreset = (presetId, direction = 'up') => {
    setDailyBriefingEmailPresets((prev) => moveDailyBriefingCustomPresetOrder(prev, presetId, direction));
  };

  const handleDeleteDailyBriefingEmailPreset = (presetId) => {
    if (!presetId || isDefaultDailyBriefingEmailPresetId(presetId)) {
      return;
    }

    const targetPreset = dailyBriefingEmailPresets.find((preset) => preset.id === presetId);
    if (!targetPreset) {
      return;
    }

    if (dailyBriefingDefaultEmailPresetId === presetId) {
      setDailyBriefingDefaultEmailPresetId('');
    }
    setDailyBriefingEmailPresets((prev) => prev.filter((preset) => preset.id !== presetId));
    message.success(`已删除分发预设：${targetPreset.name || '未命名预设'}`);
  };

  const buildDailyBriefingDistributionPayload = () => ({
    enabled: dailyBriefingDistributionEnabled,
    send_time: dailyBriefingDistributionTime || '09:00',
    timezone: dailyBriefingDistributionTimezone || 'Asia/Shanghai',
    weekdays: dailyBriefingDistributionWeekdays?.length
      ? dailyBriefingDistributionWeekdays
      : DEFAULT_DAILY_BRIEFING_DISTRIBUTION_WEEKDAYS,
    notification_channels: parseDailyBriefingNotificationChannels(dailyBriefingNotificationChannels),
    default_preset_id: dailyBriefingDefaultEmailPresetId || '',
    presets: normalizeDailyBriefingEmailPresets(dailyBriefingEmailPresets).map((preset) => ({
      id: preset.id,
      name: preset.name,
      to_recipients: preset.toRecipients || '',
      cc_recipients: preset.ccRecipients || '',
    })),
    to_recipients: dailyBriefingEmailRecipients,
    cc_recipients: dailyBriefingEmailCcRecipients,
    team_note: dailyBriefingTeamNote,
  });

  const applyDailyBriefingDistributionResponse = (data = {}) => {
    const distribution = normalizeServerDailyBriefingDistribution(data?.distribution || {});
    setDailyBriefingDistributionEnabled(distribution.enabled);
    setDailyBriefingDistributionTime(distribution.sendTime || '09:00');
    setDailyBriefingDistributionTimezone(distribution.timezone || 'Asia/Shanghai');
    setDailyBriefingDistributionWeekdays(distribution.weekdays?.length ? distribution.weekdays : DEFAULT_DAILY_BRIEFING_DISTRIBUTION_WEEKDAYS);
    setDailyBriefingNotificationChannels((distribution.notificationChannels || ['dry_run']).join(' '));
    setDailyBriefingDeliveryHistory(data?.delivery_history || []);
    setDailyBriefingSchedule(normalizeDailyBriefingSchedule(data?.schedule || {}));
  };

  const handleSaveDailyBriefingDistribution = async () => {
    setDailyBriefingDistributionSaving(true);
    try {
      const response = await updateResearchBriefingDistribution(buildDailyBriefingDistributionPayload());
      if (response?.success) {
        applyDailyBriefingDistributionResponse(response.data);
      }
      message.success('每日简报分发配置已保存');
    } catch (error) {
      message.error(error.userMessage || error.message || '保存分发配置失败');
    } finally {
      setDailyBriefingDistributionSaving(false);
    }
  };

  const handleRunDailyBriefingDryRun = async () => {
    setDailyBriefingDryRunRunning(true);
    try {
      await updateResearchBriefingDistribution(buildDailyBriefingDistributionPayload());
      const artifacts = buildShareArtifacts();
      const response = await runResearchBriefingDryRun({
        subject: artifacts.emailSubject,
        body: artifacts.emailBody,
        current_view: workbenchViewSummary.headline,
        headline: workbenchDailyBriefing.headline,
        summary: workbenchDailyBriefing.summary,
        to_recipients: artifacts.toRecipients,
        cc_recipients: artifacts.ccRecipients,
        team_note: artifacts.teamNote,
        task_count: filteredTasks.length,
        channel: 'email',
      });
      if (response?.success) {
        setDailyBriefingDeliveryHistory(response.data?.delivery_history || []);
        setDailyBriefingSchedule(normalizeDailyBriefingSchedule(response.data?.schedule || {}));
      }
      message.success('每日简报 Dry-run 已记录');
    } catch (error) {
      message.error(error.userMessage || error.message || '记录 Dry-run 失败');
    } finally {
      setDailyBriefingDryRunRunning(false);
    }
  };

  const handleSendDailyBriefing = async () => {
    setDailyBriefingSending(true);
    try {
      const distributionPayload = buildDailyBriefingDistributionPayload();
      await updateResearchBriefingDistribution(distributionPayload);
      const artifacts = buildShareArtifacts();
      const response = await sendResearchBriefing({
        subject: artifacts.emailSubject,
        body: artifacts.emailBody,
        current_view: workbenchViewSummary.headline,
        headline: workbenchDailyBriefing.headline,
        summary: workbenchDailyBriefing.summary,
        to_recipients: artifacts.toRecipients,
        cc_recipients: artifacts.ccRecipients,
        team_note: artifacts.teamNote,
        task_count: filteredTasks.length,
        channel: 'email',
        channels: distributionPayload.notification_channels,
      });
      if (response?.success) {
        setDailyBriefingDeliveryHistory(response.data?.delivery_history || []);
        setDailyBriefingSchedule(normalizeDailyBriefingSchedule(response.data?.schedule || {}));
      }
      const record = response?.data?.record || {};
      if (record.status === 'sent') {
        message.success('每日简报已发送');
      } else if (record.status === 'partial') {
        message.warning('每日简报部分通道发送成功，请查看最近分发记录');
      } else if (record.status === 'dry_run') {
        message.info('当前通道为 dry_run，已记录但未真实发送');
      } else {
        message.warning('每日简报未完成真实发送，请查看最近分发记录');
      }
    } catch (error) {
      message.error(error.userMessage || error.message || '发送每日简报失败');
    } finally {
      setDailyBriefingSending(false);
    }
  };

  const handleRetryDailyBriefingDelivery = async (record = {}, retryChannels = []) => {
    const channels = (retryChannels || [])
      .map((channel) => String(channel || '').trim())
      .filter(Boolean);
    if (!channels.length) {
      message.info('这条分发记录没有需要重试的失败通道');
      return;
    }

    const retryRecordId = record.id || record.created_at || record.createdAt || 'latest';
    setDailyBriefingRetryingRecordId(retryRecordId);
    try {
      const artifacts = buildShareArtifacts();
      const response = await sendResearchBriefing({
        subject: artifacts.emailSubject || record.subject || 'Research Workbench Daily Briefing',
        body: artifacts.emailBody,
        current_view: workbenchViewSummary.headline || record.current_view || record.currentView || '',
        headline: workbenchDailyBriefing.headline || record.headline || '',
        summary: workbenchDailyBriefing.summary || record.summary || '',
        to_recipients: artifacts.toRecipients || record.to_recipients || record.toRecipients || '',
        cc_recipients: artifacts.ccRecipients || record.cc_recipients || record.ccRecipients || '',
        team_note: artifacts.teamNote || record.team_note || record.teamNote || '',
        task_count: filteredTasks.length || record.task_count || record.taskCount || 0,
        channel: 'email',
        channels,
      });
      if (response?.success) {
        setDailyBriefingDeliveryHistory(response.data?.delivery_history || []);
        setDailyBriefingSchedule(normalizeDailyBriefingSchedule(response.data?.schedule || {}));
      }
      const status = response?.data?.record?.status || 'unknown';
      if (status === 'sent') {
        message.success(`已重试失败通道：${channels.join(', ')}`);
      } else if (status === 'partial') {
        message.warning('重试后仍有部分通道未完成，请查看最近分发记录');
      } else {
        message.warning('重试未完成，请查看最近分发记录');
      }
    } catch (error) {
      message.error(error.userMessage || error.message || '重试分发失败');
    } finally {
      setDailyBriefingRetryingRecordId('');
    }
  };

  return {
    // state values
    dailyBriefingDefaultEmailPresetId,
    dailyBriefingPdfExporting,
    dailyBriefingPreviewSeed,
    dailyBriefingEmailCcRecipients,
    dailyBriefingEmailPresets,
    dailyBriefingEmailRecipients,
    dailyBriefingTeamNote,
    dailyBriefingDeliveryHistory,
    dailyBriefingDistributionEnabled,
    dailyBriefingDistributionSaving,
    dailyBriefingDistributionTime,
    dailyBriefingDistributionTimezone,
    dailyBriefingDistributionWeekdays,
    dailyBriefingDryRunRunning,
    dailyBriefingNotificationChannelOptions,
    dailyBriefingNotificationChannels,
    dailyBriefingSchedule,
    dailyBriefingRetryingRecordId,
    dailyBriefingSending,
    // setters used by UI inputs / preview drawer
    setDailyBriefingPdfExporting,
    setDailyBriefingPreviewSeed,
    setDailyBriefingEmailCcRecipients,
    setDailyBriefingEmailRecipients,
    setDailyBriefingTeamNote,
    setDailyBriefingDistributionEnabled,
    setDailyBriefingDistributionTime,
    setDailyBriefingDistributionTimezone,
    setDailyBriefingDistributionWeekdays,
    setDailyBriefingNotificationChannels,
    // memos
    activeDailyBriefingEmailPresetId,
    dailyBriefingDistributionConfig,
    // preset handlers
    handleApplyDailyBriefingEmailPreset,
    handleSetDefaultDailyBriefingEmailPreset,
    handleAddDailyBriefingEmailPreset,
    handleChangeDailyBriefingEmailPresetName,
    handleSaveDailyBriefingEmailPreset,
    handleMoveDailyBriefingEmailPreset,
    handleDeleteDailyBriefingEmailPreset,
    // distribution / send / dry-run / retry
    handleSaveDailyBriefingDistribution,
    handleRunDailyBriefingDryRun,
    handleSendDailyBriefing,
    handleRetryDailyBriefingDelivery,
  };
}

export default useDailyBriefing;
