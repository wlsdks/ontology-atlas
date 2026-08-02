import { describe, expect, it } from "vitest";
import type { KnowledgeGraphEdge, KnowledgeGraphNode } from "@/entities/knowledge-graph";
import { buildConceptEgo, matchNodeId } from "./build-concept-ego";

function node(id: string, kind: string, title: string, slug = title): KnowledgeGraphNode {
  return {
    id,
    title,
    display: title,
    kind,
    projectIds: [],
    evidenceIds: [slug],
    hasOwnDocument: true,
    agentSlug: slug,
    ref: null,
    lastApprovedAt: "",
    lastApprovedBy: "",
    summary: null,
  } as unknown as KnowledgeGraphNode;
}

function edge(from: string, to: string, type: KnowledgeGraphEdge["type"]): KnowledgeGraphEdge {
  return {
    id: `${from}--${type}-->${to}`,
    from,
    to,
    type,
    projectIds: [],
    evidenceIds: [],
    lastApprovedAt: "",
    lastApprovedBy: "",
  } as unknown as KnowledgeGraphEdge;
}

const NODES = [
  node("domain:shell", "domain", "온보딩·배포·앱 셸", "domains/shell"),
  node("capability:mcp", "capability", "MCP 서버", "capabilities/mcp-server"),
  node("element:rail", "element", "App Nav Rail", "elements/app-nav-rail"),
  node("element:tabs", "element", "Bottom Tab Bar", "elements/bottom-tab-bar"),
];

const EDGES = [
  edge("domain:shell", "element:rail", "contains"),
  edge("domain:shell", "element:tabs", "contains"),
  edge("capability:mcp", "domain:shell", "is_a"),
  edge("capability:mcp", "element:rail", "depends_on"),
];

describe("buildConceptEgo — 방향이 관계의 절반이다", () => {
  /*
   * 시안 배선에서 들어오는 `contains` 를 「담고 있는 것」에 넣었더니 도메인
   * 노드에서 ↑17 과 ↓16 이 거의 같은 집합이 됐다. 그 회귀를 여기서 잡는다.
   */
  it("들어오는 contains 는 「나를 담은 곳」이지 「내가 담은 것」이 아니다", () => {
    const ego = buildConceptEgo("element:rail", NODES, EDGES);
    expect(ego).not.toBeNull();
    expect(ego!.neighbors.belongsTo.map((n) => n.id)).toContain("domain:shell");
    expect(ego!.neighbors.contains).toHaveLength(0);
  });

  it("나가는 contains 는 「담고 있는 것」이다", () => {
    const ego = buildConceptEgo("domain:shell", NODES, EDGES)!;
    expect(ego.neighbors.contains.map((n) => n.id).sort()).toEqual([
      "element:rail",
      "element:tabs",
    ]);
    expect(ego.neighbors.belongsTo.map((n) => n.id)).toEqual(["capability:mcp"]);
  });

  it("depends_on 은 방향에 따라 「기대는 곳」과 「이곳을 쓰는 곳」으로 갈린다", () => {
    const from = buildConceptEgo("capability:mcp", NODES, EDGES)!;
    expect(from.neighbors.dependsOn.map((n) => n.id)).toEqual(["element:rail"]);
    const to = buildConceptEgo("element:rail", NODES, EDGES)!;
    expect(to.neighbors.usedBy.map((n) => n.id)).toEqual(["capability:mcp"]);
  });

  it("같은 이웃이 두 번 세어지지 않는다", () => {
    const dup = [...EDGES, edge("domain:shell", "element:rail", "contains")];
    const ego = buildConceptEgo("domain:shell", NODES, dup)!;
    expect(ego.neighbors.contains).toHaveLength(2);
    expect(ego.total).toBe(3);
  });

  it("도메인 이름은 belongsTo 의 도메인 이웃에서 온다", () => {
    expect(buildConceptEgo("element:rail", NODES, EDGES)!.domainLabel).toBe("온보딩·배포·앱 셸");
    // 도메인 자신에게는 상위 도메인이 없다 — 빈 칸이 정답이다.
    expect(buildConceptEgo("domain:shell", NODES, EDGES)!.domainLabel).toBeNull();
  });

  it("그래프에 없는 노드는 null — 볼트의 개념이 아닌 마크다운이 그렇다", () => {
    expect(buildConceptEgo("element:nope", NODES, EDGES)).toBeNull();
  });
});

describe("matchNodeId — 커밋이 건드린 파일을 그래프 노드에 맞춘다", () => {
  /*
   * Rust 는 frontmatter 의 slug 를(#842), 파생은 `<kind>:<꼬리>` 를 쓴다.
   * 문자열이 그대로 안 맞으므로 이 다리가 없으면 **모든 걸음이 「개념 밖」**
   * 으로 보이고 아무 에러도 안 난다.
   */
  it("frontmatter slug 로 맞춘다", () => {
    expect(matchNodeId({ slug: "capabilities/mcp-server", kind: "capability" }, NODES)).toBe(
      "capability:mcp",
    );
  });

  it("kind 가 비어 있어도 근거 슬러그로 맞춘다 (지워진 파일)", () => {
    expect(matchNodeId({ slug: "elements/app-nav-rail", kind: null }, NODES)).toBe("element:rail");
  });

  it("볼트의 개념이 아니면 null", () => {
    expect(matchNodeId({ slug: "README", kind: null }, NODES)).toBeNull();
  });
});
