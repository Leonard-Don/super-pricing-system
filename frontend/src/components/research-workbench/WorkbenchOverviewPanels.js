import React from 'react';
import { Alert, Button, Card, Checkbox, Col, Input, Row, Space, Statistic, Switch, Tag, Typography } from 'antd';
import { buildActiveWorkbenchFilterMeta } from './workbenchUtils';

const { Text } = Typography;
const { TextArea } = Input;
const WEEKDAY_OPTIONS = [
  { label: '周一', value: 'mon' },
  { label: '周二', value: 'tue' },
  { label: '周三', value: 'wed' },
  { label: '周四', value: 'thu' },
  { label: '周五', value: 'fri' },
  { label: '周六', value: 'sat' },
  { label: '周日', value: 'sun' },
];

const parseNotificationChannels = (value = '') => {
  const rawChannels = Array.isArray(value)
    ? value
    : String(value || 'dry_run').split(/[\s,;]+/);
  const channels = rawChannels
    .map((item) => String(item || '').trim())
    .filter(Boolean);
  return channels.length ? channels : ['dry_run'];
};

const getDeliveryResultTagColor = (status = '') => {
  if (status === 'sent') return 'green';
  if (status === 'partial') return 'gold';
  if (status === 'failed') return 'red';
  if (status === 'skipped') return 'orange';
  return 'blue';
};

const getScheduleStatusTagColor = (status = '') => {
  if (status === 'scheduled') return 'green';
  if (status.startsWith('invalid')) return 'red';
  if (status === 'disabled') return 'default';
  return 'gold';
};

const WorkbenchOverviewPanels = ({
  activeDailyBriefingEmailPresetId,
  autoRefreshSummary,
  dailyBriefingBrandLabel,
  dailyBriefingEmailCcRecipients,
  dailyBriefingDefaultEmailPresetId,
  dailyBriefingEmailPresets,
  dailyBriefingEmailRecipients,
  dailyBriefingDeliveryHistory,
  dailyBriefingDistributionConfig,
  dailyBriefingDistributionSaving,
  dailyBriefingDryRunRunning,
  dailyBriefingSending,
  dailyBriefingNotificationChannelOptions = [],
  dailyBriefingSchedule,
  dailyBriefing,
  dailyBriefingPdfExporting,
  dailyBriefingTeamNote,
  filters,
  morningPresetActive,
  morningPresetCandidate,
  morningPresetSummary,
  onAddDailyBriefingEmailPreset,
  onApplyDailyBriefingEmailPreset,
  onApplyMorningPreset,
  onChangeDailyBriefingEmailPresetName,
  onChangeDailyBriefingDistributionEnabled,
  onChangeDailyBriefingDistributionTime,
  onChangeDailyBriefingDistributionTimezone,
  onChangeDailyBriefingDistributionWeekdays,
  onChangeDailyBriefingNotificationChannels,
  onChangeDailyBriefingNote,
  onCopyDailyBriefing,
  onCopyDailyBriefingEmailBody,
  onCopyDailyBriefingEmailSubject,
  onCopyDailyBriefingHtml,
  onCopyDailyBriefingMarkdown,
  onChangeDailyBriefingEmailCcRecipients,
  onChangeDailyBriefingEmailRecipients,
  onClearDailyBriefingNote,
  onClearDailyBriefingEmailCcRecipients,
  onClearDailyBriefingEmailRecipients,
  onDownloadDailyBriefingHtml,
  onExportDailyBriefingPdf,
  onDeleteDailyBriefingEmailPreset,
  onMoveDailyBriefingEmailPreset,
  onOpenDailyBriefingMailDraft,
  onOpenDailyBriefingEmailTemplatePage,
  onOpenDailyBriefingPreviewDrawer,
  onOpenDailyBriefingShareCard,
  onOpenQueueCrossMarket,
  onOpenQueueLead,
  onOpenQueuePricing,
  onCopyViewLink,
  onRefreshNow,
  onRunDailyBriefingDryRun,
  onSaveDailyBriefingEmailPreset,
  onSaveDailyBriefingDistribution,
  onSendDailyBriefing,
  onSetDefaultDailyBriefingEmailPreset,
  onSetAutoRefreshInterval,
  onToggleAutoRefresh,
  queueLaunchSummary,
  refreshStats,
  setFilters,
  snapshotSummaryOptions,
  sourceOptions,
  stats,
  TYPE_OPTIONS,
  REFRESH_OPTIONS,
  REASON_OPTIONS,
  SNAPSHOT_VIEW_OPTIONS,
}) => {
  const toggleReasonFilter = (reason) => {
    if (!setFilters) {
      return;
    }
    setFilters((prev) => ({
      ...prev,
      reason: prev.reason === reason ? '' : reason,
    }));
  };

  const clearAllFilters = () => {
    if (!setFilters) {
      return;
    }
    setFilters((prev) => ({
      ...prev,
      type: '',
      source: '',
      refresh: '',
      reason: '',
      snapshotView: '',
      snapshotFingerprint: '',
      snapshotSummary: '',
      keyword: '',
    }));
  };

  const clearFilterField = (field) => {
    if (!setFilters || !field) {
      return;
    }
    setFilters((prev) => ({
      ...prev,
      [field]: '',
    }));
  };

  const toggleSnapshotSummary = (summary, fingerprint = '') => {
    if (!setFilters) {
      return;
    }
    setFilters((prev) => ({
      ...prev,
      snapshotSummary: prev.snapshotSummary === summary ? '' : summary,
      snapshotFingerprint: prev.snapshotSummary === summary ? '' : fingerprint,
    }));
  };

  const isReasonActive = (reason) => filters?.reason === reason;
  const distributionEnabled = Boolean(dailyBriefingDistributionConfig?.enabled);
  const distributionWeekdays = dailyBriefingDistributionConfig?.weekdays?.length
    ? dailyBriefingDistributionConfig.weekdays
    : ['mon', 'tue', 'wed', 'thu', 'fri'];
  const selectedNotificationChannels = parseNotificationChannels(dailyBriefingDistributionConfig?.notificationChannels);
  const notificationChannelMap = new Map();
  (Array.isArray(dailyBriefingNotificationChannelOptions) ? dailyBriefingNotificationChannelOptions : []).forEach((channel) => {
    const id = String(channel?.id || '').trim();
    if (!id || notificationChannelMap.has(id)) {
      return;
    }
    notificationChannelMap.set(id, channel);
  });
  selectedNotificationChannels.forEach((channelId) => {
    if (!notificationChannelMap.has(channelId)) {
      notificationChannelMap.set(channelId, {
        id: channelId,
        label: channelId,
        type: 'saved',
        source: 'distribution',
        enabled: true,
      });
    }
  });
  const notificationChannelCheckboxOptions = Array.from(notificationChannelMap.values()).map((channel) => ({
    label: `${channel.label || channel.id} · ${channel.id}${channel.enabled === false ? ' · disabled' : ''}`,
    value: channel.id,
  }));
  const canOpenDailyBriefingMailDraft = Boolean(dailyBriefingEmailRecipients?.trim());
  const activeFilterMeta = buildActiveWorkbenchFilterMeta(filters, {
    reasonOptions: REASON_OPTIONS,
    refreshOptions: REFRESH_OPTIONS,
    snapshotViewOptions: SNAPSHOT_VIEW_OPTIONS,
    sourceOptions,
    typeOptions: TYPE_OPTIONS,
  });

  return (
    <>
    {activeFilterMeta.length ? (
      <Alert
        type="info"
        showIcon
        message="当前工作台筛选已生效"
        description={(
          <Space wrap>
            {activeFilterMeta.map((item) => (
              <Tag
                key={item.field}
                color={item.color}
                closable
                closeIcon={<span data-testid={`overview-filter-close-${item.field}`}>×</span>}
                onClose={(event) => {
                  event.preventDefault();
                  clearFilterField(item.field);
                }}
              >
                {item.text}
              </Tag>
            ))}
          </Space>
        )}
        action={(
          <Space>
            <Button size="small" onClick={onCopyViewLink}>
              复制当前视图链接
            </Button>
            <Button size="small" onClick={clearAllFilters}>
              清空全部筛选
            </Button>
          </Space>
        )}
      />
    ) : null}
    <Row gutter={[16, 16]}>
      <Col xs={24} md={24}>
        <Card
          variant="borderless"
          title="每日简报"
          extra={(
            <Space wrap>
              {morningPresetActive && morningPresetCandidate?.label ? (
                <Tag color="magenta">{morningPresetCandidate.label}</Tag>
              ) : null}
              <Tag color={autoRefreshSummary?.enabled ? (autoRefreshSummary?.documentVisible ? 'green' : 'gold') : 'default'}>
                {autoRefreshSummary?.statusLabel || '自动刷新已关闭'}
              </Tag>
            </Space>
          )}
        >
          <Space direction="vertical" size={12} style={{ width: '100%' }}>
            <div>
              <Text strong style={{ display: 'block', fontSize: 16, color: 'var(--text-primary)' }}>
                {dailyBriefing?.headline || '今日先整理研究工作台'}
              </Text>
              {dailyBriefing?.summary ? (
                <Text type="secondary">{dailyBriefing.summary}</Text>
              ) : null}
            </div>
            {dailyBriefing?.chips?.length ? (
              <Space wrap>
                {dailyBriefing.chips.map((item) => (
                  <Tag key={item.label} color={item.color || 'blue'}>
                    {`${item.label} ${item.value || 0}`}
                  </Tag>
                ))}
              </Space>
            ) : null}
            {(dailyBriefing?.details || []).map((item) => (
              <Text key={item} type="secondary">
                {item}
              </Text>
            ))}
            <div>
              <Text type="secondary" style={{ display: 'block', marginBottom: 8 }}>
                {`导出抬头：${dailyBriefingBrandLabel || 'Super Pricing System · Research Workbench'}`}
              </Text>
              <TextArea
                value={dailyBriefingTeamNote || ''}
                autoSize={{ minRows: 2, maxRows: 4 }}
                maxLength={240}
                placeholder="写给协作者的晨会提醒、风险提示或任务交接备注..."
                onChange={(event) => onChangeDailyBriefingNote?.(event.target.value)}
              />
              <Input
                style={{ marginTop: 12 }}
                value={dailyBriefingEmailRecipients || ''}
                placeholder="收件人模板，如 pm@example.com; desk@example.com"
                onChange={(event) => onChangeDailyBriefingEmailRecipients?.(event.target.value)}
              />
              <Input
                style={{ marginTop: 8 }}
                value={dailyBriefingEmailCcRecipients || ''}
                placeholder="抄送模板，如 risk@example.com; lead@example.com"
                onChange={(event) => onChangeDailyBriefingEmailCcRecipients?.(event.target.value)}
              />
              {dailyBriefingEmailPresets?.length ? (
                <div style={{ marginTop: 12, display: 'grid', gap: 8 }}>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', justifyContent: 'space-between' }}>
                    <Text strong style={{ color: 'var(--text-primary)' }}>
                      分发预设
                    </Text>
                    <Button size="small" onClick={onAddDailyBriefingEmailPreset}>
                      新增自定义预设
                    </Button>
                  </div>
                  <Text type="secondary">
                    把当前收件人和抄送模板存成晨会、风险同步、管理层简报等本地预设，后续可以一键切换；也可以继续新增自己的分发槽位。默认预设会在本地模板为空时自动回填。
                  </Text>
                  {dailyBriefingEmailPresets.map((preset) => {
                    const presetActive = preset?.id && preset.id === activeDailyBriefingEmailPresetId;
                    const presetDefault = preset?.id && preset.id === dailyBriefingDefaultEmailPresetId;
                    const presetName = preset?.name || '未命名预设';
                    const hasRecipients = Boolean(preset?.toRecipients?.trim() || preset?.ccRecipients?.trim());
                    const presetDeletable = preset?.id?.startsWith?.('custom_');

                    return (
                      <div
                        key={preset.id}
                        style={{
                          display: 'grid',
                          gap: 8,
                          padding: 12,
                          borderRadius: 12,
                          border: presetActive ? '1px solid rgba(37, 99, 235, 0.35)' : '1px solid rgba(148, 163, 184, 0.25)',
                          background: presetActive ? 'rgba(37, 99, 235, 0.06)' : 'rgba(15, 23, 42, 0.02)',
                        }}
                      >
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', justifyContent: 'space-between' }}>
                          <Input
                            size="small"
                            style={{ maxWidth: 220 }}
                            value={preset.name || ''}
                            placeholder="预设名称"
                            onChange={(event) => onChangeDailyBriefingEmailPresetName?.(preset.id, event.target.value)}
                          />
                          {presetActive ? <Tag color="blue">当前已应用</Tag> : null}
                          {presetDefault ? <Tag color="gold">默认预设</Tag> : null}
                          {presetDeletable ? <Tag color="default">自定义</Tag> : null}
                        </div>
                        <Text type="secondary" style={{ whiteSpace: 'pre-wrap' }}>
                          {`收件人：${preset.toRecipients || '未保存'}`}
                        </Text>
                        <Text type="secondary" style={{ whiteSpace: 'pre-wrap' }}>
                          {`抄送：${preset.ccRecipients || '未保存'}`}
                        </Text>
                        <Space wrap>
                          <Button
                            size="small"
                            type={presetActive ? 'primary' : 'default'}
                            disabled={!hasRecipients}
                            onClick={() => onApplyDailyBriefingEmailPreset?.(preset.id)}
                          >
                            {presetActive ? `继续使用 ${presetName}` : `应用 ${presetName}`}
                          </Button>
                          <Button size="small" onClick={() => onSaveDailyBriefingEmailPreset?.(preset.id)}>
                            保存当前模板
                          </Button>
                          <Button size="small" onClick={() => onSetDefaultDailyBriefingEmailPreset?.(preset.id)}>
                            {presetDefault ? '取消默认' : '设为默认'}
                          </Button>
                          {presetDeletable ? (
                            <>
                              <Button
                                size="small"
                                disabled={dailyBriefingEmailPresets.findIndex((item) => item.id === preset.id) === dailyBriefingEmailPresets.findIndex((item) => item.id?.startsWith?.('custom_'))}
                                onClick={() => onMoveDailyBriefingEmailPreset?.(preset.id, 'up')}
                              >
                                上移
                              </Button>
                              <Button
                                size="small"
                                disabled={[...dailyBriefingEmailPresets].reverse().findIndex((item) => item.id?.startsWith?.('custom_')) === [...dailyBriefingEmailPresets].reverse().findIndex((item) => item.id === preset.id)}
                                onClick={() => onMoveDailyBriefingEmailPreset?.(preset.id, 'down')}
                              >
                                下移
                              </Button>
                            </>
                          ) : null}
                          {presetDeletable ? (
                            <Button size="small" danger onClick={() => onDeleteDailyBriefingEmailPreset?.(preset.id)}>
                              删除预设
                            </Button>
                          ) : null}
                        </Space>
                      </div>
                    );
                  })}
                </div>
              ) : null}
              <Space wrap style={{ marginTop: 8 }}>
                <Text type="secondary">导出时会自动附带生成时间与团队备注。</Text>
                <Text type="secondary">收件人与抄送模板可同步到分发配置，用于 dry-run 审计、邮件模板页和邮件草稿。</Text>
                {dailyBriefingTeamNote?.trim() ? (
                  <Button size="small" onClick={onClearDailyBriefingNote}>
                    清空团队备注
                  </Button>
                ) : null}
                {dailyBriefingEmailRecipients?.trim() ? (
                  <Button size="small" onClick={onClearDailyBriefingEmailRecipients}>
                    清空收件人
                  </Button>
                ) : null}
                {dailyBriefingEmailCcRecipients?.trim() ? (
                  <Button size="small" onClick={onClearDailyBriefingEmailCcRecipients}>
                    清空抄送
                  </Button>
                ) : null}
              </Space>
            </div>
            <div
              style={{
                display: 'grid',
                gap: 10,
                padding: 12,
                borderRadius: 12,
                border: '1px solid rgba(148, 163, 184, 0.25)',
                background: 'rgba(15, 23, 42, 0.02)',
              }}
            >
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', justifyContent: 'space-between' }}>
                <Space wrap>
                  <Text strong style={{ color: 'var(--text-primary)' }}>分发中心</Text>
                  <Tag color={distributionEnabled ? 'green' : 'default'}>
                    {distributionEnabled ? '已启用' : 'Dry-run'}
                  </Tag>
                  <Tag color={getScheduleStatusTagColor(dailyBriefingSchedule?.status || '')}>
                    {dailyBriefingSchedule?.status || 'disabled'}
                  </Tag>
                </Space>
                <Space wrap>
                  <Text type="secondary">自动分发</Text>
                  <Switch
                    checked={distributionEnabled}
                    onChange={(checked) => onChangeDailyBriefingDistributionEnabled?.(checked)}
                    aria-label="自动分发"
                  />
                </Space>
              </div>
              <Space wrap>
                <Input
                  aria-label="简报发送时间"
                  style={{ width: 96 }}
                  value={dailyBriefingDistributionConfig?.sendTime || '09:00'}
                  placeholder="09:00"
                  onChange={(event) => onChangeDailyBriefingDistributionTime?.(event.target.value)}
                />
                <Input
                  aria-label="简报时区"
                  style={{ width: 160 }}
                  value={dailyBriefingDistributionConfig?.timezone || 'Asia/Shanghai'}
                  placeholder="Asia/Shanghai"
                  onChange={(event) => onChangeDailyBriefingDistributionTimezone?.(event.target.value)}
                />
                <Checkbox.Group
                  aria-label="通知通道"
                  options={notificationChannelCheckboxOptions}
                  value={selectedNotificationChannels}
                  onChange={(values) => {
                    const nextChannels = values?.length ? values : ['dry_run'];
                    onChangeDailyBriefingNotificationChannels?.(nextChannels.join(' '));
                  }}
                />
                <Button loading={dailyBriefingDistributionSaving} onClick={onSaveDailyBriefingDistribution}>
                  保存分发配置
                </Button>
                <Button type="primary" loading={dailyBriefingDryRunRunning} onClick={onRunDailyBriefingDryRun}>
                  试发送 Dry-run
                </Button>
                <Button loading={dailyBriefingSending} onClick={onSendDailyBriefing}>
                  发送通知
                </Button>
              </Space>
              <Text type="secondary">
                {dailyBriefingSchedule?.status === 'scheduled'
                  ? `下次自动分发：${dailyBriefingSchedule.nextRunLabel || dailyBriefingSchedule.nextRunAt}`
                  : dailyBriefingSchedule?.nextRunLabel || '自动分发未启用'}
              </Text>
              <Checkbox.Group
                options={WEEKDAY_OPTIONS}
                value={distributionWeekdays}
                onChange={(values) => onChangeDailyBriefingDistributionWeekdays?.(values)}
              />
              {dailyBriefingDeliveryHistory?.length ? (
                <div style={{ display: 'grid', gap: 6 }}>
                  <Text type="secondary">最近分发记录</Text>
                  {dailyBriefingDeliveryHistory.slice(0, 3).map((record) => (
                    <div key={record.id} style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
                      <Tag color={getDeliveryResultTagColor(record.status)}>{record.status || 'dry_run'}</Tag>
                      <Text type="secondary">{record.created_at || record.createdAt || '未记录时间'}</Text>
                      <Text style={{ color: 'var(--text-primary)' }}>{record.subject || record.headline || '每日简报'}</Text>
                      <Text type="secondary">{record.to_recipients || record.toRecipients || '未设置收件人'}</Text>
                      {(record.channel_results || record.channelResults || []).length ? (
                        (record.channel_results || record.channelResults || []).map((result) => (
                          <Tag
                            key={`${record.id}-${result.channel || result.status}`}
                            color={getDeliveryResultTagColor(result.status)}
                            title={result.reason || ''}
                          >
                            {`${result.channel || 'channel'}: ${result.status || 'unknown'}`}
                          </Tag>
                        ))
                      ) : (
                        <Text type="secondary">{(record.channels || []).join(', ') || record.channel || '未记录通道'}</Text>
                      )}
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
            <Space wrap>
              <Button type="primary" onClick={onRefreshNow} loading={autoRefreshSummary?.isRefreshing}>
                立即刷新
              </Button>
              <Button onClick={onCopyDailyBriefing}>
                复制今日简报
              </Button>
              <Button onClick={onCopyDailyBriefingMarkdown}>
                复制 Markdown 简报
              </Button>
              <Button onClick={onCopyDailyBriefingHtml}>
                复制 HTML 简报
              </Button>
              <Button onClick={onCopyDailyBriefingEmailSubject}>
                复制邮件主题
              </Button>
              <Button onClick={onCopyDailyBriefingEmailBody}>
                复制邮件正文
              </Button>
              <Button onClick={onDownloadDailyBriefingHtml}>
                下载 HTML 简报
              </Button>
              <Button onClick={onExportDailyBriefingPdf} loading={dailyBriefingPdfExporting}>
                导出 PDF 简报
              </Button>
              <Button onClick={onOpenDailyBriefingEmailTemplatePage}>
                打开邮件模板页
              </Button>
              <Button
                onClick={onOpenDailyBriefingMailDraft}
                disabled={!canOpenDailyBriefingMailDraft}
                title={canOpenDailyBriefingMailDraft ? '打开邮件草稿' : '请先设置收件人模板'}
              >
                打开邮件草稿
              </Button>
              <Button onClick={onOpenDailyBriefingPreviewDrawer}>
                工作台内预览
              </Button>
              <Button onClick={onOpenDailyBriefingShareCard}>
                打开分享卡片
              </Button>
              {morningPresetCandidate ? (
                <Button
                  onClick={onApplyMorningPreset}
                  disabled={morningPresetActive}
                >
                  {morningPresetActive ? '晨间默认视图已生效' : '切回晨间默认视图'}
                </Button>
              ) : null}
              <Button onClick={onToggleAutoRefresh}>
                {autoRefreshSummary?.enabled ? '暂停自动刷新' : '开启自动刷新'}
              </Button>
              {(autoRefreshSummary?.intervalOptions || []).map((item) => (
                <Button
                  key={item.value}
                  size="small"
                  type={autoRefreshSummary?.intervalMs === item.value ? 'primary' : 'default'}
                  onClick={() => onSetAutoRefreshInterval?.(item.value)}
                >
                  {item.label}
                </Button>
              ))}
            </Space>
            <Text type="secondary">
              最近刷新：{autoRefreshSummary?.lastRefreshLabel || '等待首次刷新'}
              {autoRefreshSummary?.enabled
                ? ` · ${autoRefreshSummary?.documentVisible ? autoRefreshSummary?.nextRefreshLabel : '页面后台时自动刷新暂停'}`
                : ' · 自动刷新当前已关闭'}
            </Text>
            {morningPresetCandidate && !morningPresetActive ? (
              <Text type="secondary">
                {morningPresetSummary?.label
                  ? `最近一次晨间推荐：${morningPresetSummary.label}`
                  : `当前可切回：${morningPresetCandidate.label}`}
              </Text>
            ) : null}
          </Space>
        </Card>
      </Col>
    </Row>
    <Row gutter={[16, 16]}>
      <Col xs={12} md={6}>
        <Card variant="borderless">
          <Statistic title="总任务" value={stats?.total || 0} />
        </Card>
      </Col>
      <Col xs={12} md={6}>
        <Card variant="borderless">
          <Statistic title="进行中" value={stats?.status_counts?.in_progress || 0} />
        </Card>
      </Col>
      <Col xs={12} md={6}>
        <Card variant="borderless">
          <Statistic title="阻塞" value={stats?.status_counts?.blocked || 0} />
        </Card>
      </Col>
      <Col xs={12} md={6}>
        <Card variant="borderless">
          <Statistic title="已完成" value={stats?.status_counts?.complete || 0} />
        </Card>
      </Col>
    </Row>

    <Row gutter={[16, 16]}>
      <Col xs={24} md={6}>
        <Card variant="borderless">
          <Statistic title="建议更新" value={refreshStats.high} valueStyle={{ color: '#cf1322' }} />
          <Text type="secondary">宏观或另类数据与保存输入明显脱节，建议优先重开研究。</Text>
        </Card>
      </Col>
      <Col xs={24} md={6}>
        <Card variant="borderless">
          <Statistic title="建议复核" value={refreshStats.medium} valueStyle={{ color: '#d48806' }} />
          <Text type="secondary">核心驱动在变化，适合先做一次中间复核，再决定是否更新快照。</Text>
        </Card>
      </Col>
      <Col xs={24} md={6}>
        <Card variant="borderless">
          <Statistic title="共振驱动" value={refreshStats.resonance} valueStyle={{ color: '#c41d7f' }} />
          <Text type="secondary">这些任务的优先级变化来自宏观共振结构切换，更值得优先看。</Text>
        </Card>
      </Col>
      <Col xs={24} md={6}>
        <Card variant="borderless">
          <Statistic title="核心腿受压" value={refreshStats.biasQualityCore} valueStyle={{ color: '#fa541c' }} />
          <Text type="secondary">这些任务的主题核心腿已经成为偏置收缩焦点，通常比普通配置压缩更值得先处理。</Text>
        </Card>
      </Col>
      <Col xs={24} md={6}>
        <Card variant="borderless">
          <Statistic title="降级运行" value={refreshStats.selectionQualityActive} valueStyle={{ color: '#ad6800' }} />
          <Text type="secondary">这些任务的当前结果已经按收缩或自动降级强度运行，通常应排在普通更新前面优先重看。</Text>
        </Card>
      </Col>
      <Col xs={24} md={6}>
        <Card variant="borderless">
          <Statistic title="复核语境切换" value={refreshStats.reviewContext} valueStyle={{ color: '#1d39c4' }} />
          <Text type="secondary">这些任务最近两版刚切入复核语境，或从复核型结果回到普通结果，适合尽快复核最新判断。</Text>
        </Card>
      </Col>
      <Col xs={24} md={6}>
        <Card variant="borderless">
          <Statistic title="系统衰败雷达" value={refreshStats.structuralDecayRadar || 0} valueStyle={{ color: '#cf1322' }} />
          <Text type="secondary">这些任务的系统级结构衰败雷达较保存时升温，通常意味着风险预算需要先收缩，再讨论表达方向。</Text>
        </Card>
      </Col>
      <Col xs={24} md={6}>
        <Card
          variant="borderless"
          extra={(
            <Button
              type="link"
              size="small"
              onClick={() => setFilters((prev) => ({ ...prev, snapshotView: prev.snapshotView === 'filtered' ? '' : 'filtered' }))}
            >
              {filters?.snapshotView === 'filtered' ? '取消筛选' : '只看带视角'}
            </Button>
          )}
        >
          <Statistic title="带视角快照" value={refreshStats.snapshotViewFiltered || 0} valueStyle={{ color: '#389e0d' }} />
          <Text type="secondary">这些任务最近一次快照带有工作台筛选视角，适合回溯“当时为什么会看它”。</Text>
        </Card>
      </Col>
      <Col xs={24} md={6}>
        <Card
          variant="borderless"
          extra={(
            <Button
              type="link"
              size="small"
              onClick={() => setFilters((prev) => ({ ...prev, snapshotView: prev.snapshotView === 'scoped' ? '' : 'scoped' }))}
            >
              {filters?.snapshotView === 'scoped' ? '取消筛选' : '只看带焦点'}
            </Button>
          )}
        >
          <Statistic title="带任务焦点快照" value={refreshStats.snapshotViewScoped || 0} valueStyle={{ color: '#1677ff' }} />
          <Text type="secondary">这些任务的最近快照还带有明确研究焦点，适合直接进入复盘或复核。</Text>
        </Card>
      </Col>
      <Col xs={24} md={12}>
        <Card
          variant="borderless"
          title="研究视角复盘入口"
          extra={stats?.snapshot_view_queues?.length ? <Tag color="blue">全量工作台</Tag> : null}
        >
          <Space direction="vertical" size={12} style={{ width: '100%' }}>
            {snapshotSummaryOptions?.length ? (
              snapshotSummaryOptions.slice(0, 4).map((item) => (
                <Space key={item.value} wrap style={{ width: '100%', justifyContent: 'space-between' }}>
                  <Space wrap>
                    <Button
                      size="small"
                      type={filters?.snapshotSummary === item.value ? 'primary' : 'default'}
                      onClick={() => toggleSnapshotSummary(item.value, item.fingerprint)}
                    >
                      {filters?.snapshotSummary === item.value ? '取消复盘队列' : `查看“${item.value}”`}
                    </Button>
                    <Tag color="volcano">{item.count}</Tag>
                    {item.scopedCount ? <Tag color="processing">焦点 {item.scopedCount}</Tag> : null}
                  </Space>
                  <Text type="secondary">{item.label}</Text>
                </Space>
              ))
            ) : (
              <Text type="secondary">暂时还没有带研究视角的快照，等下一轮保存后这里会形成复盘入口。</Text>
            )}
            <Text type="secondary">
              按保存当时的工作台研究视角回看任务，比只看最新状态更容易复盘当时的判断框架。
              {stats?.snapshot_view_queues?.length ? ' 当前入口来自全量工作台聚合，不受页面已加载任务数限制。' : ''}
            </Text>
          </Space>
        </Card>
      </Col>
      <Col xs={24} md={12}>
        <Card
          variant="borderless"
          title="当前复盘队列执行入口"
          extra={queueLaunchSummary?.launchableCount ? <Tag color="purple">可重开 {queueLaunchSummary.launchableCount}</Tag> : null}
        >
          <Space direction="vertical" size={12} style={{ width: '100%' }}>
            <Space wrap>
              <Button
                type="primary"
                onClick={onOpenQueueLead}
                disabled={!queueLaunchSummary?.leadTask}
              >
                打开队列首条
              </Button>
              <Button
                onClick={onOpenQueuePricing}
                disabled={!queueLaunchSummary?.pricingTask}
              >
                打开首个 Pricing
              </Button>
              <Button
                onClick={onOpenQueueCrossMarket}
                disabled={!queueLaunchSummary?.crossMarketTask}
              >
                打开首个跨市场
              </Button>
            </Space>
            <Space wrap>
              <Tag color="blue">Pricing {queueLaunchSummary?.pricingCount || 0}</Tag>
              <Tag color="purple">Cross-Market {queueLaunchSummary?.crossMarketCount || 0}</Tag>
            </Space>
            <Text type="secondary">
              {queueLaunchSummary?.leadTask
                ? `当前排序首条：${queueLaunchSummary.leadTask.title || queueLaunchSummary.leadTask.id}`
                : '当前筛选队列里还没有可直接重新打开的研究页。'}
            </Text>
            <Text type="secondary">
              这个入口适合把当前筛选队列直接送回执行页，不用先点开单张任务卡再重开研究。
            </Text>
          </Space>
        </Card>
      </Col>
      <Col xs={24} md={6}>
        <Card
          variant="borderless"
          extra={(
            <Button type="link" size="small" onClick={() => toggleReasonFilter('priority_new')}>
              {isReasonActive('priority_new') ? '取消筛选' : '只看首次'}
            </Button>
          )}
        >
          <Statistic title="自动排序首次入列" value={refreshStats.priorityNew || 0} valueStyle={{ color: '#1677ff' }} />
          <Text type="secondary">这些任务是第一次被系统推进自动排序队列，适合先快速扫一眼，确认是否需要立刻升级处理。</Text>
        </Card>
      </Col>
      <Col xs={24} md={6}>
        <Card
          variant="borderless"
          extra={(
            <Button type="link" size="small" onClick={() => toggleReasonFilter('priority_escalated')}>
              {isReasonActive('priority_escalated') ? '取消筛选' : '只看升档'}
            </Button>
          )}
        >
          <Statistic title="自动排序升档" value={refreshStats.priorityEscalated || 0} valueStyle={{ color: '#cf1322' }} />
          <Text type="secondary">这些任务最近一次自动排序不是简单复写，而是优先级真的升了一档，通常应该先看。</Text>
        </Card>
      </Col>
      <Col xs={24} md={6}>
        <Card variant="borderless">
          <Statistic title="人的维度" value={refreshStats.peopleLayer} valueStyle={{ color: '#722ed1' }} />
          <Text type="secondary">这些任务的人事与组织结构较保存时明显走弱，适合优先确认长期判断是否需要下修。</Text>
        </Card>
      </Col>
      <Col xs={24} md={6}>
        <Card variant="borderless">
          <Statistic title="部门混乱" value={refreshStats.departmentChaos} valueStyle={{ color: '#ad4e00' }} />
          <Text type="secondary">这些任务的部门级政策混乱较保存时恶化，适合优先确认政策执行主体是否已经改变组合风险。</Text>
        </Card>
      </Col>
      <Col xs={24} md={6}>
        <Card variant="borderless">
          <Statistic title="自动降级" value={refreshStats.selectionQuality} valueStyle={{ color: '#d48806' }} />
          <Text type="secondary">这些任务已经从原始推荐切到降级处理，说明主题排序本身正在被重新评估。</Text>
        </Card>
      </Col>
      <Col xs={24} md={6}>
        <Card variant="borderless">
          <Statistic title="政策源驱动" value={refreshStats.policySource} valueStyle={{ color: '#cf1322' }} />
          <Text type="secondary">这些任务的更新优先级来自政策正文抓取质量退化，应先确认研究输入是否仍然可靠。</Text>
        </Card>
      </Col>
      <Col xs={24} md={6}>
        <Card variant="borderless">
          <Statistic title="偏置收缩" value={refreshStats.biasQuality} valueStyle={{ color: '#d46b08' }} />
          <Text type="secondary">这些任务的宏观偏置强度已经被证据质量压缩，建议先确认模板还适不适合维持原有配置力度。</Text>
        </Card>
      </Col>
      <Col xs={24} md={6}>
        <Card
          variant="borderless"
          extra={(
            <Button type="link" size="small" onClick={() => toggleReasonFilter('priority_relaxed')}>
              {isReasonActive('priority_relaxed') ? '取消筛选' : '只看缓和'}
            </Button>
          )}
        >
          <Statistic title="自动排序缓和" value={refreshStats.priorityRelaxed || 0} valueStyle={{ color: '#389e0d' }} />
          <Text type="secondary">这些任务最近一次自动排序显示风险边际缓和，更适合从“马上处理”切回“跟踪观察”。</Text>
        </Card>
      </Col>
      <Col xs={24} md={6}>
        <Card
          variant="borderless"
          extra={(
            <Button type="link" size="small" onClick={() => toggleReasonFilter('priority_updated')}>
              {isReasonActive('priority_updated') ? '取消筛选' : '只看更新'}
            </Button>
          )}
        >
          <Statistic title="自动排序同类更新" value={refreshStats.priorityUpdated || 0} valueStyle={{ color: '#d48806' }} />
          <Text type="secondary">这些任务的自动排序没有升档或缓和，但同类风险还在持续刷新，适合放进日常复核列表里稳定跟踪。</Text>
        </Card>
      </Col>
    </Row>

    <Row gutter={[16, 16]}>
      <Col xs={24} md={24}>
        <Card variant="borderless">
          <Statistic title="继续观察" value={refreshStats.low} valueStyle={{ color: '#1677ff' }} />
          <Text type="secondary">当前输入与保存快照仍然相近，可以继续沿现有研究路线推进。</Text>
        </Card>
      </Col>
    </Row>

    {refreshStats.selectionQualityActive ? (
      <Alert
        type="warning"
        showIcon
        message="降级运行任务应优先重看"
        description={`当前有 ${refreshStats.selectionQualityActive} 条任务的保存结果已经按收缩或自动降级强度运行。这类结果本身已经受推荐质量变化影响，通常应排在普通“建议更新”前面优先处理。`}
      />
    ) : null}

    {refreshStats.structuralDecayRadar ? (
      <Alert
        type="error"
        showIcon
        message="系统衰败雷达升温任务应优先处理"
        description={`当前有 ${refreshStats.structuralDecayRadar} 条任务被系统级结构衰败雷达重新排序。这类任务通常不是单点证据变化，而是风险预算、治理和执行压力形成了新的系统级负向共振。`}
      />
    ) : null}

    {refreshStats.priorityEscalated ? (
      <Alert
        type="error"
        showIcon
        message="自动排序刚升档的任务应排在最前面"
        description={`当前有 ${refreshStats.priorityEscalated} 条任务最近一次自动排序被系统判定为“升级”。这意味着优先级不是重复记录，而是较上次真的更紧急了。`}
        action={(
          <Button size="small" type="primary" danger onClick={() => toggleReasonFilter('priority_escalated')}>
            {isReasonActive('priority_escalated') ? '取消筛选' : '只看升档'}
          </Button>
        )}
      />
    ) : null}
    </>
  );
};

export default WorkbenchOverviewPanels;
