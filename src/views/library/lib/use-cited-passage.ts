import { useEffect, useState } from 'react';

import { citedPassage, type CitedPassage } from '@/shared/lib/source-passage';

/**
 * **Read one file, because a person pressed the citation that names it.**
 *
 * A wiki fact ends in `[[src:sources/settlement-policy.md#l14]]`. Until slice U1 pressing
 * it opened the file's card and the reader had to leave Atlas, open the document and
 * count to line 14 to check the claim. This hook is the read that makes the passage
 * appear instead, and every clause of `.claude/rules/local-first.md` it has to satisfy is
 * a property of *when* it runs:
 *
 * - **One file, named by the person.** Only the path in the citation they pressed. No
 *   walk, no scan, no neighbouring file, nothing speculative.
 * - **Through a handle already granted.** `sourceHandles` comes from the folder walk the
 *   person opened: a `TauriFileHandle` over `read_vault_binary_file` in the app, an FSA
 *   handle in the browser. `getFile()` is the same call on both surfaces, so this is not
 *   a bridge and does not belong in `DEGRADED_SURFACES` — the ability exists in both
 *   places (`.claude/rules/surfaces.md`, "Library sources").
 * - **Nothing kept.** The text lives in this hook's state and is dropped the moment the
 *   citation changes or the pane closes. No IndexedDB, no `.ontology-atlas/` record, no
 *   frontmatter: `docs/DECISIONS.md` 2026-09-07 — Atlas still keeps no converted copy.
 * - **Nothing sent.** No LLM, ACP or MCP path is touched. A read the person asked for is
 *   not a transfer, so there is no new disclosure sentence; what the pane does owe them
 *   is the truth that the file *was* opened, which is why `SourceSummary` stops saying it
 *   never was.
 *
 * The sha256 is measured from the same bytes when the platform can (`crypto.subtle` needs
 * a secure context, and a custom-scheme WebView is not guaranteed one). It is offered as
 * "measured just now" rather than silently filling the row the native hash owns: a hash
 * whose provenance a person cannot tell apart is a fact about nothing.
 */

export interface CitedPassageState {
  path: string;
  anchor: string;
  /** `reading` while the bytes are in flight; `failed` when the file could not be read. */
  phase: 'reading' | 'ready' | 'failed';
  passage: CitedPassage | null;
  /** The reader's own message, shown as the reason — never a guessed passage. */
  error: string | null;
  /** sha256 of exactly the bytes this read used, when the platform could measure it. */
  hash: string | null;
}

async function digestHex(bytes: ArrayBuffer): Promise<string | null> {
  try {
    if (typeof crypto === 'undefined' || !crypto.subtle) return null;
    const digest = await crypto.subtle.digest('SHA-256', bytes);
    return Array.from(new Uint8Array(digest))
      .map((byte) => byte.toString(16).padStart(2, '0'))
      .join('');
  } catch {
    // A browser outside a secure context refuses; the row keeps the fact it had.
    return null;
  }
}

export function useCitedPassage({
  citation,
  handle,
  enabled,
}: {
  /** The citation the person pressed, or null when they arrived at the file another way. */
  citation: { path: string; anchor?: string } | null;
  /** The handle the folder walk granted for that path, if the folder holds the file. */
  handle: FileSystemFileHandle | undefined;
  enabled: boolean;
}): CitedPassageState | null {
  const [state, setState] = useState<CitedPassageState | null>(null);
  const path = citation?.path ?? null;
  const anchor = citation?.anchor ?? null;
  const wanted = enabled && path && anchor ? `${path}#${anchor}` : null;

  useEffect(() => {
    if (!wanted || !path || !anchor || !handle) return;
    let live = true;
    void (async () => {
      try {
        const file = await handle.getFile();
        const bytes = await file.arrayBuffer();
        const passage = citedPassage(new Uint8Array(bytes), path, anchor);
        const hash = await digestHex(bytes);
        if (!live) return;
        setState({ path, anchor, phase: 'ready', passage, error: null, hash });
      } catch (error) {
        if (!live) return;
        setState({
          path,
          anchor,
          phase: 'failed',
          passage: null,
          error: error instanceof Error ? error.message : String(error),
          hash: null,
        });
      }
    })();
    return () => {
      // Closing the pane, or pressing a different citation, discards the text. There is
      // no cache to invalidate because there is no cache.
      live = false;
    };
  }, [anchor, handle, path, wanted]);

  if (!wanted || !path || !anchor) return null;
  if (!handle) {
    /*
     * The citation button is only pressable for a path the folder holds
     * (`DocsVaultViewer` renders the unknown case as plain text), so this is the narrow
     * race where the file left the folder between the walk and the press. It is a fact
     * about the folder, not a read that failed, so it needs no state either.
     */
    return { path, anchor, phase: 'failed', passage: null, error: null, hash: null };
  }
  /*
   * `reading` is derived rather than stored. The state this hook keeps is only ever the
   * answer for one citation; while it holds someone else's — or nothing yet — the pane
   * is reading, and saying so needs no render of its own.
   */
  if (!state || `${state.path}#${state.anchor}` !== wanted) {
    return { path, anchor, phase: 'reading', passage: null, error: null, hash: null };
  }
  return state;
}
