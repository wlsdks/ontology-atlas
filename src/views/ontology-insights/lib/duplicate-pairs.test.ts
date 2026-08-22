import { describe, expect, it } from "vitest";
import type { KnowledgeGraphEdge, KnowledgeGraphNode } from "@/entities/knowledge-graph";
import { buildDuplicatePairs, scoreNodeSimilarity, similarityTokens } from "./duplicate-pairs";

function node(
  id: string,
  kind: string,
  title: string,
  slug = id.split(":").pop() ?? id,
): KnowledgeGraphNode {
  return {
    id,
    title,
    kind,
    projectIds: [],
    evidenceIds: [slug],
    lastApprovedAt: new Date(0),
    lastApprovedBy: "vault-frontmatter",
  };
}
function edge(id: string, from: string, to: string, type: string): KnowledgeGraphEdge {
  return {
    id,
    from,
    to,
    type,
    projectIds: [],
    evidenceIds: [],
    lastApprovedAt: new Date(0),
    lastApprovedBy: "vault-frontmatter",
  };
}

describe("similarityTokens", () => {
  it("소문자 영숫자 덩어리만 남기고 1자는 버린다", () => {
    expect(similarityTokens("Ontology-Drawer v2 a")).toEqual(["ontology", "drawer", "v2"]);
  });
});

describe("scoreNodeSimilarity", () => {
  it("이름·종류·소속·이웃이 전부 같으면 1", () => {
    const shared = {
      slug: "elements/drawer",
      title: "Node drawer",
      kind: "capability",
      domain: "domains/map",
    };
    const neighbors = new Set(["n1"]);
    expect(
      scoreNodeSimilarity({ ...shared, neighbors }, { ...shared, neighbors }).total,
    ).toBe(1);
  });

  it("소속이 없는 두 노드는 소속 점수를 서로 나눠 갖지 않는다", () => {
    const left = { slug: "a", title: "A", kind: "element", domain: null, neighbors: new Set<string>() };
    expect(scoreNodeSimilarity(left, { ...left }).domain).toBe(0);
  });
});

describe("buildDuplicatePairs", () => {
  const nodes = [
    node("domain:map", "domain", "Map", "domains/map"),
    node("element:node-drawer", "element", "Node drawer", "elements/node-drawer"),
    node("element:node-drawer-model", "element", "Node drawer model", "elements/node-drawer-model"),
    node("element:camera-easing", "element", "Camera easing", "elements/camera-easing"),
  ];
  const edges = [
    edge("c1", "domain:map", "element:node-drawer", "contains"),
    edge("c2", "domain:map", "element:node-drawer-model", "contains"),
    edge("c3", "domain:map", "element:camera-easing", "contains"),
  ];

  it("이름이 크게 겹치는 쌍만 올리고, 연결이 많은 쪽을 남길 쪽으로 제안한다", () => {
    const { rows, suspectCount } = buildDuplicatePairs(nodes, edges, 5);

    expect(rows).toHaveLength(1);
    expect(suspectCount).toBe(1);
    expect(rows[0].keepSlug).toBe("elements/node-drawer");
    expect(rows[0].dissolveSlug).toBe("elements/node-drawer-model");
    expect(rows[0].kind).toBe("element");
    expect(rows[0].score).toBeGreaterThan(0.6);
    // The evidence is words a person reads — the fact of sharing a folder (`elements`) is removed.
    expect(rows[0].sharedTokens).toEqual(["drawer", "node"]);
  });

  it("상한을 넘겨도 전체 의심 수는 남긴다 — 조용히 줄이지 않는다", () => {
    const { rows, suspectCount } = buildDuplicatePairs(nodes, edges, 0);
    expect(rows).toHaveLength(0);
    expect(suspectCount).toBe(1);
  });

  it("자기 문서가 없는 노드는 후보에서 뺀다 — 합칠 파일이 없기 때문", () => {
    // A node born from a code path written in another document's `elements:` — its evidence slug
    // belongs not to itself but to the document that named it. A source file and its test file have
    // near-identical names, so left alone they rise to the top as the leading duplicate.
    const derived = [
      ...nodes,
      {
        ...node("element:scriptsfoomjs", "element", "Scripts foo"),
        evidenceIds: ["elements/node-drawer"],
        hasOwnDocument: false,
      },
      {
        ...node("element:scriptsfootestmjs", "element", "Scripts foo test"),
        evidenceIds: ["elements/node-drawer"],
        hasOwnDocument: false,
      },
    ];

    const { rows } = buildDuplicatePairs(derived, edges, 5);
    expect(rows.every((row) => !row.keepSlug.includes("scripts"))).toBe(true);
    expect(rows).toHaveLength(1);
  });

  it("id 꼬리가 파일 이름과 달라도 문서가 있으면 후보다 — 프로젝트 노드", () => {
    // A project id is built from frontmatter `slug:` (`ontology/project.md` →
    // `project:ontology-atlas`) and differs from the filename tail. While the screen inferred its
    // own document as "id tail == document slug tail", this node was silently missed.
    const project: KnowledgeGraphNode = {
      ...node("project:ontology-atlas", "project", "Ontology Atlas"),
      evidenceIds: ["ontology/project"],
    };
    const twin: KnowledgeGraphNode = {
      ...node("project:ontology-atlas-2", "project", "Ontology Atlas"),
      evidenceIds: ["ontology/project-2"],
    };

    const { rows } = buildDuplicatePairs([project, twin], [], 5);
    expect(rows.map((row) => [row.keepSlug, row.dissolveSlug])).toEqual([
      ["ontology/project", "ontology/project-2"],
    ]);
  });

  it("빈 볼트/한 개짜리 볼트는 한 쌍도 만들지 않는다 — 카드가 렌더되지 않는 조건", () => {
    expect(buildDuplicatePairs([], [], 5).rows).toHaveLength(0);
    expect(buildDuplicatePairs([nodes[1]], [], 5).rows).toHaveLength(0);
  });

  it("임계값이 이름 없이 도달 가능한 상한보다 낮으면 전수 비교로 되돌린다", () => {
    // Kind (0.1) plus parent (0.1) gives 0.2 — at this threshold even a pair sharing no words is a
    // candidate. Narrowing with the inverted index would miss it.
    const { rows } = buildDuplicatePairs(nodes, edges, 20, 0.2);
    expect(rows.some((row) => row.sharedTokens.length === 0)).toBe(true);
  });
});
