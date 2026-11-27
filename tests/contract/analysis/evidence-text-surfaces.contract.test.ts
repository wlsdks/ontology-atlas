// @vitest-environment jsdom
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { renderHook, waitFor } from "@testing-library/react";
import { afterAll, beforeAll, expect, it, vi } from "vitest";
import type { KnowledgeGraphNode } from "@/entities/knowledge-graph";
import { useMapEvidenceStates } from "@/features/vault-ontology/model/use-map-evidence-states";
import * as gitTools from "../../../mcp/src/git/git-tools.mjs";

/** The two MCP readers, typed as this test calls them; the module ships plain ESM. */
const collectPathLastChanges = gitTools.collectPathLastChanges as unknown as (input: {
  repoRoot: string;
  vaultRoot: string;
  repoPaths: string[];
  vaultPaths: string[];
}) => { ok: boolean; changes: Map<string, Record<string, unknown>> };
const readEvidenceTextPairs = gitTools.readEvidenceTextPairs as unknown as (input: {
  repoRoot: string;
  vaultRoot: string;
  pairs: { path: string; commit: string }[];
}) => { ok: boolean; readings: { path: string; commit: string; before: string | null; after: string | null }[] };

/**
 * One repository, two surfaces: the map's hook (its desktop Git bridge answered by the MCP
 * server's own walk and reader) and `validate_vault` must call the same concepts stale. The
 * fixture holds one of each kind of commit the comparison rule decides.
 */

const repo = vi.hoisted(() => ({ root: "", vault: "", docs: [] as { slug: string; frontmatter: Record<string, unknown> }[] }));

vi.mock("@/entities/vault-session", () => ({
  useDataSourceMode: () => "local",
  useLocalVault: () => ({ status: "ready", handle: { name: "vault" }, manifest: { docs: repo.docs }, lastLoadedAt: 1 }),
}));
vi.mock("@/shared/lib/vault-folder/select-open-vault-handle", () => ({
  selectOpenVaultHandle: (_status: string, handle: unknown) => handle,
}));
vi.mock("@/shared/lib/vault-folder/native-vault/tauri-vault-runtime", () => ({
  getTauriVaultRootPath: () => repo.vault,
}));
vi.mock("@/shared/lib/git/tauri-git", () => ({
  gitPathsLastChange: async (_vaultPath: string, repoPaths: string[], vaultPaths: string[]) => {
    const walk = collectPathLastChanges({ repoRoot: repo.root, vaultRoot: repo.vault, repoPaths, vaultPaths });
    if (!walk.ok) return null;
    return [...walk.changes].map(([path, change]) => ({ path, ...change }));
  },
  gitEvidenceTextPairs: async (_vaultPath: string, pairs: { path: string; commit: string }[]) => {
    const read = readEvidenceTextPairs({ repoRoot: repo.root, vaultRoot: repo.vault, pairs });
    return read.ok ? read.readings : null;
  },
}));

let clock = Date.parse("2026-11-01T00:00:00Z");
function commit(message: string) {
  clock += 60_000;
  const date = new Date(clock).toISOString();
  execFileSync("git", ["-C", repo.root, "add", "-A", "."]);
  execFileSync("git", ["-C", repo.root, "commit", "-qm", message], {
    env: { ...process.env, GIT_AUTHOR_DATE: date, GIT_COMMITTER_DATE: date },
  });
}

const FILES: Record<string, [before: string, after: string]> = {
  "src/comment.ts": ["export const a = 1;\n", "// Why a is one.\nexport const a = 1; /* fixed */\n"],
  "src/import.ts": ['import { x } from "./x";\nexport const b = x;\n', 'import {\n  x, // the one\n} from "./lib/x";\nexport const b = x;\n'],
  "src/code.ts": ["export const c = 1;\n", "export const c = 2;\n"],
  "src/alias.ts": ['import { strict as check } from "./rules";\nexport const d = check;\n', 'import { loose as check } from "./rules";\nexport const d = check;\n'],
  "src/space.ts": ["export const e = s.split(' ');\n", "export const e = s.split('');\n"],
  "src/layout.py": ["if x:\n    a()\n    b()\n", "if x:\n    a()\nb()\n"],
  "config/secrets.ts": ["export const key = 1;\n", "// The key.\nexport const key = 1;\n"],
  "src/notes.ts": ["export const n = 1;\n", "LINK"],
  "src/untouched.ts": ["export const u = 1;\n", "export const u = 1;\n"],
};

beforeAll(() => {
  repo.root = realpathSync(mkdtempSync(join(tmpdir(), "ontology-atlas-evidence-surfaces-")));
  repo.vault = join(repo.root, "vault");
  mkdirSync(join(repo.vault, "capabilities"), { recursive: true });
  mkdirSync(join(repo.root, "src"));
  mkdirSync(join(repo.root, "config"));
  execFileSync("git", ["-C", repo.root, "init", "-q", "-b", "main"]);
  execFileSync("git", ["-C", repo.root, "config", "user.name", "Atlas Test"]);
  execFileSync("git", ["-C", repo.root, "config", "user.email", "atlas@example.test"]);
  execFileSync("git", ["-C", repo.root, "config", "commit.gpgsign", "false"]);
  writeFileSync(join(repo.root, ".env.local"), "export const n = 1;\n");
  for (const [path, [before]] of Object.entries(FILES)) writeFileSync(join(repo.root, path), before);
  repo.docs = Object.keys(FILES).map((path) => {
    const name = path.replace(/^.*\/|\.\w+$/g, "");
    const slug = `capabilities/${name}`;
    writeFileSync(join(repo.vault, `${slug}.md`), `---\nkind: capability\nslug: ${slug}\ntitle: ${name}\npath: ${path}\n---\n\nCites ${path}.\n`);
    return { slug, frontmatter: { kind: "capability", path } };
  });
  execFileSync("git", ["-C", repo.root, "add", "-f", ".env.local"]);
  commit("record every concept");
  for (const [path, [, after]] of Object.entries(FILES)) {
    if (after === "LINK") {
      rmSync(join(repo.root, path));
      symlinkSync("../.env.local", join(repo.root, path));
    } else writeFileSync(join(repo.root, path), after);
  }
  commit("change the cited files");
});

afterAll(() => {
  if (repo.root) rmSync(repo.root, { recursive: true, force: true });
});

it("the map and validate_vault call the same concepts current and stale", async () => {
  process.env.OATLAS_VAULT = repo.vault;
  const { validateVaultReport } = await import("../../../mcp/src/tools/validate-vault.mjs");
  const drift = validateVaultReport({ repoRoot: repo.root }).evidenceDrift;
  expect(drift.checked).toBe(true);

  const nodes: KnowledgeGraphNode[] = repo.docs.map((doc) => ({
    id: doc.slug,
    title: doc.slug,
    kind: "capability",
    projectIds: ["shop"],
    evidenceIds: [doc.slug],
    lastApprovedAt: new Date(0),
    lastApprovedBy: "test",
  }));
  const map = renderHook(() => useMapEvidenceStates({ nodes, enabled: true }));
  await waitFor(() => expect(map.result.current.availability).toBe("measured"));
  const mapStale = [...map.result.current.states].filter(([, state]) => state === "stale").map(([id]) => id).sort();
  const serverStale = [...drift.stale, ...drift.missing].map((row: { slug: string }) => row.slug).sort();

  expect(mapStale).toEqual(serverStale);
  expect(serverStale).toEqual([
    "capabilities/alias",
    "capabilities/code",
    "capabilities/layout",
    "capabilities/notes",
    "capabilities/secrets",
    "capabilities/space",
  ]);
  const mapCurrent = [...map.result.current.states].filter(([, state]) => state === "current").length;
  expect(mapCurrent).toBe(drift.counts.current);
  expect(drift.counts.stale + drift.counts.missing).toBe(mapStale.length);
});
