import { describe, expect, it } from "vitest";
import { buildEdgeTypeRows } from "./build-edge-type-rows";

describe("buildEdgeTypeRows", () => {
  it("returns no rows for an empty Map", () => {
    expect(buildEdgeTypeRows(new Map())).toEqual([]);
  });

  it("orders canonical types by KNOWLEDGE_EDGE_TYPES", () => {
    const rows = buildEdgeTypeRows(
      new Map([
        ["depends_on", 3],
        ["contains", 5],
      ]),
    );
    // KNOWLEDGE_EDGE_TYPES order: contains, belongs_to, depends_on, ...
    expect(rows.map((r) => r.type)).toEqual(["contains", "depends_on"]);
    expect(rows.map((r) => r.count)).toEqual([5, 3]);
  });

  it("appends foreign types after canonical ones in input order", () => {
    const rows = buildEdgeTypeRows(
      new Map([
        ["custom_a", 2],
        ["contains", 1],
        ["custom_b", 4],
      ]),
    );
    expect(rows.map((r) => r.type)).toEqual([
      "contains",
      "custom_a",
      "custom_b",
    ]);
  });

  it("drops zero and negative counts", () => {
    const rows = buildEdgeTypeRows(
      new Map([
        ["contains", 0],
        ["depends_on", 5],
        ["foreign_zero", 0],
        ["foreign_negative", -1],
      ]),
    );
    expect(rows.map((r) => r.type)).toEqual(["depends_on"]);
  });

  it("omits canonical types with no count", () => {
    const rows = buildEdgeTypeRows(new Map([["uses", 2]]));
    // Zero counts are skipped, leaving `uses`.
    expect(rows).toEqual([{ type: "uses", count: 2 }]);
  });
});
