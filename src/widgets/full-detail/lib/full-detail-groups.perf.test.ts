import { expect, it } from "vitest";
import {
  buildConnections, groupConnectionsByRole,
  type ConnectionSourceEdge, type ConnectionSourceNode, type DatasheetConnection,
} from "@/entities/knowledge-graph";
import { buildFullDetailGroups, type FullDetailGroups } from "./full-detail-groups";

/** Field reads of the edges, the work a per-row scan multiplies by the rows. */
const reads = { count: 0 };

function counted(edge: ConnectionSourceEdge): ConnectionSourceEdge {
  return new Proxy(edge, {
    get(target, key, receiver) {
      reads.count += 1;
      return Reflect.get(target, key, receiver);
    },
  });
}

function scanPerRow(nodeId: string, nodes: ConnectionSourceNode[], edges: ConnectionSourceEdge[]): FullDetailGroups {
  const grouped = groupConnectionsByRole(buildConnections(nodeId, nodes, edges));
  const toView = (connections: readonly DatasheetConnection[]) => {
    const rows = connections.map(connection => {
      let childCount = 0;
      for (const edge of edges) {
        if (edge.type === "contains" && edge.from === connection.id) childCount += 1;
        else if (edge.type === "belongs_to" && edge.to === connection.id) childCount += 1;
      }
      return {
        id: connection.id, title: connection.title, kind: connection.kind,
        fresh: false, childCount,
      };
    });
    return { rows, total: rows.length };
  };
  return {
    contains: toView(grouped.contains), usedBy: toView(grouped.usedBy),
    dependsOn: toView(grouped.dependsOn), belongsTo: toView(grouped.belongsTo),
    related: toView(grouped.related),
  };
}

it("builds the same large detail groups without scanning every edge for each row", () => {
  const nodes: ConnectionSourceNode[] = [{ id: "root", title: "Root", kind: "domain" }];
  const edges: ConnectionSourceEdge[] = [];
  for (let i = 0; i < 1500; i++) {
    const id = `child:${i}`;
    nodes.push({ id, title: `연결 ${i}`, kind: "capability" });
    edges.push(counted({ from: "root", to: id, type: "contains" }));
    edges.push(counted({ from: `leaf:${i}`, to: id, type: "belongs_to" }));
  }
  expect(buildFullDetailGroups("root", nodes, edges)).toEqual(scanPerRow("root", nodes, edges));
  reads.count = 0;
  const groups = buildFullDetailGroups("root", nodes, edges);
  expect(groups.contains.total).toBe(1500);
  // Measured 2026-11-23: 18,000 reads, six an edge; a count per row that scans the edges reads millions.
  expect(reads.count).toBeLessThanOrEqual(10 * edges.length);
});
