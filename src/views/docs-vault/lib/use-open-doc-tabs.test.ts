import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  docTabsStorageKey,
  readStoredActiveDocSlug,
  readStoredDocTabs,
  storeActiveDocSlug,
} from "./doc-tabs";
import { useOpenDocTabs } from "./use-open-doc-tabs";

const SOURCE = "server";
const KEY = docTabsStorageKey(SOURCE);

function seed(slugs: string[]) {
  window.localStorage.setItem(
    KEY,
    JSON.stringify(
      slugs.map((slug, index) => ({
        slug,
        title: slug,
        lastActivatedAt: 1_000 + index,
      })),
    ),
  );
}

afterEach(() => {
  window.localStorage.clear();
  vi.restoreAllMocks();
});

describe("useOpenDocTabs", () => {
  it("restores the previous session's tabs for the vault", async () => {
    seed(["a", "b", "c"]);
    const { result } = renderHook(() =>
      useOpenDocTabs({ sourceKey: SOURCE, validSlugs: new Set(["a", "b", "c"]) }),
    );
    expect(result.current.hydrated).toBe(false);
    await act(async () => {});
    expect(result.current.tabs.map((tab) => tab.slug)).toEqual(["a", "b", "c"]);
    expect(result.current.hydrated).toBe(true);
    expect(result.current.restoredActiveSlug).toBe("c");
  });

  it("restores the separately remembered active slug before timestamp fallback", async () => {
    seed(["a", "b", "c"]);
    storeActiveDocSlug(SOURCE, "a");
    const { result } = renderHook(() =>
      useOpenDocTabs({ sourceKey: SOURCE, validSlugs: new Set(["a", "b", "c"]) }),
    );
    await act(async () => {});
    expect(result.current.restoredActiveSlug).toBe("a");
  });

  it("remembers an explicit active slug for the current vault", async () => {
    seed(["a", "b"]);
    const { result } = renderHook(() =>
      useOpenDocTabs({ sourceKey: SOURCE, validSlugs: new Set(["a", "b"]) }),
    );
    await act(async () => {});
    act(() => {
      result.current.rememberActiveSlug("b");
    });
    expect(readStoredActiveDocSlug(SOURCE)).toBe("b");
    expect(result.current.restoredActiveSlug).toBe("b");
  });

  it("keeps the stored tabs when a document opens before hydration settles", () => {
    // 회귀 가드: 마운트 시 문서 선택 effect(openTab)가 하이드레이션
    // 마이크로태스크보다 먼저 돈다. 빈 state 를 기준으로 저장하면 이전
    // 세션 탭이 통째로 지워졌다 (소유자 계약 "앱을 다시 켜도 그대로" 위반).
    seed(["a", "b", "c"]);
    const deferred: Array<() => void> = [];
    vi.spyOn(globalThis, "queueMicrotask").mockImplementation((fn) => {
      deferred.push(fn as () => void);
    });

    const { result } = renderHook(() =>
      useOpenDocTabs({
        sourceKey: SOURCE,
        validSlugs: new Set(["a", "b", "c", "d"]),
      }),
    );
    // 아직 하이드레이션 전 — state 는 비어 있다.
    expect(result.current.tabs).toEqual([]);

    act(() => {
      result.current.openTab("d", "D");
    });

    expect(readStoredDocTabs(SOURCE).map((tab) => tab.slug)).toEqual([
      "a",
      "b",
      "c",
      "d",
    ]);

    act(() => {
      deferred.forEach((fn) => fn());
    });

    expect(result.current.tabs.map((tab) => tab.slug)).toEqual([
      "a",
      "b",
      "c",
      "d",
    ]);
  });

  it("does not leak the previous vault's tabs after a source switch", async () => {
    seed(["a", "b"]);
    window.localStorage.setItem(
      docTabsStorageKey("local:my-vault"),
      JSON.stringify([{ slug: "x", title: "X", lastActivatedAt: 1 }]),
    );
    const { result, rerender } = renderHook(
      ({ sourceKey }: { sourceKey: string }) =>
        useOpenDocTabs({ sourceKey, validSlugs: new Set(["a", "b", "x", "y"]) }),
      { initialProps: { sourceKey: SOURCE } },
    );
    await act(async () => {});
    expect(result.current.tabs.map((tab) => tab.slug)).toEqual(["a", "b"]);

    rerender({ sourceKey: "local:my-vault" });
    // 하이드레이션 전에 새 vault 문서가 열리는 구간 — 이전 vault 탭이
    // 새 vault 저장소로 새면 안 된다.
    act(() => {
      result.current.openTab("y", "Y");
    });
    expect(
      readStoredDocTabs("local:my-vault").map((tab) => tab.slug),
    ).toEqual(["x", "y"]);
    expect(readStoredDocTabs(SOURCE).map((tab) => tab.slug)).toEqual(["a", "b"]);
  });

  it("adds a new tab and persists it once hydrated", async () => {
    seed(["a"]);
    const { result } = renderHook(() =>
      useOpenDocTabs({ sourceKey: SOURCE, validSlugs: new Set(["a", "b"]) }),
    );
    await act(async () => {});
    act(() => {
      result.current.openTab("b", "B");
    });
    expect(result.current.tabs.map((tab) => tab.slug)).toEqual(["a", "b"]);
    expect(readStoredDocTabs(SOURCE).map((tab) => tab.slug)).toEqual(["a", "b"]);
  });
});
