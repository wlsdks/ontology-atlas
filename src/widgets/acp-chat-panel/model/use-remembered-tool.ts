import { useCallback, useState } from 'react';

import { rememberTool, rememberedTool } from '@/features/acp-session';

import { keptAwayRuntimeId } from './kept-panels';

/**
 * Seats the tool last chosen in this folder once the folder and the usable tools are both known,
 * and again when the folder changes. Returns the setter a person's own pick goes through.
 * `setRuntimeId` must be state of the component that calls this hook.
 */
export function useRememberedTool({
  vaultRoot,
  runtimes,
  runtimeId,
  setRuntimeId,
  held = false,
}: {
  vaultRoot: string | null;
  runtimes: ReadonlyArray<{ id: string }>;
  runtimeId: string | null;
  setRuntimeId: (runtimeId: string) => void;
  held?: boolean;
}): (runtimeId: string) => void {
  const [seatedFor, setSeatedFor] = useState<string | null>(null);
  if (vaultRoot !== null && runtimes.length > 0 && seatedFor !== vaultRoot) {
    setSeatedFor(vaultRoot);
    const remembered = rememberedTool(vaultRoot);
    if (
      remembered !== null
      && remembered !== runtimeId
      && !held
      // A conversation still running out of sight keeps its tool until it is seated again.
      && keptAwayRuntimeId() === null
      && runtimes.some((runtime) => runtime.id === remembered)
    ) {
      setRuntimeId(remembered);
    }
  }
  return useCallback(
    (chosen: string) => {
      rememberTool(vaultRoot, chosen);
      setRuntimeId(chosen);
    },
    [setRuntimeId, vaultRoot],
  );
}
