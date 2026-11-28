import { createTranslator } from "use-intl";
import { describe, expect, it } from "vitest";

import en from "../../../../../messages/en.json";
import ko from "../../../../../messages/ko.json";
import {
  appendFootprintVisit,
  buildTrailStepLinks,
  collapseFootprintTrail,
  FOOTPRINT_TRAIL_MAX,
  formatFootprintTrailAgentPacket,
  TRAIL_STEP_UNRELATED,
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

const LABELS: FootprintTrailPacketLabels = {
  title: "방문 기록",
  order: "방문 순서:",
  reviewHint: "각 개념 맥락 검토:",
  undocumented: "아직 문서 없음",
  pathHint: "처음과 마지막 개념 사이 경로 확인:",
  unrelated: "직접 연결 없음",
};

const RETIRED_TOOL_NAMES = ["get_concept(", "add_concept(", "add_concept ", "find_path", "maintenance_plan"];

describe("formatFootprintTrailAgentPacket", () => {
  const entries: FootprintTrailEntry[] = [
    { id: "domain:core", title: "Core", kind: "domain", slug: "domains/core" },
    { id: "capability:vault-graph-query", title: "Vault graph query", kind: "capability", slug: "capabilities/vault-graph-query" },
  ];

  it("names each concept by its vault slug, never the map's internal id", () => {
    const text = formatFootprintTrailAgentPacket(entries, LABELS);
    expect(text).toContain("# 방문 기록");
    expect(text).toContain("1. Core (domain): domains/core");
    expect(text).toContain("2. Vault graph query (capability): capabilities/vault-graph-query");
    expect(text).not.toContain("capability:vault-graph-query");
    expect(text).not.toContain("domain:core");
  });

  it("reads the whole walk in one get_concepts call and asks for the path between its ends", () => {
    const text = formatFootprintTrailAgentPacket(entries, LABELS);
    expect(text).toContain('get_concepts({"slugs":["domains/core","capabilities/vault-graph-query"]})');
    expect(text).toContain(
      'query_ontology({"operation":"path","from":"domains/core","to":"capabilities/vault-graph-query"})',
    );
  });

  it("uses advertised tools only and carries no block of unrelated concepts", () => {
    const text = formatFootprintTrailAgentPacket(
      [...entries, { id: "element:ghost", title: "Ghost", kind: "element", slug: null }],
      LABELS,
    );
    for (const retired of RETIRED_TOOL_NAMES) expect(text).not.toContain(retired);
    expect(text.match(/get_concepts\(/g)).toHaveLength(1);
    expect(text).not.toMatch(/untouched|maintenance/i);
  });

  it("names a concept with no document by its title and leaves it out of the read call", () => {
    const text = formatFootprintTrailAgentPacket(
      [entries[0], { id: "element:ghost", title: "Ghost", kind: "element", slug: null }],
      LABELS,
    );
    expect(text).toContain("2. Ghost (element)\n");
    expect(text).toContain('get_concepts({"slugs":["domains/core"]})');
    expect(text).toContain("Ghost: 아직 문서 없음");
    // A path query needs a slug at both ends.
    expect(text).not.toContain("query_ontology");
  });

  it("omits the path query for a single visit", () => {
    const text = formatFootprintTrailAgentPacket([entries[0]], LABELS);
    expect(text).toContain('get_concepts({"slugs":["domains/core"]})');
    expect(text).not.toContain("query_ontology");
  });

  it("carries the move under each step: relation word plus the recorded reason", () => {
    const text = formatFootprintTrailAgentPacket(entries, LABELS, [
      null,
      { relationLabel: "포함", reason: "Core 는 이 능력을 품는다" },
    ]);
    expect(text).toContain(
      "2. Vault graph query (capability): capabilities/vault-graph-query\n   — 포함 · Core 는 이 능력을 품는다",
    );
  });

  it("states a bare relation, says so for a move across no edge, and claims nothing otherwise", () => {
    expect(formatFootprintTrailAgentPacket(entries, LABELS, [null, { relationLabel: "의존", reason: null }])).toContain("   — 의존");
    expect(formatFootprintTrailAgentPacket(entries, LABELS, [null, TRAIL_STEP_UNRELATED])).toContain("   — 직접 연결 없음");
    expect(formatFootprintTrailAgentPacket(entries, LABELS, [null, null])).not.toContain("   — ");
  });
});

describe.each([
  { locale: "en", messages: en, hangul: false },
  { locale: "ko", messages: ko, hangul: true },
])("the $locale packet", ({ locale, messages, hangul }) => {
  it("words a concept with no document yet in that locale's catalogue", () => {
    const t = createTranslator({ locale, messages, namespace: "topology.footprint" });
    const text = formatFootprintTrailAgentPacket([{ id: "capability:ghost", title: "Ghost", kind: "capability", slug: null }], {
      title: t("packetTitle"),
      order: t("packetOrder"),
      reviewHint: t("packetReviewHint"),
      pathHint: t("packetPathHint"),
      undocumented: t("packetUndocumented"),
      unrelated: t("stepUnrelated"),
    });
    expect(text).toContain(`Ghost: ${t("packetUndocumented")}`);
    expect(t("packetUndocumented")).toContain("add_concepts");
    expect(/\p{Script=Hangul}/u.test(text)).toBe(hangul);
  });
});

/**
 * The trail is a walk: consecutive steps need not share an edge, so "not directly related" is a
 * valid answer for a real move, and no answer is right for a move the list did not show.
 */
describe("buildTrailStepLinks", () => {
  const edges: TrailEdge[] = [
    { from: "domain:core", to: "capability:x", type: "contains", label: "  Core 는 이 능력을 품는다  " },
    { from: "capability:x", to: "element:y", type: "depends_on" },
    { from: "domain:core", to: "element:z", type: "related_to", label: "" },
  ];
  const linksOf = (steps: string[]) => buildTrailStepLinks(steps, collapseFootprintTrail(steps), edges);

  it("describes how each step follows the one before it", () => {
    expect(linksOf(["domain:core", "capability:x", "element:y"])).toEqual([
      null,
      { type: "contains", reason: "Core 는 이 능력을 품는다" },
      { type: "depends_on", reason: null },
    ]);
  });

  /** A→B→C→B lists A, C, B; C was reached from B, not from A, so C claims nothing. */
  it("captions only the moves the walk made when a revisit collapses the list", () => {
    const steps = ["domain:core", "capability:x", "element:y", "capability:x"];
    expect(collapseFootprintTrail(steps)).toEqual(["domain:core", "element:y", "capability:x"]);
    expect(linksOf(steps)).toEqual([null, null, { type: "depends_on", reason: null }]);
  });

  it("claims no move across a step the list no longer shows", () => {
    const steps = ["domain:core", "capability:x", "element:y"];
    expect(buildTrailStepLinks(steps, ["domain:core", "element:y"], edges)).toEqual([null, null]);
  });

  it("crossing an edge backwards is still crossing that edge", () => {
    expect(linksOf(["element:y", "capability:x"])[1]).toEqual({ type: "depends_on", reason: null });
  });

  it("names a real move between two unrelated concepts as unrelated", () => {
    expect(linksOf(["element:y", "element:z"])).toEqual([null, TRAIL_STEP_UNRELATED]);
  });

  it("an empty relation note is no reason, not an empty sentence", () => {
    expect(linksOf(["domain:core", "element:z"])[1]).toEqual({ type: "related_to", reason: null });
  });

  it("prefers the edge that carries a reason when a pair has several", () => {
    const parallel: TrailEdge[] = [
      { from: "a", to: "b", type: "related_to" },
      { from: "b", to: "a", type: "depends_on", label: "왜 이어지는지" },
    ];
    expect(buildTrailStepLinks(["a", "b"], ["a", "b"], parallel)[1]).toEqual({
      type: "depends_on",
      reason: "왜 이어지는지",
    });
  });

  it("aligns index-for-index with the rows, and answers an empty trail with nothing", () => {
    expect(linksOf([])).toEqual([]);
    expect(linksOf(["domain:core"])).toEqual([null]);
  });
});
