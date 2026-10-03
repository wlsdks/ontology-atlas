import { afterEach, describe, expect, it } from "vitest";
import type { DialMemory } from "@/widgets/ontology-map";
import { readFlatRingMemory, writeFlatRingMemory } from "./flat-ring-memory-store";

const memory = (angle: number): DialMemory => ({
  order: ["domain:b", "domain:a"],
  radiusByStep: new Map([[0, 412.5], [2, 230.25]]),
  angleById: new Map([["domain:a", { step: 0, angle }], ["domain:b", { step: 2, angle: -1.25 }]]),
  itemOrder: new Map([["domain:a", ["capability:y", "capability:x", "domain:a::direct"]]]),
});

describe("flat ring memory store", () => {
  afterEach(() => window.localStorage.clear());

  it("keeps one record per vault identity under atlas.map.flat-rings.v1: and reads it back whole", () => {
    writeFlatRingMemory("local:alpha", memory(0.5));
    writeFlatRingMemory("sample:dogfood", memory(-2));
    expect(window.localStorage.getItem("atlas.map.flat-rings.v1:local:alpha")).not.toBeNull();
    expect(readFlatRingMemory("local:alpha")).toEqual(memory(0.5));
    expect(readFlatRingMemory("sample:dogfood")?.angleById.get("domain:a")).toEqual({ step: 0, angle: -2 });
    expect(readFlatRingMemory("local:beta")).toBeNull();
  });

  it("ignores a record it cannot read", () => {
    window.localStorage.setItem("atlas.map.flat-rings.v1:local:alpha", "{not json");
    expect(readFlatRingMemory("local:alpha")).toBeNull();
    window.localStorage.setItem("atlas.map.flat-rings.v1:local:alpha", JSON.stringify({ version: 2, order: [] }));
    expect(readFlatRingMemory("local:alpha")).toBeNull();
    window.localStorage.setItem(
      "atlas.map.flat-rings.v1:local:alpha",
      JSON.stringify({ version: 1, order: ["a"], radiusByStep: [[0, "far"]], angleById: {}, itemOrder: {} }),
    );
    expect(readFlatRingMemory("local:alpha")).toBeNull();
  });
});
