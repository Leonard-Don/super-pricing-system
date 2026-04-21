import { isRecoverableLazyImportError, loadWithRetry } from '../utils/lazyWithRetry';

describe('lazyWithRetry helpers', () => {
  let reloadMock;

  beforeEach(() => {
    window.sessionStorage.clear();
    reloadMock = jest.fn();
  });

  it('recognizes chunk load failures as recoverable lazy import errors', () => {
    expect(isRecoverableLazyImportError(new Error('Loading chunk workbench failed.'))).toBe(true);
    expect(isRecoverableLazyImportError(new Error('ChunkLoadError: Loading CSS chunk failed.'))).toBe(true);
    expect(isRecoverableLazyImportError(new Error('ordinary network timeout'))).toBe(false);
  });

  it('retries a recoverable import failure before succeeding', async () => {
    const importer = jest.fn()
      .mockRejectedValueOnce(new Error('Loading chunk workbench failed.'))
      .mockResolvedValueOnce({ default: 'RecoveredModule' });

    await expect(loadWithRetry(importer, {
      maxRetries: 1,
      retryDelayMs: 0,
      reloadOnChunkError: false,
      reloadKey: 'workbench-test',
      reload: reloadMock,
    })).resolves.toEqual({ default: 'RecoveredModule' });

    expect(importer).toHaveBeenCalledTimes(2);
    expect(reloadMock).not.toHaveBeenCalled();
  });

  it('reloads once when recoverable lazy imports keep failing', async () => {
    const importer = jest.fn().mockRejectedValue(new Error('ChunkLoadError: route split failed'));

    void loadWithRetry(importer, {
      maxRetries: 0,
      retryDelayMs: 0,
      reloadKey: 'reload-once-test',
      reload: reloadMock,
    });

    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(reloadMock).toHaveBeenCalledTimes(1);
    expect(window.sessionStorage.getItem('lazy-retry-reload:reload-once-test')).toBe('1');
  });

  it('throws after a prior reload marker to avoid refresh loops', async () => {
    const importer = jest.fn().mockRejectedValue(new Error('ChunkLoadError: route split failed'));
    window.sessionStorage.setItem('lazy-retry-reload:reload-once-test', '1');

    await expect(loadWithRetry(importer, {
      maxRetries: 0,
      retryDelayMs: 0,
      reloadKey: 'reload-once-test',
      reload: reloadMock,
    })).rejects.toThrow('ChunkLoadError');

    expect(reloadMock).not.toHaveBeenCalled();
    expect(window.sessionStorage.getItem('lazy-retry-reload:reload-once-test')).toBeNull();
  });
});
