import { describe, expect, it } from "vitest";

import { selectLibraryHandle } from "./select-library-handle";

const handle = { name: "atlas" } as unknown as FileSystemDirectoryHandle;

describe("selectLibraryHandle", () => {
  it("keeps the folder across a rescan of the same handle", () => {
    expect(selectLibraryHandle("loaded", handle)).toBe(handle);
    expect(selectLibraryHandle("loading", handle)).toBe(handle);
  });

  it("has no folder before one is chosen, or when access is lost", () => {
    expect(selectLibraryHandle("idle", handle)).toBeNull();
    expect(selectLibraryHandle("permission-needed", handle)).toBeNull();
    expect(selectLibraryHandle("error", handle)).toBeNull();
    expect(selectLibraryHandle("loading", null)).toBeNull();
    expect(selectLibraryHandle("loaded", undefined)).toBeNull();
  });
});
