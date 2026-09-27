import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useHomeRouteState } from "./use-home-route-state";

// `useSearchParams` is only a re-render trigger, so a stub echoing the URL is enough.
vi.mock("next/navigation", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/navigation")>()),
  useSearchParams: () => new URLSearchParams(window.location.search),
}));

function currentUrl() {
  return `${window.location.pathname}${window.location.search}`;
}

describe("useHomeRouteState history contract", () => {
  beforeEach(() => {
    window.history.replaceState({}, "", "/ko/topology/?p=ontology-atlas");
  });

  /**
   * Normalisation effects resolving to the same URL must not push, or the first Back changes
   * nothing.
   */
  it("adds no history entry when the resulting URL is unchanged", () => {
    const { result } = renderHook(() => useHomeRouteState());
    const before = window.history.length;

    act(() => {
      result.current[1]((current) => current);
    });

    expect(window.history.length).toBe(before);
    expect(currentUrl()).toBe("/ko/topology/?p=ontology-atlas");
  });

  it("pushes exactly one entry for an update that changes the URL", () => {
    const { result } = renderHook(() => useHomeRouteState());
    const before = window.history.length;

    act(() => {
      result.current[1]({ selectedSlug: "docs-vault" });
    });

    expect(window.history.length).toBe(before + 1);
    expect(currentUrl()).toContain("p=docs-vault");
  });

  it("the replace option overwrites the current entry for deep-link normalization", () => {
    const { result } = renderHook(() => useHomeRouteState());
    const before = window.history.length;

    act(() => {
      result.current[1]({ selectedSlug: "docs-vault" }, { replace: true });
    });

    expect(window.history.length).toBe(before);
    expect(currentUrl()).toContain("p=docs-vault");
  });

  it("closing the chat removes the whole-graph request from the current address", () => {
    window.history.replaceState(
      {},
      "",
      "/ko/topology/?ask=business-flow&via=insights%3Aflow",
    );
    const { result } = renderHook(() => useHomeRouteState());

    act(() => {
      result.current[1](
        { askIntent: null, askBusinessFlow: false },
        { replace: true },
      );
    });

    expect(currentUrl()).toBe("/ko/topology/?via=insights%3Aflow");
    expect(result.current[0].askBusinessFlow).toBe(false);
  });
});
