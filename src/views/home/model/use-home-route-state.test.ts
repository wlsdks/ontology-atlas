import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useHomeRouteState } from "./use-home-route-state";

// The hook uses `useSearchParams` only as a re-render trigger; window.location
// is the source of truth, so a minimal stub echoing the URL is enough.
vi.mock("next/navigation", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/navigation")>()),
  useSearchParams: () => new URLSearchParams(window.location.search),
}));

function currentUrl() {
  return `${window.location.pathname}${window.location.search}`;
}

describe("useHomeRouteState — 히스토리 계약", () => {
  beforeEach(() => {
    window.history.replaceState({}, "", "/ko/topology/?p=ontology-atlas");
  });

  /**
   * Regression: landing from the project detail's "view on the map" stacked
   * two history entries (measured 2→4), so the first Back changed nothing on
   * screen. Cause: normalisation effects running right after landing called
   * pushState **even though they resolved to the same URL**.
   */
  it("결과 URL 이 지금과 같으면 히스토리에 칸을 만들지 않는다", () => {
    const { result } = renderHook(() => useHomeRouteState());
    const before = window.history.length;

    act(() => {
      result.current[1]((current) => current);
    });

    expect(window.history.length).toBe(before);
    expect(currentUrl()).toBe("/ko/topology/?p=ontology-atlas");
  });

  it("실제로 달라지는 갱신은 딱 한 칸만 push 한다", () => {
    const { result } = renderHook(() => useHomeRouteState());
    const before = window.history.length;

    act(() => {
      result.current[1]({ selectedSlug: "docs-vault" });
    });

    expect(window.history.length).toBe(before + 1);
    expect(currentUrl()).toContain("p=docs-vault");
  });

  it("replace 옵션은 새 칸 대신 현재 칸을 덮는다 — 딥링크 정규화용", () => {
    const { result } = renderHook(() => useHomeRouteState());
    const before = window.history.length;

    act(() => {
      result.current[1]({ selectedSlug: "docs-vault" }, { replace: true });
    });

    expect(window.history.length).toBe(before);
    expect(currentUrl()).toContain("p=docs-vault");
  });

  it("대화창을 닫으면 전체 그래프 요청을 현재 주소에서 지운다", () => {
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
