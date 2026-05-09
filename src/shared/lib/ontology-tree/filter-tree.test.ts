import { describe, expect, it } from "vitest";
import type { KnowledgeGraphNode } from "@/entities/knowledge-graph";
import { buildOntologyTree } from "./build-tree";
import { filterTreeByQuery } from "./filter-tree";

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
      withParent(node("capability:mcp-server", "MCP Server (20 tools)")),
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
