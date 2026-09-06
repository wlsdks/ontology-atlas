import { renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { useLibraryModel } from "@/views/library/lib/use-library-model";

function doc(slug: string, frontmatter: Record<string, unknown>, mtime = 1) {
  return { slug, title: slug, frontmatter, body: "", mtime, headings: [], description: "", tags: [], outLinks: [], backlinks: [] } as never;
}
function handleFor(text: string): FileSystemFileHandle {
  return { getFile: async () => ({ text: async () => text }) } as unknown as FileSystemFileHandle;
}

describe("the model reads wiki/_log.md", () => {
  it("exposes the last compile and lint lines", async () => {
    const log = "# Wiki log\n\n## [2026-09-06T09:05:00Z] compile | sources/a.docx → a (new) | agent:claude\n## [2026-09-06T09:40:00Z] lint | disagreement 0 | agent:claude\n";
    const docs = [doc("wiki/_log", {}), doc("wiki/a", { created_by: "agent:claude", sources: [] })];
    const fileHandles = new Map([["wiki/_log", handleFor(log)], ["wiki/a", handleFor("---\ntitle: a\n---\n")]]);
    const { result } = renderHook(() => useLibraryModel({ docs, sources: [], fileHandles, enabled: true, vaultRootPath: null } as never));
    await waitFor(() => expect(result.current.log.lastCompile?.summary).toBe("sources/a.docx → a (new)"));
    expect(result.current.log.lastLint?.summary).toBe("disagreement 0");
  });
});
