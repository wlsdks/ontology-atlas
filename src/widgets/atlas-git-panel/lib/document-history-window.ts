import type { GitCommitInfo } from "@/shared/lib/git/tauri-git";

/** How many of a document's other steps are read; one more tells whether older ones exist. */
export const DOCUMENT_HISTORY_LIMIT = 12;
/** Rows a document's history shows before "N more". */
export const DOCUMENT_HISTORY_PREVIEW = 3;

const DEFAULT_FADE_DURATION_MS = 120;

/** Keeps the steps to show and notes whether the read found older ones beyond the limit. */
export function readDocumentHistory(read: readonly GitCommitInfo[] | null): {
  rows: GitCommitInfo[];
  older: boolean;
} {
  const all = read ?? [];
  return {
    rows: all.slice(0, DOCUMENT_HISTORY_LIMIT),
    older: all.length > DOCUMENT_HISTORY_LIMIT,
  };
}

/**
 * The rows on screen and what the controls around them say: three by default so the ego drawing
 * stays above the fold, the rest counted behind one press, and the "older steps" note only once
 * every read row is visible.
 */
export function visibleDocumentHistory(
  others: readonly GitCommitInfo[],
  expanded: boolean,
  older: boolean,
): { shown: readonly GitCommitInfo[]; hidden: number; showToggle: boolean; showOlderNote: boolean } {
  const shown = expanded ? others : others.slice(0, DOCUMENT_HISTORY_PREVIEW);
  const hidden = others.length - shown.length;
  return {
    shown,
    hidden,
    showToggle: hidden > 0 || (expanded && others.length > DOCUMENT_HISTORY_PREVIEW),
    showOlderNote: older && (expanded || others.length <= DOCUMENT_HISTORY_PREVIEW),
  };
}

/** The token computes as ".12s" in the browser, not "120ms"; read either unit. */
export function motionDurationMs(rawToken: string): number {
  const raw = rawToken.trim();
  const value = Number.parseFloat(raw);
  if (!Number.isFinite(value)) return DEFAULT_FADE_DURATION_MS;
  return raw.endsWith("ms") ? value : value * 1000;
}
