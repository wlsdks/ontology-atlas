import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { PREFERENCE_CHANGE_EVENT, definePreference } from "./define-preference";

const pref = definePreference({ key: "atlas.test.pref", values: ["a", "b"] as const, fallback: "a" });

beforeEach(() => {
  window.localStorage.clear();
});

describe("definePreference", () => {
  it("falls back on a missing or unknown value", () => {
    expect(pref.read()).toBe("a");
    window.localStorage.setItem("atlas.test.pref", "zzz");
    expect(pref.read()).toBe("a");
    expect(pref.resolve("b")).toBe("b");
  });

  it("persists a write and announces it in this tab", () => {
    const heard = vi.fn();
    window.addEventListener(PREFERENCE_CHANGE_EVENT, heard);
    pref.write("b");
    window.removeEventListener(PREFERENCE_CHANGE_EVENT, heard);
    expect(window.localStorage.getItem("atlas.test.pref")).toBe("b");
    expect(heard).toHaveBeenCalledTimes(1);
  });

  it("updates every hook subscriber on a same-tab write", () => {
    const { result } = renderHook(() => pref.use());
    expect(result.current).toBe("a");
    act(() => pref.write("b"));
    expect(result.current).toBe("b");
  });

  it("follows another tab through the storage event for its own key only", () => {
    const onChange = vi.fn();
    const stop = pref.subscribe(onChange);
    window.dispatchEvent(new StorageEvent("storage", { key: "atlas.other" }));
    expect(onChange).not.toHaveBeenCalled();
    window.dispatchEvent(new StorageEvent("storage", { key: "atlas.test.pref" }));
    expect(onChange).toHaveBeenCalledTimes(1);
    stop();
  });

  it("still answers when storage throws", () => {
    const spy = vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    expect(pref.read()).toBe("a");
    spy.mockRestore();
  });
});
