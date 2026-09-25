import { describe, expect, it } from "vitest";
import { decideMapViewSync } from "./use-territories-view-sync";

describe("map view address sync", () => {
  it("writes the address when the reader picks a view, and not when it already says so", () => {
    expect(decideMapViewSync("stored-changed", "hex", null)).toEqual({ adopt: null, write: "hex" });
    expect(decideMapViewSync("stored-changed", null, "hex")).toEqual({ adopt: null, write: null });
    expect(decideMapViewSync("stored-changed", "hex", "hex")).toEqual({ adopt: null, write: undefined });
  });

  it("adopts an address that names a view, on arrival or later", () => {
    expect(decideMapViewSync("arrival", null, "hex")).toEqual({ adopt: "hex", write: undefined });
    expect(decideMapViewSync("address-changed", "territories", "hex")).toEqual({ adopt: "hex", write: undefined });
  });

  it("writes a stored view once on arrival", () => {
    expect(decideMapViewSync("arrival", "hex", null)).toEqual({ adopt: null, write: "hex" });
  });

  it("never answers another writer's bare address with a write — 20 of them write nothing", () => {
    for (let i = 0; i < 20; i += 1) expect(decideMapViewSync("address-changed", "hex", null)).toEqual({ adopt: null, write: undefined });
  });
});
