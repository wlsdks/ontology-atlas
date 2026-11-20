import { renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { useSteadyFix } from "./use-steady-fix";

describe("the page's steady Fix action", () => {
  it("stays one object while what it shows is the same, and a press runs the latest action", () => {
    const first = vi.fn();
    const second = vi.fn();
    const { result, rerender } = renderHook(({ onPress, disabled }) => useSteadyFix({ mode: "agent", disabled, onPress }), {
      initialProps: { onPress: first, disabled: false },
    });
    const before = result.current;
    rerender({ onPress: second, disabled: false });
    expect(result.current).toBe(before);
    result.current!.onPress();
    expect(second).toHaveBeenCalledTimes(1);
    expect(first).not.toHaveBeenCalled();
    rerender({ onPress: second, disabled: true });
    expect(result.current).not.toBe(before);
    expect(result.current?.disabled).toBe(true);
  });

  it("is nothing when there is no action", () => {
    expect(renderHook(() => useSteadyFix(null)).result.current).toBeNull();
  });
});
