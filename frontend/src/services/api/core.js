import axios from 'axios';

/**
 * 后端通信 core 层。
 *
 * - 集中管理 axios 实例、超时档位、token 缓存与刷新逻辑、统一错误处理拦截器。
 * - 业务领域模块（backtest/quantLab/...）只 import `api` 和 `withTimeoutProfile`，
 *   不再各自创建 axios client，避免拦截器重复注册和 token 状态不一致。
 */

const DEFAULT_LOCAL_API_BASE_URL = 'http://127.0.0.1:8100';
export const API_BASE_URL = process.env.REACT_APP_API_URL || DEFAULT_LOCAL_API_BASE_URL;
export const API_TIMEOUT = parseInt(process.env.REACT_APP_API_TIMEOUT) || 300000;
const API_AUTH_TOKEN_KEY = 'pricing_auth_token';
const API_REFRESH_TOKEN_KEY = 'pricing_refresh_token';

let authTokenCache = '';
let refreshTokenCache = '';
let refreshInFlight = null;
if (typeof window !== 'undefined') {
  authTokenCache = window.localStorage.getItem(API_AUTH_TOKEN_KEY) || '';
  refreshTokenCache = window.localStorage.getItem(API_REFRESH_TOKEN_KEY) || '';
}

export const getApiAuthToken = () => authTokenCache;
export const getApiRefreshToken = () => refreshTokenCache;

export const setApiAuthToken = (token) => {
  authTokenCache = token || '';
  if (typeof window !== 'undefined') {
    if (authTokenCache) {
      window.localStorage.setItem(API_AUTH_TOKEN_KEY, authTokenCache);
    } else {
      window.localStorage.removeItem(API_AUTH_TOKEN_KEY);
    }
  }
};

export const setApiRefreshToken = (token) => {
  refreshTokenCache = token || '';
  if (typeof window !== 'undefined') {
    if (refreshTokenCache) {
      window.localStorage.setItem(API_REFRESH_TOKEN_KEY, refreshTokenCache);
    } else {
      window.localStorage.removeItem(API_REFRESH_TOKEN_KEY);
    }
  }
};

const parseTimeout = (value, fallback) => {
  const parsed = parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

export const API_TIMEOUT_PROFILES = {
  default: API_TIMEOUT,
  analysis: parseTimeout(process.env.REACT_APP_API_TIMEOUT_ANALYSIS, 120000),
  standard: parseTimeout(process.env.REACT_APP_API_TIMEOUT_STANDARD, 30000),
  dashboard: parseTimeout(process.env.REACT_APP_API_TIMEOUT_DASHBOARD, 45000),
  workbench: parseTimeout(process.env.REACT_APP_API_TIMEOUT_WORKBENCH, 30000),
};

export const withTimeoutProfile = (profile = 'default', config = {}) => ({
  ...config,
  timeout: config.timeout ?? API_TIMEOUT_PROFILES[profile] ?? API_TIMEOUT_PROFILES.default,
});

const isCanceledRequest = (error) => (
  axios.isCancel(error)
  || error?.code === 'ERR_CANCELED'
  || error?.name === 'CanceledError'
  || error?.message === 'canceled'
);

/**
 * 解析 Content-Disposition 头里的 filename / filename* 字段。
 * 供需要下载文件的领域模块复用。
 */
export const parseFilenameFromDisposition = (contentDisposition) => {
  if (!contentDisposition) {
    return '';
  }

  const utf8Match = contentDisposition.match(/filename\*=UTF-8''([^;]+)/i);
  if (utf8Match?.[1]) {
    return decodeURIComponent(utf8Match[1]);
  }

  const asciiMatch = contentDisposition.match(/filename="?([^"]+)"?/i);
  return asciiMatch?.[1] || '';
};

const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: API_TIMEOUT,
  headers: {
    'Content-Type': 'application/json',
  },
});

const refreshAccessTokenIfNeeded = async () => {
  if (!refreshTokenCache) {
    throw new Error('No refresh token available');
  }
  if (!refreshInFlight) {
    refreshInFlight = api.post(
      '/infrastructure/auth/refresh',
      {
        refresh_token: refreshTokenCache,
      },
      withTimeoutProfile('standard', { headers: { 'X-Skip-Auth-Refresh': '1' } }),
    )
      .then((response) => {
        const payload = response.data || {};
        if (payload.access_token) {
          setApiAuthToken(payload.access_token);
        }
        if (payload.refresh_token) {
          setApiRefreshToken(payload.refresh_token);
        }
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

// 请求拦截器
api.interceptors.request.use(
  (config) => {
    if (authTokenCache && !config.headers?.Authorization) {
      config.headers = {
        ...config.headers,
        Authorization: `Bearer ${authTokenCache}`,
      };
    }
    if (process.env.NODE_ENV === 'development') {
      console.log('API Request:', config.method?.toUpperCase(), config.url);
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// 响应拦截器 - 增强错误处理
api.interceptors.response.use(
  (response) => {
    if (process.env.NODE_ENV === 'development') {
      console.log('API Response:', response.status, response.config.url);
    }
    return response;
  },
  (error) => {
    if (isCanceledRequest(error)) {
      error.userMessage = '请求已取消';
      error.errorCode = 'REQUEST_CANCELED';
      return Promise.reject(error);
    }

    const originalRequest = error.config || {};
    const canRefresh = (
      error.response?.status === 401
      && refreshTokenCache
      && !originalRequest._retry
      && originalRequest.headers?.['X-Skip-Auth-Refresh'] !== '1'
      && !String(originalRequest.url || '').includes('/infrastructure/auth/login')
      && !String(originalRequest.url || '').includes('/infrastructure/auth/refresh')
      && !String(originalRequest.url || '').includes('/infrastructure/oauth/token')
    );

    if (canRefresh) {
      originalRequest._retry = true;
      return refreshAccessTokenIfNeeded()
        .then(() => {
          originalRequest.headers = {
            ...(originalRequest.headers || {}),
            Authorization: `Bearer ${authTokenCache}`,
          };
          return api(originalRequest);
        });
    }

    // 统一错误处理
    let errorMessage = '请求失败，请稍后重试';
    let errorCode = 'UNKNOWN_ERROR';

    if (error.response) {
      // 服务器返回了错误响应
      const { status, data } = error.response;

      // 尝试从标准错误格式提取信息
      if (data?.error) {
        errorMessage = data.error.message || errorMessage;
        errorCode = data.error.code || errorCode;
      } else if (data?.detail) {
        errorMessage = data.detail;
      } else if (typeof data === 'string') {
        errorMessage = data;
      }

      // 根据状态码设置通用错误消息
      switch (status) {
        case 400:
          errorMessage = errorMessage || '请求参数错误';
          break;
        case 401:
          errorMessage = '请先登录';
          break;
        case 403:
          errorMessage = '没有权限访问';
          break;
        case 404:
          errorMessage = errorMessage || '请求的资源不存在';
          break;
        case 429:
          errorMessage = '请求过于频繁，请稍后再试';
          break;
        case 500:
          errorMessage = '服务器内部错误，请稍后重试';
          break;
        case 502:
        case 503:
          errorMessage = '服务暂时不可用，请稍后重试';
          break;
        default:
          break;
      }

      console.error(`API Error [${status}] ${errorCode}:`, errorMessage);
    } else if (error.request) {
      // 请求已发出但没有收到响应
      if (error.code === 'ECONNABORTED') {
        errorMessage = '请求超时，请检查网络连接';
      } else {
        errorMessage = '无法连接到服务器，请检查网络';
      }
      console.error('API Network Error:', error.config?.url || 'unknown', error.message);
    } else {
      // 请求配置出错
      console.error('API Config Error:', error.message);
    }

    // 附加错误信息到 error 对象
    error.userMessage = errorMessage;
    error.errorCode = errorCode;

    return Promise.reject(error);
  }
);

export { api };
export default api;
