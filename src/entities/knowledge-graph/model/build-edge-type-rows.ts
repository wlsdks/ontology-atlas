import { KNOWLEDGE_EDGE_TYPES } from './types';

export interface EdgeTypeRow {
  type: string;
  count: number;
}

const KNOWN_EDGE_TYPE_SET: ReadonlySet<string> = new Set(KNOWLEDGE_EDGE_TYPES);

/** Bar rows: canonical types in declared order, then foreign types in input order; zero counts dropped. */
export function buildEdgeTypeRows(
  typeDist: ReadonlyMap<string, number>,
): EdgeTypeRow[] {
  const rows: EdgeTypeRow[] = [];
  for (const t of KNOWLEDGE_EDGE_TYPES) {
    const count = typeDist.get(t) ?? 0;
    if (count > 0) rows.push({ type: t, count });
  }
  for (const [type, count] of typeDist) {
    if (KNOWN_EDGE_TYPE_SET.has(type)) continue;
    if (count <= 0) continue;
    rows.push({ type, count });
  }
  return rows;
}
