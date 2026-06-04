import { describe, it, expect, beforeEach } from 'vitest';
import {
  withTimeoutProfile,
  API_TIMEOUT_PROFILES,
  getApiAuthToken,
  setApiAuthToken,
  getApiRefreshToken,
  setApiRefreshToken,
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
