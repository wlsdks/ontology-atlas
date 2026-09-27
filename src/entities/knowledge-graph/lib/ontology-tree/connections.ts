/** Direct connections of one node, shared by the datasheet and full detail (FSD forbids widget → widget imports). */

import { isContainmentRelation } from "./relations";

export interface DatasheetConnection {
  id: string;
  title: string;
  kind: string;
  relationType: string;
  direction: "incoming" | "outgoing";
}

/** usedBy = incoming, dependsOn = outgoing: the axis the metric line counts. */
export interface GroupedConnections {
  usedBy: DatasheetConnection[];
  dependsOn: DatasheetConnection[];
}

/**
 * Groups connections by direction, one row per neighbor within a group (rows show neighbors, not
 * relation types); the same neighbor in the opposite direction is a separate fact.
 */
export function groupConnectionsByDirection(
  connections: readonly DatasheetConnection[],
): GroupedConnections {
  const usedBy: DatasheetConnection[] = [];
  const dependsOn: DatasheetConnection[] = [];
  const seenUsedBy = new Set<string>();
  const seenDependsOn = new Set<string>();
  for (const connection of connections) {
    if (connection.direction === "incoming") {
      if (seenUsedBy.has(connection.id)) continue;
      seenUsedBy.add(connection.id);
      usedBy.push(connection);
    } else {
      if (seenDependsOn.has(connection.id)) continue;
      seenDependsOn.add(connection.id);
      dependsOn.push(connection);
    }
  }
  return { usedBy, dependsOn };
}

/** Connections by role, with containment split out, so popover and full detail count alike. */
export interface RoleGroupedConnections {
  /** Outgoing containment. */
  contains: DatasheetConnection[];
  /** Incoming non-containment. */
  usedBy: DatasheetConnection[];
  /** Outgoing non-containment. */
  dependsOn: DatasheetConnection[];
  /** Incoming containment. */
  belongsTo: DatasheetConnection[];
}

/** `contains` points parent → child and `belongs_to` child → parent (as `buildContainmentParents`). */
function containmentNodeIsParent(connection: DatasheetConnection): boolean {
  return connection.relationType === "belongs_to"
    ? connection.direction === "incoming"
    : connection.direction === "outgoing";
}

/** Four role groups, each deduped by neighbor id, in input order. */
export function groupConnectionsByRole(
  connections: readonly DatasheetConnection[],
): RoleGroupedConnections {
  const contains: DatasheetConnection[] = [];
  const usedBy: DatasheetConnection[] = [];
  const dependsOn: DatasheetConnection[] = [];
  const belongsTo: DatasheetConnection[] = [];
  const seen = {
    contains: new Set<string>(),
    usedBy: new Set<string>(),
    dependsOn: new Set<string>(),
    belongsTo: new Set<string>(),
  };
  for (const connection of connections) {
    let bucket: DatasheetConnection[];
    let seenSet: Set<string>;
    if (isContainmentRelation(connection.relationType)) {
      if (containmentNodeIsParent(connection)) {
        bucket = contains;
        seenSet = seen.contains;
      } else {
        bucket = belongsTo;
        seenSet = seen.belongsTo;
      }
    } else if (connection.direction === "incoming") {
      bucket = usedBy;
      seenSet = seen.usedBy;
    } else {
      bucket = dependsOn;
      seenSet = seen.dependsOn;
    }
    if (seenSet.has(connection.id)) continue;
    seenSet.add(connection.id);
    bucket.push(connection);
  }
  return { contains, usedBy, dependsOn, belongsTo };
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
      });
    }
  }
  return [...outgoing, ...incoming];
}
