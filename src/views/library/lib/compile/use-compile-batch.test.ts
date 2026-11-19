import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { LibrarySourceRow } from "@/entities/docs-vault";

import { useCompileBatch, type UseCompileBatchArgs } from "./use-compile-batch";

function row(index: number, state: LibrarySourceRow["state"] = "not-compiled"): LibrarySourceRow {
  const path = `sources/doc-${String(index).padStart(2, "0")}.md`;
  return { path, name: path.slice(8), format: "md", bytes: 1, mtime: 1, state, citedBy: [] };
}

/** Criterion 5: 37 waiting sources, in list order. */
const WAITING = Array.from({ length: 37 }, (_, index) => row(index));
const paths = (rows: readonly LibrarySourceRow[]) => rows.map((source) => source.path);

function withPages(sources: readonly LibrarySourceRow[], done: ReadonlySet<string>): LibrarySourceRow[] {
  return sources.map((source) => (done.has(source.path) ? { ...source, state: "compiled" } : source));
}

function setup(folderKey: string, initial: Partial<UseCompileBatchArgs> = {}) {
  return renderHook((props: UseCompileBatchArgs) => useCompileBatch(props), {
    initialProps: { sources: WAITING, folderKey, running: false, ...initial },
  });
}

describe("useCompileBatch", () => {
  it("names the first 10 and says 27 wait after them, before and during the request", () => {
    const { result, rerender } = setup("/folder/first");
    expect(paths(result.current.targets)).toEqual(paths(WAITING.slice(0, 10)));
    expect(result.current.rest).toBe(27);

    let sent: readonly LibrarySourceRow[] = [];
    act(() => { sent = result.current.begin(); });
    rerender({ sources: WAITING, folderKey: "/folder/first", running: true });
    expect(paths(sent)).toEqual(paths(WAITING.slice(0, 10)));
    expect([...result.current.inFlight]).toEqual(paths(sent));
    expect(result.current.rest).toBe(27);
    expect(result.current.targets.some((target) => result.current.inFlight.has(target.path))).toBe(false);
  });

  it("moves the 2 that came back last, and the next press names 10 others", () => {
    const key = "/folder/returned";
    const { result, rerender } = setup(key);
    act(() => { result.current.begin(); });
    rerender({ sources: WAITING, folderKey: key, running: true });
    const landed = new Set(paths(WAITING.slice(0, 8)));
    const after = withPages(WAITING, landed);
    rerender({ sources: after, folderKey: key, running: false });

    expect(result.current.inFlight.size).toBe(0);
    expect(result.current.returned).toBe(2);
    expect(paths(result.current.targets)).toEqual(paths(WAITING.slice(10, 20)));
    expect(result.current.rest).toBe(19);

    // The returned set is the session's, not the component's: a remount keeps the order.
    const again = setup(key, { sources: after });
    expect(paths(again.result.current.targets)).toEqual(paths(WAITING.slice(10, 20)));
    const everything = setup(key, { sources: after, size: 29 });
    expect(paths(everything.result.current.targets).slice(-2)).toEqual(paths(WAITING.slice(8, 10)));
  });

  it("forgets a returned source once its page lands", () => {
    const key = "/folder/late";
    const { result, rerender } = setup(key);
    act(() => { result.current.begin(); });
    rerender({ sources: WAITING, folderKey: key, running: true });
    rerender({ sources: WAITING, folderKey: key, running: false });
    expect(result.current.returned).toBe(10);
    // The folder watch reports the pages after the turn has ended.
    rerender({ sources: withPages(WAITING, new Set(paths(WAITING.slice(0, 10)))), folderKey: key, running: false });
    expect(result.current.returned).toBe(0);
  });

  it("keeps each folder's returned sources to that folder", () => {
    const { result, rerender } = setup("/folder/a");
    act(() => { result.current.begin(); });
    rerender({ sources: WAITING, folderKey: "/folder/a", running: true });
    rerender({ sources: WAITING, folderKey: "/folder/a", running: false });
    const other = setup("/folder/b");
    expect(paths(other.result.current.targets)).toEqual(paths(WAITING.slice(0, 10)));
    expect(other.result.current.returned).toBe(0);
  });

  it("leaves the sources as they were when the turn never started", () => {
    const { result } = setup("/folder/failed");
    act(() => { result.current.begin(); });
    expect(result.current.inFlight.size).toBe(10);
    act(() => { result.current.finish(); });
    expect(result.current.inFlight.size).toBe(0);
    expect(result.current.returned).toBe(0);
    expect(paths(result.current.targets)).toEqual(paths(WAITING.slice(0, 10)));
    expect(result.current.rest).toBe(27);
  });

  it("does not let finish undo a turn that ran", () => {
    const key = "/folder/ran";
    const { result, rerender } = setup(key);
    act(() => { result.current.begin(); });
    rerender({ sources: WAITING, folderKey: key, running: true });
    act(() => { result.current.finish(); });
    expect(result.current.inFlight.size).toBe(10);
    rerender({ sources: WAITING, folderKey: key, running: false });
    expect(result.current.returned).toBe(10);
  });

  it("names 3 on the local route", () => {
    const { result } = setup("/folder/local", { size: 3 });
    expect(paths(result.current.targets)).toEqual(paths(WAITING.slice(0, 3)));
    expect(result.current.rest).toBe(34);
  });
});
