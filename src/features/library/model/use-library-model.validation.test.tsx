import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { parseFrontmatter } from "@/shared/lib/parse-frontmatter";
import { useLibraryModel } from "./use-library-model";

type ModelInput = Parameters<typeof useLibraryModel>[0];

function page(link = "") {
  return `---
title: Delivery plan
created_by: agent:test
compiled_at: 2026-09-10T00:00:00Z
sources: [sources/plan.md]
source_hash: {}
status: draft
summary: The delivery date.
---
## Summary
The delivery plan. ${link}
## Facts
- Delivery is in September. [[src:sources/plan.md#l1]]
## Decisions
## Open questions
## Not in sources
`;
}

function doc(slug: string, raw: string, mtime = 1): ModelInput["docs"][number] {
  return {
    slug, path: `${slug}.md`, title: slug, frontmatter: parseFrontmatter(raw).frontmatter,
    mtime, headings: [], tags: [], excerpt: "", wordCount: 0,
    updatedAt: "2026-09-10", linksOut: [],
  };
}

function handle(text: () => Promise<string>) {
  const getFile = vi.fn(async () => ({ text }));
  return { handle: { getFile } as unknown as FileSystemFileHandle, getFile };
}

function input(pages: Array<[string, string]>): ModelInput {
  return {
    docs: pages.map(([slug, raw]) => doc(slug, raw)),
    sources: [{ path: "sources/plan.md", name: "plan.md", format: "md", mtime: 1, bytes: 30 }],
    fileHandles: new Map(pages.map(([slug, raw]) => [slug, handle(async () => raw).handle])),
    sourceHandles: new Map(),
    vaultRootPath: null,
    vaultScope: "validation-fixture",
    enabled: true,
  };
}

describe("Library validation follows the current folder", () => {
  it("rejudges unchanged citations when their source is removed and restored without rereading the page", async () => {
    const props = input([["wiki/plan", page()]]);
    const file = handle(async () => page());
    props.fileHandles.set("wiki/plan", file.handle);
    const { result, rerender } = renderHook(useLibraryModel, { initialProps: props });
    await waitFor(() => expect(result.current.verdicts.get("wiki/plan")?.ok).toBe(true));

    rerender({ ...props, sources: [] });
    await waitFor(() => expect(result.current.verdicts.get("wiki/plan")?.problems)
      .toEqual(expect.arrayContaining([expect.objectContaining({ code: "citation-target-missing" })])));

    rerender(props);
    await waitFor(() => expect(result.current.verdicts.get("wiki/plan")?.ok).toBe(true));
    expect(file.getFile).toHaveBeenCalledTimes(1);
  });

  it("rejudges incoming links on page deletion and restores them from cached text", async () => {
    const props = input([["wiki/plan", page("[[wiki/detail]]")], ["wiki/detail", page()]]);
    const { result, rerender } = renderHook(useLibraryModel, { initialProps: props });
    await waitFor(() => expect(result.current.verdicts.get("wiki/plan")?.ok).toBe(true));

    rerender({ ...props, docs: props.docs.slice(0, 1), fileHandles: new Map([["wiki/plan", props.fileHandles.get("wiki/plan")!]]) });
    await waitFor(() => expect(result.current.verdicts.get("wiki/plan")?.problems)
      .toEqual(expect.arrayContaining([expect.objectContaining({ code: "dangling-wikilink" })])));
    expect(result.current.pageTexts.has("wiki/detail")).toBe(false);
    expect(result.current.verdicts.has("wiki/detail")).toBe(false);

    rerender(props);
    await waitFor(() => expect(result.current.verdicts.get("wiki/plan")?.ok).toBe(true));
    expect(result.current.pageTexts.has("wiki/detail")).toBe(true);
  });

  it("does not let an interrupted read consume the verdict needed by the next folder poll", async () => {
    const props = input([["wiki/plan", page()]]);
    let finish!: (raw: string) => void;
    const pending = new Promise<string>((resolve) => { finish = resolve; });
    props.fileHandles.set("wiki/plan", handle(() => pending).handle);
    const { result, rerender } = renderHook(useLibraryModel, { initialProps: props });
    rerender({ ...props, docs: [...props.docs], fileHandles: new Map(props.fileHandles) });
    await act(async () => { finish(page()); });
    await waitFor(() => expect(result.current.verdicts.get("wiki/plan")?.ok).toBe(true));
    expect(result.current.pageTexts.get("wiki/plan")).toBe(page());
  });

  it("withdraws removed pages while an old read is pending", async () => {
    const props = input([["wiki/plan", page()]]);
    const { result, rerender } = renderHook(useLibraryModel, { initialProps: props });
    await waitFor(() => expect(result.current.pageTexts.has("wiki/plan")).toBe(true));
    let finish!: (raw: string) => void;
    const pending = new Promise<string>((resolve) => { finish = resolve; });
    const next = { ...props, docs: [doc("wiki/plan", page(), 2)], fileHandles: new Map([["wiki/plan", handle(() => pending).handle]]) };
    rerender(next);
    expect(result.current.pageTexts.has("wiki/plan")).toBe(false);
    expect(result.current.verdicts.has("wiki/plan")).toBe(false);
    rerender({ ...next, docs: [], fileHandles: new Map() });
    await act(async () => { finish(page()); });
    expect(result.current.pageTexts.size).toBe(0);
    expect(result.current.verdicts.size).toBe(0);
  });
});
