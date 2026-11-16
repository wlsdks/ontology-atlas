import type { KnowledgeGraphNode } from "@/entities/knowledge-graph";
import { isProjectConcept } from "./project-to-check";

export const CHANGED_SLOTS = 3;

export interface ProjectChangedRow {
  id: string;
  name: string;
  kind: string;
  /** 0 means today. */
  agoDays: number;
}

export interface ProjectChanged {
  /** Newest first, at most `CHANGED_SLOTS`. */
  visible: ProjectChangedRow[];
  /** This project's concepts changed in the window. */
  total: number;
  /** This project's concepts changed in the window, for the row marks in the Composition. */
  changedIds: ReadonlySet<string>;
}

/**
 * The map's recent-change lens (`useAdaptiveRecentChanges`), narrowed to one project's concepts;
 * the window is the lens's own, so the page and the map INDEX name the same days.
 */
export function buildProjectChanged(
  lensRows: readonly { id: string; agoDays: number }[],
  nodes: readonly KnowledgeGraphNode[],
  projectSlug: string,
): ProjectChanged {
  const nodeById = new Map(nodes.map((node) => [node.id, node] as const));
  const rows: ProjectChangedRow[] = [];
  for (const lensRow of lensRows) {
    const node = nodeById.get(lensRow.id);
    if (!node || !isProjectConcept(node, projectSlug)) continue;
    rows.push({ id: node.id, name: node.display ?? node.title, kind: node.kind, agoDays: lensRow.agoDays });
  }
  rows.sort((a, b) => a.agoDays - b.agoDays || a.name.localeCompare(b.name));
  return { visible: rows.slice(0, CHANGED_SLOTS), total: rows.length, changedIds: new Set(rows.map((row) => row.id)) };
}
