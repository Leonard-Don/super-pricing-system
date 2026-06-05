// ---------------------------------------------------------------------------
// usePricingWorkbenchActions
//
// Ported from frontend/src/components/pricing/usePricingWorkbenchActions.js
//
// Manages saving a pricing analysis to the research workbench and updating
// the snapshot for an already-saved task.
// ---------------------------------------------------------------------------

import { useCallback, useState } from 'react';

import {
  createResearchTask,
  addResearchTaskSnapshot,
} from '@/services/api/research';
import { buildPricingWorkbenchPayload } from '@/features/workbench/lib/playbookViewModels';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

// The Playbook type in playbookViewModels is not exported; we use the broadest
// compatible shape here and cast at the call-site.
export type PricingPlaybook = Record<string, unknown>;

export interface UsePricingWorkbenchActionsParams {
  data: Record<string, unknown> | null;
  mergedContext: Record<string, unknown>;
  period: string;
  playbook?: PricingPlaybook | null;
  onSaveSuccess?: (taskId: string) => void;
  onUpdateSnapshotSuccess?: (taskId: string) => void;
}

export interface UsePricingWorkbenchActionsResult {
  saveTask: () => Promise<void>;
  updateSnapshot: () => Promise<void>;
  savedTaskId: string;
  savingTask: boolean;
  updatingSnapshot: boolean;
  setSavedTaskId: (id: string) => void;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export default function usePricingWorkbenchActions({
  data,
  mergedContext,
  period,
  playbook = null,
  onSaveSuccess,
  onUpdateSnapshotSuccess,
}: UsePricingWorkbenchActionsParams): UsePricingWorkbenchActionsResult {
  const [savingTask, setSavingTask] = useState(false);
  const [updatingSnapshot, setUpdatingSnapshot] = useState(false);
  const [savedTaskId, setSavedTaskId] = useState('');

  const saveTask = useCallback(async () => {
    const payload = buildPricingWorkbenchPayload(
      { ...mergedContext, period },
      data,
      // Cast: the Playbook type in playbookViewModels is an internal interface;
      // PricingPlaybook (Record<string,unknown>) is structurally compatible.
      playbook as Parameters<typeof buildPricingWorkbenchPayload>[2],
    );
    if (!payload) {
      // No symbol — cannot save
      return;
    }

    setSavingTask(true);
    try {
      const response = await createResearchTask(
        payload as Parameters<typeof createResearchTask>[0],
      );
      const id = (response as { id?: string }).id ?? '';
      setSavedTaskId(id);
      onSaveSuccess?.(id);
    } finally {
      setSavingTask(false);
    }
  }, [data, mergedContext, onSaveSuccess, period, playbook]);

  const updateSnapshot = useCallback(async () => {
    if (!savedTaskId) {
      return;
    }

    const payload = buildPricingWorkbenchPayload(
      { ...mergedContext, period },
      data,
      playbook as Parameters<typeof buildPricingWorkbenchPayload>[2],
    );
    if (!(payload as Record<string, unknown> | null)?.snapshot) {
      return;
    }

    const typedPayload = payload as Record<string, unknown>;

    setUpdatingSnapshot(true);
    try {
      await addResearchTaskSnapshot(
        savedTaskId,
        {
          snapshot: typedPayload.snapshot,
          ...(typedPayload.refresh_priority_event
            ? { refresh_priority_event: typedPayload.refresh_priority_event }
            : {}),
        } as Parameters<typeof addResearchTaskSnapshot>[1],
      );
      onUpdateSnapshotSuccess?.(savedTaskId);
    } finally {
      setUpdatingSnapshot(false);
    }
  }, [data, mergedContext, onUpdateSnapshotSuccess, period, playbook, savedTaskId]);

  return {
    saveTask,
    updateSnapshot,
    savedTaskId,
    savingTask,
    updatingSnapshot,
    setSavedTaskId,
  };
}
