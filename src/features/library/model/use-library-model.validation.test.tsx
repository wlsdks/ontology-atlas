import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { parseFrontmatter } from "@/shared/lib/vault-document/parse-frontmatter";
import { validateWikiFolder } from "@/shared/lib/library/wiki-folder";
import { buildWikiNodeIndex, validateWikiPage } from "@/shared/lib/library/wiki-page-schema";
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
    mtime, tags: [], 
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

  it("rejudges incoming links on page deletion and restores them when the page returns", async () => {
    const props = input([["wiki/plan", page("[[wiki/detail]]")], ["wiki/detail", page()]]);
    const { result, rerender } = renderHook(useLibraryModel, { initialProps: props });
    await waitFor(() => expect(result.current.verdicts.get("wiki/plan")?.ok).toBe(true));

    rerender({ ...props, docs: props.docs.slice(0, 1), fileHandles: new Map([["wiki/plan", props.fileHandles.get("wiki/plan")!]]) });
    await waitFor(() => expect(result.current.verdicts.get("wiki/plan")?.problems)
      .toEqual(expect.arrayContaining([expect.objectContaining({ code: "dangling-wikilink" })])));
    expect(result.current.pageFacts.has("wiki/detail")).toBe(false);
    expect(result.current.verdicts.has("wiki/detail")).toBe(false);

    rerender(props);
    await waitFor(() => expect(result.current.verdicts.get("wiki/plan")?.ok).toBe(true));
    expect(result.current.pageFacts.has("wiki/detail")).toBe(true);
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
    expect(result.current.pageFacts.get("wiki/plan")?.claims.claims.map((claim) => claim.text))
      .toEqual(["Delivery is in September. [[src:sources/plan.md#l1]]"]);
  });

  it("withdraws removed pages while an old read is pending", async () => {
    const props = input([["wiki/plan", page()]]);
    const { result, rerender } = renderHook(useLibraryModel, { initialProps: props });
    await waitFor(() => expect(result.current.pageFacts.has("wiki/plan")).toBe(true));
    let finish!: (raw: string) => void;
    const pending = new Promise<string>((resolve) => { finish = resolve; });
    const next = { ...props, docs: [doc("wiki/plan", page(), 2)], fileHandles: new Map([["wiki/plan", handle(() => pending).handle]]) };
    rerender(next);
    expect(result.current.pageFacts.has("wiki/plan")).toBe(false);
    expect(result.current.verdicts.has("wiki/plan")).toBe(false);
    rerender({ ...next, docs: [], fileHandles: new Map() });
    await act(async () => { finish(page()); });
    expect(result.current.pageFacts.size).toBe(0);
    expect(result.current.verdicts.size).toBe(0);
  });

  it("reports a page whose described concept was deleted, as validate_wiki does", async () => {
    const linked = page().replace("status: draft", "status: draft\ndescribes:\n  - capabilities/login");
    const login = doc("capabilities/login", "---\nkind: capability\ntitle: Login\n---\nA person signs in.\n");
    const props = input([["wiki/plan", linked]]);
    const withConcept: ModelInput = { ...props, docs: [...props.docs, login] };
    const { result, rerender } = renderHook(useLibraryModel, { initialProps: withConcept });
    await waitFor(() => expect(result.current.verdicts.get("wiki/plan")?.ok).toBe(true));

    rerender(props);
    await waitFor(() => expect(result.current.verdicts.get("wiki/plan")?.ok).toBe(false));
    // The page validator and the folder validator, run over the same folder, give the same codes.
    const nodes = buildWikiNodeIndex(props.docs.map((entry) => ({ slug: entry.slug, kind: entry.frontmatter.kind })));
    const codes = [
      ...validateWikiPage(linked, { knownSources: new Set(["sources/plan.md"]), nodes }).problems,
      ...validateWikiFolder([{ path: "wiki/plan.md", raw: linked }])[0]!.problems,
    ].map((problem) => problem.code);
    expect(result.current.verdicts.get("wiki/plan")?.problems.map((problem) => problem.code)).toEqual(codes);
    expect(codes).toEqual(["describes-target-missing"]);
    expect(result.current.structural.blockingPageCount).toBe(1);
  });
});
