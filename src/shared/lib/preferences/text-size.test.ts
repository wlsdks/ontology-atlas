import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";

import {
  TEXT_SIZES,
  TEXT_SIZE_ATTRIBUTE,
  TEXT_SIZE_ROOT_PERCENT,
  useTextSize,
  writeTextSize,
} from "./text-size";

beforeEach(() => {
  window.localStorage.clear();
  document.documentElement.removeAttribute(TEXT_SIZE_ATTRIBUTE);
});

describe("text size", () => {
  it("has three steps at 100, 112.5 and 125 percent", () => {
    expect(TEXT_SIZES.map((size) => TEXT_SIZE_ROOT_PERCENT[size])).toEqual([100, 112.5, 125]);
  });

  it("sets the root attribute and removes it again at default", () => {
    writeTextSize("larger");
    expect(document.documentElement.getAttribute(TEXT_SIZE_ATTRIBUTE)).toBe("larger");
    writeTextSize("default");
    expect(document.documentElement.hasAttribute(TEXT_SIZE_ATTRIBUTE)).toBe(false);
  });

  it("is shared by every subscriber", () => {
    const { result } = renderHook(() => useTextSize());
    expect(result.current).toBe("default");
    act(() => writeTextSize("large"));
    expect(result.current).toBe("large");
  });
});
