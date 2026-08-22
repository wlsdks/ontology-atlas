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
    // Regression guard: at mount the document-selection effect (openTab) runs before the hydration
    // microtask. Saving against empty state wiped the previous session's tabs entirely, breaking the
    // owner's contract "still there after restarting the app".
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
    // Not hydrated yet — state is empty.
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
    // The window where a document from a new vault is opened before hydration — the previous
    // vault's tabs must not leak into the new vault's storage.
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
