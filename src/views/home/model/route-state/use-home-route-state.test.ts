import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { parseSearch } from "@/shared/lib/navigation/atlas-search";
import { useHomeRouteState } from "./use-home-route-state";

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
    const { result } = renderHook(() => useHomeRouteState(parseSearch(window.location.search)));
    const before = window.history.length;

    act(() => {
      result.current[1]((current) => current);
    });

    expect(window.history.length).toBe(before);
    expect(currentUrl()).toBe("/ko/topology/?p=ontology-atlas");
  });

  it("pushes exactly one entry for an update that changes the URL", () => {
    const { result } = renderHook(() => useHomeRouteState(parseSearch(window.location.search)));
    const before = window.history.length;

    act(() => {
      result.current[1]({ selectedSlug: "docs-vault" });
    });

    expect(window.history.length).toBe(before + 1);
    expect(currentUrl()).toContain("p=docs-vault");
  });

  it("the replace option overwrites the current entry for deep-link normalization", () => {
    const { result } = renderHook(() => useHomeRouteState(parseSearch(window.location.search)));
    const before = window.history.length;

    act(() => {
      result.current[1]({ selectedSlug: "docs-vault" }, { replace: true });
    });

    expect(window.history.length).toBe(before);
    expect(currentUrl()).toContain("p=docs-vault");
  });

  /**
   * The router hands a written query back in a transition, so `search` here stays the old one, as it
   * does for the renders between a write and the router's commit. A panel closed beside its address
   * write must not render with the old query, or the effect that opens it on that query reopens it.
   */
  it("shows its own write before the router hands the new query back", () => {
    window.history.replaceState({}, "", "/ko/topology/?p=domain%3Aorders&workbench=create");
    const committed = parseSearch(window.location.search);
    const { result } = renderHook(() => useHomeRouteState(committed));
    expect(result.current[0].createNodeIntent).toBe(true);

    act(() => {
      result.current[1]((current) => ({ ...current, createNodeIntent: false }));
    });

    expect(currentUrl()).toBe("/ko/topology/?p=domain%3Aorders");
    expect(result.current[0].createNodeIntent).toBe(false);
    expect(result.current[0].selectedSlug).toBe("domain:orders");
  });

  it("shows the committed query once the window holds an address it did not write", () => {
    window.history.replaceState({}, "", "/ko/topology/?workbench=create");
    const committed = parseSearch(window.location.search);
    const { result, rerender } = renderHook(() => useHomeRouteState(committed));
    act(() => {
      result.current[1]({ createNodeIntent: false });
    });

    // The rail moved the window to the next screen before the router unmounted this one.
    window.history.pushState({}, "", "/ko/library/?tab=ontology");
    rerender();

    expect(result.current[0].createNodeIntent).toBe(true);
  });

  it("closing the chat removes the whole-graph request from the current address", () => {
    window.history.replaceState(
      {},
      "",
      "/ko/topology/?ask=business-flow&via=insights%3Aflow",
    );
    const { result } = renderHook(() => useHomeRouteState(parseSearch(window.location.search)));
    expect(result.current[0].askBusinessFlow).toBe(true);

    act(() => {
      result.current[1](
        { askIntent: null, askBusinessFlow: false },
        { replace: true },
      );
    });

    expect(currentUrl()).toBe("/ko/topology/?via=insights%3Aflow");
  });
});
