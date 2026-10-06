import { expect, it } from "vitest";
import {
  buildConnections, groupConnectionsByRole, isContainmentRelation,
  type ConnectionSourceEdge, type ConnectionSourceNode, type DatasheetConnection,
} from "@/entities/knowledge-graph";
import { buildFullDetailGroups, type FullDetailGroups } from "./full-detail-groups";

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
        containment: isContainmentRelation(connection.relationType), fresh: false, childCount,
      };
    });
    return { rows, total: rows.length };
  };
  return {
    contains: toView(grouped.contains), usedBy: toView(grouped.usedBy),
    dependsOn: toView(grouped.dependsOn), belongsTo: toView(grouped.belongsTo),
  };
}

it("builds the same large detail groups without scanning every edge for each row", () => {
  const nodes: ConnectionSourceNode[] = [{ id: "root", title: "Root", kind: "domain" }];
  const edges: ConnectionSourceEdge[] = [];
  for (let i = 0; i < 1500; i++) {
    const id = `child:${i}`;
    nodes.push({ id, title: `연결 ${i}`, kind: "capability" });
    edges.push({ from: "root", to: id, type: "contains" });
    edges.push({ from: `leaf:${i}`, to: id, type: "belongs_to" });
  }
  const indexed = () => buildFullDetailGroups("root", nodes, edges);
  const scanned = () => scanPerRow("root", nodes, edges);
  expect(indexed()).toEqual(scanned());
  expect(indexed().contains.total).toBe(1500);
  const median = (run: () => FullDetailGroups) => {
    const samples = [];
    for (let round = 0; round < 7; round++) {
      const start = performance.now();
      run();
      samples.push(performance.now() - start);
    }
    return samples.sort((a, b) => a - b)[3];
  };
  const before = median(scanned), after = median(indexed);
  console.info(`[full-detail-groups] nodes=${nodes.length} edges=${edges.length} perRow=${before.toFixed(2)}ms indexed=${after.toFixed(2)}ms ratio=${(before / after).toFixed(2)}`);
  // Same-process comparison with headroom for removed rows × edges work.
  expect(after).toBeLessThan(before / 5);
});
