import { describe, expect, it } from "vitest";
import type { KnowledgeGraphNode } from "@/entities/knowledge-graph";
import { buildOntologyTree } from "./build-tree";
import {
  countMatchingTreeNodes,
  filterTreeByNodeIds,
  filterTreeByQuery,
  knowledgeNodeMatchesQuery,
} from "./filter-tree";

const APPROVED_AT = new Date("2026-04-27T00:00:00Z");
const node = (id: string, title: string, kind = "capability"): KnowledgeGraphNode => ({
  id,
  title,
  kind,
  projectIds: [],
  evidenceIds: [],
  lastApprovedAt: APPROVED_AT,
  lastApprovedBy: "test",
});
// 트리 구조는 \`contains\` edges 로 표현 (KnowledgeGraphNode.parentId 필드는
// 폐기 — buildOntologyTree 가 \`edge.type==='contains'\` 의 from/to 로 부모
// 추론). 이 helper 는 dead-field-free 노드를 그냥 복제 (호출 site 가독성용).
function withParent(n: KnowledgeGraphNode): KnowledgeGraphNode {
  return { ...n };
}

describe("filterTreeByQuery", () => {
  // root
  // ├─ child-1 (title: "auth-login")
  // │  └─ grand-1 (title: "session")
  // └─ child-2 (title: "logout")
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
    expect(r).toHaveLength(1); // root 살림
    expect(r[0]?.children).toHaveLength(1); // child-1 만, child-2 (로그아웃) 제외
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
    // child-1 매치 → grand-1 (자손) keep
    expect(r[0]?.children[0]?.children).toHaveLength(1);
    expect(r[0]?.children[0]?.children[0]?.node.id).toBe("grand-1");
  });

  it("매치 없음 — 빈 배열", () => {
    const r = filterTreeByQuery(tree.roots, "xyzqwerty");
    expect(r).toHaveLength(0);
  });

  it("slug (node.id) 도 매치 — 사용자가 'mcp-server' 같은 slug 로 검색", () => {
    // 개발자는 frontmatter / 코드에서 slug 형태 (kind:tail) 를 일상적으로 본다.
    // 검색이 title 만 매칭하면 'mcp-server' 같은 slug 검색이 빈 결과로 떨어져
    // 사용자가 이 트리에 없다고 오해. id 도 매치 대상에 포함.
    const slugNodes = [
      node("root", "프로젝트", "project"),
      withParent(node("capability:mcp-server", "MCP Server (24 tools)")),
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
    // "로그" → 로그인 + 로그아웃 = 2 (root/세션 은 비매치)
    expect(countMatchingTreeNodes(tree.roots, "로그")).toBe(2);
    // "세션" → grand-1 1개 (조상 root/child-1 은 카운트 안 함)
    expect(countMatchingTreeNodes(tree.roots, "세션")).toBe(1);
  });

  it("매치 없음 → 0", () => {
    expect(countMatchingTreeNodes(tree.roots, "xyzqwerty")).toBe(0);
  });
});

describe("filterTreeByNodeIds", () => {
  // root
  // ├─ child-1 (로그인)
  // │  └─ grand-1 (세션)
  // └─ child-2 (로그아웃)
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
    expect(r).toHaveLength(1); // root (조상)
    expect(r[0]?.node.id).toBe("root");
    expect(r[0]?.children).toHaveLength(1); // child-1 만 (child-2 제외)
    expect(r[0]?.children[0]?.node.id).toBe("child-1");
  });

  it("변경 노드의 자손은 *변경된 것만* 살림 (전 subtree 아님)", () => {
    // child-1 변경 but grand-1 미변경 → grand-1 은 숨김 (query filter 와 다른 점)
    const r = filterTreeByNodeIds(tree.roots, new Set(["child-1"]));
    expect(r[0]?.children[0]?.children).toHaveLength(0);
  });

  it("자손만 변경 시 부모 chain 으로 살아남고, 변경된 자손만 남김", () => {
    const r = filterTreeByNodeIds(tree.roots, new Set(["grand-1"]));
    expect(r).toHaveLength(1); // root
    expect(r[0]?.children).toHaveLength(1); // child-1 (조상)
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
