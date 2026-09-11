import { useEffect, useState } from 'react';

import { sourceOutline, type SourceOutline } from '@/shared/lib/source-passage';

/**
 * **Read one file's shape, because a person opened its pane.**
 *
 * The source pane could always state five facts — path, format, size, state, sha256 —
 * and every one of them came from the directory listing or a hash. None of them says
 * whether the document holds three headings or three hundred rows, so a person with no
 * agent could not learn what was *in* their own file without leaving the app (measured
 * 2026-09-11 on a six-file folder). Slice U2's outline section is that answer, and this
 * is the read behind it.
 *
 * It obeys the same clause as `use-cited-passage.ts` and `use-source-search.ts`: nothing
 * is read that a person did not name. Choosing a row **is** naming that file — one file,
 * the one whose pane is open, through the handle the folder walk already granted. No
 * walk, no neighbouring file, nothing speculative, nothing kept.
 *
 * ⚠️ **It reads the file, so the pane may no longer say it never did.** `SourceSummary`
 * prints `source.openedForOutline` once this has an answer, which is why that sentence
 * exists: a pane showing a document's structure while claiming Atlas never opened it
 * would be a reassurance that had stopped being true (the same correction po-evidence and
 * po-steward asked for in U1).
 *
 * ⚠️ Arriving by a pressed citation reads the file **twice** — once here for the shape,
 * once in `use-cited-passage.ts` for the passage. Both are the same person's one press
 * and neither keeps anything, so it is correct; it is not yet efficient, and collapsing
 * them into one read that serves both is a follow-up rather than something to do behind
 * a slice that changed the copy.
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
