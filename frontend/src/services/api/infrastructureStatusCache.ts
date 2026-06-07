import { getInfrastructureStatus } from './infrastructure';

/**
 * Shared, request-deduplicating accessor for `GET /infrastructure/status`.
 *
 * The workbench mounts `useDailyBriefing` more than once per page (the cluster
 * wrapper and the panel it renders), and React StrictMode double-invokes each
 * effect in dev. Calling `getInfrastructureStatus` directly therefore fired the
 * endpoint up to 4× on a single load. This module caches the in-flight promise
 * (and its resolved value) so every concurrent/subsequent caller shares one
 * request for the lifetime of the page. The cache is cleared on failure so a
 * later mount can retry.
 */

type InfrastructureStatus = Awaited<ReturnType<typeof getInfrastructureStatus>>;

let cached: Promise<InfrastructureStatus> | null = null;

/**
 * Fetch the infrastructure status, sharing a single request across all callers.
 */
export const getInfrastructureStatusShared = (): Promise<InfrastructureStatus> => {
  if (!cached) {
    cached = getInfrastructureStatus().catch((error) => {
      // Drop the cached rejection so the next caller can retry.
      cached = null;
      throw error;
    });
  }
  return cached;
};

/**
 * Clear the shared cache. Intended for tests and explicit refresh flows.
 */
export const resetInfrastructureStatusCache = (): void => {
  cached = null;
};
