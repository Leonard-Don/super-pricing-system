import axios, {
  type AxiosError,
  type AxiosInstance,
  type AxiosRequestConfig,
  type InternalAxiosRequestConfig,
} from 'axios';

const DEFAULT_LOCAL_API_BASE_URL = 'http://127.0.0.1:8100';
export const API_BASE_URL = import.meta.env.VITE_API_URL || DEFAULT_LOCAL_API_BASE_URL;
export const API_TIMEOUT = parseInt(import.meta.env.VITE_API_TIMEOUT ?? '') || 300000;
const API_AUTH_TOKEN_KEY = 'pricing_auth_token';
const API_REFRESH_TOKEN_KEY = 'pricing_refresh_token';

let authTokenCache = '';
let refreshTokenCache = '';
let refreshInFlight: Promise<unknown> | null = null;
if (typeof window !== 'undefined') {
  authTokenCache = window.localStorage.getItem(API_AUTH_TOKEN_KEY) || '';
  refreshTokenCache = window.localStorage.getItem(API_REFRESH_TOKEN_KEY) || '';
}

export const getApiAuthToken = (): string => authTokenCache;
export const getApiRefreshToken = (): string => refreshTokenCache;

export const setApiAuthToken = (token: string): void => {
  authTokenCache = token || '';
  if (typeof window !== 'undefined') {
    if (authTokenCache) window.localStorage.setItem(API_AUTH_TOKEN_KEY, authTokenCache);
    else window.localStorage.removeItem(API_AUTH_TOKEN_KEY);
  }
};

export const setApiRefreshToken = (token: string): void => {
  refreshTokenCache = token || '';
  if (typeof window !== 'undefined') {
    if (refreshTokenCache) window.localStorage.setItem(API_REFRESH_TOKEN_KEY, refreshTokenCache);
    else window.localStorage.removeItem(API_REFRESH_TOKEN_KEY);
  }
};

const parseTimeout = (value: string | undefined, fallback: number): number => {
  const parsed = parseInt(value ?? '', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

export const API_TIMEOUT_PROFILES = {
  default: API_TIMEOUT,
  analysis: parseTimeout(import.meta.env.VITE_API_TIMEOUT_ANALYSIS, 120000),
  standard: parseTimeout(import.meta.env.VITE_API_TIMEOUT_STANDARD, 30000),
  dashboard: parseTimeout(import.meta.env.VITE_API_TIMEOUT_DASHBOARD, 45000),
  workbench: parseTimeout(import.meta.env.VITE_API_TIMEOUT_WORKBENCH, 30000),
} as const;

export type TimeoutProfile = keyof typeof API_TIMEOUT_PROFILES;

export const withTimeoutProfile = (
  profile: TimeoutProfile = 'default',
  config: AxiosRequestConfig = {},
): AxiosRequestConfig => ({
  ...config,
  timeout: config.timeout ?? API_TIMEOUT_PROFILES[profile] ?? API_TIMEOUT_PROFILES.default,
});

const isCanceledRequest = (error: AxiosError): boolean =>
  axios.isCancel(error) ||
  error?.code === 'ERR_CANCELED' ||
  error?.name === 'CanceledError' ||
  error?.message === 'canceled';

const api: AxiosInstance = axios.create({
  baseURL: API_BASE_URL,
  timeout: API_TIMEOUT,
  headers: { 'Content-Type': 'application/json' },
});

const refreshAccessTokenIfNeeded = async (): Promise<unknown> => {
  if (!refreshTokenCache) throw new Error('No refresh token available');
  if (!refreshInFlight) {
    refreshInFlight = api
      .post(
        '/infrastructure/auth/refresh',
        { refresh_token: refreshTokenCache },
        withTimeoutProfile('standard', { headers: { 'X-Skip-Auth-Refresh': '1' } }),
      )
      .then((response) => {
        const payload = response.data || {};
        if (payload.access_token) setApiAuthToken(payload.access_token);
        if (payload.refresh_token) setApiRefreshToken(payload.refresh_token);
        return payload;
      })
      .catch((error) => {
        setApiAuthToken('');
        setApiRefreshToken('');
        throw error;
      })
      .finally(() => {
        refreshInFlight = null;
      });
  }
  return refreshInFlight;
};

api.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    if (authTokenCache && !config.headers?.Authorization) {
      config.headers.Authorization = `Bearer ${authTokenCache}`;
    }
    if (import.meta.env.DEV) {
      console.log('API Request:', config.method?.toUpperCase(), config.url);
    }
    return config;
  },
  (error) => Promise.reject(error),
);

api.interceptors.response.use(
  (response) => {
    if (import.meta.env.DEV) console.log('API Response:', response.status, response.config.url);
    return response;
  },
  (error: AxiosError & { userMessage?: string; errorCode?: string }) => {
    if (isCanceledRequest(error)) {
      error.userMessage = '请求已取消';
      error.errorCode = 'REQUEST_CANCELED';
      return Promise.reject(error);
    }
    const originalRequest = (error.config || {}) as InternalAxiosRequestConfig & { _retry?: boolean };
    const url = String(originalRequest.url || '');
    const canRefresh =
      error.response?.status === 401 &&
      refreshTokenCache &&
      !originalRequest._retry &&
      originalRequest.headers?.['X-Skip-Auth-Refresh'] !== '1' &&
      !url.includes('/infrastructure/auth/login') &&
      !url.includes('/infrastructure/auth/refresh') &&
      !url.includes('/infrastructure/oauth/token');

    if (canRefresh) {
      originalRequest._retry = true;
      return refreshAccessTokenIfNeeded().then(() => {
        originalRequest.headers.Authorization = `Bearer ${authTokenCache}`;
        return api(originalRequest);
      });
    }

    let errorMessage = '请求失败，请稍后重试';
    let errorCode = 'UNKNOWN_ERROR';
    if (error.response) {
      const status = error.response.status;
      const data: unknown = error.response.data;
      const body =
        typeof data === 'object' && data !== null
          ? (data as { error?: { message?: string; code?: string }; detail?: string })
          : null;
      if (body?.error) {
        errorMessage = body.error.message || errorMessage;
        errorCode = body.error.code || errorCode;
      } else if (body?.detail) {
        errorMessage = body.detail;
      } else if (typeof data === 'string') {
        errorMessage = data;
      }
      switch (status) {
        case 400: errorMessage = errorMessage || '请求参数错误'; break;
        case 401: errorMessage = '请先登录'; break;
        case 403: errorMessage = '没有权限访问'; break;
        case 404: errorMessage = errorMessage || '请求的资源不存在'; break;
        case 429: errorMessage = '请求过于频繁，请稍后再试'; break;
        case 500: errorMessage = '服务器内部错误，请稍后重试'; break;
        case 502:
        case 503: errorMessage = '服务暂时不可用，请稍后重试'; break;
        default: break;
      }
      console.error(`API Error [${status}] ${errorCode}:`, errorMessage);
    } else if (error.request) {
      errorMessage = error.code === 'ECONNABORTED' ? '请求超时，请检查网络连接' : '无法连接到服务器，请检查网络';
      console.error('API Network Error:', error.config?.url || 'unknown', error.message);
    } else {
      console.error('API Config Error:', error.message);
    }
    error.userMessage = errorMessage;
    error.errorCode = errorCode;
    return Promise.reject(error);
  },
);

export { api };
export default api;
