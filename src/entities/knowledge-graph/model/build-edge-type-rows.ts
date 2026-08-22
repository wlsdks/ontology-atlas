import { KNOWLEDGE_EDGE_TYPES } from './types';

export interface EdgeTypeRow {
  type: string;
  count: number;
}

const KNOWN_EDGE_TYPE_SET: ReadonlySet<string> = new Set(KNOWLEDGE_EDGE_TYPES);

/**
 * Edge-type distribution → bar rows. Canonical types (`KNOWLEDGE_EDGE_TYPES`) come
 * first in their declared order, foreign types after in input order. Zero-count rows
 * are dropped.
 *
 * Feeds the edge-type panel on /ontology/insights; any new surface reuses this helper
 * so the shape stays single-sourced.
 */
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
