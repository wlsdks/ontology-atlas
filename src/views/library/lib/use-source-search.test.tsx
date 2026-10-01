import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { useSourceSearch } from "./use-source-search";

afterEach(cleanup);

it("does not reread an in-flight file when the preceding result is published", async () => {
  const pending = new Map<string, Array<(bytes: ArrayBuffer) => void>>();
  const paths = ["sources/a.md", "sources/b.md"];
  const sources = paths.map(path => ({ path, bytes: 10, mtime: 1 }));
  const handles = new Map(paths.map(path => [path, {
    getFile: async () => ({ arrayBuffer: () => new Promise<ArrayBuffer>(resolve => {
      const queue = pending.get(path) ?? [];
      queue.push(resolve);
      pending.set(path, queue);
    }) }),
  } as unknown as FileSystemFileHandle]));
  const { result } = renderHook(() => useSourceSearch({
    sources, sourceHandles: handles, vaultScope: "single-reader", needle: "match", enabled: true,
  }));
  await waitFor(() => expect(pending.get(paths[0])).toHaveLength(1));
  await act(async () => pending.get(paths[0])![0](new TextEncoder().encode("# match").buffer));
  await waitFor(() => expect(pending.has(paths[1])).toBe(true));
  expect(pending.get(paths[1])).toHaveLength(1);
  await act(async () => pending.get(paths[1])![0](new TextEncoder().encode("# match").buffer));
  await waitFor(() => expect(result.current.phase).toBe("ready"));
  expect(result.current.readCount).toBe(2);
  expect(result.current.hits.size).toBe(2);
});

it("discards an old folder read after the search scope changes", async () => {
  const releases: Array<(bytes: ArrayBuffer) => void> = [];
  const sources = [{ path: "sources/a.md", bytes: 10, mtime: 1 }];
  const handles = new Map([[sources[0].path, {
    getFile: async () => ({ arrayBuffer: () => new Promise<ArrayBuffer>(resolve => releases.push(resolve)) }),
  } as unknown as FileSystemFileHandle]]);
  const { result, rerender } = renderHook(({ scope }) => useSourceSearch({
    sources, sourceHandles: handles, vaultScope: scope, needle: "new", enabled: true,
  }), { initialProps: { scope: "old" } });
  await waitFor(() => expect(releases).toHaveLength(1));
  rerender({ scope: "new" });
  await waitFor(() => expect(releases).toHaveLength(2));
  await act(async () => releases[0](new TextEncoder().encode("# new from old folder").buffer));
  expect(result.current.readCount).toBe(0);
  expect(result.current.hits.size).toBe(0);
  await act(async () => releases[1](new TextEncoder().encode("# new folder").buffer));
  await waitFor(() => expect(result.current.phase).toBe("ready"));
  expect(result.current.hits.get(sources[0].path)?.text).toBe("# new folder");
});
