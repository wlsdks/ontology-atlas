import { describe, expect, it } from "vitest";
import type { KnowledgeGraphNode } from "@/entities/knowledge-graph";
import type { Project } from "@/entities/project";
import {
  compactTopologyPanelTitle,
  resolveTopologyNodeTitle,
} from "./resolve-topology-node-title";

function node(id: string, title: string): KnowledgeGraphNode {
  return {
    id,
    title,
    kind: "capability",
    projectIds: [],
    evidenceIds: [],
    lastApprovedAt: new Date(0),
    lastApprovedBy: "test",
  };
}

const nodes = [node("capability:checkout", "결제 (주문 도메인)")];
const noProjects: ReadonlyMap<string, Project> = new Map();

describe("resolveTopologyNodeTitle", () => {
  it("해석되면 괄호를 뗀 이름", () => {
    expect(
      resolveTopologyNodeTitle({
        slug: "capability:checkout",
        projectBySlug: noProjects,
        ontologyNodes: nodes,
      }),
    ).toBe("결제");
  });

  /**
   * This one line was the source of the screen stating an outright falsehood: a
   * fallback that passes the slug off as a title gives an absent node a name,
   * and the path chip then asserts "no path" over it. null is the information
   * that the node is not here.
   */
  it("이 볼트에 없으면 null — 슬러그를 제목으로 위장하지 않는다", () => {
    expect(
      resolveTopologyNodeTitle({
        slug: "capability:from-another-vault",
        projectBySlug: noProjects,
        ontologyNodes: nodes,
      }),
    ).toBeNull();
  });

  it("그래프가 아직 없으면 null", () => {
    expect(
      resolveTopologyNodeTitle({
        slug: "capability:checkout",
        projectBySlug: noProjects,
        ontologyNodes: null,
      }),
    ).toBeNull();
  });

  it("슬러그가 없으면 null", () => {
    expect(
      resolveTopologyNodeTitle({
        slug: null,
        projectBySlug: noProjects,
        ontologyNodes: nodes,
      }),
    ).toBeNull();
  });
});

describe("compactTopologyPanelTitle", () => {
  it("괄호 부연을 뗀다", () => {
    expect(compactTopologyPanelTitle("결제 (주문 도메인)")).toBe("결제");
  });

  it("괄호만 남으면 원문을 지킨다", () => {
    expect(compactTopologyPanelTitle("(주문)")).toBe("(주문)");
  });
});
