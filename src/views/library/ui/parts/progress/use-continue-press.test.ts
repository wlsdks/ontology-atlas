import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { LibrarySourceRow } from "@/entities/docs-vault";
import { buildCompileBrief } from "@/features/library";

import { useContinuePress } from "./use-continue-press";

function row(index: number): LibrarySourceRow {
  const path = `sources/doc-${String(index).padStart(2, "0")}.md`;
  return { path, name: path.slice(8), format: "md", bytes: 1, mtime: 1, state: "not-compiled", citedBy: [] };
}

const WAITING = Array.from({ length: 37 }, (_, index) => row(index));

describe("useContinuePress", () => {
  it("sends exactly the batch the band names, and its brief names no other source", () => {
    const briefs: string[] = [];
    const send = vi.fn((batch: readonly LibrarySourceRow[]) => {
      briefs.push(buildCompileBrief({ sources: batch, locale: "en", writerId: "agent:test", vaultRoot: "/vault" }));
      return true;
    });
    const { result } = renderHook(() =>
      useContinuePress({ sources: WAITING, folderKey: "/press/sent", running: false, send }),
    );
    const named = result.current.continueBatch.next.map((source) => source.path);
    expect(named).toEqual(WAITING.slice(0, 10).map((source) => source.path));
    expect(result.current.continueBatch.rest).toBe(27);

    act(() => result.current.press());

    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0]![0].map((source) => source.path)).toEqual(named);
    for (const path of named) expect(briefs[0]).toContain(path);
    for (const source of WAITING.slice(10)) expect(briefs[0]).not.toContain(source.path);
    expect([...result.current.continueBatch.running]).toEqual(named);
  });

  it("settles a batch whose request could not start, so its rows do not stay running", () => {
    const { result } = renderHook(() =>
      useContinuePress({ sources: WAITING, folderKey: "/press/failed", running: false, send: () => false }),
    );
    act(() => result.current.press());
    expect(result.current.continueBatch.running.size).toBe(0);
  });
});
