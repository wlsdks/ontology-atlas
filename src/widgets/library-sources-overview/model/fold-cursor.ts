import type { SourceGrouping, SourceGroupIndex } from "./source-group-index";
import { AlikeFolds, type SourceTableRow } from "./table-rows";

/** One grouping's folded rows and how far it has read the index's change log. */
export class FoldCursor {
  readonly folds = new AlikeFolds();
  private cursor = -1;

  rows(index: SourceGroupIndex, grouping: SourceGrouping, writing: ReadonlySet<string>): SourceTableRow[] {
    const changes = index.changesSince(this.cursor, grouping);
    this.cursor = changes.cursor;
    return changes.groups ? this.folds.fold(changes.groups, writing, false) : this.folds.fold(index.list(grouping), writing);
  }
}
