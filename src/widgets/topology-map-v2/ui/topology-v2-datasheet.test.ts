import { describe, expect, it } from "vitest";

import {
  formatV2HandoffText,
  formatV2MetricLine,
  groupV2Connections,
  type V2DatasheetConnection,
} from "./topology-v2-datasheet";

const conn = (
  partial: Partial<V2DatasheetConnection> & { id: string; relationType: string },
): V2DatasheetConnection => ({
  title: partial.id,
  kind: "capability",
  direction: "outgoing",
  ...partial,
});

describe("groupV2Connections", () => {
  it("splits containment relations (contains/belongs_to) from dependency relations", () => {
    const grouped = groupV2Connections([
      conn({ id: "child-a", relationType: "contains" }),
      conn({ id: "parent", relationType: "belongs_to" }),
      conn({ id: "dep-x", relationType: "depends_on" }),
      conn({ id: "impl-y", relationType: "implements" }),
      conn({ id: "use-z", relationType: "uses" }),
    ]);
    expect(grouped.contains.map((c) => c.id)).toEqual(["child-a", "parent"]);
    expect(grouped.depends.map((c) => c.id)).toEqual(["dep-x", "impl-y", "use-z"]);
  });

  it("preserves input order within each group and handles an empty list", () => {
    expect(groupV2Connections([])).toEqual({ contains: [], depends: [] });
  });
});

describe("formatV2MetricLine", () => {
  const labels = { usedBy: "쓰는 곳", dependsOn: "기대는 곳", evidence: "근거" };

  it("joins the three plain-language facts as ONE engraved line (no triplication)", () => {
    expect(
      formatV2MetricLine({ usedBy: 3, dependsOn: 5, evidence: 2 }, labels),
    ).toBe("쓰는 곳 3 · 기대는 곳 5 · 근거 2");
  });

  it("keeps zeros explicit so the line always has three segments", () => {
    expect(
      formatV2MetricLine({ usedBy: 0, dependsOn: 0, evidence: 0 }, labels),
    ).toBe("쓰는 곳 0 · 기대는 곳 0 · 근거 0");
  });
});

describe("formatV2HandoffText", () => {
  it("emits a deterministic MCP/CLI-style payload with slug, typed facts, and a next action", () => {
    const text = formatV2HandoffText({
      slug: "mcp-server",
      kind: "capability",
      domainTitle: "AI Agent Partner",
      usedBy: 5,
      dependsOn: 2,
      evidence: 3,
      containsNames: ["mcp-tool-registry", "stdio-transport"],
      dependsNames: ["relation-graph"],
    });
    expect(text).toBe(
      [
        "node: mcp-server",
        "kind: capability",
        "domain: AI Agent Partner",
        "used_by: 5",
        "depends_on: 2",
        "evidence: 3",
        "contains: mcp-tool-registry, stdio-transport",
        "depends: relation-graph",
        'next: get_concept("mcp-server") → review context, then patch_concept / add_relation as needed',
      ].join("\n"),
    );
  });

  it("falls back to '-' for a missing domain and for empty connection groups", () => {
    const text = formatV2HandoffText({
      slug: "orphan",
      kind: "element",
      domainTitle: null,
      usedBy: 0,
      dependsOn: 0,
      evidence: 0,
      containsNames: [],
      dependsNames: [],
    });
    expect(text).toContain("domain: -");
    expect(text).toContain("contains: -");
    expect(text).toContain("depends: -");
  });
});
