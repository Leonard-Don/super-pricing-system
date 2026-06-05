import type { paths, components } from '@/generated/api-types';
import api, { withTimeoutProfile } from './core';

/**
 * 研究工作台领域 API：任务 CRUD、状态流转、Snapshot、时间线、评论、Board 重排、统计。
 * 路由前缀：`/research-workbench/*`
 */

// ---- Request / Response types ----
type ResearchTasksResponse =
  paths['/research-workbench/tasks']['get']['responses'][200]['content']['application/json'];

type ResearchTaskCreateBody =
  paths['/research-workbench/tasks']['post']['requestBody']['content']['application/json'];

type ResearchTaskCreateResponse =
  paths['/research-workbench/tasks']['post']['responses'][200]['content']['application/json'];

type ResearchTaskGetResponse =
  paths['/research-workbench/tasks/{task_id}']['get']['responses'][200]['content']['application/json'];

type ResearchTaskUpdateBody =
  paths['/research-workbench/tasks/{task_id}']['put']['requestBody']['content']['application/json'];

type ResearchTaskUpdateResponse =
  paths['/research-workbench/tasks/{task_id}']['put']['responses'][200]['content']['application/json'];

type ResearchTaskDeleteResponse =
  paths['/research-workbench/tasks/{task_id}']['delete']['responses'][200]['content']['application/json'];

type ResearchTaskTimelineResponse =
  paths['/research-workbench/tasks/{task_id}/timeline']['get']['responses'][200]['content']['application/json'];

type ResearchTaskCommentBody =
  paths['/research-workbench/tasks/{task_id}/comments']['post']['requestBody']['content']['application/json'];

type ResearchTaskCommentResponse =
  paths['/research-workbench/tasks/{task_id}/comments']['post']['responses'][200]['content']['application/json'];

type ResearchTaskCommentDeleteResponse =
  paths['/research-workbench/tasks/{task_id}/comments/{comment_id}']['delete']['responses'][200]['content']['application/json'];

type ResearchTaskSnapshotBody =
  paths['/research-workbench/tasks/{task_id}/snapshot']['post']['requestBody']['content']['application/json'];

type ResearchTaskSnapshotResponse =
  paths['/research-workbench/tasks/{task_id}/snapshot']['post']['responses'][200]['content']['application/json'];

type ReorderResearchBoardBody =
  paths['/research-workbench/board/reorder']['post']['requestBody']['content']['application/json'];

type ReorderResearchBoardResponse =
  paths['/research-workbench/board/reorder']['post']['responses'][200]['content']['application/json'];

type ResearchTaskStatsResponse =
  paths['/research-workbench/stats']['get']['responses'][200]['content']['application/json'];

type BulkUpdateResearchTasksBody =
  paths['/research-workbench/tasks/bulk-update']['post']['requestBody']['content']['application/json'];

type BulkUpdateResearchTasksResponse =
  paths['/research-workbench/tasks/bulk-update']['post']['responses'][200]['content']['application/json'];

// ---- Param shapes ----
export interface ResearchTasksParams {
  limit?: number;
  type?: string;
  status?: string;
  source?: string;
  view?: string;
}

/**
 * 获取研究工作台任务列表。
 */
export const getResearchTasks = async (
  params: ResearchTasksParams = {},
): Promise<ResearchTasksResponse> => {
  const search = new URLSearchParams();
  if (params.limit) search.set('limit', String(params.limit));
  if (params.type) search.set('type', params.type);
  if (params.status) search.set('status', params.status);
  if (params.source) search.set('source', params.source);
  if (params.view) search.set('view', params.view);
  const query = search.toString();
  const response = await api.get<ResearchTasksResponse>(
    `/research-workbench/tasks${query ? `?${query}` : ''}`,
    withTimeoutProfile('workbench'),
  );
  return response.data;
};

/**
 * 创建研究工作台任务。
 */
export const createResearchTask = async (
  payload: ResearchTaskCreateBody,
): Promise<ResearchTaskCreateResponse> => {
  const response = await api.post<ResearchTaskCreateResponse>(
    '/research-workbench/tasks',
    payload,
    withTimeoutProfile('workbench'),
  );
  return response.data;
};

/**
 * 获取研究工作台任务详情。
 */
export const getResearchTask = async (
  taskId: string,
): Promise<ResearchTaskGetResponse> => {
  const response = await api.get<ResearchTaskGetResponse>(
    `/research-workbench/tasks/${encodeURIComponent(taskId)}`,
    withTimeoutProfile('workbench'),
  );
  return response.data;
};

/**
 * 更新研究工作台任务（状态流转等）。
 */
export const updateResearchTask = async (
  taskId: string,
  payload: ResearchTaskUpdateBody,
): Promise<ResearchTaskUpdateResponse> => {
  const response = await api.put<ResearchTaskUpdateResponse>(
    `/research-workbench/tasks/${encodeURIComponent(taskId)}`,
    payload,
    withTimeoutProfile('workbench'),
  );
  return response.data;
};

/**
 * 删除研究工作台任务。
 */
export const deleteResearchTask = async (
  taskId: string,
): Promise<ResearchTaskDeleteResponse> => {
  const response = await api.delete<ResearchTaskDeleteResponse>(
    `/research-workbench/tasks/${encodeURIComponent(taskId)}`,
    withTimeoutProfile('workbench'),
  );
  return response.data;
};

/**
 * 获取研究任务时间线。
 */
export const getResearchTaskTimeline = async (
  taskId: string,
): Promise<ResearchTaskTimelineResponse> => {
  const response = await api.get<ResearchTaskTimelineResponse>(
    `/research-workbench/tasks/${encodeURIComponent(taskId)}/timeline`,
    withTimeoutProfile('workbench'),
  );
  return response.data;
};

/**
 * 为研究任务添加评论。
 */
export const addResearchTaskComment = async (
  taskId: string,
  payload: ResearchTaskCommentBody,
): Promise<ResearchTaskCommentResponse> => {
  const response = await api.post<ResearchTaskCommentResponse>(
    `/research-workbench/tasks/${encodeURIComponent(taskId)}/comments`,
    payload,
    withTimeoutProfile('workbench'),
  );
  return response.data;
};

/**
 * 删除研究任务评论。
 */
export const deleteResearchTaskComment = async (
  taskId: string,
  commentId: string,
): Promise<ResearchTaskCommentDeleteResponse> => {
  const response = await api.delete<ResearchTaskCommentDeleteResponse>(
    `/research-workbench/tasks/${encodeURIComponent(taskId)}/comments/${encodeURIComponent(commentId)}`,
    withTimeoutProfile('workbench'),
  );
  return response.data;
};

/**
 * 追加研究任务快照。
 */
export const addResearchTaskSnapshot = async (
  taskId: string,
  payload: ResearchTaskSnapshotBody,
): Promise<ResearchTaskSnapshotResponse> => {
  const response = await api.post<ResearchTaskSnapshotResponse>(
    `/research-workbench/tasks/${encodeURIComponent(taskId)}/snapshot`,
    payload,
    withTimeoutProfile('workbench'),
  );
  return response.data;
};

/**
 * 批量更新研究工作台看板顺序。
 */
export const reorderResearchBoard = async (
  payload: ReorderResearchBoardBody,
): Promise<ReorderResearchBoardResponse> => {
  const response = await api.post<ReorderResearchBoardResponse>(
    '/research-workbench/board/reorder',
    payload,
    withTimeoutProfile('workbench'),
  );
  return response.data;
};

/**
 * 获取研究工作台统计。
 */
export const getResearchTaskStats = async (): Promise<ResearchTaskStatsResponse> => {
  const response = await api.get<ResearchTaskStatsResponse>(
    '/research-workbench/stats',
    withTimeoutProfile('workbench'),
  );
  return response.data;
};

/**
 * 批量更新研究工作台任务。
 */
export const bulkUpdateResearchTasks = async (
  payload: BulkUpdateResearchTasksBody,
): Promise<BulkUpdateResearchTasksResponse> => {
  const response = await api.post<BulkUpdateResearchTasksResponse>(
    '/research-workbench/tasks/bulk-update',
    payload,
    withTimeoutProfile('workbench'),
  );
  return response.data;
};

// ---- Briefing distribution types ----
type ResearchBriefingDistributionResponse =
  paths['/research-workbench/briefing/distribution']['get']['responses'][200]['content']['application/json'];

type ResearchBriefingDistributionBody =
  components['schemas']['ResearchBriefingDistributionRequest'];

type ResearchBriefingDistributionUpdateResponse =
  paths['/research-workbench/briefing/distribution']['put']['responses'][200]['content']['application/json'];

type ResearchBriefingDryRunBody =
  components['schemas']['ResearchBriefingDryRunRequest'];

type ResearchBriefingDryRunResponse =
  paths['/research-workbench/briefing/dry-run']['post']['responses'][200]['content']['application/json'];

type ResearchBriefingSendBody =
  components['schemas']['ResearchBriefingSendRequest'];

type ResearchBriefingSendResponse =
  paths['/research-workbench/briefing/send']['post']['responses'][200]['content']['application/json'];

// ---- Alt-data candidates types ----
type AltDataCandidateListResponse =
  paths['/research-workbench/alt-data-candidates']['get']['responses'][200]['content']['application/json'];

type AltDataCandidateRefreshResponse =
  paths['/research-workbench/alt-data-candidates/refresh']['post']['responses'][200]['content']['application/json'];

type AltDataCandidateConvertResponse =
  paths['/research-workbench/alt-data-candidates/{candidate_id}/convert']['post']['responses'][200]['content']['application/json'];

type AltDataCandidateActionResponse =
  paths['/research-workbench/alt-data-candidates/{candidate_id}/dismiss']['post']['responses'][200]['content']['application/json'];

type AltDataCandidateSnoozeBody =
  components['schemas']['AltDataCandidateSnoozeRequest'];

// ---- Param shapes ----
export interface AltDataCandidatesParams {
  state?: string;
}

// ============ Briefing 分发 ============

/**
 * 获取每日简报分发配置。
 */
export const getResearchBriefingDistribution =
  async (): Promise<ResearchBriefingDistributionResponse> => {
    const response = await api.get<ResearchBriefingDistributionResponse>(
      '/research-workbench/briefing/distribution',
      withTimeoutProfile('workbench'),
    );
    return response.data;
  };

/**
 * 保存每日简报分发配置（PUT）。
 */
export const updateResearchBriefingDistribution = async (
  payload: ResearchBriefingDistributionBody,
): Promise<ResearchBriefingDistributionUpdateResponse> => {
  const response = await api.put<ResearchBriefingDistributionUpdateResponse>(
    '/research-workbench/briefing/distribution',
    payload,
    withTimeoutProfile('workbench'),
  );
  return response.data;
};

/**
 * 记录每日简报 dry-run 分发（不真实发送）。
 */
export const runResearchBriefingDryRun = async (
  payload: ResearchBriefingDryRunBody,
): Promise<ResearchBriefingDryRunResponse> => {
  const response = await api.post<ResearchBriefingDryRunResponse>(
    '/research-workbench/briefing/dry-run',
    payload,
    withTimeoutProfile('workbench'),
  );
  return response.data;
};

/**
 * 发送每日简报到通知通道。
 */
export const sendResearchBriefing = async (
  payload: ResearchBriefingSendBody,
): Promise<ResearchBriefingSendResponse> => {
  const response = await api.post<ResearchBriefingSendResponse>(
    '/research-workbench/briefing/send',
    payload,
    withTimeoutProfile('workbench'),
  );
  return response.data;
};

// ============ Alt-Data 候选任务队列 ============

/**
 * 列出另类数据候选研究任务。
 */
export const listAltDataCandidates = async (
  params: AltDataCandidatesParams = {},
): Promise<AltDataCandidateListResponse> => {
  const search = new URLSearchParams();
  if (params.state) search.set('state', params.state);
  const query = search.toString();
  const response = await api.get<AltDataCandidateListResponse>(
    `/research-workbench/alt-data-candidates${query ? `?${query}` : ''}`,
    withTimeoutProfile('workbench'),
  );
  return response.data;
};

/**
 * 基于最新另类数据信号刷新候选队列。
 */
export const refreshAltDataCandidates =
  async (): Promise<AltDataCandidateRefreshResponse> => {
    const response = await api.post<AltDataCandidateRefreshResponse>(
      '/research-workbench/alt-data-candidates/refresh',
      {},
      withTimeoutProfile('workbench'),
    );
    return response.data;
  };

/**
 * 将另类数据候选转换为研究工作台任务。
 */
export const convertAltDataCandidate = async (
  candidateId: string,
): Promise<AltDataCandidateConvertResponse> => {
  const response = await api.post<AltDataCandidateConvertResponse>(
    `/research-workbench/alt-data-candidates/${encodeURIComponent(candidateId)}/convert`,
    {},
    withTimeoutProfile('workbench'),
  );
  return response.data;
};

/**
 * 忽略一条另类数据候选。
 */
export const dismissAltDataCandidate = async (
  candidateId: string,
): Promise<AltDataCandidateActionResponse> => {
  const response = await api.post<AltDataCandidateActionResponse>(
    `/research-workbench/alt-data-candidates/${encodeURIComponent(candidateId)}/dismiss`,
    {},
    withTimeoutProfile('workbench'),
  );
  return response.data;
};

/**
 * 暂时延后一条另类数据候选。
 */
export const snoozeAltDataCandidate = async (
  candidateId: string,
  hours: AltDataCandidateSnoozeBody['hours'] = 24,
): Promise<AltDataCandidateActionResponse> => {
  const response = await api.post<AltDataCandidateActionResponse>(
    `/research-workbench/alt-data-candidates/${encodeURIComponent(candidateId)}/snooze`,
    { hours },
    withTimeoutProfile('workbench'),
  );
  return response.data;
};
