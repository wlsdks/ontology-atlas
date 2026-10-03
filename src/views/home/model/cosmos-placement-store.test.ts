import { afterEach, describe, expect, it } from "vitest";
import { clearCosmosPlacement, readCosmosPlacement, writeCosmosPlacement } from "./cosmos-placement-store";

const KEY = "atlas.map.cosmos.v1:local:alpha";
const record = (x: number) => ({ version: 1 as const, centres: { "domain:a": [x, 0] as [number, number] } });

describe("cosmos placement store", () => {
  afterEach(() => window.localStorage.clear());

  it("keeps one record of galaxy centres per vault identity under atlas.map.cosmos.v1:", () => {
    writeCosmosPlacement("local:alpha", record(120));
    writeCosmosPlacement("sample:dogfood", record(-120));
    expect(window.localStorage.getItem(KEY)).not.toBeNull();
    expect(readCosmosPlacement("local:alpha")?.centres["domain:a"]).toEqual([120, 0]);
    expect(readCosmosPlacement("sample:dogfood")?.centres["domain:a"]).toEqual([-120, 0]);
    expect(readCosmosPlacement("local:beta")).toBeNull();
  });

  it("ignores a record it cannot read", () => {
    for (const raw of [
      "{not json",
      JSON.stringify({ version: 2, centres: {} }),
      JSON.stringify({ version: 1, centres: { "domain:a": [1] } }),
      JSON.stringify({ version: 1, centres: { "domain:a": ["1", 2] } }),
      JSON.stringify({ version: 1, centres: { "domain:a": [null, 2] } }),
      JSON.stringify({ version: 1, centres: [] }),
    ]) {
      window.localStorage.setItem(KEY, raw);
      expect(readCosmosPlacement("local:alpha")).toBeNull();
    }
  });

  it("writes neither an invalid nor an oversize record", () => {
    expect(writeCosmosPlacement("local:alpha", { version: 1, centres: { "domain:a": [Number.NaN, 0] } })).toBe(false);
    const centres: Record<string, [number, number]> = {};
    for (let i = 0; i < 12_000; i += 1) centres[`domain:${i.toString().padStart(8, "0")}`] = [i + 0.25, -i - 0.75];
    expect(writeCosmosPlacement("local:alpha", { version: 1, centres })).toBe(false);
    expect(window.localStorage.getItem(KEY)).toBeNull();
  });

  it("clears the record", () => {
    writeCosmosPlacement("local:alpha", record(1));
    clearCosmosPlacement("local:alpha");
    expect(readCosmosPlacement("local:alpha")).toBeNull();
  });
});
