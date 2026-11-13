/** Direct connections of one node, shared by the datasheet and full detail (FSD forbids widget → widget imports). */

import { isContainmentRelation, isDirectionalRelation } from "./relations";

export interface DatasheetConnection {
  id: string;
  title: string;
  kind: string;
  relationType: string;
  relationTypes?: readonly string[];
  direction: "incoming" | "outgoing";
  /** The relation's recorded reason (`relation_notes`); null or absent when none was written. */
  reason?: string | null;
}

/** Connections by role, with containment split out, so popover and full detail count alike. */
export interface RoleGroupedConnections {
  /** Outgoing containment. */
  contains: DatasheetConnection[];
  /** Incoming directed relations. */
  usedBy: DatasheetConnection[];
  /** Outgoing directed relations. */
  dependsOn: DatasheetConnection[];
  /** Incoming containment. */
  belongsTo: DatasheetConnection[];
  /** `relates` either way: it names no direction (spec §5). */
  related: DatasheetConnection[];
}

/** `contains` points parent → child and `belongs_to` child → parent (as `buildContainmentParents`). */
function containmentNodeIsParent(connection: DatasheetConnection): boolean {
  return connection.relationType === "belongs_to"
    ? connection.direction === "incoming"
    : connection.direction === "outgoing";
}

/** O(n+t) role groups, deduped by neighbor in input order; a later copy lends its reason to a row without one. */
export function groupConnectionsByRole(
  connections: readonly DatasheetConnection[],
): RoleGroupedConnections {
  const contains: DatasheetConnection[] = [];
  const usedBy: DatasheetConnection[] = [];
  const dependsOn: DatasheetConnection[] = [];
  const belongsTo: DatasheetConnection[] = [];
  const related: DatasheetConnection[] = [];
  type Kept = { row: DatasheetConnection; types: Set<string> };
  const seen = {
    contains: new Map<string, Kept>(),
    usedBy: new Map<string, Kept>(),
    dependsOn: new Map<string, Kept>(),
    belongsTo: new Map<string, Kept>(),
    related: new Map<string, Kept>(),
  };
  for (const connection of connections) {
    let bucket: DatasheetConnection[];
    let kept: Map<string, Kept>;
    if (isContainmentRelation(connection.relationType)) {
      if (containmentNodeIsParent(connection)) {
        bucket = contains;
        kept = seen.contains;
      } else {
        bucket = belongsTo;
        kept = seen.belongsTo;
      }
    } else if (!isDirectionalRelation(connection.relationType)) {
      bucket = related;
      kept = seen.related;
    } else if (connection.direction === "incoming") {
      bucket = usedBy;
      kept = seen.usedBy;
    } else {
      bucket = dependsOn;
      kept = seen.dependsOn;
    }
    const earlier = kept.get(connection.id);
    if (earlier) {
      for (const type of connection.relationTypes ?? [connection.relationType]) earlier.types.add(type);
      earlier.row.reason ||= connection.reason ?? null;
      continue;
    }
    const row = { ...connection };
    kept.set(connection.id, { row, types: new Set(connection.relationTypes ?? [connection.relationType]) });
    bucket.push(row);
  }
  const groups = { contains, usedBy, dependsOn, belongsTo, related };
  for (const role of Object.keys(groups) as (keyof RoleGroupedConnections)[]) {
    for (const row of groups[role]) row.relationTypes = [...seen[role].get(row.id)!.types];
  }
  return groups;
}

/** Structural shapes compatible with the KnowledgeGraph types. */
export interface ConnectionSourceNode {
  id: string;
  title: string;
  display?: string;
  /** Every `display_<locale>`, so a neighbor matches by name in any locale. */
  displayLocales?: Readonly<Record<string, string>>;
  kind: string;
}
export interface ConnectionSourceEdge {
  from: string;
  to: string;
  type: string;
  /** The recorded reason; blank reads as none. */
  label?: string;
}

/**
 * Outgoing then incoming, deduped by (neighbor id, relationType, direction) so parallel copies of
 * one edge do not duplicate rows or React keys.
 */
export function buildConnections(
  nodeId: string,
  nodes: readonly ConnectionSourceNode[],
  edges: readonly ConnectionSourceEdge[],
): DatasheetConnection[] {
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const outgoing: DatasheetConnection[] = [];
  const incoming: DatasheetConnection[] = [];
  const seen = new Set<string>();
  for (const edge of edges) {
    if (edge.from === nodeId) {
      const other = nodeById.get(edge.to);
      if (!other) continue;
      const key = `${other.id}|${edge.type}|outgoing`;
      if (seen.has(key)) continue;
      seen.add(key);
      outgoing.push({
        id: other.id,
        title: other.display ?? other.title,
        kind: other.kind,
        relationType: edge.type,
        direction: "outgoing",
        reason: edge.label?.trim() || null,
      });
    } else if (edge.to === nodeId) {
      const other = nodeById.get(edge.from);
      if (!other) continue;
      const key = `${other.id}|${edge.type}|incoming`;
      if (seen.has(key)) continue;
      seen.add(key);
      incoming.push({
        id: other.id,
        title: other.display ?? other.title,
        kind: other.kind,
        relationType: edge.type,
        direction: "incoming",
        reason: edge.label?.trim() || null,
      });
    }
  }
  return [...outgoing, ...incoming];
}
