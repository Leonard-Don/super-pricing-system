import type { components, paths } from '@/generated/api-types';
import api, { withTimeoutProfile } from './core';

/**
 * 定价实验台领域 API (subset)：估值实验 + 因子表达式。
 * 路由前缀：`/quant-lab/*`
 */

// ---- Request body types ----
type ValuationLabBody =
  paths['/quant-lab/valuation-lab']['post']['requestBody']['content']['application/json'];

type FactorExpressionBody =
  paths['/quant-lab/factor-expression']['post']['requestBody']['content']['application/json'];

// ---- Response types ----
type ValuationLabResponse =
  paths['/quant-lab/valuation-lab']['post']['responses'][200]['content']['application/json'];

type ValuationLabAsyncResponse =
  paths['/quant-lab/valuation-lab/async']['post']['responses'][200]['content']['application/json'];

type FactorExpressionResponse =
  paths['/quant-lab/factor-expression']['post']['responses'][200]['content']['application/json'];

type FactorExpressionAsyncResponse =
  paths['/quant-lab/factor-expression/async']['post']['responses'][200]['content']['application/json'];

// ============ 估值实验 ============

/**
 * Run a synchronous valuation-lab computation.
 */
export const runQuantValuationLab = async (
  payload: ValuationLabBody,
): Promise<ValuationLabResponse> => {
  const response = await api.post<ValuationLabResponse>(
    '/quant-lab/valuation-lab',
    payload,
    withTimeoutProfile('analysis'),
  );
  return response.data;
};

/**
 * Queue an async valuation-lab computation; returns a task/job reference.
 */
export const queueQuantValuationLab = async (
  payload: ValuationLabBody,
): Promise<ValuationLabAsyncResponse> => {
  const response = await api.post<ValuationLabAsyncResponse>(
    '/quant-lab/valuation-lab/async',
    payload,
    withTimeoutProfile('standard'),
  );
  return response.data;
};

// ============ 因子表达式 ============

/**
 * Run a synchronous factor-expression evaluation.
 */
export const runQuantFactorExpression = async (
  payload: FactorExpressionBody,
): Promise<FactorExpressionResponse> => {
  const response = await api.post<FactorExpressionResponse>(
    '/quant-lab/factor-expression',
    payload,
    withTimeoutProfile('analysis'),
  );
  return response.data;
};

/**
 * Queue an async factor-expression task; returns a task/job reference.
 */
export const queueQuantFactorExpressionTask = async (
  payload: FactorExpressionBody,
): Promise<FactorExpressionAsyncResponse> => {
  const response = await api.post<FactorExpressionAsyncResponse>(
    '/quant-lab/factor-expression/async',
    payload,
    withTimeoutProfile('standard'),
  );
  return response.data;
};

// ============ 告警事件发布 ============

type AlertEventPublishBody =
  components['schemas']['AlertEventPublishRequest'];

type AlertEventPublishResponse =
  paths['/quant-lab/alerts/publish']['post']['responses'][200]['content']['application/json'];

/**
 * 发布统一告警事件并执行级联动作。
 */
export const publishQuantAlertEvent = async (
  payload: AlertEventPublishBody,
): Promise<AlertEventPublishResponse> => {
  const response = await api.post<AlertEventPublishResponse>(
    '/quant-lab/alerts/publish',
    payload,
    withTimeoutProfile('standard'),
  );
  return response.data;
};
