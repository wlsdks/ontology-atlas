import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import { comparableCode as comparableInApp } from "@/shared/lib/git/comparable-code.mjs";
import { resolveEvidenceStates as resolveInApp } from "@/shared/lib/git/evidence-states";
import {
  movedEvidencePairs as movedPairsInApp,
  unchangedEvidencePairs as unchangedInApp,
} from "@/shared/lib/git/evidence-verdict.mjs";
import { comparableCode as comparableInServer } from "../../../mcp/src/drift/comparable-code.mjs";
import { resolveEvidenceStates as resolveInServer } from "../../../mcp/src/drift/evidence-drift.mjs";
import {
  movedEvidencePairs as movedPairsInServer,
  unchangedEvidencePairs as unchangedInServer,
} from "../../../mcp/src/drift/evidence-verdict.mjs";
import * as gitTools from "../../../mcp/src/git/git-tools.mjs";
import { COMPARABLE_CODE_CASES } from "../../fixtures/comparable-code-cases.mjs";
import DOCUMENT_DATING from "../../fixtures/document-dating-cases.json";

/** The MCP walk, typed as this test calls it; the module ships plain ESM. */
const collectPathLastChanges = gitTools.collectPathLastChanges as unknown as (input: {
  repoRoot: string;
  vaultRoot: string;
  repoPaths: string[];
  vaultPaths: string[];
}) => { ok: boolean; changes: Map<string, { exists: boolean; lastChangedAt: string | null; lastCommit: string | null }> };

/** The server's answer, as this test reads it; the module ships plain ESM without types. */
type ServerStates = Record<
  "current" | "stale" | "missing" | "unknown",
  { slug: string; docChangedAt?: string | null; moved?: { path: string; changedAt: string }[] }[]
>;

/**
 * The screen and `validate_vault` answer the evidence question in one voice: both call the shared
 * evidence module in `shared/lib/git/`, and this test feeds one fixture through both and compares.
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

describe("comment-only changes, on both surfaces", () => {
  it.each(COMPARABLE_CODE_CASES)("$name → same: $same, through both import paths", (testCase) => {
    const app = comparableInApp(testCase.before, testCase.path) === comparableInApp(testCase.after, testCase.path);
    const server = comparableInServer(testCase.before, testCase.path) === comparableInServer(testCase.after, testCase.path);
    expect(app).toBe(testCase.same);
    expect(server).toBe(testCase.same);
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
  ] as const)("a $reading file under $docPath → $expected, on both surfaces", ({ reading, docPath, expected }) => {
    const evidencePaths = ["src/still.ts", "src/moved.ts"];
    const appPairs = movedPairsInApp([{ docPath, evidencePaths }], DATED);
    const serverPairs = movedPairsInServer([{ docPath, evidencePaths }], DATED);
    expect(serverPairs).toEqual(appPairs);
    const readings = appPairs.map((pair) => ({ ...pair, ...READINGS[reading] }));
    const appUnchanged = unchangedInApp(readings);
    const serverUnchanged = unchangedInServer(readings);
    expect([...serverUnchanged]).toEqual([...appUnchanged]);
    const app = resolveInApp([{ id: "subject", docPath, evidencePaths }], DATED, DATED, appUnchanged);
    const server = resolveInServer(
      [{ slug: "subject", kind: "capability", docPath, evidencePaths }],
      DATED,
      { unchangedPairs: serverUnchanged },
    ) as ServerStates;
    expect(appVerdict(app, "subject")).toBe(expected);
    expect(serverVerdict(server, "subject")).toBe(expected);
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

type DatingStep = {
  commit?: string;
  files?: Record<string, string>;
  revert?: string;
  restore?: string;
  from?: string;
  reset?: string;
  cherryPick?: string;
  as?: string;
};

/** Replays one case of the shared table; the desktop walks replay the same table in `src-tauri/src/git/evidence/tests.rs`. */
function replayDatingCase(steps: readonly DatingStep[]): { root: string; labels: Map<string, string> } {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "atlas-dating-")));
  const labels = new Map<string, string>();
  const git = (minute: number, ...args: string[]) => {
    const at = `2026-01-01T00:${String(minute).padStart(2, "0")}:00Z`;
    return execFileSync("git", args, { cwd: root, encoding: "utf8", env: { ...process.env, GIT_AUTHOR_DATE: at, GIT_COMMITTER_DATE: at } }).trim();
  };
  git(0, "init", "-q", "-b", "main");
  git(0, "config", "user.email", "test@example.invalid");
  git(0, "config", "user.name", "atlas test");
  git(0, "config", "commit.gpgsign", "false");
  git(0, "config", "core.autocrlf", "false");
  steps.forEach((step, index) => {
    const minute = index + 1;
    const label = (name: string | undefined) => labels.get(name ?? "") ?? "";
    if (step.commit) {
      for (const [path, text] of Object.entries(step.files ?? {})) {
        mkdirSync(dirname(join(root, path)), { recursive: true });
        writeFileSync(join(root, path), text);
        git(minute, "add", "--", path);
      }
      git(minute, "commit", "-qm", step.commit);
      labels.set(step.commit, git(minute, "rev-parse", "HEAD"));
    } else if (step.revert) git(minute, "revert", "--no-edit", label(step.revert));
    else if (step.restore) {
      git(minute, "checkout", label(step.from), "--", step.restore);
      git(minute, "commit", "-qm", "restore");
    } else if (step.reset) git(minute, "reset", "-q", "--hard", label(step.reset));
    else if (step.cherryPick) git(minute, "cherry-pick", label(step.cherryPick));
    if (step.as) labels.set(step.as, git(minute, "rev-parse", "HEAD"));
  });
  return { root, labels };
}

describe("a document is dated by its bytes, on both surfaces", () => {
  const vaultFolder = DOCUMENT_DATING.document.split("/")[0]!;
  const documentKey = DOCUMENT_DATING.document.slice(vaultFolder.length + 1);
  it.each(DOCUMENT_DATING.cases)("$name → $verdict", (testCase) => {
    const { root, labels } = replayDatingCase(testCase.steps as DatingStep[]);
    try {
      const walk = collectPathLastChanges({
        repoRoot: root,
        vaultRoot: join(root, vaultFolder),
        repoPaths: [DOCUMENT_DATING.code],
        vaultPaths: [documentKey],
      });
      expect(walk.ok).toBe(true);
      expect(walk.changes.get(documentKey)?.lastCommit).toBe(labels.get(testCase.dates.document));
      expect(walk.changes.get(DOCUMENT_DATING.code)?.lastCommit).toBe(labels.get(testCase.dates.code));
      const changes = new Map<string, { exists: boolean; lastChangedAt: string | null }>([
        [documentKey, walk.changes.get(documentKey)!],
        [DOCUMENT_DATING.code, walk.changes.get(DOCUMENT_DATING.code)!],
      ]);
      const concept = { docPath: documentKey, evidencePaths: [DOCUMENT_DATING.code] };
      const app = resolveInApp([{ id: "subject", ...concept }], changes);
      const server = resolveInServer([{ slug: "subject", kind: "capability", ...concept }], changes) as ServerStates;
      expect(appVerdict(app, "subject")).toBe(testCase.verdict);
      expect(serverVerdict(server, "subject")).toBe(testCase.verdict);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
