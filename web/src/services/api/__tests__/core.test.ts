import { describe, it, expect, beforeEach } from 'vitest';
import {
  withTimeoutProfile,
  API_TIMEOUT_PROFILES,
  getApiAuthToken,
  setApiAuthToken,
  getApiRefreshToken,
  setApiRefreshToken,
  normalizeApiError,
} from '@/services/api/core';

describe('api core', () => {
  beforeEach(() => {
    window.localStorage.clear();
    setApiAuthToken('');
    setApiRefreshToken('');
  });

  it('withTimeoutProfile picks the profile timeout', () => {
    expect(withTimeoutProfile('standard').timeout).toBe(API_TIMEOUT_PROFILES.standard);
    expect(withTimeoutProfile('analysis').timeout).toBe(API_TIMEOUT_PROFILES.analysis);
  });

  it('withTimeoutProfile lets explicit config.timeout win', () => {
    expect(withTimeoutProfile('standard', { timeout: 5 }).timeout).toBe(5);
  });

  it('unknown profile falls back to default timeout', () => {
    // @ts-expect-error intentionally invalid profile
    expect(withTimeoutProfile('nope').timeout).toBe(API_TIMEOUT_PROFILES.default);
  });

  it('auth token setter persists to localStorage and getter reads cache', () => {
    setApiAuthToken('abc');
    expect(getApiAuthToken()).toBe('abc');
    expect(window.localStorage.getItem('pricing_auth_token')).toBe('abc');
    setApiAuthToken('');
    expect(getApiAuthToken()).toBe('');
    expect(window.localStorage.getItem('pricing_auth_token')).toBeNull();
  });

  it('refresh token setter persists and clears', () => {
    setApiRefreshToken('r1');
    expect(getApiRefreshToken()).toBe('r1');
    expect(window.localStorage.getItem('pricing_refresh_token')).toBe('r1');
    setApiRefreshToken('');
    expect(window.localStorage.getItem('pricing_refresh_token')).toBeNull();
  });
});

describe('normalizeApiError', () => {
  it('coerces a FastAPI 422 detail array into a readable string (never an object)', () => {
    // Regression: rendering this payload as a React child crashed the whole app
    // ("Objects are not valid as a React child (found: object with keys {type, loc, msg, input})").
    const data = {
      detail: [
        { type: 'missing', loc: ['body', 'username'], msg: 'Field required', input: {} },
        { type: 'missing', loc: ['body', 'password'], msg: 'Field required', input: {} },
      ],
    };
    const { message } = normalizeApiError(422, data);
    expect(typeof message).toBe('string');
    expect(message).toContain('Field required');
    expect(message).toContain('username');
    // must not leak a stringified object
    expect(message).not.toContain('[object Object]');
  });

  it('passes through a plain string detail', () => {
    expect(normalizeApiError(404, { detail: '找不到资源' }).message).toBe('找不到资源');
  });

  it('coerces a single FastAPI detail object into its msg', () => {
    expect(normalizeApiError(400, { detail: { type: 'value_error', loc: ['body'], msg: '参数无效', input: 1 } }).message)
      .toContain('参数无效');
  });

  it('prefers the success-envelope error.message/code', () => {
    const { message, code } = normalizeApiError(500, { error: { message: '内部错误', code: 'E_INTERNAL' } });
    expect(message).toBe('服务器内部错误，请稍后重试'); // 500 overrides to friendly copy
    expect(code).toBe('E_INTERNAL');
  });

  it('applies friendly status copy for 401/403/429', () => {
    expect(normalizeApiError(401, {}).message).toBe('请先登录');
    expect(normalizeApiError(403, {}).message).toBe('没有权限访问');
    expect(normalizeApiError(429, {}).message).toBe('请求过于频繁，请稍后再试');
  });

  it('falls back to a default message for an empty/odd body', () => {
    expect(normalizeApiError(418, null).message).toBe('请求失败，请稍后重试');
    expect(normalizeApiError(418, { detail: [] }).message).toBe('请求失败，请稍后重试');
  });
});
