import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { useStampedCache } from "./use-stamped-cache";

describe("current Library read cache", () => {
  it("accepts new input arrays with the same stamps without restarting render", () => {
    const { result, rerender } = renderHook((stamps: string[]) => useStampedCache([...stamps]), { initialProps: ["page@1"] });
    act(() => result.current.publish(new Map([["page@1", "Current"]])));
    const values = result.current.values;
    rerender(["page@1"]);
    expect(result.current.values).toBe(values);
  });

  it("retains current values and releases old revisions across a thousand replacements", () => {
    const { result, rerender } = renderHook(useStampedCache, { initialProps: ["stable", "page@0"] });
    act(() => result.current.publish(new Map([["stable", "Shared"], ["page@0", "First"]])));
    for (let revision = 1; revision <= 1000; revision += 1) {
      const stamp = `page@${revision}`;
      rerender(["stable", stamp]);
      act(() => result.current.publish(new Map([[stamp, `Body ${revision}`]])));
      expect([...result.current.values]).toEqual([["stable", "Shared"], [stamp, `Body ${revision}`]]);
    }
    rerender([]);
    expect(result.current.values.size).toBe(0);
  });

  it("rejects a completed read for a folder or revision that is no longer current", () => {
    const { result, rerender } = renderHook(useStampedCache, { initialProps: ["first\0페이지@1"] });
    const publish = result.current.publish;
    act(() => publish(new Map([["first\0페이지@1", "Private first folder"]])));
    rerender(["second\0페이지@1"]);
    act(() => publish(new Map([["first\0페이지@1", "Late first read"], ["second\0페이지@1", "Current"]])));
    expect([...result.current.values]).toEqual([["second\0페이지@1", "Current"]]);
  });
});
