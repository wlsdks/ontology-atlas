import { describe, expect, it } from "vitest";
import { comparableCode as comparableInApp } from "@/shared/lib/git/comparable-code.mjs";
import { resolveEvidenceStates as resolveInApp } from "@/shared/lib/git/evidence-states";
import {
  movedEvidencePairs as movedPairsInApp,
  unchangedEvidencePairs as unchangedInApp,
} from "@/shared/lib/git/evidence-verdict.mjs";
import { COMPARABLE_CODE_CASES } from "../../fixtures/comparable-code-cases.mjs";
import DOCUMENT_DATING from "../../fixtures/document-dating-cases.json";
import DATING_WALKS from "../../fixtures/document-dating-walks-golden.json";

/**
 * The screen and `validate_vault` answer the evidence question in one voice. The screen's side runs
 * here from the shared evidence module in `shared/lib/git/`; each case names the verdict both
 * surfaces gave on 2026-11-28, and the dates a history walk reported are recorded in
 * `tests/fixtures/document-dating-walks-golden.json`.
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

describe("evidence drift parity", () => {
  it.each(CASES)("$name → $expected", (testCase) => {
    const app = resolveInApp(
      [{ id: "subject", docPath: testCase.docPath, evidencePaths: testCase.evidencePaths }],
      CHANGES,
    );
    expect(appVerdict(app, "subject")).toBe(testCase.expected);
  });

  it("names the moved file and the document's date as the server did", () => {
    const concept = { docPath: "capabilities/subject.md", evidencePaths: ["src/moved.ts"] };
    const app = resolveInApp([{ id: "subject", ...concept }], CHANGES);
    expect(app.rows[0]?.moved).toEqual([{ path: "src/moved.ts", changedAt: "2026-09-12T00:00:00Z" }]);
    expect(app.rows[0]?.docChangedAt).toBe(DOC);
  });
});

describe("comment-only changes", () => {
  it.each(COMPARABLE_CODE_CASES)("$name → same: $same", (testCase) => {
    const app = comparableInApp(testCase.before, testCase.path) === comparableInApp(testCase.after, testCase.path);
    expect(app).toBe(testCase.same);
  });

  const COMMIT = "a".repeat(40);
  const DATED = new Map([
    ["capabilities/subject.md", { exists: true, lastChangedAt: DOC, lastCommit: COMMIT }],
    ["capabilities/uncommitted.md", { exists: true, lastChangedAt: DOC, lastCommit: null }],
    ["src/moved.ts", { exists: true, lastChangedAt: "2026-09-12T00:00:00Z" }],
    ["src/still.ts", { exists: true, lastChangedAt: "2026-09-01T00:00:00Z" }],
  ]);
  const READINGS = {
    "comment-only": { before: "// old\nconst a = 1;\n", after: "// new\nconst a = 1;\n" },
    "code change": { before: "const a = 1;\n", after: "const a = 2;\n" },
    unreadable: { before: null, after: "const a = 1;\n" },
  } as const;

  it.each([
    { reading: "comment-only", docPath: "capabilities/subject.md", expected: "current" },
    { reading: "code change", docPath: "capabilities/subject.md", expected: "stale" },
    { reading: "unreadable", docPath: "capabilities/subject.md", expected: "stale" },
    { reading: "comment-only", docPath: "capabilities/uncommitted.md", expected: "stale" },
  ] as const)("a $reading file under $docPath → $expected", ({ reading, docPath, expected }) => {
    const evidencePaths = ["src/still.ts", "src/moved.ts"];
    const appPairs = movedPairsInApp([{ docPath, evidencePaths }], DATED);
    const readings = appPairs.map((pair) => ({ ...pair, ...READINGS[reading] }));
    const appUnchanged = unchangedInApp(readings);
    const app = resolveInApp([{ id: "subject", docPath, evidencePaths }], DATED, DATED, appUnchanged);
    expect(appVerdict(app, "subject")).toBe(expected);
  });

  it("names only moved files with a committed document, at the document's commit", () => {
    const pairs = movedPairsInApp(
      [
        { docPath: "capabilities/subject.md", evidencePaths: ["src/still.ts", "src/moved.ts"] },
        { docPath: "capabilities/uncommitted.md", evidencePaths: ["src/moved.ts"] },
      ],
      DATED,
    );
    expect(pairs).toEqual([{ commit: COMMIT, path: "src/moved.ts" }]);
  });
});

describe("a document is dated by its bytes", () => {
  const vaultFolder = DOCUMENT_DATING.document.split("/")[0]!;
  const documentKey = DOCUMENT_DATING.document.slice(vaultFolder.length + 1);
  const walks = DATING_WALKS.walks as Record<string, { document: { exists: boolean; lastChangedAt: string | null }; code: { exists: boolean; lastChangedAt: string | null } }>;

  it("records a walk for every case of the shared table", () => {
    expect(Object.keys(walks).sort()).toEqual(DOCUMENT_DATING.cases.map((testCase) => testCase.name).sort());
  });

  it.each(DOCUMENT_DATING.cases)("$name → $verdict", (testCase) => {
    const walk = walks[testCase.name]!;
    const changes = new Map([
      [documentKey, walk.document],
      [DOCUMENT_DATING.code, walk.code],
    ]);
    const concept = { docPath: documentKey, evidencePaths: [DOCUMENT_DATING.code] };
    const app = resolveInApp([{ id: "subject", ...concept }], changes);
    expect(appVerdict(app, "subject")).toBe(testCase.verdict);
  });
});
