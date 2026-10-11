import { afterEach, describe, expect, it } from "vitest";
import { renderHook } from "@testing-library/react";
import { useDocumentTitle } from "./use-document-title";

const ORIGINAL_TITLE = document.title;

afterEach(() => {
  document.title = ORIGINAL_TITLE;
});

describe("useDocumentTitle", () => {
  it("문자열 전달 시 document.title 갱신", () => {
    renderHook(() => useDocumentTitle("Demo · demo"));
    expect(document.title).toBe("Demo · demo");
  });

  it("null/빈 값은 무시", () => {
    document.title = "Untouched";
    renderHook(() => useDocumentTitle(null));
    expect(document.title).toBe("Untouched");
    renderHook(() => useDocumentTitle(""));
    expect(document.title).toBe("Untouched");
  });

  it("unmount 시 다음 화면이 이미 쓴 제목을 덮지 않는다", () => {
    // Restoring the title captured at mount wrote this route's metadata title
    // over the next route's own after Next had applied it (design audit
    // 2026-09-04: leaving the insights board left "My folder analysis" on
    // /git). The destination route owns the title from unmount on.
    document.title = "Before";
    const { unmount } = renderHook(() => useDocumentTitle("During"));
    expect(document.title).toBe("During");
    document.title = "Next route";
    unmount();
    expect(document.title).toBe("Next route");
  });

  it("입력값 변경 시 새 값 반영", () => {
    const { rerender } = renderHook(
      ({ value }: { value: string }) => useDocumentTitle(value),
      { initialProps: { value: "First" } },
    );
    expect(document.title).toBe("First");
    rerender({ value: "Second" });
    expect(document.title).toBe("Second");
  });
});
