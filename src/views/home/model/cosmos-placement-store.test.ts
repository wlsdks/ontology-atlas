import { afterEach, describe, expect, it } from "vitest";
import { readCosmosPlacement, writeCosmosPlacement } from "./cosmos-placement-store";

const record = (x: number) => ({ version: 1 as const, centres: { "domain:a": [x, 0] as [number, number] } });

describe("cosmos placement store", () => {
  afterEach(() => window.localStorage.clear());

  it("keeps one record of galaxy centres per vault identity under atlas.map.cosmos.v1:", () => {
    writeCosmosPlacement("local:alpha", record(120));
    writeCosmosPlacement("sample:dogfood", record(-120));
    expect(window.localStorage.getItem("atlas.map.cosmos.v1:local:alpha")).not.toBeNull();
    expect(readCosmosPlacement("local:alpha")?.centres["domain:a"]).toEqual([120, 0]);
    expect(readCosmosPlacement("sample:dogfood")?.centres["domain:a"]).toEqual([-120, 0]);
    expect(readCosmosPlacement("local:beta")).toBeNull();
  });

  it("ignores a record it cannot read", () => {
    window.localStorage.setItem("atlas.map.cosmos.v1:local:alpha", "{not json");
    expect(readCosmosPlacement("local:alpha")).toBeNull();
    window.localStorage.setItem("atlas.map.cosmos.v1:local:alpha", JSON.stringify({ version: 2 }));
    expect(readCosmosPlacement("local:alpha")).toBeNull();
  });
});
