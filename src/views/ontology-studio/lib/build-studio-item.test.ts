import { describe, expect, it } from "vitest";
import {
  buildStudioItem,
  selectDefaultStudioNodeId,
  type StudioSourceEdge,
  type StudioSourceNode,
} from "./build-studio-item";

// A small graph modelled on the compass mockup: a "결제 승인" capability inside
// the "결제" domain, containing one element, depending on two capabilities, and
// related to one. No `is_a` edge — so the UP bearing is the empty hero socket.
const NODES: StudioSourceNode[] = [
  { id: "domain:payment", title: "결제 도메인", kind: "domain" },
  {
    id: "capability:pay-approve",
    title: "결제 승인",
    display: "결제 승인",
    kind: "capability",
    summary: "결제 승인 정의",
    evidenceIds: ["capabilities/pay-approve"],
  },
  { id: "capability:stock-check", title: "재고 확인", kind: "capability" },
  { id: "capability:order-create", title: "주문 생성", kind: "capability" },
  { id: "capability:refund", title: "환불", kind: "capability" },
  { id: "element:gateway", title: "src/payment/gateway.ts", kind: "element" },
  { id: "capability:transaction", title: "거래", kind: "capability" },
];

const EDGES: StudioSourceEdge[] = [
  { from: "domain:payment", to: "capability:pay-approve", type: "contains" },
  { from: "capability:pay-approve", to: "element:gateway", type: "contains" },
  { from: "capability:pay-approve", to: "capability:stock-check", type: "depends_on" },
  { from: "capability:pay-approve", to: "capability:order-create", type: "depends_on" },
  { from: "capability:pay-approve", to: "capability:refund", type: "related_to" },
];

describe("buildStudioItem — compass bearings", () => {
  it("returns null for an unknown node id", () => {
    expect(buildStudioItem("capability:nope", NODES, EDGES)).toBeNull();
  });

  it("renders the focal node with kind, parent domain, definition, and write slug", () => {
    const item = buildStudioItem("capability:pay-approve", NODES, EDGES)!;
    expect(item.node.label).toBe("결제 승인");
    expect(item.node.kind).toBe("capability");
    expect(item.node.domainLabel).toBe("결제 도메인");
    expect(item.node.definition).toBe("결제 승인 정의");
    // 자기 문서를 가진 노드 — 쓰기는 그 문서로 간다.
    expect(item.node.writeTarget).toEqual({
      status: "existing",
      slug: "capabilities/pay-approve",
      agentSlug: "capabilities/pay-approve",
    });
  });

  /**
   * 남의 문서가 이름만 불러낸 개념(`hasOwnDocument: false`)은 쓰기 대상이
   * 없다. 예전엔 `evidenceIds[0]` 을 그대로 썼는데 그 값은 *자기를 인용한
   * 남의 문서* 라, 사용자가 이 개념에 대해 적은 관계가 남의 frontmatter 에
   * 앉았다 — 사용자가 한 적 없는 주장이 남의 문서에 사실로 기록된 것이다.
   */
  it("자기 문서가 없는 파생 개념은 남의 문서를 쓰기 대상으로 삼지 않는다", () => {
    const derived: StudioSourceNode[] = [
      ...NODES,
      {
        id: "element:payment-gateway",
        title: "payment-gateway",
        kind: "element",
        // 이 개념을 인용한 *남의* 문서 slug 다.
        evidenceIds: ["capabilities/pay-approve"],
        hasOwnDocument: false,
      },
    ];
    const item = buildStudioItem("element:payment-gateway", derived, EDGES)!;
    expect(item.node.writeTarget).toEqual({
      status: "missing",
      slug: "elements/payment-gateway",
      title: "payment-gateway",
      kind: "element",
      domainValue: null,
    });
  });

  it("groups real relations onto the four fixed bearings", () => {
    const item = buildStudioItem("capability:pay-approve", NODES, EDGES)!;

    // RIGHT = depends_on (2), folder-prefixed refs computed for writing.
    expect(item.bearings.right.filled).toBe(true);
    expect(item.bearings.right.frontmatterKey).toBe("dependencies");
    expect(item.bearings.right.neighbors.map((n) => n.title)).toEqual(["재고 확인", "주문 생성"]);
    expect(item.bearings.right.neighbors[0].ref).toBe("capabilities/stock-check");

    // DOWN = contains (1 element).
    expect(item.bearings.down.filled).toBe(true);
    expect(item.bearings.down.frontmatterKey).toBe("contains");
    expect(item.bearings.down.neighbors.map((n) => n.title)).toEqual(["src/payment/gateway.ts"]);

    // LEFT = related_to (1).
    expect(item.bearings.left.filled).toBe(true);
    expect(item.bearings.left.frontmatterKey).toBe("relates");
    expect(item.bearings.left.neighbors.map((n) => n.title)).toEqual(["환불"]);
  });

  it("leaves UP (is_a) empty and marks it the single recommended guided socket", () => {
    const item = buildStudioItem("capability:pay-approve", NODES, EDGES)!;
    expect(item.bearings.up.filled).toBe(false);
    expect(item.bearings.up.frontmatterKey).toBe("broader");
    expect(item.bearings.up.recommended).toBe(true);
    // Only one recommended socket across the four bearings.
    expect(item.order.filter((b) => b.recommended)).toHaveLength(1);
  });

  it("counts filled bearings (3 of 4 here — up empty)", () => {
    const item = buildStudioItem("capability:pay-approve", NODES, EDGES)!;
    expect(item.filledBearings).toBe(3);
    expect(item.totalBearings).toBe(4);
  });

  it("marks an empty DOWN (contains) bearing as expected-but-missing (amber)", () => {
    const item = buildStudioItem("capability:transaction", NODES, EDGES)!;
    expect(item.bearings.down.filled).toBe(false);
    expect(item.bearings.down.expected).toBe(true);
    // UP is still the recommended one (priority up > down).
    expect(item.bearings.up.recommended).toBe(true);
    expect(item.bearings.down.recommended).toBe(false);
  });

  it("renders a filled UP bearing when a broader-derived is_a edge exists", () => {
    const edges: StudioSourceEdge[] = [
      ...EDGES,
      { from: "capability:pay-approve", to: "capability:transaction", type: "is_a" },
    ];
    const item = buildStudioItem("capability:pay-approve", NODES, edges)!;
    expect(item.bearings.up.filled).toBe(true);
    expect(item.bearings.up.neighbors.map((n) => n.title)).toEqual(["거래"]);
    expect(item.bearings.up.recommended).toBe(false);
    expect(item.filledBearings).toBe(4);
  });
});

describe("selectDefaultStudioNodeId", () => {
  it("returns null for an empty graph", () => {
    expect(selectDefaultStudioNodeId([], [])).toBeNull();
  });

  it("prefers the most-connected capability", () => {
    expect(selectDefaultStudioNodeId(NODES, EDGES)).toBe("capability:pay-approve");
  });

  it("falls back to a non-container node when no capability exists", () => {
    const nodes: StudioSourceNode[] = [
      { id: "domain:x", title: "X", kind: "domain" },
      { id: "element:y", title: "y.ts", kind: "element" },
    ];
    const edges: StudioSourceEdge[] = [{ from: "domain:x", to: "element:y", type: "contains" }];
    expect(selectDefaultStudioNodeId(nodes, edges)).toBe("element:y");
  });
});
