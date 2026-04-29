import { api, withTimeoutProfile } from './core';

/**
 * 研究工作台领域 API：任务 CRUD、状态流转、Snapshot、Board 重排、Briefing 分发。
 * 路由前缀：`/research-workbench/*`
 */

export const getResearchTasks = async (params = {}) => {
  const search = new URLSearchParams();
  if (params.limit) search.set('limit', String(params.limit));
  if (params.type) search.set('type', params.type);
  if (params.status) search.set('status', params.status);
  if (params.source) search.set('source', params.source);
  if (params.view) search.set('view', params.view);
  const query = search.toString();
  const response = await api.get(`/research-workbench/tasks${query ? `?${query}` : ''}`, withTimeoutProfile('workbench'));
  return response.data;
};

export const createResearchTask = async (payload) => {
  const response = await api.post('/research-workbench/tasks', payload, withTimeoutProfile('workbench'));
  return response.data;
};

export const getResearchTask = async (taskId) => {
  const response = await api.get(`/research-workbench/tasks/${encodeURIComponent(taskId)}`, withTimeoutProfile('workbench'));
  return response.data;
};

export const updateResearchTask = async (taskId, payload) => {
  const response = await api.put(`/research-workbench/tasks/${encodeURIComponent(taskId)}`, payload, withTimeoutProfile('workbench'));
  return response.data;
};

export const getResearchTaskTimeline = async (taskId) => {
  const response = await api.get(`/research-workbench/tasks/${encodeURIComponent(taskId)}/timeline`, withTimeoutProfile('workbench'));
  return response.data;
};

export const addResearchTaskComment = async (taskId, payload) => {
  const response = await api.post(`/research-workbench/tasks/${encodeURIComponent(taskId)}/comments`, payload, withTimeoutProfile('workbench'));
  return response.data;
};

export const deleteResearchTaskComment = async (taskId, commentId) => {
  const response = await api.delete(
    `/research-workbench/tasks/${encodeURIComponent(taskId)}/comments/${encodeURIComponent(commentId)}`,
    withTimeoutProfile('workbench'),
  );
  return response.data;
};

export const addResearchTaskSnapshot = async (taskId, payload) => {
  const response = await api.post(
    `/research-workbench/tasks/${encodeURIComponent(taskId)}/snapshot`,
    payload,
    withTimeoutProfile('workbench'),
  );
  return response.data;
};

export const reorderResearchBoard = async (payload) => {
  const response = await api.post('/research-workbench/board/reorder', payload, withTimeoutProfile('workbench'));
  return response.data;
};

// ============ Briefing 分发 ============
export const getResearchBriefingDistribution = async () => {
  const response = await api.get('/research-workbench/briefing/distribution', withTimeoutProfile('workbench'));
  return response.data;
};

export const updateResearchBriefingDistribution = async (payload) => {
  const response = await api.put('/research-workbench/briefing/distribution', payload, withTimeoutProfile('workbench'));
  return response.data;
};

export const runResearchBriefingDryRun = async (payload) => {
  const response = await api.post('/research-workbench/briefing/dry-run', payload, withTimeoutProfile('workbench'));
  return response.data;
};

export const sendResearchBriefing = async (payload) => {
  const response = await api.post('/research-workbench/briefing/send', payload, withTimeoutProfile('workbench'));
  return response.data;
};

// ============ 批量操作 / 删除 / 统计 ============
export const bulkUpdateResearchTasks = async (payload) => {
  const response = await api.post('/research-workbench/tasks/bulk-update', payload, withTimeoutProfile('workbench'));
  return response.data;
};

export const deleteResearchTask = async (taskId) => {
  const response = await api.delete(`/research-workbench/tasks/${encodeURIComponent(taskId)}`, withTimeoutProfile('workbench'));
  return response.data;
};

export const getResearchTaskStats = async () => {
  const response = await api.get('/research-workbench/stats', withTimeoutProfile('workbench'));
  return response.data;
};
