'use client';

import { useState } from 'react';

type HeldDatasheet<T> = {
  nodeId: string;
  model: T;
};

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
