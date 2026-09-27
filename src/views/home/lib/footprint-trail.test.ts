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
  it("adds the first visit to an empty trail", () => {
    expect(appendFootprintVisit([], "capability:a")).toEqual(["capability:a"]);
  });

  it("appends at the end and keeps the order", () => {
    expect(appendFootprintVisit(["a", "b"], "c")).toEqual(["a", "b", "c"]);
  });

  it("a revisit stacks as a new step instead of erasing the earlier one", () => {
    expect(appendFootprintVisit(["a", "b", "c"], "a")).toEqual(["a", "b", "c", "a"]);
  });

  it("a consecutive duplicate is not a step, so reclicking a node does not advance the count", () => {
    expect(appendFootprintVisit(["a", "b"], "b")).toEqual(["a", "b"]);
  });

  it("pushes out the oldest visit past the cap", () => {
    const full = Array.from({ length: FOOTPRINT_TRAIL_MAX }, (_, i) => `n${i}`);
    const next = appendFootprintVisit(full, "new");
    expect(next.length).toBe(FOOTPRINT_TRAIL_MAX);
    expect(next[next.length - 1]).toBe("new");
    expect(next[0]).toBe("n1"); // n0 pushed out
  });

  it("does not mutate the input array", () => {
    const input = ["a", "b"];
    appendFootprintVisit(input, "c");
    expect(input).toEqual(["a", "b"]);
  });
});

describe("collapseFootprintTrail", () => {
  it("keeps only the last visit of each node and preserves order", () => {
    expect(collapseFootprintTrail(["a", "b", "a", "c"])).toEqual(["b", "a", "c"]);
  });

  it("returns the trail unchanged without duplicates", () => {
    expect(collapseFootprintTrail(["a", "b", "c"])).toEqual(["a", "b", "c"]);
  });
});

describe("graphIdToConceptSlug", () => {
  it("strips the kind prefix to return the bare slug", () => {
    expect(graphIdToConceptSlug("capability:ai-agent-partner")).toBe("ai-agent-partner");
    expect(graphIdToConceptSlug("project:atlas")).toBe("atlas");
  });
  it("returns an id without a prefix unchanged", () => {
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

  it("carries the slug order, the get_concept sequence and a find_path hint", () => {
    const text = formatFootprintTrailAgentPacket(entries, LABELS);
    expect(text).toContain("# 걸어온 길");
    expect(text).toContain("1. Core (domain): domain:core");
    expect(text).toContain("2. Cap X (capability): capability:x");
    expect(text).toContain('get_concept("core")');
    expect(text).toContain('get_concept("x")');
    expect(text).toContain('find_path("core", "x")');
  });

  it("omits the find_path hint for a single visit", () => {
    const text = formatFootprintTrailAgentPacket([entries[0]], LABELS);
    expect(text).toContain('get_concept("core")');
    expect(text).not.toContain("find_path");
  });

  /**
   * The reason is what the vault holds and the source does not, so the packet carries it under
   * each step.
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
 * The trail is a walk: consecutive nodes need not share an edge, so "not directly related" is a
 * valid answer.
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
