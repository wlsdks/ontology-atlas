import { renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { useObservedWikiWork } from "./use-observed-wiki-work";

describe("session-scoped wiki observations", () => {
  it("silently baselines first open and a different folder with the same page slug", () => {
    const onReset = vi.fn();
    const onReceipts = vi.fn();
    const { rerender } = renderHook(
      ({ scope, revisions }) => useObservedWikiWork(scope, revisions, onReset, onReceipts),
      { initialProps: { scope: "local:ontology#1", revisions: new Map([["wiki/plan", 10]]) } },
    );
    expect(onReset).toHaveBeenCalledTimes(1);
    expect(onReceipts).not.toHaveBeenCalled();
    rerender({ scope: "local:ontology#1", revisions: new Map([["wiki/plan", 11]]) });
    expect(onReceipts).toHaveBeenCalledTimes(1);
    expect(onReceipts.mock.calls[0][0][0]).toMatchObject({ kind: "write", target: { ref: "wiki/plan" } });
    rerender({ scope: "local:ontology#2", revisions: new Map([["wiki/plan", 99]]) });
    expect(onReset).toHaveBeenCalledTimes(2);
    expect(onReceipts).toHaveBeenCalledTimes(1);
    rerender({ scope: "local:ontology#2", revisions: new Map([["wiki/plan", 100]]) });
    expect(onReceipts).toHaveBeenCalledTimes(2);
  });

  it("counts each page that differs from the folder's first listing once", () => {
    const first = new Map([["wiki/plan", 10], ["wiki/notes", 10], ["wiki/_log", 10]]);
    const { result, rerender } = renderHook(
      ({ scope, revisions }) => useObservedWikiWork(scope, revisions, vi.fn(), vi.fn()),
      { initialProps: { scope: "local:ontology#1", revisions: first } },
    );
    expect(result.current).toBe(0);
    rerender({ scope: "local:ontology#1", revisions: new Map([["wiki/plan", 11], ["wiki/notes", 10], ["wiki/_log", 11]]) });
    expect(result.current).toBe(1);
    // The same page again is still one page; a new page is a second.
    rerender({ scope: "local:ontology#1", revisions: new Map([["wiki/plan", 12], ["wiki/notes", 10], ["wiki/new", 1]]) });
    expect(result.current).toBe(2);
    rerender({ scope: "local:ontology#2", revisions: new Map([["wiki/plan", 99]]) });
    expect(result.current).toBe(0);
  });
});
