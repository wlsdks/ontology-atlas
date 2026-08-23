'use client';

import { useState } from 'react';

type HeldDatasheet<T> = {
  nodeId: string;
  model: T;
};

/**
 * Keeps the most recent compact-datasheet model only while its panel finishes
 * exiting. A newly selected node never receives the previous node's snapshot:
 * until its own model is available, `selectedNodeId` mismatches the held identity
 * and this deliberately returns null.
 *
 * The state update is guarded by the immutable model identity. The live model is
 * returned directly, so a same-node model refresh is visible immediately and its
 * newest value becomes the next exit snapshot without using a render ref.
 */
export function useRetainedDatasheetModel<T extends { nodeId: string }>(
  liveModel: T | null,
  selectedNodeId: string | null,
): T | null {
  const [held, setHeld] = useState<HeldDatasheet<T> | null>(() =>
    liveModel ? { nodeId: liveModel.nodeId, model: liveModel } : null,
  );

  if (
    liveModel !== null &&
    (held?.nodeId !== liveModel.nodeId || held.model !== liveModel)
  ) {
    setHeld({ nodeId: liveModel.nodeId, model: liveModel });
  }

  if (liveModel !== null) return liveModel;
  if (selectedNodeId !== null && held?.nodeId !== selectedNodeId) return null;
  return held?.model ?? null;
}
