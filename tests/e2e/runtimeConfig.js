const DEFAULT_FRONTEND_URL = 'http://127.0.0.1:3100';
const DEFAULT_API_URL = 'http://127.0.0.1:8100';

const FRONTEND_BASE_URL = (process.env.E2E_FRONTEND_URL || DEFAULT_FRONTEND_URL).replace(/\/$/, '');
const API_BASE_URL = (process.env.E2E_API_URL || DEFAULT_API_URL).replace(/\/$/, '');

const frontendUrl = new URL(FRONTEND_BASE_URL);
const apiUrl = new URL(API_BASE_URL);

const buildRuntimeEnv = (overrides = {}) => {
  const frontendOrigin = frontendUrl.origin;
  const apiOrigin = apiUrl.origin;

  return {
    ...process.env,
    E2E_FRONTEND_URL: FRONTEND_BASE_URL,
    E2E_API_URL: API_BASE_URL,
    FRONTEND_HOST: frontendUrl.hostname,
    FRONTEND_PORT: frontendUrl.port || (frontendUrl.protocol === 'https:' ? '443' : '80'),
    FRONTEND_URL: frontendOrigin,
    FRONTEND_ORIGIN: frontendOrigin,
    PORT: frontendUrl.port || (frontendUrl.protocol === 'https:' ? '443' : '80'),
    BACKEND_HOST: apiUrl.hostname,
    BACKEND_PORT: apiUrl.port || (apiUrl.protocol === 'https:' ? '443' : '80'),
    API_HOST: apiUrl.hostname,
    API_PORT: apiUrl.port || (apiUrl.protocol === 'https:' ? '443' : '80'),
    BACKEND_PUBLIC_URL: apiOrigin,
    AUTH_PUBLIC_BASE_URL: apiOrigin,
    REACT_APP_API_URL: apiOrigin,
    BROWSER: 'none',
    ...overrides,
  };
};

module.exports = {
  API_BASE_URL,
  FRONTEND_BASE_URL,
  buildRuntimeEnv,
};
