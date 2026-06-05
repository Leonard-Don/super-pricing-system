import type { paths } from '@/generated/api-types';
import api, { withTimeoutProfile } from './core';

/**
 * 跨市场领域 API (GodEye subset)：模板。
 * 路由前缀：`/cross-market/*`
 */

type CrossMarketTemplatesResponse =
  paths['/cross-market/templates']['get']['responses'][200]['content']['application/json'];

/**
 * 获取跨市场演示模板列表。
 */
export const getCrossMarketTemplates =
  async (): Promise<CrossMarketTemplatesResponse> => {
    const response = await api.get<CrossMarketTemplatesResponse>(
      '/cross-market/templates',
      withTimeoutProfile('dashboard'),
    );
    return response.data;
  };
