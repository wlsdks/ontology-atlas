import type { SourceGrouping } from "./source-group-index";
import type { SourceTableRow } from "./table-rows";

/** The order rows are drawn in, held between re-sorts; rows that join in between go to the end. */
export interface HeldOrder {
  keys: readonly string[];
  grouping: SourceGrouping;
}

/** `previous` itself when `keys` are the same, so an unchanged re-sort does not re-render. */
export function holdOrder(previous: HeldOrder, keys: readonly string[]): HeldOrder {
  if (keys.length === previous.keys.length && keys.every((key, i) => key === previous.keys[i])) return previous;
  return { ...previous, keys };
}

/** `rows` in the order of `keys`: a row with no key yet goes last, a key with no row is skipped. */
export function rowsInHeldOrder(rows: readonly SourceTableRow[], keys: readonly string[]): SourceTableRow[] {
  const byKey = new Map(rows.map((row) => [row.key, row]));
  const ordered: SourceTableRow[] = [];
  for (const key of keys) {
    const row = byKey.get(key);
    if (row) {
      ordered.push(row);
      byKey.delete(key);
    }
  }
  for (const row of byKey.values()) ordered.push(row);
  return ordered;
}
