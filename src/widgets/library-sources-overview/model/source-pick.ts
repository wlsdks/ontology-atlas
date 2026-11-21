import { sourceNeedsCompile, type LibrarySourceRow } from "@/entities/docs-vault";

import type { SourceGrouping } from "./source-group-index";
import type { AlikeFolds, SourceTableRow } from "./table-rows";

/** A picked row: one group, or every folder of an alike row. */
export interface SourcePick {
  grouping: SourceGrouping;
  keys: readonly string[];
  name: string;
}

/** The row that holds a pick: the one drawing the first picked folder still counted. */
export function pickedRowOf(folds: AlikeFolds, pick: SourcePick | null, grouping: SourceGrouping): SourceTableRow | null {
  if (!pick || pick.grouping !== grouping) return null;
  for (const key of pick.keys) {
    const row = folds.rowOf(key);
    if (row) return row;
  }
  return null;
}

/** The first `limit` sources of the pick that still need a page, in the order the rows came. */
export function pickedWaitingSources(
  sources: readonly LibrarySourceRow[],
  keyOf: (path: string, grouping: SourceGrouping) => string | undefined,
  pick: SourcePick | null,
  limit: number,
): LibrarySourceRow[] {
  if (!pick) return [];
  const keys = new Set(pick.keys);
  const waiting: LibrarySourceRow[] = [];
  for (const row of sources) {
    if (!sourceNeedsCompile(row)) continue;
    const key = keyOf(row.path, pick.grouping);
    if (key !== undefined && keys.has(key)) waiting.push(row);
    if (waiting.length === limit) break;
  }
  return waiting;
}

/** The pick when every folder it names has left the disk, judged only once the folder is fully counted. */
export function pickWithNoFolderLeft(
  pick: SourcePick | null,
  { counted, hasGroup }: { counted: boolean; hasGroup: (key: string) => boolean },
): SourcePick | null {
  return pick !== null && counted && !pick.keys.some(hasGroup) ? pick : null;
}
