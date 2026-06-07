/**
 * useAltDataCandidates — manages alt-data candidate queue state.
 *
 * Loads the list via listAltDataCandidates, exposes refresh/convert/dismiss/snooze
 * actions, and tracks loading/error state.
 * Uses startTransition for non-urgent state updates (react-hooks v7 pattern).
 * No `any`.
 */

import { startTransition, useCallback, useEffect, useState } from 'react';
import type { components } from '@/generated/api-types';

import {
  convertAltDataCandidate,
  dismissAltDataCandidate,
  listAltDataCandidates,
  refreshAltDataCandidates,
  snoozeAltDataCandidate,
} from '@/services/api/research';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type AltDataCandidate = components['schemas']['AltDataCandidate'];

export interface UseAltDataCandidatesReturn {
  candidates: AltDataCandidate[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  convert: (candidateId: string) => Promise<void>;
  dismiss: (candidateId: string) => Promise<void>;
  snooze: (candidateId: string) => Promise<void>;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export default function useAltDataCandidates(): UseAltDataCandidatesReturn {
  const [candidates, setCandidates] = useState<AltDataCandidate[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ── Load initial list ────────────────────────────────────────────────────
  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const envelope = await listAltDataCandidates();
      startTransition(() => {
        setCandidates(envelope.data ?? []);
      });
    } catch (err) {
      startTransition(() => {
        setError(err instanceof Error ? err.message : '加载候选队列失败');
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // ── Refresh (re-generate from latest signals) ────────────────────────────
  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const envelope = await refreshAltDataCandidates();
      startTransition(() => {
        setCandidates(envelope.data?.pending ?? []);
      });
    } catch (err) {
      startTransition(() => {
        setError(err instanceof Error ? err.message : '刷新候选队列失败');
      });
    } finally {
      setLoading(false);
    }
  }, []);

  // ── Helper: optimistically update a candidate state ──────────────────────
  const patchCandidate = useCallback(
    (candidateId: string, patch: Partial<AltDataCandidate>) => {
      startTransition(() => {
        setCandidates((prev) =>
          prev.map((c) => (c.candidate_id === candidateId ? { ...c, ...patch } : c)),
        );
      });
    },
    [],
  );

  // ── Convert ──────────────────────────────────────────────────────────────
  const convert = useCallback(
    async (candidateId: string) => {
      patchCandidate(candidateId, { state: 'converted' });
      try {
        await convertAltDataCandidate(candidateId);
      } catch (err) {
        // revert optimistic update
        patchCandidate(candidateId, { state: 'pending' });
        startTransition(() => {
          setError(err instanceof Error ? err.message : '转换候选失败');
        });
      }
    },
    [patchCandidate],
  );

  // ── Dismiss ──────────────────────────────────────────────────────────────
  const dismiss = useCallback(
    async (candidateId: string) => {
      patchCandidate(candidateId, { state: 'dismissed' });
      try {
        await dismissAltDataCandidate(candidateId);
      } catch (err) {
        patchCandidate(candidateId, { state: 'pending' });
        startTransition(() => {
          setError(err instanceof Error ? err.message : '忽略候选失败');
        });
      }
    },
    [patchCandidate],
  );

  // ── Snooze ───────────────────────────────────────────────────────────────
  const snooze = useCallback(
    async (candidateId: string) => {
      patchCandidate(candidateId, { state: 'snoozed' });
      try {
        await snoozeAltDataCandidate(candidateId);
      } catch (err) {
        patchCandidate(candidateId, { state: 'pending' });
        startTransition(() => {
          setError(err instanceof Error ? err.message : '延后候选失败');
        });
      }
    },
    [patchCandidate],
  );

  return { candidates, loading, error, refresh, convert, dismiss, snooze };
}
