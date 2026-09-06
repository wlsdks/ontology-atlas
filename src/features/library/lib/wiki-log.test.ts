import { describe, expect, it } from "vitest";

import { appendWikiLog, describeCompileTurn, describeLintTurn, formatWikiLogEntry, parseWikiLog } from "./wiki-log";

describe("a log line is one parseable line", () => {
  it("round-trips through format and parse", () => {
    const entry = { at: "2026-09-06T18:05:12Z", kind: "compile" as const, summary: "sources/a.pdf → a (new)", writer: "agent:claude" };
    const line = formatWikiLogEntry(entry);
    expect(line).toBe("## [2026-09-06T18:05:12Z] compile | sources/a.pdf → a (new) | agent:claude");
    expect(parseWikiLog(`# Wiki log\n\nprose\n\n${line}\n`)).toEqual([entry]);
  });

  it("flattens a summary that carries newlines, so the file stays one line per event", () => {
    expect(formatWikiLogEntry({ at: "t", kind: "lint", summary: "a\n  b", writer: "human" })).toBe("## [t] lint | a b | human");
  });

  it("skips lines that are not entries rather than failing", () => {
    expect(parseWikiLog("## [t] unknown | x | y\n- a bullet\n")).toEqual([]);
  });
});

describe("the compile line is read from the folder, not from the agent", () => {
  it("names new pages, revised pages, and the sources the turn was given", () => {
    const before = new Map([["wiki/plan", 1], ["wiki/arch", 1]]);
    const after = new Map([["wiki/plan", 2], ["wiki/arch", 1], ["wiki/runbook", 5]]);
    expect(describeCompileTurn({ sources: ["sources/ops-runbook.pdf"], before, after })).toBe(
      "sources/ops-runbook.pdf → runbook (new), plan (revised)",
    );
  });

  it("says so when nothing changed", () => {
    const same = new Map([["wiki/plan", 1]]);
    expect(describeCompileTurn({ sources: ["sources/x.txt"], before: same, after: same })).toBe("sources/x.txt → no page changed");
  });
});

describe("the lint line carries the report's counts when the report states them", () => {
  it("reads the four counts from the brief's own closing shape", () => {
    const text = "### Counts\n- Disagreement: 0 (1 uncertain)\n- Superseded claim: 1\n- Missing cross-reference: 2\n- Concept without a page: 6\n";
    expect(describeLintTurn(text)).toBe("disagreement 0 · superseded 1 · missing-link 2 · name-without-page 6");
  });

  it("reads a Korean report's count line, as the localized brief asks for it", () => {
    const text = "…\n**범주별 개수** — 어긋남 0, 대체된 주장 2, 빠진 연결 1, 문서 없는 이름 5.\n```json\n{}\n```";
    expect(describeLintTurn(text)).toBe("disagreement 0 · superseded 2 · missing-link 1 · name-without-page 5");
  });

  it("does not invent counts the report did not state", () => {
    expect(describeLintTurn("I read the pages and found nothing to report.")).toBe("ran; counts not stated");
    expect(describeLintTurn(null)).toBe("ran; counts not stated");
  });
});

describe("appendWikiLog writes a file a person and grep can both read", () => {
  function memoryVault() {
    let content: string | null = null;
    const file = {
      getFile: async () => ({ text: async () => content ?? "" }),
      createWritable: async () => ({
        write: async (next: string) => {
          content = next;
        },
        close: async () => {},
      }),
    };
    const dir = { getFileHandle: async () => file };
    const vault = { getDirectoryHandle: async () => dir } as unknown as FileSystemDirectoryHandle;
    return { vault, read: () => content };
  }

  it("keeps one blank line after the header and none between entries", async () => {
    const { vault, read } = memoryVault();
    const first = { at: "2026-09-06T13:45:43Z", kind: "lint" as const, summary: "disagreement 1", writer: "agent:claude" };
    const second = { at: "2026-09-06T13:50:00Z", kind: "compile" as const, summary: "sources/a.pdf → a (new)", writer: "agent:claude" };
    await appendWikiLog(vault, first);
    await appendWikiLog(vault, second);
    const text = read() ?? "";
    // Seen on the installed app on 2026-09-06: the first entry sat directly under the header prose.
    expect(text).toMatch(/Not a page\.\n\n## \[2026-09-06T13:45:43Z\] lint/);
    expect(text).toMatch(/agent:claude\n## \[2026-09-06T13:50:00Z\] compile/);
    expect(text.endsWith("\n")).toBe(true);
    expect(parseWikiLog(text)).toEqual([first, second]);
  });
});
