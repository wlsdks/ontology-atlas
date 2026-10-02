import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { useStampedCache } from "./use-stamped-cache";

describe("current Library read cache", () => {
  it("publishes current values without enumerating unrelated read entries", () => {
    const { result } = renderHook(useStampedCache, { initialProps: ["body@1", "hash@1"] });
    act(() => result.current.publish(new Map([["body@1", "Old"], ["hash@1", "Old hash"]])));
    const read = new Map(Array.from({ length: 1000 }, (_, index) => [`stale@${index}`, "Stale"]));
    read.set("hash@1", "");
    read.set("body@1", "New");
    let iterated = 0;
    const tracked = new Proxy(read, {
      get(target, key) {
        if (key === Symbol.iterator) return function* () {
          for (const entry of target) { iterated += 1; yield entry; }
        };
        const value = Reflect.get(target, key, target);
        return typeof value === "function" ? value.bind(target) : value;
      },
    });
    act(() => result.current.publish(tracked));
    expect([...result.current.values]).toEqual([["body@1", "New"], ["hash@1", ""]]);
    expect(read.size).toBe(1002);
    expect(iterated).toBe(0);
  });

  it("keeps old values not supplied by a later publication", () => {
    const { result } = renderHook(useStampedCache, { initialProps: ["second", "first"] });
    act(() => result.current.publish(new Map([["first", "One"], ["second", "Two"]])));
    act(() => result.current.publish(new Map([["first", "Changed"]])));
    expect([...result.current.values]).toEqual([["second", "Two"], ["first", "Changed"]]);
  });

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
