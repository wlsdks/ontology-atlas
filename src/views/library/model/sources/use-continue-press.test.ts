import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { LibrarySourceRow } from "@/entities/docs-vault";

import { useContinuePress } from "./use-continue-press";

function row(index: number): LibrarySourceRow {
  const path = `sources/doc-${String(index).padStart(2, "0")}.md`;
  return { path, name: path.slice(8), format: "md", bytes: 1, mtime: 1, state: "not-compiled", citedBy: [] };
}

const WAITING = Array.from({ length: 37 }, (_, index) => row(index));
const paths = (rows: readonly LibrarySourceRow[]) => rows.map((source) => source.path);

type Props = Parameters<typeof useContinuePress>[0];

describe("useContinuePress", () => {
  it("picks nothing while no surface draws the batch, and picks once on press", () => {
    const eligible = vi.fn(() => true);
    const send = vi.fn((_batch: readonly LibrarySourceRow[]) => true);
    const { result, rerender } = renderHook((props: Props) => useContinuePress(props), {
      initialProps: { sources: WAITING, folderKey: "/press/hidden", running: false, shown: false, eligible, send },
    });
    // Three publishes of the folder with the band and the popover closed.
    for (let i = 0; i < 3; i += 1) {
      rerender({ sources: [...WAITING], folderKey: "/press/hidden", running: false, shown: false, eligible, send });
    }
    expect(eligible).not.toHaveBeenCalled();
    expect(result.current.continueBatch.next).toEqual([]);

    act(() => result.current.press());
    expect(eligible).toHaveBeenCalledTimes(WAITING.length);
    expect(paths(send.mock.calls[0]![0])).toEqual(paths(WAITING.slice(0, 10)));
  });

  it("a door that names its sources sends exactly those and marks only them running", () => {
    const send = vi.fn((_batch: readonly LibrarySourceRow[]) => true);
    const { result } = renderHook(() =>
      useContinuePress({ sources: WAITING, folderKey: "/press/named", running: false, send }),
    );
    act(() => result.current.pressFor([WAITING[30]!]));
    expect(send).toHaveBeenCalledTimes(1);
    expect(paths(send.mock.calls[0]![0])).toEqual(["sources/doc-30.md"]);
    expect([...result.current.continueBatch.running]).toEqual(["sources/doc-30.md"]);
  });

  it("drops a batch whose request could not start, so its rows do not stay running", () => {
    const { result } = renderHook(() =>
      useContinuePress({ sources: WAITING, folderKey: "/press/failed", running: false, send: () => false }),
    );
    act(() => result.current.press());
    expect(result.current.continueBatch.running.size).toBe(0);
  });
});
