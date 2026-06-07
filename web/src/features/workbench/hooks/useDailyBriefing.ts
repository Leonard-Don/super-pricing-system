/**
 * useDailyBriefing — TypeScript port of
 * frontend/src/components/research-workbench/useDailyBriefing.js
 *
 * Manages daily-briefing distribution config, email-preset CRUD, and
 * dry-run / send / retry handlers.  No `message` (antd toast) dependency —
 * status is exposed via state so the UI layer can render its own toasts.
 */

import { startTransition, useEffect, useMemo, useRef, useState } from 'react';

import {
  getResearchBriefingDistribution,
  runResearchBriefingDryRun,
  sendResearchBriefing,
  updateResearchBriefingDistribution,
} from '@/services/api/research';
import { getInfrastructureStatusShared } from '@/services/api/infrastructureStatusCache';
import {
  DAILY_BRIEFING_CC_STORAGE_KEY,
  DAILY_BRIEFING_DEFAULT_EMAIL_PRESET_STORAGE_KEY,
  DAILY_BRIEFING_EMAIL_PRESETS_STORAGE_KEY,
  DAILY_BRIEFING_EMAIL_PRESET_NAME_MAX_LENGTH,
  DAILY_BRIEFING_NOTE_STORAGE_KEY,
  DAILY_BRIEFING_RECIPIENTS_STORAGE_KEY,
  DEFAULT_DAILY_BRIEFING_DISTRIBUTION_WEEKDAYS,
  DEFAULT_DAILY_BRIEFING_EMAIL_PRESETS,
  type DailyBriefingEmailPreset,
  type DailyBriefingNotificationChannelOption,
  type DailyBriefingSchedule,
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
} from '@/features/workbench/lib/dailyBriefingHelpers';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface DailyBriefingDistributionConfig {
  enabled: boolean;
  sendTime: string;
  timezone: string;
  weekdays: string[];
  notificationChannels: string;
}

export interface DeliveryRecord {
  id?: string;
  created_at?: string;
  createdAt?: string;
  status?: string;
  subject?: string;
  current_view?: string;
  currentView?: string;
  headline?: string;
  summary?: string;
  to_recipients?: string;
  toRecipients?: string;
  cc_recipients?: string;
  ccRecipients?: string;
  team_note?: string;
  teamNote?: string;
  task_count?: number;
  taskCount?: number;
}

export interface ShareArtifacts {
  emailSubject?: string;
  emailBody?: string;
  toRecipients?: string;
  ccRecipients?: string;
  teamNote?: string;
}

export interface UseDailyBriefingProps {
  workbenchDailyBriefing: {
    headline?: string;
    summary?: string;
    chips?: unknown[];
    details?: unknown[];
  };
  workbenchViewSummary: {
    headline?: string;
    scopedTaskLabel?: string;
  };
  filteredTasks: unknown[];
  buildShareArtifactsRef?: React.RefObject<((referenceDate?: Date) => ShareArtifacts) | null>;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

function useDailyBriefing({
  workbenchDailyBriefing,
  workbenchViewSummary,
  filteredTasks,
  buildShareArtifactsRef,
}: UseDailyBriefingProps) {
  const buildShareArtifacts = (referenceDate?: Date): ShareArtifacts => {
    const impl = buildShareArtifactsRef?.current;
    if (typeof impl !== 'function') {
      return {};
    }
    return impl(referenceDate);
  };

  // ---- State ----------------------------------------------------------------

  const [dailyBriefingDefaultEmailPresetResolved, setDailyBriefingDefaultEmailPresetResolved] =
    useState(false);
  const [dailyBriefingDefaultEmailPresetId, setDailyBriefingDefaultEmailPresetId] = useState(
    () => readDailyBriefingLocalValue(DAILY_BRIEFING_DEFAULT_EMAIL_PRESET_STORAGE_KEY),
  );
  const [dailyBriefingPdfExporting, setDailyBriefingPdfExporting] = useState(false);
  const [dailyBriefingPreviewSeed, setDailyBriefingPreviewSeed] = useState<string | null>(null);
  const [dailyBriefingEmailCcRecipients, setDailyBriefingEmailCcRecipients] = useState(
    () => readDailyBriefingLocalValue(DAILY_BRIEFING_CC_STORAGE_KEY),
  );
  const [dailyBriefingEmailPresets, setDailyBriefingEmailPresets] =
    useState<DailyBriefingEmailPreset[]>(() => readDailyBriefingEmailPresets());
  const [dailyBriefingEmailRecipients, setDailyBriefingEmailRecipients] = useState(
    () => readDailyBriefingLocalValue(DAILY_BRIEFING_RECIPIENTS_STORAGE_KEY),
  );
  const [dailyBriefingTeamNote, setDailyBriefingTeamNote] = useState(
    () => readDailyBriefingTeamNote(),
  );
  const [dailyBriefingDeliveryHistory, setDailyBriefingDeliveryHistory] = useState<
    DeliveryRecord[]
  >([]);
  const [dailyBriefingDistributionEnabled, setDailyBriefingDistributionEnabled] = useState(false);
  const [dailyBriefingDistributionSaving, setDailyBriefingDistributionSaving] = useState(false);
  const [dailyBriefingDistributionTime, setDailyBriefingDistributionTime] = useState('09:00');
  const [dailyBriefingDistributionTimezone, setDailyBriefingDistributionTimezone] =
    useState('Asia/Shanghai');
  const [dailyBriefingDistributionWeekdays, setDailyBriefingDistributionWeekdays] = useState<
    string[]
  >(DEFAULT_DAILY_BRIEFING_DISTRIBUTION_WEEKDAYS);
  const [dailyBriefingDryRunRunning, setDailyBriefingDryRunRunning] = useState(false);
  const [dailyBriefingNotificationChannelOptions, setDailyBriefingNotificationChannelOptions] =
    useState<DailyBriefingNotificationChannelOption[]>(
      () => normalizeDailyBriefingNotificationChannelOptions(),
    );
  const [dailyBriefingNotificationChannels, setDailyBriefingNotificationChannels] =
    useState('dry_run');
  const [dailyBriefingSchedule, setDailyBriefingSchedule] = useState<DailyBriefingSchedule>(
    () => normalizeDailyBriefingSchedule(),
  );
  const [dailyBriefingRetryingRecordId, setDailyBriefingRetryingRecordId] = useState('');
  const [dailyBriefingSending, setDailyBriefingSending] = useState(false);

  // Last-known operation status — exposed so UI can render toasts without antd.
  const [dailyBriefingLastOpStatus, setDailyBriefingLastOpStatus] = useState<{
    type: 'success' | 'error' | 'warning' | 'info' | null;
    message: string;
  }>({ type: null, message: '' });

  // ---- Memos ----------------------------------------------------------------

  const activeDailyBriefingEmailPresetId = useMemo(
    () =>
      dailyBriefingEmailPresets.find((preset) =>
        matchesDailyBriefingEmailPreset(
          preset,
          dailyBriefingEmailRecipients,
          dailyBriefingEmailCcRecipients,
        ),
      )?.id ?? '',
    [dailyBriefingEmailCcRecipients, dailyBriefingEmailPresets, dailyBriefingEmailRecipients],
  );

  const dailyBriefingDistributionConfig = useMemo<DailyBriefingDistributionConfig>(
    () => ({
      enabled: dailyBriefingDistributionEnabled,
      sendTime: dailyBriefingDistributionTime,
      timezone: dailyBriefingDistributionTimezone,
      weekdays: dailyBriefingDistributionWeekdays,
      notificationChannels: dailyBriefingNotificationChannels,
    }),
    [
      dailyBriefingDistributionEnabled,
      dailyBriefingDistributionTime,
      dailyBriefingDistributionTimezone,
      dailyBriefingDistributionWeekdays,
      dailyBriefingNotificationChannels,
    ],
  );

  // ---- Effects: localStorage sync ------------------------------------------

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      window.localStorage.setItem(DAILY_BRIEFING_NOTE_STORAGE_KEY, dailyBriefingTeamNote);
    } catch {
      // Ignore local persistence failures.
    }
  }, [dailyBriefingTeamNote]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      window.localStorage.setItem(
        DAILY_BRIEFING_RECIPIENTS_STORAGE_KEY,
        dailyBriefingEmailRecipients,
      );
    } catch {
      // Ignore local persistence failures.
    }
  }, [dailyBriefingEmailRecipients]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      window.localStorage.setItem(
        DAILY_BRIEFING_CC_STORAGE_KEY,
        dailyBriefingEmailCcRecipients,
      );
    } catch {
      // Ignore local persistence failures.
    }
  }, [dailyBriefingEmailCcRecipients]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      window.localStorage.setItem(
        DAILY_BRIEFING_EMAIL_PRESETS_STORAGE_KEY,
        JSON.stringify(normalizeDailyBriefingEmailPresets(dailyBriefingEmailPresets)),
      );
    } catch {
      // Ignore local persistence failures.
    }
  }, [dailyBriefingEmailPresets]);

  // ---- Effects: default-preset validation ----------------------------------

  useEffect(() => {
    if (!dailyBriefingDefaultEmailPresetId) return;
    if (!dailyBriefingEmailPresets.some((p) => p.id === dailyBriefingDefaultEmailPresetId)) {
      startTransition(() => setDailyBriefingDefaultEmailPresetId(''));
    }
  }, [dailyBriefingDefaultEmailPresetId, dailyBriefingEmailPresets]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      if (dailyBriefingDefaultEmailPresetId) {
        window.localStorage.setItem(
          DAILY_BRIEFING_DEFAULT_EMAIL_PRESET_STORAGE_KEY,
          dailyBriefingDefaultEmailPresetId,
        );
      } else {
        window.localStorage.removeItem(DAILY_BRIEFING_DEFAULT_EMAIL_PRESET_STORAGE_KEY);
      }
    } catch {
      // Ignore local persistence failures.
    }
  }, [dailyBriefingDefaultEmailPresetId]);

  // ---- Effect: auto-apply default preset on first load ---------------------

  useEffect(() => {
    if (dailyBriefingDefaultEmailPresetResolved) return;

    if (dailyBriefingEmailRecipients.trim() || dailyBriefingEmailCcRecipients.trim()) {
      startTransition(() => setDailyBriefingDefaultEmailPresetResolved(true));
      return;
    }

    if (!dailyBriefingDefaultEmailPresetId) {
      startTransition(() => setDailyBriefingDefaultEmailPresetResolved(true));
      return;
    }

    const defaultPreset = dailyBriefingEmailPresets.find(
      (p) => p.id === dailyBriefingDefaultEmailPresetId,
    );
    if (!defaultPreset) {
      startTransition(() => setDailyBriefingDefaultEmailPresetResolved(true));
      return;
    }

    startTransition(() => {
      setDailyBriefingEmailRecipients(defaultPreset.toRecipients ?? '');
      setDailyBriefingEmailCcRecipients(defaultPreset.ccRecipients ?? '');
      setDailyBriefingDefaultEmailPresetResolved(true);
    });
  }, [
    dailyBriefingDefaultEmailPresetId,
    dailyBriefingDefaultEmailPresetResolved,
    dailyBriefingEmailCcRecipients,
    dailyBriefingEmailPresets,
    dailyBriefingEmailRecipients,
  ]);

  // ---- Effect: load distribution from server on mount ----------------------

  useEffect(() => {
    let mounted = true;

    const loadDailyBriefingDistribution = async () => {
      const [distributionResult, infrastructureResult] = await Promise.allSettled([
        getResearchBriefingDistribution(),
        getInfrastructureStatusShared(),
      ]);

      if (!mounted) return;

      try {
        if (
          infrastructureResult.status === 'fulfilled' &&
          (infrastructureResult.value as { success?: boolean })?.success
        ) {
          const infraData = (
            infrastructureResult.value as { data?: { notifications?: { channels?: unknown[] } } }
          )?.data;
          startTransition(() =>
            setDailyBriefingNotificationChannelOptions(
              normalizeDailyBriefingNotificationChannelOptions(
                infraData?.notifications?.channels ?? [],
              ),
            ),
          );
        }

        if (
          distributionResult.status !== 'fulfilled' ||
          !(distributionResult.value as { success?: boolean })?.success
        ) {
          return;
        }

        const response = distributionResult.value as {
          success: boolean;
          data: Record<string, unknown>;
        };
        const distribution = normalizeServerDailyBriefingDistribution(
          (response.data?.['distribution'] as Record<string, unknown>) ?? {},
        );

        startTransition(() => {
          setDailyBriefingDistributionEnabled(distribution.enabled);
          setDailyBriefingDistributionTime(distribution.sendTime || '09:00');
          setDailyBriefingDistributionTimezone(distribution.timezone || 'Asia/Shanghai');
          setDailyBriefingDistributionWeekdays(
            distribution.weekdays?.length
              ? distribution.weekdays
              : DEFAULT_DAILY_BRIEFING_DISTRIBUTION_WEEKDAYS,
          );
          setDailyBriefingNotificationChannels(
            (distribution.notificationChannels ?? ['dry_run']).join(' '),
          );
          setDailyBriefingDeliveryHistory(
            (response.data?.['delivery_history'] as DeliveryRecord[]) ?? [],
          );
          setDailyBriefingSchedule(
            normalizeDailyBriefingSchedule(
              (response.data?.['schedule'] as Record<string, unknown>) ?? {},
            ),
          );

          if ((response.data?.['distribution'] as Record<string, unknown>)?.['presets']) {
            const presetsRaw = (
              response.data?.['distribution'] as Record<string, unknown>
            )?.['presets'];
            if (Array.isArray(presetsRaw) && presetsRaw.length) {
              setDailyBriefingEmailPresets(distribution.presets);
            }
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
        });
      } catch {
        // Keep local briefing controls usable when distribution state is unavailable.
      }
    };

    void loadDailyBriefingDistribution();
    return () => {
      mounted = false;
    };
  }, []);

  // ---- Preset handlers -------------------------------------------------------

  const handleApplyDailyBriefingEmailPreset = (presetId: string) => {
    const targetPreset = dailyBriefingEmailPresets.find((p) => p.id === presetId);
    if (!targetPreset) return;

    setDailyBriefingEmailRecipients(targetPreset.toRecipients ?? '');
    setDailyBriefingEmailCcRecipients(targetPreset.ccRecipients ?? '');
    setDailyBriefingLastOpStatus({
      type: 'success',
      message: `已切换到分发预设：${targetPreset.name || '未命名预设'}`,
    });
  };

  const handleSetDefaultDailyBriefingEmailPreset = (presetId: string) => {
    const targetPreset = dailyBriefingEmailPresets.find((p) => p.id === presetId);
    if (!targetPreset) return;

    const presetName = targetPreset.name || '未命名预设';
    if (dailyBriefingDefaultEmailPresetId === presetId) {
      setDailyBriefingDefaultEmailPresetId('');
      setDailyBriefingLastOpStatus({ type: 'success', message: `已取消默认分发预设：${presetName}` });
      return;
    }

    setDailyBriefingDefaultEmailPresetId(presetId);
    if (!dailyBriefingEmailRecipients.trim() && !dailyBriefingEmailCcRecipients.trim()) {
      setDailyBriefingEmailRecipients(targetPreset.toRecipients ?? '');
      setDailyBriefingEmailCcRecipients(targetPreset.ccRecipients ?? '');
    }
    setDailyBriefingLastOpStatus({ type: 'success', message: `已设为默认分发预设：${presetName}` });
  };

  const handleAddDailyBriefingEmailPreset = () => {
    const nextPresetName = buildNextCustomDailyBriefingPresetName(dailyBriefingEmailPresets);
    const nextPresetId = buildDailyBriefingCustomPresetId();

    setDailyBriefingEmailPresets((prev) => [
      ...prev,
      { id: nextPresetId, name: nextPresetName, toRecipients: '', ccRecipients: '' },
    ]);
    setDailyBriefingLastOpStatus({ type: 'success', message: `已新增自定义分发预设：${nextPresetName}` });
  };

  const handleChangeDailyBriefingEmailPresetName = (presetId: string, nextName = '') => {
    setDailyBriefingEmailPresets((prev) =>
      prev.map((preset) =>
        preset.id === presetId
          ? {
              ...preset,
              name: String(nextName || '').slice(0, DAILY_BRIEFING_EMAIL_PRESET_NAME_MAX_LENGTH),
            }
          : preset,
      ),
    );
  };

  const handleSaveDailyBriefingEmailPreset = (presetId: string) => {
    const currentPreset = dailyBriefingEmailPresets.find((p) => p.id === presetId);
    const fallbackName =
      DEFAULT_DAILY_BRIEFING_EMAIL_PRESETS.find((item) => item.id === presetId)?.name ??
      '未命名预设';
    const savedPresetName =
      String(currentPreset?.name ?? '')
        .trim()
        .slice(0, DAILY_BRIEFING_EMAIL_PRESET_NAME_MAX_LENGTH) || fallbackName;

    setDailyBriefingEmailPresets((prev) =>
      prev.map((preset) => {
        if (preset.id !== presetId) return preset;
        return {
          ...preset,
          name: savedPresetName,
          ccRecipients: dailyBriefingEmailCcRecipients,
          toRecipients: dailyBriefingEmailRecipients,
        };
      }),
    );
    setDailyBriefingLastOpStatus({ type: 'success', message: `已保存分发预设：${savedPresetName}` });
  };

  const handleMoveDailyBriefingEmailPreset = (presetId: string, direction: 'up' | 'down' = 'up') => {
    setDailyBriefingEmailPresets((prev) =>
      moveDailyBriefingCustomPresetOrder(prev, presetId, direction),
    );
  };

  const handleDeleteDailyBriefingEmailPreset = (presetId: string) => {
    if (!presetId || isDefaultDailyBriefingEmailPresetId(presetId)) return;

    const targetPreset = dailyBriefingEmailPresets.find((p) => p.id === presetId);
    if (!targetPreset) return;

    if (dailyBriefingDefaultEmailPresetId === presetId) {
      setDailyBriefingDefaultEmailPresetId('');
    }
    setDailyBriefingEmailPresets((prev) => prev.filter((p) => p.id !== presetId));
    setDailyBriefingLastOpStatus({
      type: 'success',
      message: `已删除分发预设：${targetPreset.name || '未命名预设'}`,
    });
  };

  // ---- Distribution payload / save -----------------------------------------

  const buildDailyBriefingDistributionPayload = () => ({
    enabled: dailyBriefingDistributionEnabled,
    send_time: dailyBriefingDistributionTime || '09:00',
    timezone: dailyBriefingDistributionTimezone || 'Asia/Shanghai',
    weekdays: dailyBriefingDistributionWeekdays?.length
      ? dailyBriefingDistributionWeekdays
      : DEFAULT_DAILY_BRIEFING_DISTRIBUTION_WEEKDAYS,
    notification_channels: parseDailyBriefingNotificationChannels(
      dailyBriefingNotificationChannels,
    ),
    default_preset_id: dailyBriefingDefaultEmailPresetId || '',
    presets: normalizeDailyBriefingEmailPresets(dailyBriefingEmailPresets).map((preset) => ({
      id: preset.id,
      name: preset.name,
      to_recipients: preset.toRecipients ?? '',
      cc_recipients: preset.ccRecipients ?? '',
    })),
    to_recipients: dailyBriefingEmailRecipients,
    cc_recipients: dailyBriefingEmailCcRecipients,
    team_note: dailyBriefingTeamNote,
  });

  // Ref so async handlers always see latest payload without stale closure
  const buildPayloadRef = useRef(buildDailyBriefingDistributionPayload);
  buildPayloadRef.current = buildDailyBriefingDistributionPayload;

  const applyDailyBriefingDistributionResponse = (data: Record<string, unknown> = {}) => {
    const distribution = normalizeServerDailyBriefingDistribution(
      (data?.['distribution'] as Record<string, unknown>) ?? {},
    );
    setDailyBriefingDistributionEnabled(distribution.enabled);
    setDailyBriefingDistributionTime(distribution.sendTime || '09:00');
    setDailyBriefingDistributionTimezone(distribution.timezone || 'Asia/Shanghai');
    setDailyBriefingDistributionWeekdays(
      distribution.weekdays?.length
        ? distribution.weekdays
        : DEFAULT_DAILY_BRIEFING_DISTRIBUTION_WEEKDAYS,
    );
    setDailyBriefingNotificationChannels(
      (distribution.notificationChannels ?? ['dry_run']).join(' '),
    );
    setDailyBriefingDeliveryHistory((data?.['delivery_history'] as DeliveryRecord[]) ?? []);
    setDailyBriefingSchedule(
      normalizeDailyBriefingSchedule((data?.['schedule'] as Record<string, unknown>) ?? {}),
    );
  };

  const handleSaveDailyBriefingDistribution = async () => {
    setDailyBriefingDistributionSaving(true);
    try {
      const response = (await updateResearchBriefingDistribution(
        buildPayloadRef.current(),
      )) as { success?: boolean; data?: Record<string, unknown> };
      if (response?.success) {
        applyDailyBriefingDistributionResponse(response.data ?? {});
      }
      setDailyBriefingLastOpStatus({ type: 'success', message: '每日简报分发配置已保存' });
    } catch (err) {
      const error = err as { userMessage?: string; message?: string };
      setDailyBriefingLastOpStatus({
        type: 'error',
        message: error.userMessage || error.message || '保存分发配置失败',
      });
    } finally {
      setDailyBriefingDistributionSaving(false);
    }
  };

  const handleRunDailyBriefingDryRun = async () => {
    setDailyBriefingDryRunRunning(true);
    try {
      await updateResearchBriefingDistribution(buildPayloadRef.current());
      const artifacts = buildShareArtifacts();
      const response = (await runResearchBriefingDryRun({
        subject: artifacts.emailSubject ?? '',
        body: artifacts.emailBody ?? '',
        current_view: workbenchViewSummary.headline ?? '',
        headline: workbenchDailyBriefing.headline ?? '',
        summary: workbenchDailyBriefing.summary ?? '',
        to_recipients: artifacts.toRecipients ?? '',
        cc_recipients: artifacts.ccRecipients ?? '',
        team_note: artifacts.teamNote ?? '',
        task_count: filteredTasks.length,
        channel: 'email',
      })) as { success?: boolean; data?: { delivery_history?: DeliveryRecord[]; schedule?: Record<string, unknown> } };

      if (response?.success) {
        setDailyBriefingDeliveryHistory(response.data?.delivery_history ?? []);
        setDailyBriefingSchedule(
          normalizeDailyBriefingSchedule(response.data?.schedule ?? {}),
        );
      }
      setDailyBriefingLastOpStatus({ type: 'success', message: '每日简报 Dry-run 已记录' });
    } catch (err) {
      const error = err as { userMessage?: string; message?: string };
      setDailyBriefingLastOpStatus({
        type: 'error',
        message: error.userMessage || error.message || '记录 Dry-run 失败',
      });
    } finally {
      setDailyBriefingDryRunRunning(false);
    }
  };

  const handleSendDailyBriefing = async () => {
    setDailyBriefingSending(true);
    try {
      const distributionPayload = buildPayloadRef.current();
      await updateResearchBriefingDistribution(distributionPayload);
      const artifacts = buildShareArtifacts();
      const response = (await sendResearchBriefing({
        subject: artifacts.emailSubject ?? '',
        body: artifacts.emailBody ?? '',
        current_view: workbenchViewSummary.headline ?? '',
        headline: workbenchDailyBriefing.headline ?? '',
        summary: workbenchDailyBriefing.summary ?? '',
        to_recipients: artifacts.toRecipients ?? '',
        cc_recipients: artifacts.ccRecipients ?? '',
        team_note: artifacts.teamNote ?? '',
        task_count: filteredTasks.length,
        channel: 'email',
        channels: distributionPayload.notification_channels,
      })) as {
        success?: boolean;
        data?: {
          delivery_history?: DeliveryRecord[];
          schedule?: Record<string, unknown>;
          record?: { status?: string };
        };
      };

      if (response?.success) {
        setDailyBriefingDeliveryHistory(response.data?.delivery_history ?? []);
        setDailyBriefingSchedule(
          normalizeDailyBriefingSchedule(response.data?.schedule ?? {}),
        );
      }

      const record = response?.data?.record ?? {};
      if (record.status === 'sent') {
        setDailyBriefingLastOpStatus({ type: 'success', message: '每日简报已发送' });
      } else if (record.status === 'partial') {
        setDailyBriefingLastOpStatus({
          type: 'warning',
          message: '每日简报部分通道发送成功，请查看最近分发记录',
        });
      } else if (record.status === 'dry_run') {
        setDailyBriefingLastOpStatus({
          type: 'info',
          message: '当前通道为 dry_run，已记录但未真实发送',
        });
      } else {
        setDailyBriefingLastOpStatus({
          type: 'warning',
          message: '每日简报未完成真实发送，请查看最近分发记录',
        });
      }
    } catch (err) {
      const error = err as { userMessage?: string; message?: string };
      setDailyBriefingLastOpStatus({
        type: 'error',
        message: error.userMessage || error.message || '发送每日简报失败',
      });
    } finally {
      setDailyBriefingSending(false);
    }
  };

  const handleRetryDailyBriefingDelivery = async (
    record: DeliveryRecord = {},
    retryChannels: string[] = [],
  ) => {
    const channels = (retryChannels ?? [])
      .map((ch) => String(ch ?? '').trim())
      .filter(Boolean);

    if (!channels.length) {
      setDailyBriefingLastOpStatus({
        type: 'info',
        message: '这条分发记录没有需要重试的失败通道',
      });
      return;
    }

    const retryRecordId = record.id ?? record.created_at ?? record.createdAt ?? 'latest';
    setDailyBriefingRetryingRecordId(retryRecordId);
    try {
      const artifacts = buildShareArtifacts();
      const response = (await sendResearchBriefing({
        subject:
          artifacts.emailSubject || record.subject || 'Research Workbench Daily Briefing',
        body: artifacts.emailBody ?? '',
        current_view:
          workbenchViewSummary.headline || record.current_view || record.currentView || '',
        headline: workbenchDailyBriefing.headline || record.headline || '',
        summary: workbenchDailyBriefing.summary || record.summary || '',
        to_recipients:
          artifacts.toRecipients || record.to_recipients || record.toRecipients || '',
        cc_recipients:
          artifacts.ccRecipients || record.cc_recipients || record.ccRecipients || '',
        team_note: artifacts.teamNote || record.team_note || record.teamNote || '',
        task_count:
          filteredTasks.length || record.task_count || record.taskCount || 0,
        channel: 'email',
        channels,
      })) as {
        success?: boolean;
        data?: {
          delivery_history?: DeliveryRecord[];
          schedule?: Record<string, unknown>;
          record?: { status?: string };
        };
      };

      if (response?.success) {
        setDailyBriefingDeliveryHistory(response.data?.delivery_history ?? []);
        setDailyBriefingSchedule(
          normalizeDailyBriefingSchedule(response.data?.schedule ?? {}),
        );
      }

      const status = response?.data?.record?.status ?? 'unknown';
      if (status === 'sent') {
        setDailyBriefingLastOpStatus({
          type: 'success',
          message: `已重试失败通道：${channels.join(', ')}`,
        });
      } else if (status === 'partial') {
        setDailyBriefingLastOpStatus({
          type: 'warning',
          message: '重试后仍有部分通道未完成，请查看最近分发记录',
        });
      } else {
        setDailyBriefingLastOpStatus({
          type: 'warning',
          message: '重试未完成，请查看最近分发记录',
        });
      }
    } catch (err) {
      const error = err as { userMessage?: string; message?: string };
      setDailyBriefingLastOpStatus({
        type: 'error',
        message: error.userMessage || error.message || '重试分发失败',
      });
    } finally {
      setDailyBriefingRetryingRecordId('');
    }
  };

  // ---- Return ---------------------------------------------------------------

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
    dailyBriefingLastOpStatus,
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
