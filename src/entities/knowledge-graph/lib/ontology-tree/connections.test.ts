import { describe, expect, it } from "vitest";
import { buildConnections, groupConnectionsByRole } from "./connections";

const nodes = [
  { id: "capability:checkout", title: "Checkout", kind: "capability" },
  { id: "capability:payment", title: "Payment", kind: "capability" },
  { id: "capability:cart", title: "Cart", kind: "capability" },
  { id: "document:adr-2", title: "ADR 2", kind: "document" },
];

describe("buildConnections", () => {
  it("carries each relation's recorded reason onto its row, and none where none was written", () => {
    const rows = buildConnections("capability:checkout", nodes, [
      { from: "capability:checkout", to: "capability:payment", type: "depends_on", label: "  Payment must clear before an order exists.  " },
      { from: "capability:cart", to: "capability:checkout", type: "depends_on" },
      { from: "document:adr-2", to: "capability:checkout", type: "describes", label: "   " },
    ]);
    expect(rows.map((row) => [row.id, row.direction, row.reason])).toEqual([
      ["capability:payment", "outgoing", "Payment must clear before an order exists."],
      ["capability:cart", "incoming", null],
      ["document:adr-2", "incoming", null],
    ]);
  });
});

describe("groupConnectionsByRole", () => {
  it("keeps a reason when a parallel copy of the relation is the one that wrote it", () => {
    const rows = buildConnections("capability:checkout", nodes, [
      { from: "capability:checkout", to: "capability:payment", type: "depends_on" },
      { from: "capability:checkout", to: "capability:payment", type: "uses", label: "Charges the card." },
    ]);
    const groups = groupConnectionsByRole(rows);
    expect(groups.dependsOn).toHaveLength(1);
    expect(groups.dependsOn[0]).toMatchObject({ reason: "Charges the card.", relationTypes: ["depends_on", "uses"] });
  });

  it("keeps the first reason when both copies wrote one", () => {
    const rows = buildConnections("capability:checkout", nodes, [
      { from: "capability:checkout", to: "capability:payment", type: "depends_on", label: "First." },
      { from: "capability:checkout", to: "capability:payment", type: "uses", label: "Second." },
    ]);
    expect(groupConnectionsByRole(rows).dependsOn[0]!.reason).toBe("First.");
  });
});
