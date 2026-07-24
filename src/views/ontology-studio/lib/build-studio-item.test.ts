import { describe, expect, it } from "vitest";
import {
  buildStudioItem,
  selectDefaultStudioNodeId,
  type StudioSourceEdge,
  type StudioSourceNode,
} from "./build-studio-item";

// A small graph modelled on the mockup: a "결제 승인" capability inside the
// "결제" domain, containing one element (a code path → evidence), depending on
// two capabilities, and related to one.
const NODES: StudioSourceNode[] = [
  { id: "domain:payment", title: "결제 도메인", kind: "domain" },
  { id: "cap:pay-approve", title: "결제 승인", display: "결제 승인", kind: "capability", summary: "결제 승인 정의" },
  { id: "cap:stock-check", title: "재고 확인", kind: "capability" },
  { id: "cap:order-create", title: "주문 생성", kind: "capability" },
  { id: "cap:refund", title: "환불", kind: "capability" },
  { id: "el:gateway", title: "src/payment/gateway.ts", kind: "element" },
];

const EDGES: StudioSourceEdge[] = [
  { from: "domain:payment", to: "cap:pay-approve", type: "contains" },
  { from: "cap:pay-approve", to: "el:gateway", type: "contains" },
  { from: "cap:pay-approve", to: "cap:stock-check", type: "depends_on" },
  { from: "cap:pay-approve", to: "cap:order-create", type: "depends_on" },
  { from: "cap:pay-approve", to: "cap:refund", type: "related_to" },
];

describe("buildStudioItem", () => {
  it("returns null for an unknown node id", () => {
    expect(buildStudioItem("cap:nope", NODES, EDGES)).toBeNull();
  });

  it("renders the node as the hexagon subject with kind + parent domain", () => {
    const item = buildStudioItem("cap:pay-approve", NODES, EDGES)!;
    expect(item.node.label).toBe("결제 승인");
    expect(item.node.kind).toBe("capability");
    expect(item.node.domainLabel).toBe("결제 도메인");
  });

  it("maps real relations to typed gem sockets with neighbor labels", () => {
    const item = buildStudioItem("cap:pay-approve", NODES, EDGES)!;
    const byKind = Object.fromEntries(item.gems.map((g) => [g.kind, g]));

    // is_a is always the first, always-empty gold socket (the new axis).
    expect(item.gems[0].kind).toBe("isA");
    expect(byKind.isA.filled).toBe(false);

    expect(byKind.dependsOn.filled).toBe(true);
    expect(byKind.dependsOn.count).toBe(2);
    expect(byKind.dependsOn.neighbors).toEqual(["재고 확인", "주문 생성"]);

    expect(byKind.contains.filled).toBe(true);
    expect(byKind.contains.neighbors).toEqual(["src/payment/gateway.ts"]);

    expect(byKind.relates.filled).toBe(true);
    expect(byKind.relates.neighbors).toEqual(["환불"]);
  });

  it("derives stats: definition present, code evidence, relation counts", () => {
    const item = buildStudioItem("cap:pay-approve", NODES, EDGES)!;
    expect(item.stats.hasDefinition).toBe(true);
    expect(item.stats.evidenceCount).toBe(1); // el:gateway is a code path
    expect(item.stats.containsCount).toBe(1);
    expect(item.stats.dependsOnCount).toBe(2);
    expect(item.stats.relatesCount).toBe(1);
    expect(item.stats.hasIsA).toBe(false);
  });

  it("scores the item and previews the is_a gain (80% → 100% here)", () => {
    const item = buildStudioItem("cap:pay-approve", NODES, EDGES)!;
    // definition + evidence + contains + depends + relates = 80, is_a missing.
    expect(item.score.percent).toBe(80);
    expect(item.projectedScore.percent).toBe(100);
    expect(item.projectedScore.percent).toBeGreaterThan(item.score.percent);
  });

  it("always rides an empty gold is_a orb on the ring", () => {
    const item = buildStudioItem("cap:pay-approve", NODES, EDGES)!;
    const isAOrb = item.orbits.filter((o) => o.kind === "isA");
    expect(isAOrb).toHaveLength(1);
    expect(isAOrb[0].filled).toBe(false);
  });
});

describe("selectDefaultStudioNodeId", () => {
  it("returns null for an empty graph", () => {
    expect(selectDefaultStudioNodeId([], [])).toBeNull();
  });

  it("prefers the most-connected capability", () => {
    // cap:pay-approve has the most edges among capabilities.
    expect(selectDefaultStudioNodeId(NODES, EDGES)).toBe("cap:pay-approve");
  });

  it("falls back to a non-container node when no capability exists", () => {
    const nodes: StudioSourceNode[] = [
      { id: "domain:x", title: "X", kind: "domain" },
      { id: "el:y", title: "y.ts", kind: "element" },
    ];
    const edges: StudioSourceEdge[] = [{ from: "domain:x", to: "el:y", type: "contains" }];
    expect(selectDefaultStudioNodeId(nodes, edges)).toBe("el:y");
  });
});
