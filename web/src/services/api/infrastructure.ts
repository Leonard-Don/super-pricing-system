import type { paths } from '@/generated/api-types';
import api, { withTimeoutProfile } from './core';

/**
 * 基础设施领域 API：系统状态。
 * 路由前缀：`/infrastructure/*`
 */

// ---- Response types ----
type InfrastructureStatusResponse =
  paths['/infrastructure/status']['get']['responses'][200]['content']['application/json'];

/**
 * 获取基础设施状态。
 */
export const getInfrastructureStatus =
  async (): Promise<InfrastructureStatusResponse> => {
    const response = await api.get<InfrastructureStatusResponse>(
      '/infrastructure/status',
      withTimeoutProfile('standard'),
    );
    return response.data;
  };
