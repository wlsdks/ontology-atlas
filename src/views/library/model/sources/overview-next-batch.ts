import { sourceNeedsCompile, type LibrarySourceRow } from "@/entities/docs-vault";
import { PANEL_LIST_ROWS, type SourcesNextBatch } from "@/widgets/library-sources-overview";

import type { ContinueBatch } from "../../ui/parts/progress/SourceProgressBand";

/**
 * What the overview's panel lists: the files the request in flight still writes, top first, then the
 * ones the next press sends, so a file leaves once its page lands and the next joins at the bottom.
 */
export function overviewNextBatch(sources: readonly LibrarySourceRow[], batch: ContinueBatch): SourcesNextBatch {
  if (batch.running.size === 0) return batch;
  const writing = sources.filter((row) => batch.running.has(row.path) && sourceNeedsCompile(row));
  const next = [...writing, ...batch.next].slice(0, PANEL_LIST_ROWS);
  return { next, running: batch.running, rest: Math.max(0, writing.length + batch.rest - next.length) };
}
