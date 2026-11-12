import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const font = vi.hoisted(() => ({ settled: false, adopted: false, resolve: (_: boolean) => {} }));

vi.mock("@/widgets/ontology-map", () => ({
  bodyLabelFontSettled: () => font.settled,
  bodyLabelFontAdopted: () => font.adopted,
  adoptBodyLabelFont: () =>
    new Promise<boolean>((resolve) => {
      font.resolve = (adopted) => {
        font.settled = true;
        font.adopted = adopted;
        resolve(adopted);
      };
    }),
}));

import { LABEL_FONT_WAIT_MS, useBodyLabelFont } from "./use-body-label-font";

describe("useBodyLabelFont", () => {
  beforeEach(() => {
    font.settled = false;
    font.adopted = false;
  });
  afterEach(() => vi.useRealTimers());

  it("holds the map until the label font settles, so no layout is measured in a face about to change", async () => {
    const { result } = renderHook(() => useBodyLabelFont());
    expect(result.current.ready).toBe(false);
    await act(async () => font.resolve(true));
    expect(result.current).toEqual({ ready: true, adopted: true });
  });

  it("opens at once when an earlier visit already settled the font", () => {
    font.settled = true;
    font.adopted = true;
    const { result } = renderHook(() => useBodyLabelFont());
    expect(result.current).toEqual({ ready: true, adopted: true });
  });

  it("opens in the fallback face when the font stalls, and still adopts it when it arrives", async () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useBodyLabelFont());
    act(() => vi.advanceTimersByTime(LABEL_FONT_WAIT_MS));
    expect(result.current).toEqual({ ready: true, adopted: false });
    await act(async () => font.resolve(true));
    expect(result.current.adopted).toBe(true);
  });
});
