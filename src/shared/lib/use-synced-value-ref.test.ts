import { renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { useSyncedValueRef } from "./use-synced-value-ref";

describe("useSyncedValueRef", () => {
  it("keeps a stable ref updated with the latest value", () => {
    const { result, rerender } = renderHook(
      ({ value }: { value: boolean }) => useSyncedValueRef(value),
      { initialProps: { value: false } },
    );
    const initialRef = result.current;

    expect(result.current.current).toBe(false);

    rerender({ value: true });

    expect(result.current).toBe(initialRef);
    expect(result.current.current).toBe(true);
  });
});
