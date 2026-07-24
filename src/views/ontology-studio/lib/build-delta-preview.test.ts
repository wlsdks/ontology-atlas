import { describe, expect, it } from "vitest";
import { buildDeltaPreview, type BuildDeltaPreviewInput } from "./build-delta-preview";
import type { StudioRelation, StudioSatellite } from "./build-studio-item";
import type { StudioChange } from "./build-studio-changes";

const sat = (id: string, title = id): StudioSatellite => ({
  id,
  title,
  kind: "capability",
  ref: `capabilities/${id}`,
});

const emptyBase = (): Record<StudioRelation, StudioSatellite[]> => ({
  isA: [],
  dependsOn: [],
  contains: [],
  relates: [],
});

const CENTER = { title: "MCP Server", kind: "capability", domainLabel: "AI", isNew: false };

function build(over: Partial<BuildDeltaPreviewInput> = {}) {
  return buildDeltaPreview({
    center: CENTER,
    baseNeighborsByRelation: emptyBase(),
    changes: [],
    ...over,
  });
}

describe("buildDeltaPreview", () => {
  it("places a staged ADD as an indigo 'added' satellite at its relation's bearing", () => {
    const changes: StudioChange[] = [
      { op: "add", relation: "dependsOn", target: sat("el:parser", "Parser") },
    ];
    const layout = build({ changes });
    const parser = layout.satellites.find((s) => s.node.id === "el:parser");
    expect(parser).toMatchObject({ bearing: "right", state: "added" });
    expect(layout.counts).toEqual({ added: 1, moved: 0, removed: 0 });
    expect(layout.hasDelta).toBe(true);
  });

  it("keeps an untouched base neighbor as achromatic 'existing' context", () => {
    const base = emptyBase();
    base.dependsOn = [sat("el:parser", "Parser")];
    const layout = build({ baseNeighborsByRelation: base });
    expect(layout.satellites).toHaveLength(1);
    expect(layout.satellites[0]).toMatchObject({ state: "existing", bearing: "right" });
    expect(layout.hasDelta).toBe(false);
  });

  it("marks a staged REMOVE on a base neighbor as 'removed' in place", () => {
    const base = emptyBase();
    base.relates = [sat("cap:alt", "Alt")];
    const changes: StudioChange[] = [
      { op: "remove", relation: "relates", target: sat("cap:alt", "Alt") },
    ];
    const layout = build({ baseNeighborsByRelation: base, changes });
    expect(layout.satellites[0]).toMatchObject({ state: "removed", bearing: "left" });
    expect(layout.counts.removed).toBe(1);
  });

  it("RETYPE relocates a base neighbor to its NEW bearing with fromBearing set", () => {
    const base = emptyBase();
    base.dependsOn = [sat("el:parser", "Parser")];
    const changes: StudioChange[] = [
      { op: "retype", from: "dependsOn", to: "contains", target: sat("el:parser", "Parser") },
    ];
    const layout = build({ baseNeighborsByRelation: base, changes });
    // it no longer sits on its old (right) bearing…
    expect(layout.satellites.filter((s) => s.bearing === "right")).toHaveLength(0);
    // …it appears at the new (down) bearing as 'moved', remembering where from.
    const moved = layout.satellites.find((s) => s.node.id === "el:parser");
    expect(moved).toMatchObject({ bearing: "down", state: "moved", fromBearing: "right" });
    expect(layout.counts.moved).toBe(1);
  });

  it("caps satellites per bearing and reports the overflow for a '+N' chip", () => {
    const base = emptyBase();
    base.contains = Array.from({ length: 6 }, (_, i) => sat(`el:${i}`, `El ${i}`));
    const layout = build({ baseNeighborsByRelation: base, capPerBearing: 3 });
    expect(layout.satellites.filter((s) => s.bearing === "down")).toHaveLength(3);
    expect(layout.overflowByBearing.down).toBe(3);
  });

  it("delta-first ordering — the ADD survives the cap, existing context overflows first", () => {
    const base = emptyBase();
    base.contains = Array.from({ length: 3 }, (_, i) => sat(`el:${i}`, `El ${i}`));
    const changes: StudioChange[] = [
      { op: "add", relation: "contains", target: sat("el:new", "New") },
    ];
    const layout = build({ baseNeighborsByRelation: base, changes, capPerBearing: 3 });
    const down = layout.satellites.filter((s) => s.bearing === "down");
    expect(down).toHaveLength(3);
    // the added node is present despite 3 existing neighbors + cap 3.
    expect(down.some((s) => s.node.id === "el:new" && s.state === "added")).toBe(true);
    // one existing neighbor was pushed into the overflow chip, not the delta.
    expect(layout.overflowByBearing.down).toBe(1);
  });

  it("create mode — center is 'isNew' and every relation is an 'added' delta", () => {
    const changes: StudioChange[] = [
      { op: "add", relation: "isA", target: sat("cap:root", "Root") },
      { op: "add", relation: "relates", target: sat("cap:alt", "Alt") },
    ];
    const layout = build({
      center: { title: "결제 취소", kind: "capability", domainLabel: "커머스", isNew: true },
      changes,
    });
    expect(layout.center.isNew).toBe(true);
    expect(layout.satellites.every((s) => s.state === "added")).toBe(true);
    expect(layout.satellites.map((s) => s.bearing).sort()).toEqual(["left", "up"]);
  });

  it("is deterministic — same input yields an identical layout", () => {
    const base = emptyBase();
    base.dependsOn = [sat("el:a"), sat("el:b")];
    const changes: StudioChange[] = [
      { op: "add", relation: "isA", target: sat("cap:root", "Root") },
      { op: "remove", relation: "dependsOn", target: sat("el:a") },
    ];
    const input = { baseNeighborsByRelation: base, changes };
    expect(build(input)).toEqual(build(input));
  });

  it("no staged changes → hasDelta false (drives the hidden affordance)", () => {
    expect(build().hasDelta).toBe(false);
    expect(build().counts).toEqual({ added: 0, moved: 0, removed: 0 });
  });
});
