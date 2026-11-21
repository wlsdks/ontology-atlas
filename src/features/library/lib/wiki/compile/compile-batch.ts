import { sourceNeedsCompile, type LibrarySourceRow } from "@/entities/docs-vault";

export function selectCompileTargets(
  sources: readonly LibrarySourceRow[],
): LibrarySourceRow[] {
  return sources.filter(sourceNeedsCompile);
}

/**
 * Sources one Continue press names on the coding-agent route. The local runner keeps its own
 * smaller turn (`COMPILE_SOURCES_PER_TURN`), passed as `size`.
 */
export const COMPILE_BATCH_SIZE = 10;

export interface CompileBatch {
  /** The waiting sources the next request names, in list order, sources that came back last. */
  targets: LibrarySourceRow[];
  /** Waiting sources left after `targets`. */
  rest: number;
}

const NO_PATHS: ReadonlySet<string> = new Set();

/**
 * The next `size` waiting sources in list order. A source in `returned` (named by an earlier
 * request that ended without its page) goes after every other waiting source, so the next press
 * moves on instead of naming it again. One pass, O(S).
 */
export function selectCompileBatch(
  sources: readonly LibrarySourceRow[],
  { size = COMPILE_BATCH_SIZE, returned = NO_PATHS }: { size?: number; returned?: ReadonlySet<string> } = {},
): CompileBatch {
  const limit = Math.max(0, Math.floor(size));
  const targets: LibrarySourceRow[] = [];
  const later: LibrarySourceRow[] = [];
  let waiting = 0;
  for (const row of sources) {
    if (!sourceNeedsCompile(row)) continue;
    waiting += 1;
    if (returned.has(row.path)) {
      if (later.length < limit) later.push(row);
    } else if (targets.length < limit) {
      targets.push(row);
    }
  }
  for (const row of later) {
    if (targets.length >= limit) break;
    targets.push(row);
  }
  return { targets, rest: waiting - targets.length };
}
