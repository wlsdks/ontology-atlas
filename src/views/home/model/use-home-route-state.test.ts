import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useHomeRouteState } from "./use-home-route-state";

// 이 훅은 `useSearchParams` 를 re-render 트리거로만 쓴다 — 값의 진실원은
// window.location 이라 URL 을 그대로 되돌려주는 최소 stub 이면 충분하다.
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
   * F3 회귀 — 프로젝트 상세의 "지도에서 보기"로 착지하면 히스토리가 두 칸
   * 쌓여(실측 2→4) 뒤로가기 첫 번째가 화면을 하나도 바꾸지 못했다. 착지 직후
   * 도는 정규화 이펙트가 **같은 URL 로 귀결되는데도** pushState 를 부른 탓이다.
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
});
