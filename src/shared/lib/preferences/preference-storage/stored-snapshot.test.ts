import { afterEach, describe, expect, it, vi } from "vitest";

import { createStoredSnapshot } from "./stored-snapshot";

const KEY = "test:stored-snapshot";

afterEach(() => {
  window.localStorage.clear();
  vi.restoreAllMocks();
});

describe("a stored value read as a snapshot", () => {
  it("returns the same object until the stored text changes, and parses once per change", () => {
    const fallback = { count: 0 };
    const parse = vi.fn(() => ({ count: Number(window.localStorage.getItem(KEY)) }));
    const snapshot = createStoredSnapshot(KEY, fallback, parse);

    expect(snapshot()).toBe(fallback);
    window.localStorage.setItem(KEY, "3");
    const first = snapshot();
    expect(first).toEqual({ count: 3 });
    expect(snapshot()).toBe(first);
    expect(parse).toHaveBeenCalledTimes(1);

    window.localStorage.setItem(KEY, "4");
    expect(snapshot()).toEqual({ count: 4 });
    expect(parse).toHaveBeenCalledTimes(2);
  });

  it("parses again when the stored text is removed, so a cleared setting returns to its default", () => {
    const fallback = { count: 0 };
    const parse = vi.fn(() => (window.localStorage.getItem(KEY) === null ? fallback : { count: 9 }));
    const snapshot = createStoredSnapshot(KEY, fallback, parse);
    window.localStorage.setItem(KEY, "x");
    expect(snapshot()).toEqual({ count: 9 });
    window.localStorage.removeItem(KEY);
    expect(snapshot()).toBe(fallback);
  });

  it("returns the fallback when storage cannot be read", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    const fallback = { count: 0 };
    const parse = vi.fn(() => ({ count: 1 }));
    expect(createStoredSnapshot(KEY, fallback, parse)()).toBe(fallback);
    expect(parse).not.toHaveBeenCalled();
  });
});
