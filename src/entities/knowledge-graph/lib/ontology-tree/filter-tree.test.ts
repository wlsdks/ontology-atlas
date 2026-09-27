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

  it("returns the input roots for an empty query", () => {
    const r = filterTreeByQuery(tree.roots, "");
    expect(r).toEqual(tree.roots);
  });

  it("keeps matches and their ancestors and drops siblings", () => {
    const r = filterTreeByQuery(tree.roots, "로그인");
    expect(r).toHaveLength(1); // root management
    expect(r[0]?.children).toHaveLength(1); // Only child-1, excluding child-2 (logout)
    expect(r[0]?.children[0]?.node.id).toBe("child-1");
  });

  it("keeps ancestors of a matching descendant", () => {
    const r = filterTreeByQuery(tree.roots, "세션");
    expect(r).toHaveLength(1); // root
    expect(r[0]?.children).toHaveLength(1); // child-1
    expect(r[0]?.children[0]?.children).toHaveLength(1); // grand-1
    expect(r[0]?.children[0]?.children[0]?.node.id).toBe("grand-1");
  });

  it("keeps every descendant of a match", () => {
    const r = filterTreeByQuery(tree.roots, "로그인");
    // child-1 matches, so its descendant grand-1 is kept for context.
    expect(r[0]?.children[0]?.children).toHaveLength(1);
    expect(r[0]?.children[0]?.children[0]?.node.id).toBe("grand-1");
  });

  it("returns an empty array without matches", () => {
    const r = filterTreeByQuery(tree.roots, "xyzqwerty");
    expect(r).toHaveLength(0);
  });

  it("matches a slug such as 'mcp-server'", () => {
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

  it("matches case-insensitively", () => {
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
  it("matches a lowercase title or id slug", () => {
    expect(knowledgeNodeMatchesQuery(n, "mcp")).toBe(true); // title
    expect(knowledgeNodeMatchesQuery(n, "server")).toBe(true);
    expect(knowledgeNodeMatchesQuery(n, "mcp-server")).toBe(true); // id slug
  });

  it("does not match the kind prefix of an id", () => {
    // It used to, so the word pulled every node of that kind into the tree; the
    // kind filter already selects them, properly. A pasted whole id still answers.
    expect(knowledgeNodeMatchesQuery(n, "capability")).toBe(false);
    expect(knowledgeNodeMatchesQuery(n, "capability:mcp")).toBe(true);
  });

  it("matches queries typed on a Korean keyboard layout like the palette", () => {
    // Measured 2026-09-19: INDEX said "no matching concept" to both of these while
    // the palette on the same screen resolved them against the same vault.
    const cart = node("capability:cart", "장바구니");
    expect(knowledgeNodeMatchesQuery(cart, "ㅈㅂㄱㄴ")).toBe(true);
    expect(knowledgeNodeMatchesQuery(cart, "장바ㄱ")).toBe(true);
    expect(knowledgeNodeMatchesQuery(cart, "ㅈㅁㅅ")).toBe(false);
  });
  it("returns false for no match or an empty query", () => {
    expect(knowledgeNodeMatchesQuery(n, "zzz")).toBe(false);
    expect(knowledgeNodeMatchesQuery(n, "")).toBe(false);
  });

  it("matches a display name fully or partly", () => {
    const localized = node("capability:place-order", "Place Order", "capability", {
      display: "주문 접수",
      displayLocales: { ko: "주문 접수", en: "Order Intake" },
    });

    expect(knowledgeNodeMatchesQuery(localized, normalizeForMatch("주문 접수"))).toBe(true);
    expect(knowledgeNodeMatchesQuery(localized, normalizeForMatch("접수"))).toBe(true);
  });

  it("matches display_ko and display_en in any locale", () => {
    const localized = node("capability:payments", "Payment Processing", "capability", {
      display: "결제 처리",
      displayLocales: { ko: "결제 처리", en: "Payments" },
    });

    expect(knowledgeNodeMatchesQuery(localized, normalizeForMatch("결제 처리"))).toBe(true);
    expect(knowledgeNodeMatchesQuery(localized, normalizeForMatch("payments"))).toBe(true);
  });

  it("still matches canonical title and id when display names exist", () => {
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

  it("counts 0 for an empty query", () => {
    expect(countMatchingTreeNodes(tree.roots, "")).toBe(0);
    expect(countMatchingTreeNodes(tree.roots, "   ")).toBe(0);
  });

  it("counts only matching nodes, not ancestors", () => {
    // Ancestors kept for structure are not counted as matches.
    expect(countMatchingTreeNodes(tree.roots, "로그")).toBe(2);
    expect(countMatchingTreeNodes(tree.roots, "세션")).toBe(1);
  });

  it("counts 0 without matches", () => {
    expect(countMatchingTreeNodes(tree.roots, "xyzqwerty")).toBe(0);
  });

  it("counts display-name matches with the filter's matcher, excluding ancestors", () => {
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

  it("returns an empty array for empty ids", () => {
    expect(filterTreeByNodeIds(tree.roots, new Set())).toEqual([]);
  });

  it("keeps changed nodes and ancestors and drops unchanged siblings", () => {
    const r = filterTreeByNodeIds(tree.roots, new Set(["child-1"]));
    expect(r).toHaveLength(1); // root (ancestor)
    expect(r[0]?.node.id).toBe("root");
    expect(r[0]?.children).toHaveLength(1); // Only child-1 (excluding child-2)
    expect(r[0]?.children[0]?.node.id).toBe("child-1");
  });

  it("keeps only the changed descendants of a changed node", () => {
    // Unlike the query filter, an unchanged descendant is hidden even when its
    // parent changed.
    const r = filterTreeByNodeIds(tree.roots, new Set(["child-1"]));
    expect(r[0]?.children[0]?.children).toHaveLength(0);
  });

  it("keeps ancestors and only the changed descendant", () => {
    const r = filterTreeByNodeIds(tree.roots, new Set(["grand-1"]));
    expect(r).toHaveLength(1); // root
    expect(r[0]?.children).toHaveLength(1); // child-1 (ancestor)
    expect(r[0]?.children[0]?.node.id).toBe("child-1");
    expect(r[0]?.children[0]?.children).toHaveLength(1); // grand-1
    expect(r[0]?.children[0]?.children[0]?.node.id).toBe("grand-1");
  });

  it("unions the ancestor paths of several changed nodes", () => {
    const r = filterTreeByNodeIds(tree.roots, new Set(["child-1", "child-2"]));
    expect(r).toHaveLength(1);
    expect(r[0]?.children.map((c) => c.node.id).sort()).toEqual(["child-1", "child-2"]);
  });

  it("ignores ids missing from the tree", () => {
    const r = filterTreeByNodeIds(tree.roots, new Set(["ghost"]));
    expect(r).toEqual([]);
  });
});

// Prunes the tree view only; the data is untouched and the counts do not read
// this function's output.
describe("filterTreeExcludeKind", () => {
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

  it("removes subtrees of the excluded kind", () => {
    const r = filterTreeExcludeKind(tree.roots, "element");
    expect(r).toHaveLength(1); // root
    expect(r[0]?.children).toHaveLength(2);
    const child1 = r[0]?.children.find((c) => c.node.id === "child-1");
    expect(child1?.children).toHaveLength(0);
  });

  it("keeps nodes of other kinds in place", () => {
    const r = filterTreeExcludeKind(tree.roots, "element");
    expect(r[0]?.node.id).toBe("root");
    expect(r[0]?.children.map((c) => c.node.id).sort()).toEqual(["child-1", "child-2"]);
  });

  it("does not mutate the input", () => {
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

  it("returns the same output for the same input", () => {
    const r1 = filterTreeExcludeKind(tree.roots, "element");
    const r2 = filterTreeExcludeKind(tree.roots, "element");
    expect(r1).toEqual(r2);
  });

  it("removes a root of the excluded kind", () => {
    const rootIsElement = [
      node("solo-root", "고아", "element"),
    ];
    const soloTree = buildOntologyTree(rootIsElement, []);
    const r = filterTreeExcludeKind(soloTree.roots, "element");
    expect(r).toEqual([]);
  });

  it("returns the whole tree when the kind is absent", () => {
    const r = filterTreeExcludeKind(tree.roots, "document");
    expect(r).toHaveLength(1);
    expect(r[0]?.children).toHaveLength(2);
    expect(r[0]?.children.find((c) => c.node.id === "child-1")?.children).toHaveLength(1);
  });
});
