import { describe, expect, it, vi } from "vitest";

import type { VaultDoc } from "@/entities/docs-vault";

import { libraryAutoDecision, type FolderReads } from "./library-auto-decision";
import { publishLiveLibraryFolder, readLiveLibraryFolder, type LiveLibraryFolder } from "./library-folder-mirror";

const ROOT = "/Users/probe/launch";
const SOURCE = "sources/architecture.docx";

const page = (fact: string) => `---\ntitle: Architecture\ncreated_by: agent:claude\ncompiled_at: 2026-09-06T10:00:00Z\nsources:\n  - ${SOURCE}\nsource_hash:\n  ${SOURCE}: 3b1f0a00000000000000000000000000000000000000000000000000000000ab\nstatus: draft\nsummary: Architecture.\n---\n\n## Summary\n\nArchitecture.\n\n## Facts\n\n- ${fact} [[src:${SOURCE}#p1]]\n\n## Decisions\n\n## Open questions\n\n## Not in sources\n`;

const write = (content: string) => ({ filePath: `${ROOT}/wiki/architecture.md`, rawInput: { file_path: `${ROOT}/wiki/architecture.md`, content }, toolKind: "edit" });
const edit = (oldString: string, newString: string) => ({
  filePath: `${ROOT}/wiki/architecture.md`,
  rawInput: { file_path: `${ROOT}/wiki/architecture.md`, old_string: oldString, new_string: newString },
  toolKind: "edit",
});

const folder = (change: Partial<LiveLibraryFolder> = {}): LiveLibraryFolder => ({
  vaultRoot: ROOT,
  docs: [] as VaultDoc[],
  sources: [SOURCE],
  writeMode: "auto",
  ...change,
});

function disk(files: Record<string, string>): FolderReads & { files: Record<string, string> } {
  return {
    files,
    text: vi.fn(async (_root: string, path: string) => {
      if (!(path in files)) throw new Error(`missing ${path}`);
      return files[path]!;
    }),
    present: vi.fn(async (_root: string, paths: readonly string[]) => new Set(paths.filter((path) => path in files))),
  };
}

describe("a Library page write answered without a card", () => {
  it("allows a page that fits while the mode is auto, and makes the next page wait once it is ask", async () => {
    const reads = disk({ [SOURCE]: "evidence" });
    publishLiveLibraryFolder(folder());
    expect(await libraryAutoDecision(write(page("A fact.")), ROOT, readLiveLibraryFolder(), reads)).toBe("wiki/architecture.md");
    publishLiveLibraryFolder(folder({ writeMode: "ask" }));
    expect(await libraryAutoDecision(write(page("A fact.")), ROOT, readLiveLibraryFolder(), reads)).toBeNull();
  });

  it("asks for a page whose cited source was deleted after the turn began", async () => {
    const reads = disk({});
    expect(await libraryAutoDecision(write(page("A fact.")), ROOT, folder(), reads)).toBeNull();
    expect(reads.present).toHaveBeenCalledWith(ROOT, [SOURCE]);
  });

  it("judges an edit against the page on disk at the request, not the text the screen last drew", async () => {
    const reads = disk({ [SOURCE]: "evidence", "wiki/architecture.md": page("A fact.").replace("## Decisions\n", "") });
    expect(await libraryAutoDecision(edit("A fact.", "A sharper fact."), ROOT, folder(), reads)).toBeNull();
    reads.files["wiki/architecture.md"] = page("A fact.");
    expect(await libraryAutoDecision(edit("A fact.", "A sharper fact."), ROOT, folder(), reads)).toBe("wiki/architecture.md");
  });

  it("asks when the page cannot be read, or the open folder is no longer the turn's", async () => {
    const reads = disk({ [SOURCE]: "evidence" });
    expect(await libraryAutoDecision(edit("A fact.", "Another."), ROOT, folder(), reads)).toBeNull();
    expect(await libraryAutoDecision(write(page("A fact.")), ROOT, folder({ vaultRoot: "/Users/probe/other" }), reads)).toBeNull();
  });
});
