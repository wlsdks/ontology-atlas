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
    // 근거는 사람이 읽을 낱말 — 같은 폴더에 있다는 사실(elements)은 뺀다.
    expect(rows[0].sharedTokens).toEqual(["drawer", "node"]);
  });

  it("상한을 넘겨도 전체 의심 수는 남긴다 — 조용히 줄이지 않는다", () => {
    const { rows, suspectCount } = buildDuplicatePairs(nodes, edges, 0);
    expect(rows).toHaveLength(0);
    expect(suspectCount).toBe(1);
  });

  it("자기 문서가 없는 노드는 후보에서 뺀다 — 합칠 파일이 없기 때문", () => {
    // 다른 문서의 `elements:` 에 적힌 코드 경로에서 태어난 노드 — 근거 slug 가
    // 자기 것이 아니라 자기를 부른 문서의 것이다. 원본과 그 테스트 파일은
    // 이름이 거의 같아 그냥 두면 중복 1위로 올라온다.
    const derived = [
      ...nodes,
      {
        ...node("element:scriptsfoomjs", "element", "Scripts foo"),
        evidenceIds: ["elements/node-drawer"],
      },
      {
        ...node("element:scriptsfootestmjs", "element", "Scripts foo test"),
        evidenceIds: ["elements/node-drawer"],
      },
    ];

    const { rows } = buildDuplicatePairs(derived, edges, 5);
    expect(rows.every((row) => !row.keepSlug.includes("scripts"))).toBe(true);
    expect(rows).toHaveLength(1);
  });

  it("빈 볼트/한 개짜리 볼트는 한 쌍도 만들지 않는다 — 카드가 렌더되지 않는 조건", () => {
    expect(buildDuplicatePairs([], [], 5).rows).toHaveLength(0);
    expect(buildDuplicatePairs([nodes[1]], [], 5).rows).toHaveLength(0);
  });

  it("임계값이 이름 없이 도달 가능한 상한보다 낮으면 전수 비교로 되돌린다", () => {
    // 종류(0.1) + 소속(0.1) 만으로 0.2 — 낱말이 하나도 안 겹치는 쌍도
    // 이 임계값에서는 후보다. 역색인으로 좁히면 놓친다.
    const { rows } = buildDuplicatePairs(nodes, edges, 20, 0.2);
    expect(rows.some((row) => row.sharedTokens.length === 0)).toBe(true);
  });
});
