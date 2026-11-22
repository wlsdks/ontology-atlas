import { afterEach, describe, expect, it } from "vitest";
import { renderHook } from "@testing-library/react";

import {
  LIBRARY_TOAST_BOTTOM_OFFSET,
  LIBRARY_TOAST_DIALOG_OFFSET,
  LIBRARY_TOAST_RIGHT_OFFSET,
} from "@/shared/ui/toast/toast-position";

import { libraryToastOffsets, useLibraryToastOffsets } from "./library-toast-offsets";

describe("libraryToastOffsets", () => {
  it("rests in the page corner and moves in for a dialog", () => {
    expect(libraryToastOffsets({ dialogOpen: false, workCardShown: false })).toEqual({
      right: LIBRARY_TOAST_RIGHT_OFFSET,
      workCardBottom: LIBRARY_TOAST_BOTTOM_OFFSET,
      toastBottom: LIBRARY_TOAST_BOTTOM_OFFSET,
    });
    expect(libraryToastOffsets({ dialogOpen: true, workCardShown: false }).right).toBe(LIBRARY_TOAST_DIALOG_OFFSET);
  });

  it("stands a toast above the work card instead of over it, leaving the card in the corner", () => {
    const offsets = libraryToastOffsets({ dialogOpen: false, workCardShown: true });
    expect(offsets.workCardBottom).toBe(LIBRARY_TOAST_BOTTOM_OFFSET);
    expect(offsets.toastBottom).toBe(`calc(${LIBRARY_TOAST_BOTTOM_OFFSET} + 9rem + 12px)`);
  });
});

describe("useLibraryToastOffsets", () => {
  afterEach(() => document.documentElement.removeAttribute("style"));

  it("sets the toast properties while mounted and removes them on unmount", () => {
    const root = document.documentElement;
    const { unmount } = renderHook(() => useLibraryToastOffsets({ dialogOpen: false, workCardShown: true }));
    expect(root.style.getPropertyValue("--app-toast-right-offset")).toBe(LIBRARY_TOAST_RIGHT_OFFSET);
    expect(root.style.getPropertyValue("--app-toast-bottom-offset")).toContain("9rem");
    unmount();
    expect(root.style.getPropertyValue("--app-toast-right-offset")).toBe("");
    expect(root.style.getPropertyValue("--app-toast-bottom-offset")).toBe("");
  });
});
