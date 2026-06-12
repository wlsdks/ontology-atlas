import { renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { useLocalStorageBoolean } from "./use-local-storage-boolean";

describe("useLocalStorageBoolean", () => {
  afterEach(() => {
    window.localStorage.clear();
  });

  it("uses the fallback when no stored value exists", () => {
    const { result } = renderHook(() =>
      useLocalStorageBoolean("test:boolean", true),
    );

    expect(result.current).toBe(true);
  });

  it("reads a stored false value without a mount-time state effect", () => {
    window.localStorage.setItem("test:boolean", "0");

    const { result } = renderHook(() =>
      useLocalStorageBoolean("test:boolean", true),
    );

    expect(result.current).toBe(false);
  });
});
