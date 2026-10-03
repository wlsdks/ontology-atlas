import { renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { DialMemory } from "@/widgets/ontology-map";
import { writeFlatRingMemory } from "./flat-ring-memory-store";
import { useFlatRingMemory } from "./use-flat-ring-memory";

const memory = (angle: number): DialMemory => ({
  order: ["domain:a"],
  radiusByStep: new Map([[0, 400]]),
  angleById: new Map([["domain:a", { step: 0, angle }]]),
  itemOrder: new Map([["domain:a", ["capability:x"]]]),
});

describe("useFlatRingMemory", () => {
  afterEach(() => window.localStorage.clear());

  it("reads the folder's record once and returns the latest write", () => {
    writeFlatRingMemory("local:alpha", memory(1));
    const { result } = renderHook(() => useFlatRingMemory("local:alpha"));
    expect(result.current.current()?.angleById.get("domain:a")).toEqual({ step: 0, angle: 1 });
    const next = memory(2);
    result.current.write(next);
    expect(result.current.current()).toBe(next);
  });

  it("re-reads when the folder changes", () => {
    writeFlatRingMemory("local:beta", memory(7));
    const { result, rerender } = renderHook(({ key }) => useFlatRingMemory(key), { initialProps: { key: "local:alpha" } });
    expect(result.current.current()).toBeNull();
    rerender({ key: "local:beta" });
    expect(result.current.current()?.angleById.get("domain:a")).toEqual({ step: 0, angle: 7 });
  });

  it("makes no function per folder, so a kept store cannot pin the render that made it", () => {
    const { result, rerender } = renderHook(({ key }) => useFlatRingMemory(key), { initialProps: { key: "local:alpha" } });
    const first = result.current;
    rerender({ key: "local:beta" });
    const second = result.current;
    expect(second).not.toBe(first);
    for (const method of ["current", "write"] as const) expect(second[method]).toBe(first[method]);
    expect(Object.values(second).filter((value) => typeof value === "function")).toEqual([]);
  });
});
