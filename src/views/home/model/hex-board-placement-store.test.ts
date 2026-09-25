import { afterEach, describe, expect, it } from "vitest";
import { readHexPlacement, writeHexPlacement } from "./hex-board-placement-store";

const record = (q: number) => ({ version: 1 as const, reg: 2, seeds: { "domain:a": [q, 0] as [number, number] }, cells: {} });

describe("hex board placement store", () => {
  afterEach(() => window.localStorage.clear());

  it("keeps one placement per vault identity under atlas.map.hex-board.v1:", () => {
    writeHexPlacement("local:alpha", record(3));
    writeHexPlacement("sample:dogfood", record(-3));
    expect(window.localStorage.getItem("atlas.map.hex-board.v1:local:alpha")).not.toBeNull();
    expect(readHexPlacement("local:alpha")?.seeds["domain:a"]).toEqual([3, 0]);
    expect(readHexPlacement("sample:dogfood")?.seeds["domain:a"]).toEqual([-3, 0]);
    expect(readHexPlacement("local:beta")).toBeNull();
  });

  it("ignores a record it cannot read", () => {
    window.localStorage.setItem("atlas.map.hex-board.v1:local:alpha", "{not json");
    expect(readHexPlacement("local:alpha")).toBeNull();
    window.localStorage.setItem("atlas.map.hex-board.v1:local:alpha", JSON.stringify({ version: 2 }));
    expect(readHexPlacement("local:alpha")).toBeNull();
  });
});
