import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { LibrarySourceRow } from "@/entities/docs-vault";
import type { SourcePick } from "@/widgets/library-sources-overview";

import { useSourcePick } from "./use-source-pick";

const t = ((key: string, values?: Record<string, string>) => `${key}:${Object.values(values ?? {}).join(",")}`) as never;
const folderPick: SourcePick = { grouping: "folder", keys: ["folder:notes"], name: "notes" };
const row = (path: string) => ({ path, format: "md" }) as unknown as LibrarySourceRow;

describe("useSourcePick", () => {
  it("narrows to the picked folder, names it, unfolds the index and clears itself", () => {
    const unfoldIndex = vi.fn();
    const { result } = renderHook(() => useSourcePick({ workVaultScope: "a", unfoldIndex, t }));
    expect(result.current.sourceGroupFilter).toBeNull();
    act(() => result.current.setSourcePick(folderPick));
    expect(unfoldIndex).toHaveBeenCalledTimes(1);
    expect(result.current.sourceGroupFilter?.label).toBe("sourcesHome.listFolder:notes");
    expect(result.current.sourceGroupFilter?.includes(row("notes/a.md"))).toBe(true);
    expect(result.current.sourceGroupFilter?.includes(row("other/a.md"))).toBe(false);
    act(() => result.current.sourceGroupFilter?.onClear());
    expect(result.current.sourcePick).toBeNull();
    expect(unfoldIndex).toHaveBeenCalledTimes(1);
  });

  it("drops a pick when the folder changes", () => {
    const { result, rerender } = renderHook(({ scope }) => useSourcePick({ workVaultScope: scope, unfoldIndex: () => {}, t }), {
      initialProps: { scope: "a" },
    });
    act(() => result.current.setSourcePick(folderPick));
    expect(result.current.sourcePick).toBe(folderPick);
    rerender({ scope: "b" });
    expect(result.current.sourcePick).toBeNull();
  });
});
