import type { components, paths } from '@/generated/api-types';
import api, { withTimeoutProfile } from './core';

/**
 * 研究工作台领域 API (GodEye subset)：任务 CRUD。
 * 路由前缀：`/research-workbench/*`
 */

// ---- Request / Response types ----
type ResearchTasksResponse =
  paths['/research-workbench/tasks']['get']['responses'][200]['content']['application/json'];

type ResearchTaskCreateBody =
  components['schemas']['ResearchTaskCreateRequest'];

type ResearchTaskCreateResponse =
  paths['/research-workbench/tasks']['post']['responses'][200]['content']['application/json'];

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
