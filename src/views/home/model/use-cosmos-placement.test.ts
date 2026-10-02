import { renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { useCosmosPlacement } from "./use-cosmos-placement";

const KEY = "atlas.map.cosmos.v1:local:alpha";
const record = (x: number) => ({ version: 1 as const, centres: { "domain:a": [x, 0] as [number, number] } });

describe("useCosmosPlacement", () => {
  afterEach(() => window.localStorage.clear());

  it("returns the latest write, not the record it first read", () => {
    window.localStorage.setItem(KEY, JSON.stringify(record(1)));
    const { result } = renderHook(() => useCosmosPlacement("local:alpha"));
    expect(result.current.current()?.centres["domain:a"]).toEqual([1, 0]);
    const a = record(10);
    const b = record(20);
    result.current.write(a);
    result.current.write(b);
    expect(result.current.current()).toBe(b);
    expect(JSON.parse(window.localStorage.getItem(KEY)!)).toEqual(b);
  });

  it("clears to null", () => {
    const { result } = renderHook(() => useCosmosPlacement("local:alpha"));
    result.current.write(record(5));
    result.current.clear();
    expect(result.current.current()).toBeNull();
    expect(window.localStorage.getItem(KEY)).toBeNull();
  });

  it("re-reads when the vault changes", () => {
    window.localStorage.setItem("atlas.map.cosmos.v1:local:beta", JSON.stringify(record(7)));
    const { result, rerender } = renderHook(({ key }) => useCosmosPlacement(key), { initialProps: { key: "local:alpha" } });
    expect(result.current.current()).toBeNull();
    rerender({ key: "local:beta" });
    expect(result.current.current()?.centres["domain:a"]).toEqual([7, 0]);
  });

  it("drops an oversize record instead of writing it", () => {
    const { result } = renderHook(() => useCosmosPlacement("local:alpha"));
    const centres: Record<string, [number, number]> = {};
    for (let i = 0; i < 12_000; i += 1) centres[`domain:${i.toString().padStart(8, "0")}`] = [i + 0.25, -i - 0.75];
    result.current.write({ version: 1, centres });
    expect(result.current.current()).toBeNull();
    expect(window.localStorage.getItem(KEY)).toBeNull();
  });
});
