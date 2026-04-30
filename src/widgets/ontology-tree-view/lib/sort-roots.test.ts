import { describe, expect, it } from "vitest";
import { sortRoots, sortRootsByKindAndTitle } from "./sort-roots";
import type { OntologyTreeNode } from "@/shared/lib/ontology-tree";

function makeRoot(
  id: string,
  kind: string,
  title: string,
  evidenceIds: string[] = [],
): OntologyTreeNode {
  return {
    node: {
      id,
      title,
      kind,
      projectIds: [],
      evidenceIds,
      lastApprovedAt: new Date(),
      lastApprovedBy: "system",
    },
    depth: 0,
    children: [],
  };
}

describe("sortRootsByKindAndTitle", () => {
  it("returns empty for empty input", () => {
    expect(sortRootsByKindAndTitle([])).toEqual([]);
  });

  it("does not mutate the input array", () => {
    const input = [
      makeRoot("e1", "element", "Z"),
      makeRoot("p1", "project", "A"),
    ];
    const before = [...input];
    sortRootsByKindAndTitle(input);
    expect(input).toEqual(before);
  });

  it("orders project < domain < capability < element < document", () => {
    const input = [
      makeRoot("e1", "element", "z-elem"),
      makeRoot("d1", "document", "z-doc"),
      makeRoot("c1", "capability", "z-cap"),
      makeRoot("dom1", "domain", "z-dom"),
      makeRoot("p1", "project", "z-proj"),
    ];
    const sorted = sortRootsByKindAndTitle(input);
    expect(sorted.map((r) => r.node.kind)).toEqual([
      "project",
      "domain",
      "capability",
      "element",
      "document",
    ]);
  });

  it("alphabetizes by title within the same kind (Korean locale)", () => {
    const input = [
      makeRoot("p3", "project", "다"),
      makeRoot("p1", "project", "가"),
      makeRoot("p2", "project", "나"),
    ];
    const sorted = sortRootsByKindAndTitle(input);
    expect(sorted.map((r) => r.node.title)).toEqual(["가", "나", "다"]);
  });

  it("places unknown kinds last (kept stable)", () => {
    const input = [
      makeRoot("u1", "alien-kind", "Alien"),
      makeRoot("p1", "project", "Project"),
      makeRoot("d1", "domain", "Domain"),
    ];
    const sorted = sortRootsByKindAndTitle(input);
    expect(sorted.map((r) => r.node.kind)).toEqual([
      "project",
      "domain",
      "alien-kind",
    ]);
  });

  it("mixed kinds with mixed titles — kind first, then title", () => {
    const input = [
      makeRoot("d2", "domain", "B"),
      makeRoot("p2", "project", "B"),
      makeRoot("d1", "domain", "A"),
      makeRoot("p1", "project", "A"),
    ];
    const sorted = sortRootsByKindAndTitle(input);
    expect(sorted.map((r) => `${r.node.kind}/${r.node.title}`)).toEqual([
      "project/A",
      "project/B",
      "domain/A",
      "domain/B",
    ]);
  });
});

describe("sortRoots — Fire 2 multi-key", () => {
  const corpus = [
    makeRoot("p1", "project", "프로젝트 A", ["e1", "e2"]),
    makeRoot("c1", "capability", "능력 가", ["e3", "e4", "e5", "e6"]),
    makeRoot("c2", "capability", "능력 나", []),
    makeRoot("d1", "domain", "도메인 다", ["e7"]),
    makeRoot("e1", "element", "요소 라", ["e8", "e9", "e10"]),
  ];

  it("default key 'kind-title' = sortRootsByKindAndTitle 와 동일", () => {
    const a = sortRoots(corpus);
    const b = sortRootsByKindAndTitle(corpus);
    expect(a.map((r) => r.node.id)).toEqual(b.map((r) => r.node.id));
  });

  it("'evidence-desc' — 근거 많은 노드 먼저, 동률은 가나다", () => {
    const sorted = sortRoots(corpus, "evidence-desc");
    expect(sorted.map((r) => r.node.id)).toEqual([
      "c1", // 4
      "e1", // 3
      "p1", // 2
      "d1", // 1
      "c2", // 0
    ]);
  });

  it("'evidence-desc' — evidenceCount 우선 (있으면) > evidenceIds.length", () => {
    const withCount = [
      {
        node: {
          id: "x",
          title: "X",
          kind: "capability",
          projectIds: [],
          evidenceIds: ["e1"],
          evidenceCount: 99,
          lastApprovedAt: new Date(),
          lastApprovedBy: "test",
        },
        depth: 0,
        children: [],
      },
      makeRoot("y", "capability", "Y", ["e1", "e2", "e3"]),
    ];
    const sorted = sortRoots(withCount, "evidence-desc");
    expect(sorted.map((r) => r.node.id)).toEqual(["x", "y"]);
  });

  it("'title' — kind 무시 가나다순", () => {
    const sorted = sortRoots(corpus, "title");
    expect(sorted.map((r) => r.node.title)).toEqual([
      "능력 가",
      "능력 나",
      "도메인 다",
      "요소 라",
      "프로젝트 A",
    ]);
  });

  it("immutable — 입력 배열 변형 없음", () => {
    const before = [...corpus];
    sortRoots(corpus, "evidence-desc");
    sortRoots(corpus, "title");
    expect(corpus).toEqual(before);
  });
});
