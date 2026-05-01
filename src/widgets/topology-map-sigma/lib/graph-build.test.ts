import { describe, expect, it } from "vitest";
import type { Project } from "@/entities/project";
import type { OntologyCountsForProject } from "@/shared/lib/ontology-tree";
import { buildGraph } from "./graph-build";

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
      "rgba(186, 194, 206, 0.95)",
    );
    expect(graph.getNodeAttribute("p-domain", "ontologyTopKind")).toBe("domain");

    expect(graph.getNodeAttribute("p-capability", "borderColor")).toBe(
      "rgba(94, 106, 210, 0.75)",
    );
    expect(graph.getNodeAttribute("p-capability", "ontologyTopKind")).toBe(
      "capability",
    );

    expect(graph.getNodeAttribute("p-element", "borderColor")).toBe(
      "rgba(176, 190, 190, 0.95)",
    );

    // unknown 우선 (검수 신호) — capability=9 가 더 많아도 unknown 톤
    expect(graph.getNodeAttribute("p-unknown", "borderColor")).toBe(
      "rgba(255, 179, 71, 0.95)",
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
});
