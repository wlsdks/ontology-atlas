import { describe, expect, it, vi, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { createRef } from "react";
import {
  BACK_TO_TOP_SCROLL_THRESHOLD,
  shouldShowBackToTop,
  useBackToTop,
} from "./use-back-to-top";

describe("shouldShowBackToTop (pure threshold)", () => {
  it("stays hidden at and below the threshold (639/640)", () => {
    expect(shouldShowBackToTop(639)).toBe(false);
    expect(shouldShowBackToTop(BACK_TO_TOP_SCROLL_THRESHOLD)).toBe(false);
  });

  it("shows just past the threshold (641)", () => {
    expect(shouldShowBackToTop(BACK_TO_TOP_SCROLL_THRESHOLD + 1)).toBe(true);
  });
});

describe("useBackToTop", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  function makeScrollableDiv() {
    const el = document.createElement("div");
    document.body.appendChild(el);
    return el;
  }

  it("toggles visible based on scrollTop crossing the threshold", () => {
    const el = makeScrollableDiv();
    const ref = createRef<HTMLDivElement | null>();
    ref.current = el;

    const { result } = renderHook(() => useBackToTop(ref, "doc-a"));
    expect(result.current.visible).toBe(false);

    act(() => {
      Object.defineProperty(el, "scrollTop", { value: 700, configurable: true });
      el.dispatchEvent(new Event("scroll"));
    });
    expect(result.current.visible).toBe(true);

    act(() => {
      Object.defineProperty(el, "scrollTop", { value: 10, configurable: true });
      el.dispatchEvent(new Event("scroll"));
    });
    expect(result.current.visible).toBe(false);

    document.body.removeChild(el);
  });

  it("resets visible to false when the dependency key (selected doc) changes", async () => {
    const el = makeScrollableDiv();
    const ref = createRef<HTMLDivElement | null>();
    ref.current = el;

    const { result, rerender } = renderHook(
      ({ key }: { key: string }) => useBackToTop(ref, key),
      { initialProps: { key: "doc-a" } },
    );

    act(() => {
      Object.defineProperty(el, "scrollTop", { value: 900, configurable: true });
      el.dispatchEvent(new Event("scroll"));
    });
    expect(result.current.visible).toBe(true);

    // The reset is deferred to a microtask (scheduleStateSync) — verify after the flush.
    await act(async () => {
      rerender({ key: "doc-b" });
      await Promise.resolve();
    });
    expect(result.current.visible).toBe(false);

    document.body.removeChild(el);
  });

  it("scrollToTop calls scrollTo with smooth behavior by default", () => {
    const el = makeScrollableDiv();
    const scrollTo = vi.fn();
    el.scrollTo = scrollTo;
    const ref = createRef<HTMLDivElement | null>();
    ref.current = el;

    const { result } = renderHook(() => useBackToTop(ref, "doc-a"));
    act(() => {
      result.current.scrollToTop();
    });

    expect(scrollTo).toHaveBeenCalledWith({ top: 0, behavior: "smooth" });
    document.body.removeChild(el);
  });

  it("scrollToTop uses instant behavior when the user prefers reduced motion", () => {
    const el = makeScrollableDiv();
    const scrollTo = vi.fn();
    el.scrollTo = scrollTo;
    const ref = createRef<HTMLDivElement | null>();
    ref.current = el;

    vi.stubGlobal(
      "matchMedia",
      vi.fn().mockReturnValue({ matches: true }),
    );

    const { result } = renderHook(() => useBackToTop(ref, "doc-a"));
    act(() => {
      result.current.scrollToTop();
    });

    expect(scrollTo).toHaveBeenCalledWith({ top: 0, behavior: "auto" });
    document.body.removeChild(el);
  });
});
