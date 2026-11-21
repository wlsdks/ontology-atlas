import { beforeEach, describe, expect, it } from "vitest";
import { readStoredSlugs, togglePinnedInStorage } from "./pinned-docs-storage";

const KEY = "test:pinned";

describe("readStoredSlugs", () => {
  beforeEach(() => window.localStorage.clear());

  it("reads the saved strings up to the limit", () => {
    window.localStorage.setItem(KEY, JSON.stringify(["a", "b", "c"]));
    expect(readStoredSlugs(KEY, 2)).toEqual(["a", "b"]);
  });

  it("reads anything that is not a list of strings as empty or filters it", () => {
    expect(readStoredSlugs(KEY, 5)).toEqual([]);
    window.localStorage.setItem(KEY, "not json");
    expect(readStoredSlugs(KEY, 5)).toEqual([]);
    window.localStorage.setItem(KEY, JSON.stringify({ a: 1 }));
    expect(readStoredSlugs(KEY, 5)).toEqual([]);
    window.localStorage.setItem(KEY, JSON.stringify(["a", 3, null, "b"]));
    expect(readStoredSlugs(KEY, 5)).toEqual(["a", "b"]);
  });
});

describe("togglePinnedInStorage", () => {
  beforeEach(() => window.localStorage.clear());

  it("pins at the front and unpins on the second toggle, saving each result", () => {
    expect(togglePinnedInStorage(KEY, "a")).toEqual(["a"]);
    expect(togglePinnedInStorage(KEY, "b")).toEqual(["b", "a"]);
    expect(JSON.parse(window.localStorage.getItem(KEY) ?? "[]")).toEqual(["b", "a"]);
    expect(togglePinnedInStorage(KEY, "b")).toEqual(["a"]);
  });
});
