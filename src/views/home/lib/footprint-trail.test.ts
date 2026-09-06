import { describe, expect, it } from "vitest";

import {
  appendFootprintVisit,
  buildTrailStepLinks,
  collapseFootprintTrail,
  FOOTPRINT_TRAIL_MAX,
  formatFootprintTrailAgentPacket,
  graphIdToConceptSlug,
  type FootprintTrailEntry,
  type FootprintTrailPacketLabels,
  type TrailEdge,
} from "./footprint-trail";

describe("appendFootprintVisit", () => {
  it("빈 트레일에 첫 방문을 추가", () => {
    expect(appendFootprintVisit([], "capability:a")).toEqual(["capability:a"]);
  });

  it("순서를 보존하며 끝에 추가", () => {
    expect(appendFootprintVisit(["a", "b"], "c")).toEqual(["a", "b", "c"]);
  });

  /**
   * A revisit used to delete the earlier position and move the node to the end.
   * With at most one step per node, several numbers on one node were impossible
   * at the data layer.
   */
  it("재방문은 지우지 않고 새 걸음으로 쌓인다 — 되돌아온 사실이 경로에 남는다", () => {
    expect(appendFootprintVisit(["a", "b", "c"], "a")).toEqual(["a", "b", "c", "a"]);
  });

  it("연속 중복은 걸음이 아니다 — 같은 노드 재클릭으로 순번이 늘지 않는다", () => {
    expect(appendFootprintVisit(["a", "b"], "b")).toEqual(["a", "b"]);
  });

  it("상한 초과 시 가장 오래된 방문을 밀어낸다", () => {
    const full = Array.from({ length: FOOTPRINT_TRAIL_MAX }, (_, i) => `n${i}`);
    const next = appendFootprintVisit(full, "new");
    expect(next.length).toBe(FOOTPRINT_TRAIL_MAX);
    expect(next[next.length - 1]).toBe("new");
    expect(next[0]).toBe("n1"); // n0 pushed out
  });

  it("불변 — 입력 배열을 변형하지 않는다", () => {
    const input = ["a", "b"];
    appendFootprintVisit(input, "c");
    expect(input).toEqual(["a", "b"]);
  });
});

describe("collapseFootprintTrail", () => {
  it("같은 노드는 마지막 방문만 남기고 순서를 보존한다", () => {
    expect(collapseFootprintTrail(["a", "b", "a", "c"])).toEqual(["b", "a", "c"]);
  });

  it("중복이 없으면 그대로", () => {
    expect(collapseFootprintTrail(["a", "b", "c"])).toEqual(["a", "b", "c"]);
  });
});

describe("graphIdToConceptSlug", () => {
  it("kind 접두를 벗겨 bare 슬러그를 반환", () => {
    expect(graphIdToConceptSlug("capability:ai-agent-partner")).toBe("ai-agent-partner");
    expect(graphIdToConceptSlug("project:atlas")).toBe("atlas");
  });
  it("접두 없는 id 는 그대로", () => {
    expect(graphIdToConceptSlug("plain")).toBe("plain");
  });
});

const LABELS: FootprintTrailPacketLabels = {
  title: "걸어온 길",
  order: "방문 순서:",
  reviewHint: "각 노드 맥락 검토:",
  pathHint: "여정 양 끝 경로 확인:",
};

describe("formatFootprintTrailAgentPacket", () => {
  const entries: FootprintTrailEntry[] = [
    { id: "domain:core", title: "Core", kind: "domain" },
    { id: "capability:x", title: "Cap X", kind: "capability" },
  ];

  it("슬러그 순서 + get_concept 시퀀스 + find_path 힌트를 담는다", () => {
    const text = formatFootprintTrailAgentPacket(entries, LABELS);
    expect(text).toContain("# 걸어온 길");
    expect(text).toContain("1. Core (domain): domain:core");
    expect(text).toContain("2. Cap X (capability): capability:x");
    expect(text).toContain('get_concept("core")');
    expect(text).toContain('get_concept("x")');
    expect(text).toContain('find_path("core", "x")');
  });

  it("방문이 1개면 find_path 힌트를 넣지 않는다", () => {
    const text = formatFootprintTrailAgentPacket([entries[0]], LABELS);
    expect(text).toContain('get_concept("core")');
    expect(text).not.toContain("find_path");
  });

  /**
   * The packet used to hand over the places walked and drop the argument between them.
   * An agent that is told only "Core, then Cap X" has to guess the connection it was
   * being handed; the reason is exactly what the vault holds and the source does not.
   */
  it("carries the connection under each step — relation word plus the recorded reason", () => {
    const text = formatFootprintTrailAgentPacket(entries, { ...LABELS, unrelated: "직접 연결 없음" }, [], [
      null,
      { relationLabel: "포함", reason: "Core 는 이 능력을 품는다" },
    ]);
    expect(text).toContain("2. Cap X (capability): capability:x\n   — 포함 · Core 는 이 능력을 품는다");
  });

  it("states a bare relation without a reason, and says so when there is no edge", () => {
    const bare = formatFootprintTrailAgentPacket(entries, LABELS, [], [null, { relationLabel: "의존", reason: null }]);
    expect(bare).toContain("   — 의존");
    const unrelated = formatFootprintTrailAgentPacket(entries, { ...LABELS, unrelated: "직접 연결 없음" }, [], [null, null]);
    expect(unrelated).toContain("   — 직접 연결 없음");
  });

  it("keeps its older shape when the caller passes no captions", () => {
    expect(formatFootprintTrailAgentPacket(entries, LABELS)).not.toContain("   — ");
  });
});

/**
 * The walked pairs read back against the vault's own edges. Not every pair is an edge:
 * the trail is a **walk**, and clicking two unrelated nodes in turn is a normal thing to
 * do — so "not directly related" is an answer this function must be able to give.
 */
describe("buildTrailStepLinks", () => {
  const edges: TrailEdge[] = [
    { from: "domain:core", to: "capability:x", type: "contains", label: "  Core 는 이 능력을 품는다  " },
    { from: "capability:x", to: "element:y", type: "depends_on" },
    { from: "domain:core", to: "element:z", type: "related_to", label: "" },
  ];

  it("describes how each step follows the one before it", () => {
    expect(buildTrailStepLinks(["domain:core", "capability:x", "element:y"], edges)).toEqual([
      null,
      { type: "contains", reason: "Core 는 이 능력을 품는다" },
      { type: "depends_on", reason: null },
    ]);
  });

  it("crossing an edge backwards is still crossing that edge", () => {
    expect(buildTrailStepLinks(["element:y", "capability:x"], edges)[1]).toEqual({
      type: "depends_on",
      reason: null,
    });
  });

  it("says nothing rather than inventing an edge for an unrelated pair", () => {
    expect(buildTrailStepLinks(["element:y", "element:z"], edges)).toEqual([null, null]);
  });

  it("an empty relation note is no reason, not an empty sentence", () => {
    expect(buildTrailStepLinks(["domain:core", "element:z"], edges)[1]).toEqual({
      type: "related_to",
      reason: null,
    });
  });

  /** A bare type is the fallback anyway, so among parallel edges the one with a reason wins. */
  it("prefers the edge that carries a reason when a pair has several", () => {
    const parallel: TrailEdge[] = [
      { from: "a", to: "b", type: "related_to" },
      { from: "b", to: "a", type: "depends_on", label: "왜 이어지는지" },
    ];
    expect(buildTrailStepLinks(["a", "b"], parallel)[1]).toEqual({
      type: "depends_on",
      reason: "왜 이어지는지",
    });
  });

  it("aligns index-for-index with the trail, and answers an empty trail with nothing", () => {
    expect(buildTrailStepLinks([], edges)).toEqual([]);
    expect(buildTrailStepLinks(["domain:core"], edges)).toEqual([null]);
  });
});
