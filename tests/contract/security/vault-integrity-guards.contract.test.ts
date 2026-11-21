import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import {
  slugToPath as mcpSlugToPath,
  pathToSlug,
  walkMd as mcpWalkMd,
} from "../../../mcp/src/vault/slug-paths.mjs";
import { loadVaultDocs } from "../../../mcp/src/vault/documents.mjs";
import {
  writeFileAtomically as mcpWriteFileAtomically,
} from "../../../mcp/src/vault/atomic-writes.mjs";
import { compileOntology } from "../../../mcp/src/ontology-compiler.mjs";
import { writeFileAtomically as cliWriteFileAtomically } from "../../../cli/src/lib/vault-files/atomic-write.mjs";
import { slugToPath as cliSlugToPath, writeFrontmatterKey } from "../../../cli/src/lib/vault-files/write-vault.mjs";
import { walkMd as cliWalkMd } from "../../../cli/src/lib/vault-files/walk-vault.mjs";

/**
 * Cases that look valid in one file and so escape a per-file check. The pure functions are called
 * directly, because `compile`, `overview` and `relate` spawn the MCP server, and a missing runtime
 * in CI would test the environment rather than a defect.
 */

const made: string[] = [];

function vault(): string {
  const dir = mkdtempSync(join(tmpdir(), "atlas-integrity-"));
  made.push(dir);
  return dir;
}

/** Reads and compiles the vault through the production path — the test does not pre-filter. */
function compileVault(root: string) {
  return compileOntology(loadVaultDocs(root), { summary: true });
}

afterEach(() => {
  for (const dir of made.splice(0)) {
    try {
      rmSync(dir, { recursive: true, force: true });
    } catch {
      /* best effort */
    }
  }
});

/**
 * **A symlink must not write outside the vault.**
 *
 * `slugToPath` only checked whether the **path string** produced by `resolve()` was
 * inside root. If `escape.md` inside the vault is a link pointing outward, the
 * string is perfectly inside root and `writeFileSync` follows the link and writes
 * outside. Measured: a file outside the vault was modified while the success line
 * reported a path inside it — the user cannot find their edit at that path.
 *
 * The threat that function's own comment describes — *"so prompt injection cannot point at
 * a file outside the vault root"* — was open **on the filesystem side**, not the slug
 * side. The MCP and CLI copies both carry this contract.
 */
describe("writes outside the vault: symbolic links", () => {
  /** Places one link inside the vault root that points at a file outside it. */
  function vaultWithEscapeLink(): { root: string; outside: string } {
    const base = vault();
    const root = join(base, "root");
    const outside = join(base, "outside.md");
    mkdirSync(root, { recursive: true });
    writeFileSync(outside, "---\nkind: domain\ntitle: Outside\n---\nx\n");
    symlinkSync(outside, join(root, "escape.md"));
    return { root, outside };
  }

  it.each([
    ["mcp", mcpSlugToPath],
    ["cli", cliSlugToPath],
  ])("%s: refuses a linked slug", (_name, resolve) => {
    const { root } = vaultWithEscapeLink();
    expect(() => resolve(root, "escape")).toThrow(/symlink/);
  });

  it.each([
    ["mcp", mcpSlugToPath],
    ["cli", cliSlugToPath],
  ])("%s: a normal slug resolves as it is, so the guard did not kill the feature", (_name, resolve) => {
    const root = vault();
    writeFileSync(join(root, "a.md"), "---\nkind: domain\ntitle: A\n---\nx\n");
    expect(resolve(root, "a")).toBe(join(root, "a.md"));
    // A file that does not exist yet (a place to create one) is also valid.
    expect(resolve(root, "nested/new")).toBe(join(root, "nested/new.md"));
  });

  it("a write does not actually touch the link target", () => {
    const { root, outside } = vaultWithEscapeLink();
    expect(() => writeFrontmatterKey(root, "escape", "relates", ["a"])).toThrow(/symlink/);
    expect(readFileSync(outside, "utf8")).not.toContain("relates");
  });
});

/**
 * **A link inside the vault must not read a document outside it.**
 *
 * Single-slug writes went through the guard above, but full listing used a separate
 * walker. A Dirent symlink is not a directory, so anything named `.md` was collected
 * like an ordinary file and the MCP/CLI followed the link to read its target. The
 * promise that the chosen vault is the read boundary must hold for full traversal
 * too.
 */
describe("reads outside the vault: symbolic links", () => {
  const walkers = [
    ["mcp", mcpWalkMd],
    ["cli", cliWalkMd],
  ] as const;

  function vaultWithReadableEscape(): { root: string; safe: string } {
    const base = vault();
    const root = join(base, "root");
    const outside = join(base, "outside.md");
    const safe = join(root, "safe.md");
    mkdirSync(root, { recursive: true });
    writeFileSync(outside, "---\nkind: domain\ntitle: Outside secret\n---\nOUTSIDE_SECRET\n");
    writeFileSync(safe, "---\nkind: domain\ntitle: Safe\n---\nsafe-body\n");
    symlinkSync(outside, join(root, "escape.md"));
    return { root, safe };
  }

  it("probe: checks both the MCP and the CLI walker", () => {
    expect(walkers).toHaveLength(2);
  });

  it.each(walkers)("%s: walks only real files and excludes .md links", (_name, walk) => {
    const { root, safe } = vaultWithReadableEscape();
    expect(walk(root)).toEqual([safe]);
  });

  it("the MCP loader response carries neither the title nor the body of a link target", () => {
    const { root } = vaultWithReadableEscape();
    const docs = loadVaultDocs(root);
    expect(docs.map((doc) => doc.slug)).toEqual(["safe"]);
    expect(JSON.stringify(docs)).not.toContain("OUTSIDE_SECRET");
    expect(JSON.stringify(docs)).not.toContain("Outside secret");
  });
});

/** An atomic replace must not relax a private document to the default 0644 temp-file permissions. */
describe("vault file permissions: atomic update", () => {
  const writers = [
    ["mcp", mcpWriteFileAtomically],
    ["cli", cliWriteFileAtomically],
  ] as const;

  it("probe: checks both the MCP and the CLI writer", () => {
    expect(writers).toHaveLength(2);
  });

  it.each(writers)("%s: updating a 0600 document keeps it 0600", (_name, write) => {
    const root = vault();
    const target = join(root, "private.md");
    writeFileSync(target, "before\n");
    chmodSync(target, 0o600);

    write(target, "after\n");

    expect(readFileSync(target, "utf8")).toBe("after\n");
    expect(statSync(target).mode & 0o777).toBe(0o600);
  });
});

/** A kind inherited via an object meta key still does not make a graph node. */
describe("frontmatter object meta keys: graph boundary", () => {
  it("probe: compiles a normal node together with an attack document", () => {
    const root = vault();
    writeFileSync(
      join(root, "safe.md"),
      "---\nuid: 51890f3e-7b5d-4c0a-8f14-123456789abc\nkind: domain\ntitle: Safe\n---\n",
    );
    writeFileSync(
      join(root, "forged.md"),
      "---\n__proto__:\n  uid: 61890f3e-7b5d-4c0a-8f14-123456789abc\n  kind: domain\n  title: Forged\nsafe: value\n---\n",
    );

    const docs = loadVaultDocs(root);
    const forged = docs.find((doc) => doc.slug === "forged");
    const forgedFrontmatter = (forged?.frontmatter ?? {}) as Record<string, unknown>;
    expect(Object.prototype.hasOwnProperty.call(forgedFrontmatter, "kind")).toBe(false);
    expect(forgedFrontmatter.kind).toBeUndefined();

    const summary = compileOntology(docs, { summary: true }) as { nodeCount: number };
    expect(summary.nodeCount).toBe(1);
  });
});

/**
 * **Same characters means same node — NFC/NFD.**
 *
 * macOS commonly hands back Korean in filenames as NFD (decomposed jamo), while what
 * a user types into frontmatter is NFC. The two strings have **exactly the same
 * characters and different bytes.** Unnormalized, `validate` warns that a name does not
 * resolve while `list` shows that very node, and the compiler drops the edge as
 * `resolved: false`: nodes with Korean names lose their relations. The difference is
 * invisible to the eye, so it cannot be fixed by hand.
 */
describe("Unicode normalization: NFD file names", () => {
  const NFD = "한글".normalize("NFD");
  const NFC = "한글".normalize("NFC");

  it("probe: the two forms really differ in bytes", () => {
    expect(NFD).not.toBe(NFC);
    expect(NFD.normalize("NFC")).toBe(NFC);
  });

  it("a slug made from an NFD file name is NFC", () => {
    const root = vault();
    const file = join(root, `${NFD}.md`);
    expect(pathToSlug(root, file)).toBe(NFC);
  });

  it("the compiler links an NFC reference to an NFD file, and merely silencing the warning is not enough", () => {
    const root = vault();
    writeFileSync(
      join(root, `${NFD}.md`),
      "---\nuid: 01890f3e-7b5d-4c0a-8f14-123456789abc\nkind: domain\ntitle: NFD\n---\nx\n",
    );
    writeFileSync(
      join(root, "ref.md"),
      `---\nuid: 11890f3e-7b5d-4c0a-8f14-123456789abc\nkind: capability\ntitle: Ref\ndomain: ${NFC}\n---\nx\n`,
    );
    const compiled = compileOntology(loadVaultDocs(root), {}) as {
      edges?: { resolved?: boolean }[];
    };
    expect(compiled.edges?.length ?? 0).toBeGreaterThan(0);
    expect(compiled.edges?.every((edge) => edge.resolved !== false)).toBe(true);
  });
});

/**
 * **The node count is the same whichever layer you ask.**
 *
 * The contract in `AGENTS.md`: *"each `.md` with a frontmatter `kind:` is an
 * ontology node"*. `list`, `validate`, and the web runtime (`deriveDocNode` returns
 * `null` when kind is empty) all kept it, but **only the compiler accepted every
 * `.md` as a node.** One ordinary memo in the vault made it `list 97 · compile 98`,
 * and inside a single artifact `nodeCount 4` contradicted a `byKind` sum of 1. On
 * top of that, kind-less nodes tripped the result contracts of `overview` and
 * `hubs`, killing those commands outright with exit 2 — on a vault `validate` had
 * just passed.
 *
 * The existing `graph-truth-parity` contract missed this because its loader
 * **pre-filtered** the input (`if (!frontmatter?.kind) continue;`). The production
 * loader does not filter, so `loadVaultDocs` is used here as is.
 */
describe("node count matches: .md without a kind", () => {
  function mixedVault(): string {
    const root = vault();
    writeFileSync(
      join(root, "real.md"),
      "---\nuid: 21890f3e-7b5d-4c0a-8f14-123456789abc\nkind: domain\ntitle: Real\n---\nx\n",
    );
    writeFileSync(join(root, "note.md"), "# 그냥 메모\n");
    writeFileSync(join(root, "readme-ish.md"), "설명만 있는 파일\n");
    return root;
  }

  it("only a document with a kind becomes a node", () => {
    const summary = compileVault(mixedVault()) as {
      nodeCount: number;
      byKind?: Record<string, number>;
    };
    expect(summary.nodeCount).toBe(1);
    const byKindTotal = Object.values(summary.byKind ?? {}).reduce((a, b) => a + b, 0);
    // A single artifact must not contradict itself either.
    expect(byKindTotal).toBe(summary.nodeCount);
  });

  it("does not quietly swallow skipped files", () => {
    const summary = compileVault(mixedVault()) as { skippedNonNodeCount?: number };
    expect(summary.skippedNonNodeCount).toBe(2);
  });

  it("a normal vault skips nothing, so the new filter has no false positives", () => {
    const root = vault();
    writeFileSync(
      join(root, "a.md"),
      "---\nuid: 31890f3e-7b5d-4c0a-8f14-123456789abc\nkind: domain\ntitle: A\n---\nx\n",
    );
    writeFileSync(
      join(root, "b.md"),
      "---\nuid: 41890f3e-7b5d-4c0a-8f14-123456789abc\nkind: capability\ntitle: B\n---\nx\n",
    );
    const summary = compileVault(root) as { nodeCount: number; skippedNonNodeCount?: number };
    expect(summary.nodeCount).toBe(2);
    expect(summary.skippedNonNodeCount).toBe(0);
  });
});

/**
 * **A file that could not be read is never certified "clean".**
 *
 * A read failure is never skipped while still counting toward `scanned`: one unreadable `.md`
 * must not produce `6 files scanned — 0 issues. vault clean ✓` while `compile` on the same
 * vault exits 2 with EACCES.
 *
 * In CI running as root, `chmod 000` does not block reading, so this check skips
 * itself when the block did not take — it **confirms the block first** rather than
 * emitting a false green in an environment where it cannot measure.
 */
describe("files that could not be read", () => {
  it("does not swallow a file outside the check range", () => {
    const root = vault();
    writeFileSync(join(root, "ok.md"), "---\nkind: domain\ntitle: OK\n---\nx\n");
    const secret = join(root, "secret.md");
    writeFileSync(secret, "---\nkind: domain\ntitle: S\n---\nx\n");
    chmodSync(secret, 0o000);
    try {
      let blocked = true;
      try {
        readFileSync(secret, "utf8");
        blocked = false;
      } catch {
        blocked = true;
      }
      // Running as root, `chmod 000` does not block reading. To avoid a false green on a
      // contract that cannot be measured, **confirm the block first**.
      if (!blocked) return;
      expect(() => loadVaultDocs(root)).toThrow();
    } finally {
      chmodSync(secret, 0o644);
    }
  });
});
