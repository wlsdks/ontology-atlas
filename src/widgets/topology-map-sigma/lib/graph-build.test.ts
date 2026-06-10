import { describe, expect, it } from "vitest";
import { ONTOLOGY_KIND_TONE } from "@/entities/ontology-class";
import type { Project } from "@/entities/project";
import type { OntologyCountsForProject } from "@/shared/lib/ontology-tree";
import { buildGraph, TOPOLOGY_DOMAIN_TONE } from "./graph-build";

function project(overrides: Partial<Project> = {}): Project {
  return {
    slug: "alpha",
    name: "Alpha",
    category: "frontend",
    status: "active",
    description: "",
    tags: [],
    stack: [],
    links: [],
    dependencies: [],
    isHub: false,
    screenshots: [],
    timeline: { start: undefined, end: undefined } as Project["timeline"],
    position: { x: 0, y: 0 } as Project["position"],
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as Project;
}

function counts(
  byKind: Partial<OntologyCountsForProject["byKind"]> = {},
): OntologyCountsForProject {
  const filled = {
    domain: byKind.domain ?? 0,
    capability: byKind.capability ?? 0,
    element: byKind.element ?? 0,
    unknown: byKind.unknown ?? 0,
  };
  return {
    byKind: filled,
    total: filled.domain + filled.capability + filled.element + filled.unknown,
  };
}

function rgbDistance(a: string, b: string): number {
  const parse = (value: string) => {
    const match = value.match(/rgba\((\d+),\s*(\d+),\s*(\d+),/);
    if (!match) throw new Error(`Cannot parse rgba color: ${value}`);
    return match.slice(1, 4).map(Number);
  };
  const [ar, ag, ab] = parse(a);
  const [br, bg, bb] = parse(b);
  return Math.hypot(ar - br, ag - bg, ab - bb);
}

describe("buildGraph — searchText (검색 hot-path precompute)", () => {
  it("각 노드에 lowercased `projectSlug\\nlabel` searchText 를 미리 계산", () => {
    const graph = buildGraph(
      [project({ slug: "demo-iam", name: "Authentication Service" })],
      [],
    );
    const searchText = graph.getNodeAttribute("demo-iam", "searchText");
    expect(searchText).toBeDefined();
    // 전부 소문자 (build 시 1회 정규화).
    expect(searchText).toBe(searchText!.toLowerCase());
    // slug 와 label 양쪽을 포함 — 기존 matchesSearch 의 두 필드 매칭 보존.
    expect(searchText).toContain("demo-iam");
    expect(searchText).toContain("authentication service");
  });
});

describe("buildGraph — overviewLandmark (overview 항상-라벨 최상위 N)", () => {
  it("연결 많은 hub 는 overviewLandmark, 고립 노드(degree 0)는 아님", () => {
    const projects = [
      project({ slug: "hub" }),
      project({ slug: "a", dependencies: ["hub"] }),
      project({ slug: "b", dependencies: ["hub"] }),
      project({ slug: "c", dependencies: ["hub"] }),
      project({ slug: "lonely" }),
    ];
    const graph = buildGraph(projects, []);
    // hub 가 가장 많이 연결 → overview 랜드마크
    expect(graph.getNodeAttribute("hub", "overviewLandmark")).toBe(true);
    // 아무와도 연결 안 된 노드는 랜드마크 자격 없음(degree 0 제외)
    expect(graph.getNodeAttribute("lonely", "overviewLandmark")).toBeFalsy();
  });
});

describe("buildGraph — project slug-prefix fallback colors", () => {
  it("keeps domain fallback tones categorical instead of near-neutral", () => {
    const tones = Object.values(TOPOLOGY_DOMAIN_TONE);
    expect(new Set(tones).size).toBe(tones.length);

    for (let i = 0; i < tones.length; i += 1) {
      for (let j = i + 1; j < tones.length; j += 1) {
        expect(rgbDistance(tones[i], tones[j])).toBeGreaterThanOrEqual(60);
      }
    }
  });

  it("applies visibly different fallback tones before ontology extension is loaded", () => {
    const graph = buildGraph(
      [
        project({ slug: "frontend-shell", name: "Frontend Shell" }),
        project({ slug: "backend-api", name: "Backend API" }),
        project({ slug: "data-indexer", name: "Data Indexer" }),
      ],
      [],
    );

    expect(graph.getNodeAttribute("frontend-shell", "color")).toBe(
      TOPOLOGY_DOMAIN_TONE.frontend,
    );
    expect(graph.getNodeAttribute("backend-api", "color")).toBe(
      TOPOLOGY_DOMAIN_TONE.backend,
    );
    expect(graph.getNodeAttribute("data-indexer", "color")).toBe(
      TOPOLOGY_DOMAIN_TONE.data,
    );
  });
});

describe("buildGraph — ontologyCountsBySlug", () => {
  it("plain project 노드는 ontology 도미넌트 kind 별 borderColor 분기", () => {
    const projects = [
      project({ slug: "p-domain", isHub: false }),
      project({ slug: "p-capability", isHub: false }),
      project({ slug: "p-element", isHub: false }),
      project({ slug: "p-unknown", isHub: false }),
      project({ slug: "p-empty", isHub: false }),
    ];
    const ontologyCountsBySlug = new Map<string, OntologyCountsForProject>([
      ["p-domain", counts({ domain: 3 })],
      ["p-capability", counts({ capability: 5 })],
      ["p-element", counts({ element: 4 })],
      ["p-unknown", counts({ unknown: 1, capability: 9 })],
    ]);

    const graph = buildGraph(projects, [], { ontologyCountsBySlug });

    expect(graph.getNodeAttribute("p-domain", "borderColor")).toBe(
      ONTOLOGY_KIND_TONE.domain.border,
    );
    expect(graph.getNodeAttribute("p-domain", "ontologyTopKind")).toBe("domain");

    expect(graph.getNodeAttribute("p-capability", "borderColor")).toBe(
      ONTOLOGY_KIND_TONE.capability.border,
    );
    expect(graph.getNodeAttribute("p-capability", "ontologyTopKind")).toBe(
      "capability",
    );

    expect(graph.getNodeAttribute("p-element", "borderColor")).toBe(
      ONTOLOGY_KIND_TONE.element.border,
    );

    // unknown 우선 (검수 신호) — capability=9 가 더 많아도 unknown 톤
    expect(graph.getNodeAttribute("p-unknown", "borderColor")).toBe(
      ONTOLOGY_KIND_TONE.unknown.border,
    );
    expect(graph.getNodeAttribute("p-unknown", "ontologyTopKind")).toBe(
      "unknown",
    );

    // ontology 0 — 기본 NODE_BORDER (현행)
    expect(graph.getNodeAttribute("p-empty", "borderColor")).toBe(
      "rgba(200, 210, 230, 0.3)",
    );
    expect(graph.getNodeAttribute("p-empty", "ontologyTopKind")).toBeUndefined();
  });

  it("hub 노드는 ontology 분기 적용 안 함 (HUB_BORDER 유지)", () => {
    const projects = [project({ slug: "h-1", isHub: true })];
    const ontologyCountsBySlug = new Map<string, OntologyCountsForProject>([
      ["h-1", counts({ domain: 100 })],
    ]);
    const graph = buildGraph(projects, [], { ontologyCountsBySlug });
    expect(graph.getNodeAttribute("h-1", "borderColor")).toBe(
      "rgba(139, 151, 255, 0.55)",
    );
    expect(graph.getNodeAttribute("h-1", "ontologyTopKind")).toBeUndefined();
  });

  it("ontologyCountsBySlug 미제공 시 모든 노드 NODE_BORDER (현행 유지)", () => {
    const projects = [project({ slug: "p-1", isHub: false })];
    const graph = buildGraph(projects, []);
    expect(graph.getNodeAttribute("p-1", "borderColor")).toBe(
      "rgba(200, 210, 230, 0.3)",
    );
    expect(graph.getNodeAttribute("p-1", "ontologyTopKind")).toBeUndefined();
  });

  it("ontology extension maps plain project nodes to the project kind fill", () => {
    const graph = buildGraph([project({ slug: "p-1", isHub: false })], [], {
      ontologyExtension: { nodes: [], edges: [] },
    });

    expect(graph.getNodeAttribute("p-1", "color")).toBe(
      ONTOLOGY_KIND_TONE.project.fill,
    );
    expect(graph.getNodeAttribute("p-1", "borderColor")).toBe(
      ONTOLOGY_KIND_TONE.project.border,
    );
    expect(graph.getNodeAttribute("p-1", "ontologyTopKind")).toBe("project");
  });
});

describe("buildGraph — project 의존성 엣지 분류 (depProject 룩업)", () => {
  // projectBySlug Map 으로 dep→project 를 O(1) 조회하도록 바꾼 뒤,
  // 그 조회 결과(depProject.isHub)에 따른 엣지 분류가 그대로인지 가드.
  it("비허브→허브는 contains, 비허브→비허브는 depends_on", () => {
    const projects = [
      project({ slug: "hub", isHub: true }),
      project({ slug: "app", isHub: false, dependencies: ["hub"] }),
      project({ slug: "lib", isHub: false, dependencies: ["app"] }),
    ];
    const graph = buildGraph(projects, []);

    expect(graph.hasEdge("app", "hub")).toBe(true);
    expect(graph.getEdgeAttribute(graph.edge("app", "hub"), "relationType")).toBe(
      "contains",
    );
    expect(graph.getEdgeAttribute(graph.edge("app", "hub"), "kind")).toBe("contains");

    expect(graph.hasEdge("lib", "app")).toBe(true);
    expect(graph.getEdgeAttribute(graph.edge("lib", "app"), "relationType")).toBe(
      "depends_on",
    );
  });

  it("허브→허브는 depends_on + 두꺼운 curvature(0.28)", () => {
    const projects = [
      project({ slug: "h1", isHub: true, dependencies: ["h2"] }),
      project({ slug: "h2", isHub: true }),
    ];
    const graph = buildGraph(projects, []);
    const edge = graph.edge("h1", "h2");
    expect(graph.getEdgeAttribute(edge, "relationType")).toBe("depends_on");
    expect(graph.getEdgeAttribute(edge, "curvature")).toBe(0.28);
  });

  it("존재하지 않는 dep slug 는 엣지를 만들지 않는다", () => {
    const projects = [project({ slug: "solo", isHub: false, dependencies: ["ghost"] })];
    const graph = buildGraph(projects, []);
    expect(graph.hasNode("ghost")).toBe(false);
    expect(graph.size).toBe(0); // 엣지 0
  });
});

describe("buildGraph — ontology project id 해석 (prefixed ↔ bare)", () => {
  it("`project:slug` 를 참조하는 contains 엣지가 bare project 노드로 이어진다", () => {
    // ontologyInsight 의 노드 id 는 `project:`/`domain:` prefixed 지만 토폴로지의
    // project 노드는 bare slug (renderProjects 출처) — prefix 를 해석하지 못하면
    // 중앙 project ↔ domain spine 엣지가 통째로 drop 된다.
    const graph = buildGraph([project({ slug: "ontology-atlas" })], [], {
      ontologyExtension: {
        nodes: [
          {
            id: "project:ontology-atlas",
            title: "Ontology Atlas",
            kind: "project",
            projectIds: [],
            evidenceIds: [],
            lastApprovedAt: new Date(0),
            lastApprovedBy: "t",
          },
          {
            id: "domain:views",
            title: "Views",
            kind: "domain",
            projectIds: [],
            evidenceIds: [],
            lastApprovedAt: new Date(0),
            lastApprovedBy: "t",
          },
        ],
        edges: [
          {
            id: "e1",
            from: "project:ontology-atlas",
            to: "domain:views",
            type: "contains",
            projectIds: [],
            evidenceIds: [],
            lastApprovedAt: new Date(0),
            lastApprovedBy: "t",
          },
        ],
      },
    });

    // prefixed project 노드는 중복 추가하지 않는다 (bare 가 이미 있음).
    expect(graph.hasNode("project:ontology-atlas")).toBe(false);
    // 엣지는 bare project 노드로 재배선되어 살아남는다.
    expect(graph.hasEdge("ontology-atlas", "domain:views")).toBe(true);
    expect(
      graph.getEdgeAttribute("ontology-atlas", "domain:views", "kind"),
    ).toBe("contains");
  });
});

describe("buildGraph — dense ontology edge legibility", () => {
  it("uses visible fill color and size hierarchy for ontology kinds", () => {
    const graph = buildGraph([project({ slug: "p", isHub: false })], [], {
      ontologyExtension: {
        nodes: [
          {
            id: "domains/views",
            title: "Views",
            kind: "domain",
            projectIds: [],
            evidenceIds: [],
            lastApprovedAt: new Date(0),
            lastApprovedBy: "t",
          },
          {
            id: "capabilities/topology",
            title: "Topology",
            kind: "capability",
            projectIds: [],
            evidenceIds: [],
            lastApprovedAt: new Date(0),
            lastApprovedBy: "t",
          },
          {
            id: "elements/sigma",
            title: "Sigma",
            kind: "element",
            projectIds: [],
            evidenceIds: [],
            lastApprovedAt: new Date(0),
            lastApprovedBy: "t",
          },
        ],
        edges: [],
      },
    });

    expect(graph.getNodeAttribute("domains/views", "color")).toBe(
      ONTOLOGY_KIND_TONE.domain.fill,
    );
    expect(graph.getNodeAttribute("capabilities/topology", "color")).toBe(
      ONTOLOGY_KIND_TONE.capability.fill,
    );
    expect(graph.getNodeAttribute("elements/sigma", "color")).toBe(
      ONTOLOGY_KIND_TONE.element.fill,
    );
    expect(graph.getNodeAttribute("domains/views", "size")).toBeGreaterThan(
      graph.getNodeAttribute("capabilities/topology", "size"),
    );
    expect(graph.getNodeAttribute("capabilities/topology", "size")).toBeGreaterThan(
      graph.getNodeAttribute("elements/sigma", "size"),
    );
  });

  it("ontology extension edges stay thin enough to remain background evidence", () => {
    const graph = buildGraph([project({ slug: "p", isHub: false })], [], {
      ontologyExtension: {
        nodes: [
          {
            id: "domains/views",
            title: "Views",
            kind: "domain",
            projectIds: [],
            evidenceIds: [],
            lastApprovedAt: new Date(0),
            lastApprovedBy: "t",
          },
          {
            id: "capabilities/topology",
            title: "Topology",
            kind: "capability",
            projectIds: [],
            evidenceIds: [],
            lastApprovedAt: new Date(0),
            lastApprovedBy: "t",
          },
          {
            id: "elements/sigma",
            title: "Sigma",
            kind: "element",
            projectIds: [],
            evidenceIds: [],
            lastApprovedAt: new Date(0),
            lastApprovedBy: "t",
          },
        ],
        edges: [
          {
            id: "e1",
            from: "domains/views",
            to: "capabilities/topology",
            type: "contains",
            projectIds: [],
            evidenceIds: [],
            lastApprovedAt: new Date(0),
            lastApprovedBy: "t",
          },
          {
            id: "e2",
            from: "capabilities/topology",
            to: "elements/sigma",
            type: "depends_on",
            projectIds: [],
            evidenceIds: [],
            lastApprovedAt: new Date(0),
            lastApprovedBy: "t",
          },
        ],
      },
    });

    const containsEdge = graph.edge("domains/views", "capabilities/topology");
    const dependsEdge = graph.edge("capabilities/topology", "elements/sigma");

    expect(graph.getEdgeAttribute(containsEdge, "size")).toBeLessThanOrEqual(0.42);
    expect(graph.getEdgeAttribute(dependsEdge, "size")).toBeLessThanOrEqual(0.62);
    expect(graph.getEdgeAttribute(containsEdge, "color")).toBe(
      "rgba(130, 150, 195, 0.025)",
    );
  });
});

describe("buildGraph — changedSlugs (변경점 pulse)", () => {
  it("changedSlugs 의 project 노드는 recentlyUpdated 로 표시", () => {
    // 날짜를 과거로 둬 isProjectRecentlyUpdated 영향 제거 → changedSlugs 만 격리.
    const old = new Date(0);
    const projects = [
      project({ slug: "a", isHub: false, createdAt: old, updatedAt: old }),
      project({ slug: "b", isHub: false, createdAt: old, updatedAt: old }),
    ];
    const graph = buildGraph(projects, [], { changedSlugs: new Set(["a"]) });
    expect(graph.getNodeAttribute("a", "recentlyUpdated")).toBe(true);
    expect(graph.getNodeAttribute("b", "recentlyUpdated")).toBe(false);
  });

  it("changedSlugs 의 ontology ext 노드도 recentlyUpdated 로 표시", () => {
    const projects = [project({ slug: "p", isHub: false })];
    const graph = buildGraph(projects, [], {
      changedSlugs: new Set(["capabilities/x"]),
      ontologyExtension: {
        nodes: [
          {
            id: "capabilities/x",
            title: "X",
            kind: "capability",
            projectIds: [],
            evidenceIds: [],
            lastApprovedAt: new Date(0),
            lastApprovedBy: "t",
          },
          {
            id: "capabilities/y",
            title: "Y",
            kind: "capability",
            projectIds: [],
            evidenceIds: [],
            lastApprovedAt: new Date(0),
            lastApprovedBy: "t",
          },
        ],
        edges: [],
      },
    });
    expect(graph.getNodeAttribute("capabilities/x", "recentlyUpdated")).toBe(true);
    expect(graph.getNodeAttribute("capabilities/y", "recentlyUpdated")).toBe(false);
  });

  it("changedSlugs 미지정 시 ontology 노드 recentlyUpdated=false (기존 동작)", () => {
    const projects = [project({ slug: "p", isHub: false })];
    const graph = buildGraph(projects, [], {
      ontologyExtension: {
        nodes: [
          {
            id: "domains/d",
            title: "D",
            kind: "domain",
            projectIds: [],
            evidenceIds: [],
            lastApprovedAt: new Date(0),
            lastApprovedBy: "t",
          },
        ],
        edges: [],
      },
    });
    expect(graph.getNodeAttribute("domains/d", "recentlyUpdated")).toBe(false);
  });
});
