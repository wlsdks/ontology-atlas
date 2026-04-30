import { afterEach, describe, expect, it } from "vitest";
import { renderHook } from "@testing-library/react";
import { useDocumentTitle } from "./use-document-title";

const ORIGINAL_TITLE = document.title;

afterEach(() => {
  document.title = ORIGINAL_TITLE;
});

describe("useDocumentTitle", () => {
  it("문자열 전달 시 document.title 갱신", () => {
    renderHook(() => useDocumentTitle("Narnia · narnia"));
    expect(document.title).toBe("Narnia · narnia");
  });

  it("null/빈 값은 무시", () => {
    document.title = "Untouched";
    renderHook(() => useDocumentTitle(null));
    expect(document.title).toBe("Untouched");
    renderHook(() => useDocumentTitle(""));
    expect(document.title).toBe("Untouched");
  });

  it("unmount 시 직전 값으로 복원", () => {
    document.title = "Before";
    const { unmount } = renderHook(() => useDocumentTitle("During"));
    expect(document.title).toBe("During");
    unmount();
    expect(document.title).toBe("Before");
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
