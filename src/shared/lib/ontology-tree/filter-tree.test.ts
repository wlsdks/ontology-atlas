import { describe, expect, it } from "vitest";
import type { KnowledgeGraphNode } from "@/entities/knowledge-graph";
import { buildOntologyTree } from "./build-tree";
import {
  countMatchingTreeNodes,
  filterTreeByNodeIds,
  filterTreeByQuery,
  filterTreeExcludeKind,
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

// 슬라이스 C (개발/비개발 모드 토글) — 비개발(plain) 모드의 INDEX 트리에서
// element 행을 제외한다. 데이터 자체는 무변경 — 이 함수는 트리 뷰만 가지치기
// 한다(카운트/census 는 이 함수의 출력을 쓰지 않는다).
describe("filterTreeExcludeKind (슬라이스 C — 비개발 모드 element 행 제외)", () => {
  // root (project)
  // ├─ child-1 (capability, 로그인)
  // │  └─ grand-1 (element, 세션)
  // └─ child-2 (capability, 로그아웃)
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
    expect(r[0]?.children).toHaveLength(2); // child-1, child-2 그대로
    const child1 = r[0]?.children.find((c) => c.node.id === "child-1");
    expect(child1?.children).toHaveLength(0); // grand-1(element) 제거됨
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
    // grand-1(element) 는 여전히 원본 트리 안에 남아 있다.
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
