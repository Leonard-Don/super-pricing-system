import { getResearchBriefingDistribution } from './research';

/**
 * Shared, request-deduplicating accessor for
 * `GET /research-workbench/briefing/distribution`.
 *
 * The workbench mounts a single `useDailyBriefing` instance, but React
 * StrictMode synchronously double-invokes its mount effect in dev, which would
 * otherwise fire this endpoint twice on a single load. This module shares the
 * in-flight promise so concurrent callers (the StrictMode double-invoke) collapse
 * into one request.
 *
 * Unlike `infrastructureStatusCache`, the in-flight promise is dropped once it
 * settles: distribution config changes (e.g. when the user saves), so a genuine
 * remount must load fresh data rather than serve a stale cached value.
 */

type ResearchBriefingDistribution = Awaited<
  ReturnType<typeof getResearchBriefingDistribution>
>;

let inFlight: Promise<ResearchBriefingDistribution> | null = null;

/**
 * Fetch the briefing distribution config, sharing a single in-flight request
 * across all concurrent callers.
 */
export const getResearchBriefingDistributionShared =
  (): Promise<ResearchBriefingDistribution> => {
    if (!inFlight) {
      const request = getResearchBriefingDistribution();
      inFlight = request;
      // Drop the shared promise once it settles (success or failure) so the next
      // mount refetches fresh data. The guard avoids clobbering a newer request.
      // Both branches handle the rejection here so this cleanup chain never
      // surfaces an unhandled rejection — callers still receive `request` and
      // handle the error themselves.
      const clear = () => {
        if (inFlight === request) inFlight = null;
      };
      request.then(clear, clear);
    }
    return inFlight;
  };

/**
 * Clear the shared in-flight request. Intended for tests and explicit refresh
 * flows.
 */
export const resetResearchBriefingDistributionCache = (): void => {
  inFlight = null;
};
