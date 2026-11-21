import { describe, expect, it } from "vitest";

import { deriveSourceProgress, type LibrarySourceRow } from "@/entities/docs-vault";

import { SourceGroupIndex } from "./source-group-index";
import { SOURCE_STATE_ORDER } from "./source-states";

function row(path: string, state: LibrarySourceRow["state"] = "not-compiled", compiledDay = -1): LibrarySourceRow {
  const name = path.slice(path.lastIndexOf("/") + 1);
  const dot = name.lastIndexOf(".");
  return { path, name, format: dot > 0 ? name.slice(dot + 1) : "", bytes: 1, mtime: 0, state, citedBy: [], compiledDay };
}

function counts(index: SourceGroupIndex, key: string): Record<string, number> {
  const group = index.get(key)!;
  return Object.fromEntries(SOURCE_STATE_ORDER.map((state, i) => [state, group.byState[i]!]));
}

describe("SourceGroupIndex", () => {
  it("groups nested files under their first-level folder and joins NFD Hangul with its NFC twin", () => {
    const nfc = "회의록";
    const nfd = nfc.normalize("NFD");
    const rows = [
      row(`sources/${nfc}/a.md`, "compiled", 20_000),
      row(`sources/${nfd}/deep/b.md`, "stale"),
      row("sources/contracts/2024/c.pdf", "partial"),
      row("sources/contracts/d.pdf"),
      row("sources/loose.txt", "unreadable"),
    ];
    const index = new SourceGroupIndex();
    expect(index.sync(rows).done).toBe(true);

    expect(index.list("folder").map((group) => group.key).sort()).toEqual(["folder:contracts", `folder:${nfc}`, "root"]);
    expect(counts(index, `folder:${nfc}`)).toMatchObject({ compiled: 1, stale: 1 });
    expect(index.get(`folder:${nfc}`)!.waiting).toBe(1);
    expect(index.get("folder:contracts")!.total).toBe(2);
    expect(index.get("root")!.kind).toBe("root");

    const summed = Object.fromEntries(SOURCE_STATE_ORDER.map((state) => [state, 0]));
    for (const group of index.list("folder")) SOURCE_STATE_ORDER.forEach((state, i) => (summed[state]! += group.byState[i]!));
    expect(summed).toEqual(deriveSourceProgress({ sources: rows }, { now: Date.UTC(2026, 10, 21) }).byState);
  });

  it("groups by file type, with no extension as its own type", () => {
    const index = new SourceGroupIndex();
    index.sync([row("sources/a.md"), row("sources/x/b.md"), row("sources/Makefile")]);
    expect(index.get("type:md")!.total).toBe(2);
    expect(index.get("type:")!.total).toBe(1);
    expect(index.shape).toEqual({ folders: 2, firstLevel: 1, types: 2 });
  });

  it("re-counts only the rows a published batch changed, and touches only their folders", () => {
    const base = Array.from({ length: 300 }, (_, i) => row(`sources/f${i % 30}/doc-${i}.md`));
    const index = new SourceGroupIndex();
    index.sync(base);

    const written = base.map((source) => (source.path === "sources/f3/doc-3.md" || source.path === "sources/f7/doc-7.md" ? { ...source, state: "compiled" as const } : source));
    expect(index.sync(written)).toMatchObject({ rowsApplied: 2, foldersTouched: 2 });

    const appended = [...written, row("sources/f1/new-a.md"), row("sources/f1/new-b.md"), row("sources/fresh/new-c.md")];
    expect(index.sync(appended)).toMatchObject({ rowsApplied: 3, foldersTouched: 2 });
    expect(index.get("folder:fresh")!.total).toBe(1);

    const rebuilt = appended.map((source) => ({ ...source }));
    expect(index.sync(rebuilt)).toMatchObject({ rowsApplied: 0, foldersTouched: 0 });
  });

  it("drops a removed source and its emptied folder", () => {
    const index = new SourceGroupIndex();
    const rows = [row("sources/keep/a.md"), row("sources/gone/b.md", "compiled", 20_000)];
    index.sync(rows);
    expect(index.sync([rows[0]!, row("sources/keep/renamed.md")])).toMatchObject({ rowsApplied: 2, foldersTouched: 2 });
    expect(index.get("folder:gone")).toBeUndefined();
    expect(index.get("folder:keep")!.total).toBe(2);
    expect(index.shape.folders).toBe(1);
  });

  it("stops at its deadline and resumes where it stopped, reading 50,000 rows once", () => {
    const rows = Array.from({ length: 50_000 }, (_, i) => row(`sources/folder-${i % 40}/doc-${i}.md`, i % 3 === 0 ? "compiled" : "not-compiled", 20_000));
    const index = new SourceGroupIndex();
    let clock = 0;
    const now = () => clock;
    let read = 0;
    let steps = 0;
    for (;;) {
      clock = 0;
      const deadline = -1;
      const step = index.sync(rows, deadline, now);
      read += step.rowsRead;
      steps += 1;
      if (step.done) break;
    }
    expect(read).toBe(rows.length);
    expect(steps).toBeGreaterThan(100);
    expect(index.list("folder").reduce((sum, group) => sum + group.total, 0)).toBe(50_000);
  });

  it("reports the newest page day on or before today", () => {
    const index = new SourceGroupIndex();
    index.sync([row("sources/a/1.md", "compiled", 100), row("sources/a/2.md", "compiled", 140), row("sources/a/3.md", "compiled", 500)]);
    const group = index.get("folder:a")!;
    expect(index.latestDay(group, 200)).toBe(140);
    expect(index.latestDay(group, 50)).toBe(-1);
  });
});
