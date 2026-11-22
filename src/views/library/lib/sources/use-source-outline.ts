import { useEffect, useState } from 'react';

import { sourceOutline, type SourceOutline } from '@/shared/lib/library/source-outline';

/**
 * Reads one file's shape because a person opened its pane: one file, through the granted handle,
 * nothing kept. `SourceSummary` prints `source.openedForOutline` once answered. Arriving by a
 * citation reads the file twice (here and `use-cited-passage.ts`).
 */

export interface SourceOutlineState {
  path: string;
  /** `reading` while the bytes are in flight; `failed` when the file could not be read. */
  phase: 'reading' | 'ready' | 'failed';
  outline: SourceOutline | null;
}

export function useSourceOutline({
  path,
  handle,
  enabled,
}: {
  /** The open source's path, or null when the pane is showing something else. */
  path: string | null;
  /** The handle the folder walk granted for that path, if the folder holds the file. */
  handle: FileSystemFileHandle | undefined;
  enabled: boolean;
}): SourceOutlineState | null {
  const [state, setState] = useState<SourceOutlineState | null>(null);
  const wanted = enabled && path ? path : null;

  useEffect(() => {
    if (!wanted || !handle) return;
    let live = true;
    void (async () => {
      try {
        const bytes = await (await handle.getFile()).arrayBuffer();
        const outline = sourceOutline(new Uint8Array(bytes), wanted);
        if (!live) return;
        setState({ path: wanted, phase: 'ready', outline });
      } catch {
        if (!live) return;
        /*
         * A shape Atlas could not read is not a shape of zero parts. The section says it
         * could not read the file; it never prints a count it does not have.
         */
        setState({ path: wanted, phase: 'failed', outline: null });
      }
    })();
    return () => {
      // Closing the pane, or opening another file, drops the answer. There is no cache.
      live = false;
    };
  }, [handle, wanted]);

  if (!wanted) return null;
  if (!handle) return { path: wanted, phase: 'failed', outline: null };
  /*
   * `reading` is derived, as in `use-cited-passage.ts`: while the state holds another
   * file's answer — or nothing yet — this pane is reading, and saying so needs no render
   * of its own.
   */
  if (!state || state.path !== wanted) return { path: wanted, phase: 'reading', outline: null };
  return state;
}
