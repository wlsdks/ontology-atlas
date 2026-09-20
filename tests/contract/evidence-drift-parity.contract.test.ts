import { describe, expect, it } from "vitest";
import { resolveEvidenceStates as resolveInApp } from "@/views/ontology-insights/lib/brief/evidence-states";
import { resolveEvidenceStates as resolveInServer } from "../../mcp/src/evidence-drift.mjs";

/** The server's answer, as this test reads it; the module ships plain ESM without types. */
type ServerStates = Record<
  "current" | "stale" | "missing" | "unknown",
  { slug: string; docChangedAt?: string | null; moved?: { path: string; changedAt: string }[] }[]
>;

/**
 * **The screen and an agent answer the evidence question in one voice.**
 *
 * `/ontology/insights` states per concept whether the code it cites moved after its meaning
 * was last touched; `validate_vault` states the same thing to a coding agent. They were two
 * implementations for a day and disagreed on a concept citing both a path that is gone and a
 * path the walk never reached: one said `missing`, the other `unknown` (design-handoff,
 * 2026-09-19). Both now call `shared/lib/evidence-verdict.mjs`, and this test is what keeps
 * them there: it feeds one fixture through both and compares the verdicts.
 */

interface Case {
  name: string;
  docPath: string;
  evidencePaths: string[];
  expected: "current" | "stale" | "missing" | "unknown";
}

const DOC = "2026-09-10T00:00:00Z";

const CHANGES = new Map([
  ["capabilities/subject.md", { exists: true, lastChangedAt: DOC }],
  ["capabilities/undated.md", { exists: true, lastChangedAt: null }],
  ["src/moved.ts", { exists: true, lastChangedAt: "2026-09-12T00:00:00Z" }],
  ["src/still.ts", { exists: true, lastChangedAt: "2026-09-01T00:00:00Z" }],
  ["src/gone.ts", { exists: false, lastChangedAt: "2026-09-01T00:00:00Z" }],
  ["src/folder", { exists: true, isDir: true, lastChangedAt: "2026-09-15T00:00:00Z" }],
  ["src/undated.ts", { exists: true, lastChangedAt: null }],
]);

const CASES: Case[] = [
  { name: "every cited file unchanged", docPath: "capabilities/subject.md", evidencePaths: ["src/still.ts"], expected: "current" },
  { name: "a cited file moved after the document", docPath: "capabilities/subject.md", evidencePaths: ["src/still.ts", "src/moved.ts"], expected: "stale" },
  { name: "a cited path is gone", docPath: "capabilities/subject.md", evidencePaths: ["src/gone.ts"], expected: "missing" },
  // The case the two implementations disagreed on: gone wins over a path nobody walked.
  { name: "gone and never walked together", docPath: "capabilities/subject.md", evidencePaths: ["src/never-asked.ts", "src/gone.ts"], expected: "missing" },
  { name: "moved and never walked together", docPath: "capabilities/subject.md", evidencePaths: ["src/never-asked.ts", "src/moved.ts"], expected: "stale" },
  { name: "only a folder moved", docPath: "capabilities/subject.md", evidencePaths: ["src/folder"], expected: "unknown" },
  { name: "a folder moved and a file moved", docPath: "capabilities/subject.md", evidencePaths: ["src/folder", "src/moved.ts"], expected: "stale" },
  { name: "the document has no date", docPath: "capabilities/undated.md", evidencePaths: ["src/moved.ts"], expected: "unknown" },
  { name: "the cited path has no date", docPath: "capabilities/subject.md", evidencePaths: ["src/undated.ts"], expected: "unknown" },
  { name: "nothing cited", docPath: "capabilities/subject.md", evidencePaths: [], expected: "unknown" },
];

function appVerdict(states: ReturnType<typeof resolveInApp>, id: string): string {
  if (states.stale.has(id)) return "stale";
  if (states.missing.has(id)) return "missing";
  if (states.current.has(id)) return "current";
  return "unknown";
}

function serverVerdict(states: ServerStates, slug: string): string {
  for (const key of ["stale", "missing", "current", "unknown"] as const) {
    if (states[key]?.some((row) => row.slug === slug)) return key;
  }
  return "(absent)";
}

describe("evidence drift parity", () => {
  it.each(CASES)("$name → $expected, on both surfaces", (testCase) => {
    const app = resolveInApp(
      [{ id: "subject", docPath: testCase.docPath, evidencePaths: testCase.evidencePaths }],
      CHANGES,
    );
    const server = resolveInServer(
      [{ slug: "subject", kind: "capability", docPath: testCase.docPath, evidencePaths: testCase.evidencePaths }],
      CHANGES,
    ) as ServerStates;
    expect(appVerdict(app, "subject")).toBe(testCase.expected);
    expect(serverVerdict(server, "subject")).toBe(testCase.expected);
  });

  it("names the same moved file and the same dates on both surfaces", () => {
    const concept = { docPath: "capabilities/subject.md", evidencePaths: ["src/moved.ts"] };
    const app = resolveInApp([{ id: "subject", ...concept }], CHANGES);
    const server = resolveInServer([{ slug: "subject", kind: "capability", ...concept }], CHANGES) as ServerStates;
    expect(app.rows[0]?.moved).toEqual([{ path: "src/moved.ts", changedAt: "2026-09-12T00:00:00Z" }]);
    expect(server.stale[0].moved).toEqual(app.rows[0]?.moved);
    expect(server.stale[0].docChangedAt).toBe(app.rows[0]?.docChangedAt);
  });
});
