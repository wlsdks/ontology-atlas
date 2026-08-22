import { describe, expect, it } from "vitest";
import { buildEdgeTypeRows } from "./build-edge-type-rows";

describe("buildEdgeTypeRows", () => {
  it("빈 Map → 빈 배열", () => {
    expect(buildEdgeTypeRows(new Map())).toEqual([]);
  });

  it("canonical type 만 있을 때 KNOWLEDGE_EDGE_TYPES 순서대로", () => {
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

  it("외래 type 은 canonical 뒤에 입력 순서대로", () => {
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

  it("count 0 / 음수 행 제외", () => {
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

  it("canonical 미포함 type → 0 카운트로 표시 안 함", () => {
    const rows = buildEdgeTypeRows(new Map([["uses", 2]]));
    // Every entry of KNOWLEDGE_EDGE_TYPES with count 0 is skipped, leaving only `uses`.
    expect(rows).toEqual([{ type: "uses", count: 2 }]);
  });
});
