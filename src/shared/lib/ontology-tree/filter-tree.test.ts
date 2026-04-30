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
  parentId: undefined,
  lastApprovedAt: APPROVED_AT,
  lastApprovedBy: "test",
});
function withParent(n: KnowledgeGraphNode, parentId: string): KnowledgeGraphNode {
  return { ...n, parentId };
}

describe("filterTreeByQuery", () => {
  // root
  // ├─ child-1 (title: "auth-login")
  // │  └─ grand-1 (title: "session")
  // └─ child-2 (title: "logout")
  const nodes = [
    node("root", "프로젝트", "project"),
    withParent(node("child-1", "로그인"), "root"),
    withParent(node("grand-1", "세션", "element"), "child-1"),
    withParent(node("child-2", "로그아웃"), "root"),
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

  it("대소문자 무시 (lower-case 비교)", () => {
    const enNodes = [
      node("root", "ROOT", "project"),
      withParent(node("c1", "AUTH-LOGIN"), "root"),
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
