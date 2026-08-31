import { describe, expect, it } from "vitest";
import type { KnowledgeGraphNode } from "../../model";
import { normalizeForMatch } from "@/shared/lib/node-name-match";
import { buildOntologyTree } from "./build-tree";
import {
  countMatchingTreeNodes,
  filterTreeByNodeIds,
  filterTreeByQuery,
  filterTreeExcludeKind,
  knowledgeNodeMatchesQuery,
} from "./filter-tree";

const APPROVED_AT = new Date("2026-04-27T00:00:00Z");
const node = (
  id: string,
  title: string,
  kind = "capability",
  names: Pick<KnowledgeGraphNode, "display" | "displayLocales"> = {},
): KnowledgeGraphNode => ({
  id,
  title,
  ...names,
  kind,
  projectIds: [],
  evidenceIds: [],
  lastApprovedAt: APPROVED_AT,
  lastApprovedBy: "test",
});
// Tree shape comes from `contains` edges — `buildOntologyTree` infers the parent
// from their from/to. This helper only clones; it exists so call sites read as
// "this node has a parent".
function withParent(n: KnowledgeGraphNode): KnowledgeGraphNode {
  return { ...n };
}

describe("filterTreeByQuery", () => {
  // root
  // ├─ child-1 (capability)
  // │  └─ grand-1 (element)
  // └─ child-2 (capability)
  const nodes = [
    node("root", "프로젝트", "project"),
    withParent(node("child-1", "로그인")),
    withParent(node("grand-1", "세션", "element")),
    withParent(node("child-2", "로그아웃")),
  ];
  const edges = [
    {
      id: "e1",
      from: "root",
      to: "child-1",
      type: "contains",
      projectIds: [],
      evidenceIds: [],
      lastApprovedAt: APPROVED_AT,
      lastApprovedBy: "test",
    },
    {
      id: "e2",
      from: "child-1",
      to: "grand-1",
      type: "contains",
      projectIds: [],
      evidenceIds: [],
      lastApprovedAt: APPROVED_AT,
      lastApprovedBy: "test",
    },
    {
      id: "e3",
      from: "root",
      to: "child-2",
      type: "contains",
      projectIds: [],
      evidenceIds: [],
      lastApprovedAt: APPROVED_AT,
      lastApprovedBy: "test",
    },
  ];
  const tree = buildOntologyTree(nodes, edges);

  it("빈 query — input roots 그대로", () => {
    const r = filterTreeByQuery(tree.roots, "");
    expect(r).toEqual(tree.roots);
  });

  it("매치 노드 + 부모 chain 살림 + 형제 제외", () => {
    const r = filterTreeByQuery(tree.roots, "로그인");
    expect(r).toHaveLength(1); // root management
    expect(r[0]?.children).toHaveLength(1); // Only child-1, excluding child-2 (logout)
    expect(r[0]?.children[0]?.node.id).toBe("child-1");
  });

  it("자손 매치 시 부모 chain 으로 살아남음", () => {
    const r = filterTreeByQuery(tree.roots, "세션");
    expect(r).toHaveLength(1); // root
    expect(r[0]?.children).toHaveLength(1); // child-1
    expect(r[0]?.children[0]?.children).toHaveLength(1); // grand-1
    expect(r[0]?.children[0]?.children[0]?.node.id).toBe("grand-1");
  });

  it("매치 노드의 자손은 모두 살림 (컨텍스트 보존)", () => {
    const r = filterTreeByQuery(tree.roots, "로그인");
    // child-1 matches, so its descendant grand-1 is kept for context.
    expect(r[0]?.children[0]?.children).toHaveLength(1);
    expect(r[0]?.children[0]?.children[0]?.node.id).toBe("grand-1");
  });

  it("매치 없음 — 빈 배열", () => {
    const r = filterTreeByQuery(tree.roots, "xyzqwerty");
    expect(r).toHaveLength(0);
  });

  it("slug (node.id) 도 매치 — 사용자가 'mcp-server' 같은 slug 로 검색", () => {
    // Developers see slugs (`kind:tail`) constantly in frontmatter and code.
    // Matching titles only returns nothing for a slug search, which reads as
    // "not in this tree" rather than "not searchable that way".
    const slugNodes = [
      node("root", "프로젝트", "project"),
      withParent(node("capability:mcp-server", "MCP Server (32 tools)")),
    ];
    const slugEdges = [
      {
        id: "e",
        from: "root",
        to: "capability:mcp-server",
        type: "contains",
        projectIds: [],
        evidenceIds: [],
        lastApprovedAt: APPROVED_AT,
        lastApprovedBy: "test",
      },
    ];
    const slugTree = buildOntologyTree(slugNodes, slugEdges);
    const r = filterTreeByQuery(slugTree.roots, "mcp-server");
    expect(r).toHaveLength(1);
    expect(r[0]?.children[0]?.node.id).toBe("capability:mcp-server");
  });

  it("대소문자 무시 (lower-case 비교)", () => {
    const enNodes = [
      node("root", "ROOT", "project"),
      withParent(node("c1", "AUTH-LOGIN")),
    ];
    const enEdges = [
      {
        id: "e",
        from: "root",
        to: "c1",
        type: "contains",
        projectIds: [],
        evidenceIds: [],
        lastApprovedAt: APPROVED_AT,
        lastApprovedBy: "test",
      },
    ];
    const enTree = buildOntologyTree(enNodes, enEdges);
    const r = filterTreeByQuery(enTree.roots, "auth");
    expect(r).toHaveLength(1);
    expect(r[0]?.children).toHaveLength(1);
  });
});

describe("knowledgeNodeMatchesQuery", () => {
  const n = node("capability:mcp-server", "MCP Server");
  it("title 또는 id 소문자 포함이면 true", () => {
    expect(knowledgeNodeMatchesQuery(n, "mcp")).toBe(true); // title
    expect(knowledgeNodeMatchesQuery(n, "server")).toBe(true);
    expect(knowledgeNodeMatchesQuery(n, "capability")).toBe(true); // id
  });
  it("매치 없거나 빈 query 면 false", () => {
    expect(knowledgeNodeMatchesQuery(n, "zzz")).toBe(false);
    expect(knowledgeNodeMatchesQuery(n, "")).toBe(false);
  });

  it("화면의 display 이름을 정확히 또는 부분 입력하면 찾는다", () => {
    const localized = node("capability:place-order", "Place Order", "capability", {
      display: "주문 접수",
      displayLocales: { ko: "주문 접수", en: "Order Intake" },
    });

    expect(knowledgeNodeMatchesQuery(localized, normalizeForMatch("주문 접수"))).toBe(true);
    expect(knowledgeNodeMatchesQuery(localized, normalizeForMatch("접수"))).toBe(true);
  });

  it("현재 화면 언어와 무관하게 display_ko 와 display_en 이름을 찾는다", () => {
    const localized = node("capability:payments", "Payment Processing", "capability", {
      display: "결제 처리",
      displayLocales: { ko: "결제 처리", en: "Payments" },
    });

    expect(knowledgeNodeMatchesQuery(localized, normalizeForMatch("결제 처리"))).toBe(true);
    expect(knowledgeNodeMatchesQuery(localized, normalizeForMatch("payments"))).toBe(true);
  });

  it("표시 이름이 있어도 canonical title 과 id/slug 검색을 보존한다", () => {
    const localized = node("capability:place-order", "Place Order", "capability", {
      display: "주문 접수",
      displayLocales: { ko: "주문 접수", en: "Order Intake" },
    });

    expect(knowledgeNodeMatchesQuery(localized, normalizeForMatch("place order"))).toBe(true);
    expect(knowledgeNodeMatchesQuery(localized, normalizeForMatch("place-order"))).toBe(true);
  });
});

describe("countMatchingTreeNodes", () => {
  const nodes = [
    node("root", "프로젝트", "project"),
    withParent(node("child-1", "로그인")),
    withParent(node("grand-1", "세션", "element")),
    withParent(node("child-2", "로그아웃")),
  ];
  const edges = [
    { id: "e1", from: "root", to: "child-1", type: "contains", projectIds: [], evidenceIds: [], lastApprovedAt: APPROVED_AT, lastApprovedBy: "test" },
    { id: "e2", from: "child-1", to: "grand-1", type: "contains", projectIds: [], evidenceIds: [], lastApprovedAt: APPROVED_AT, lastApprovedBy: "test" },
    { id: "e3", from: "root", to: "child-2", type: "contains", projectIds: [], evidenceIds: [], lastApprovedAt: APPROVED_AT, lastApprovedBy: "test" },
  ];
  const tree = buildOntologyTree(nodes, edges);

  it("빈 query → 0", () => {
    expect(countMatchingTreeNodes(tree.roots, "")).toBe(0);
    expect(countMatchingTreeNodes(tree.roots, "   ")).toBe(0);
  });

  it("매치 노드 수만 카운트 (조상 구조 노드 제외)", () => {
    // Ancestors kept for structure are not counted as matches.
    expect(countMatchingTreeNodes(tree.roots, "로그")).toBe(2);
    expect(countMatchingTreeNodes(tree.roots, "세션")).toBe(1);
  });

  it("매치 없음 → 0", () => {
    expect(countMatchingTreeNodes(tree.roots, "xyzqwerty")).toBe(0);
  });

  it("표시 이름 검색도 필터와 같은 matcher 로 세고 부모 chain 은 count 에 넣지 않는다", () => {
    const localizedNodes = [
      node("project:shop", "Shop", "project", {
        display: "상점",
        displayLocales: { ko: "상점", en: "Shop" },
      }),
      withParent(node("domain:orders", "Orders", "domain", {
        display: "주문",
        displayLocales: { ko: "주문", en: "Orders" },
      })),
      withParent(node("capability:place-order", "Place Order", "capability", {
        display: "주문 접수",
        displayLocales: { ko: "주문 접수", en: "Order Intake" },
      })),
      withParent(node("domain:payments", "Payments", "domain", {
        display: "결제",
        displayLocales: { ko: "결제", en: "Payments" },
      })),
    ];
    const localizedEdges = [
      { id: "e-project-orders", from: "project:shop", to: "domain:orders", type: "contains", projectIds: [], evidenceIds: [], lastApprovedAt: APPROVED_AT, lastApprovedBy: "test" },
      { id: "e-orders-intake", from: "domain:orders", to: "capability:place-order", type: "contains", projectIds: [], evidenceIds: [], lastApprovedAt: APPROVED_AT, lastApprovedBy: "test" },
      { id: "e-project-payments", from: "project:shop", to: "domain:payments", type: "contains", projectIds: [], evidenceIds: [], lastApprovedAt: APPROVED_AT, lastApprovedBy: "test" },
    ];
    const localizedTree = buildOntologyTree(localizedNodes, localizedEdges);

    const exact = filterTreeByQuery(localizedTree.roots, "주문 접수");
    expect(exact).toHaveLength(1);
    expect(exact[0]?.node.id).toBe("project:shop");
    expect(exact[0]?.children.map((child) => child.node.id)).toEqual(["domain:orders"]);
    expect(exact[0]?.children[0]?.children[0]?.node.id).toBe("capability:place-order");

    const normalizedPartial = normalizeForMatch("주문");
    const directMatchCount = localizedNodes.filter((candidate) =>
      knowledgeNodeMatchesQuery(candidate, normalizedPartial),
    ).length;
    expect(directMatchCount).toBe(2);
    expect(countMatchingTreeNodes(localizedTree.roots, "주문")).toBe(directMatchCount);
    expect(countMatchingTreeNodes(localizedTree.roots, "Order Intake")).toBe(1);
  });
});

describe("filterTreeByNodeIds", () => {
  // root
  // ├─ child-1 (capability)
  // │  └─ grand-1 (element)
  // └─ child-2 (capability)
  const nodes = [
    node("root", "프로젝트", "project"),
    withParent(node("child-1", "로그인")),
    withParent(node("grand-1", "세션", "element")),
    withParent(node("child-2", "로그아웃")),
  ];
  const edges = [
    { id: "e1", from: "root", to: "child-1", type: "contains", projectIds: [], evidenceIds: [], lastApprovedAt: APPROVED_AT, lastApprovedBy: "test" },
    { id: "e2", from: "child-1", to: "grand-1", type: "contains", projectIds: [], evidenceIds: [], lastApprovedAt: APPROVED_AT, lastApprovedBy: "test" },
    { id: "e3", from: "root", to: "child-2", type: "contains", projectIds: [], evidenceIds: [], lastApprovedAt: APPROVED_AT, lastApprovedBy: "test" },
  ];
  const tree = buildOntologyTree(nodes, edges);

  it("빈 ids — 빈 배열 (보여줄 변경점 없음)", () => {
    expect(filterTreeByNodeIds(tree.roots, new Set())).toEqual([]);
  });

  it("변경 노드 + 조상 chain 살림, 변경 안 한 형제 제외", () => {
    const r = filterTreeByNodeIds(tree.roots, new Set(["child-1"]));
    expect(r).toHaveLength(1); // root (ancestor)
    expect(r[0]?.node.id).toBe("root");
    expect(r[0]?.children).toHaveLength(1); // Only child-1 (excluding child-2)
    expect(r[0]?.children[0]?.node.id).toBe("child-1");
  });

  it("변경 노드의 자손은 *변경된 것만* 살림 (전 subtree 아님)", () => {
    // Unlike the query filter, an unchanged descendant is hidden even when its
    // parent changed.
    const r = filterTreeByNodeIds(tree.roots, new Set(["child-1"]));
    expect(r[0]?.children[0]?.children).toHaveLength(0);
  });

  it("자손만 변경 시 부모 chain 으로 살아남고, 변경된 자손만 남김", () => {
    const r = filterTreeByNodeIds(tree.roots, new Set(["grand-1"]));
    expect(r).toHaveLength(1); // root
    expect(r[0]?.children).toHaveLength(1); // child-1 (ancestor)
    expect(r[0]?.children[0]?.node.id).toBe("child-1");
    expect(r[0]?.children[0]?.children).toHaveLength(1); // grand-1
    expect(r[0]?.children[0]?.children[0]?.node.id).toBe("grand-1");
  });

  it("여러 변경 노드 — 각자의 조상 경로 합집합", () => {
    const r = filterTreeByNodeIds(tree.roots, new Set(["child-1", "child-2"]));
    expect(r).toHaveLength(1);
    expect(r[0]?.children.map((c) => c.node.id).sort()).toEqual(["child-1", "child-2"]);
  });

  it("트리에 없는 id 는 무시 (제거된 노드 등)", () => {
    const r = filterTreeByNodeIds(tree.roots, new Set(["ghost"]));
    expect(r).toEqual([]);
  });
});

// Prunes the tree view only; the data is untouched and the counts do not read
// this function's output.
describe("filterTreeExcludeKind (슬라이스 C — 비개발 모드 element 행 제외)", () => {
  // root (project)
  // ├─ child-1 (capability)
  // │  └─ grand-1 (element)
  // └─ child-2 (capability)
  const nodes = [
    node("root", "프로젝트", "project"),
    withParent(node("child-1", "로그인", "capability")),
    withParent(node("grand-1", "세션", "element")),
    withParent(node("child-2", "로그아웃", "capability")),
  ];
  const edges = [
    { id: "e1", from: "root", to: "child-1", type: "contains", projectIds: [], evidenceIds: [], lastApprovedAt: APPROVED_AT, lastApprovedBy: "test" },
    { id: "e2", from: "child-1", to: "grand-1", type: "contains", projectIds: [], evidenceIds: [], lastApprovedAt: APPROVED_AT, lastApprovedBy: "test" },
    { id: "e3", from: "root", to: "child-2", type: "contains", projectIds: [], evidenceIds: [], lastApprovedAt: APPROVED_AT, lastApprovedBy: "test" },
  ];
  const tree = buildOntologyTree(nodes, edges);

  it("해당 kind 의 서브트리를 제거한다 (자손 포함)", () => {
    const r = filterTreeExcludeKind(tree.roots, "element");
    expect(r).toHaveLength(1); // root
    expect(r[0]?.children).toHaveLength(2);
    const child1 = r[0]?.children.find((c) => c.node.id === "child-1");
    expect(child1?.children).toHaveLength(0);
  });

  it("구조를 보존한다 — 제외 대상이 아닌 노드는 그대로 남는다", () => {
    const r = filterTreeExcludeKind(tree.roots, "element");
    expect(r[0]?.node.id).toBe("root");
    expect(r[0]?.children.map((c) => c.node.id).sort()).toEqual(["child-1", "child-2"]);
  });

  it("입력을 변경하지 않는다 (불변)", () => {
    const beforeIds = tree.roots.map((r) => r.node.id);
    const beforeChildCounts = tree.roots.map((r) => r.children.length);
    filterTreeExcludeKind(tree.roots, "element");
    expect(tree.roots.map((r) => r.node.id)).toEqual(beforeIds);
    expect(tree.roots.map((r) => r.children.length)).toEqual(beforeChildCounts);
    // The excluded node is still present in the source tree.
    const child1 = tree.roots[0]?.children.find((c) => c.node.id === "child-1");
    expect(child1?.children).toHaveLength(1);
    expect(child1?.children[0]?.node.id).toBe("grand-1");
  });

  it("결정론적이다 — 같은 입력에 같은 출력", () => {
    const r1 = filterTreeExcludeKind(tree.roots, "element");
    const r2 = filterTreeExcludeKind(tree.roots, "element");
    expect(r1).toEqual(r2);
  });

  it("제외 대상 kind 가 root 자체면 그 root 를 제거한다", () => {
    const rootIsElement = [
      node("solo-root", "고아", "element"),
    ];
    const soloTree = buildOntologyTree(rootIsElement, []);
    const r = filterTreeExcludeKind(soloTree.roots, "element");
    expect(r).toEqual([]);
  });

  it("해당 kind 가 없으면 트리 전체를 그대로 반환한다", () => {
    const r = filterTreeExcludeKind(tree.roots, "document");
    expect(r).toHaveLength(1);
    expect(r[0]?.children).toHaveLength(2);
    expect(r[0]?.children.find((c) => c.node.id === "child-1")?.children).toHaveLength(1);
  });
});
