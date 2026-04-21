import { lazy } from 'react';

const RECOVERABLE_LAZY_IMPORT_PATTERNS = [
  /ChunkLoadError/i,
  /Loading chunk [\w-]+ failed/i,
  /Failed to fetch dynamically imported module/i,
  /Importing a module script failed/i,
];

const DEFAULT_MAX_RETRIES = 2;
const DEFAULT_RETRY_DELAY_MS = 400;
const RELOAD_SENTINEL_PREFIX = 'lazy-retry-reload:';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const getReloadStorageKey = (reloadKey = 'global') => `${RELOAD_SENTINEL_PREFIX}${reloadKey}`;

const getSessionStorage = () => {
  if (typeof window === 'undefined') {
    return null;
  }

  try {
    return window.sessionStorage;
  } catch (error) {
    return null;
  }
};

const clearReloadMarker = (reloadKey = 'global') => {
  const storage = getSessionStorage();
  if (!storage) {
    return;
  }

  try {
    storage.removeItem(getReloadStorageKey(reloadKey));
  } catch (error) {
    // Ignore storage failures and fall back to the import error path.
  }
};

const hasReloadMarker = (reloadKey = 'global') => {
  const storage = getSessionStorage();
  if (!storage) {
    return false;
  }

  try {
    return storage.getItem(getReloadStorageKey(reloadKey)) === '1';
  } catch (error) {
    return false;
  }
};

const markReload = (reloadKey = 'global') => {
  const storage = getSessionStorage();
  if (!storage) {
    return;
  }

  try {
    storage.setItem(getReloadStorageKey(reloadKey), '1');
  } catch (error) {
    // Ignore storage failures and fall back to the import error path.
  }
};

export const isRecoverableLazyImportError = (error) => {
  const message = [
    error?.name,
    error?.message,
    typeof error?.toString === 'function' ? error.toString() : '',
  ].filter(Boolean).join(' ');

  return RECOVERABLE_LAZY_IMPORT_PATTERNS.some((pattern) => pattern.test(message));
};

export const loadWithRetry = async (
  importer,
  {
    maxRetries = DEFAULT_MAX_RETRIES,
    retryDelayMs = DEFAULT_RETRY_DELAY_MS,
    reloadKey = 'global',
    reloadOnChunkError = true,
    reload = null,
  } = {},
) => {
  let lastError;

  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    try {
      const module = await importer();
      clearReloadMarker(reloadKey);
      return module;
    } catch (error) {
      if (!isRecoverableLazyImportError(error)) {
        throw error;
      }

      lastError = error;

      if (attempt < maxRetries) {
        await sleep(retryDelayMs * (attempt + 1));
        continue;
      }
    }
  }

  const reloadFn = typeof reload === 'function'
    ? reload
    : (typeof window !== 'undefined' && typeof window.location?.reload === 'function'
      ? () => window.location.reload()
      : null);

  if (reloadOnChunkError && reloadFn) {
    if (!hasReloadMarker(reloadKey)) {
      markReload(reloadKey);
      reloadFn();
      return new Promise(() => {});
    }

    clearReloadMarker(reloadKey);
  }

  throw lastError;
};

export const lazyWithRetry = (importer, options) => lazy(() => loadWithRetry(importer, options));
