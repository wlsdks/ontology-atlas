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

// `init` writes agent configs through this copy; the app's Rust layer embeds it too.
import { writeFileAtomically as initWriteFileAtomically } from "../../../cli/src/lib/vault-files/atomic-write.mjs";
import { callServerTool } from "../server-session/call-server-tool";

/**
 * Cases that look valid in one file and so escape a per-file check. Each one is asked of the MCP
 * server over stdio, the way an agent meets it, so the answer holds whichever program serves the
 * launcher command: what an agent can write, read or count, not how the server's modules split it.
 */

const made: string[] = [];

function vault(): string {
  const dir = mkdtempSync(join(tmpdir(), "atlas-integrity-"));
  made.push(dir);
  return dir;
}

interface CompiledSummary {
  nodeCount: number;
  byKind?: Record<string, number>;
  skippedNonNodeCount?: number;
}

/** Compiles the vault through the server's own reader — the test does not pre-filter. */
async function compileSummary(root: string): Promise<CompiledSummary> {
  const answer = await callServerTool(root, "compile_ontology", { summary: true });
  expect(answer.isError, JSON.stringify(answer.value)).toBe(false);
  return answer.value as CompiledSummary;
}

/** The slugs `list_concepts` names in a vault: every document that is a node. */
async function listedSlugs(root: string): Promise<{ slugs: string[]; raw: string }> {
  const answer = await callServerTool(root, "list_concepts", { limit: 500 });
  expect(answer.isError, JSON.stringify(answer.value)).toBe(false);
  const nodes = (answer.value as { nodes: { slug: string }[] }).nodes;
  return { slugs: nodes.map((node) => node.slug).sort(), raw: JSON.stringify(answer.value) };
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
 * A guard that only checked whether the **path string** was inside the root misses a link inside
 * the vault that points outward: the string is perfectly inside root and a write follows the link.
 * Measured: a file outside the vault was modified while the success line reported a path inside
 * it — the user cannot find their edit at that path. Every MCP write resolves its slug through
 * this guard.
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

  it("refuses a write through a linked slug and leaves the link target alone", async () => {
    const { root, outside } = vaultWithEscapeLink();
    const before = readFileSync(outside, "utf8");
    const answer = await callServerTool(root, "patch_concept", { slug: "escape", frontmatter: { relates: ["a"] } });
    expect(answer.isError, JSON.stringify(answer.value)).toBe(true);
    expect(readFileSync(outside, "utf8")).toBe(before);
  });

  it("a normal slug is still written, so the guard did not kill the feature", async () => {
    const root = vault();
    const file = join(root, "a.md");
    writeFileSync(file, "---\nkind: domain\ntitle: A\n---\nx\n");
    const answer = await callServerTool(root, "patch_concept", { slug: "a", frontmatter: { relates: ["b"] } });
    expect(answer.isError, JSON.stringify(answer.value)).toBe(false);
    expect(readFileSync(file, "utf8")).toContain("relates");
  });
});

/**
 * **A link inside the vault must not read a document outside it.**
 *
 * Single-slug writes went through the guard above, but a full listing walks the folder separately.
 * A symlink entry is not a directory, so anything named `.md` could be collected like an ordinary
 * file and its target read. The promise that the chosen vault is the read boundary must hold for
 * full traversal too.
 */
describe("reads outside the vault: symbolic links", () => {
  it("lists only real files, and nothing the server returns carries a link target's title or body", async () => {
    const base = vault();
    const root = join(base, "root");
    mkdirSync(root, { recursive: true });
    writeFileSync(join(base, "outside.md"), "---\nkind: domain\ntitle: Outside secret\n---\nOUTSIDE_SECRET\n");
    writeFileSync(join(root, "safe.md"), "---\nkind: domain\ntitle: Safe\n---\nsafe-body\n");
    symlinkSync(join(base, "outside.md"), join(root, "escape.md"));

    const listed = await listedSlugs(root);
    expect(listed.slugs).toEqual(["safe"]);
    const read = await callServerTool(root, "get_concepts", { slugs: ["safe", "escape"], body: "full" });
    for (const text of [listed.raw, JSON.stringify(read.value)]) {
      expect(text).not.toContain("OUTSIDE_SECRET");
      expect(text).not.toContain("Outside secret");
    }
  });
});

/** An atomic replace must not relax a private document to the default 0644 temp-file permissions. */
describe("vault file permissions: atomic update", () => {
  it("mcp: updating a 0600 document keeps it 0600", async () => {
    const root = vault();
    const target = join(root, "private.md");
    writeFileSync(target, "---\nkind: domain\ntitle: Private\n---\nbefore\n");
    chmodSync(target, 0o600);

    const answer = await callServerTool(root, "patch_concept", { slug: "private", body: "after\n" });
    expect(answer.isError, JSON.stringify(answer.value)).toBe(false);

    expect(readFileSync(target, "utf8")).toContain("after");
    expect(statSync(target).mode & 0o777).toBe(0o600);
  });

  it("init: updating a 0600 document keeps it 0600", () => {
    const root = vault();
    const target = join(root, "private.md");
    writeFileSync(target, "before\n");
    chmodSync(target, 0o600);

    initWriteFileAtomically(target, "after\n");

    expect(readFileSync(target, "utf8")).toBe("after\n");
    expect(statSync(target).mode & 0o777).toBe(0o600);
  });
});

/** A kind inherited via an object meta key still does not make a graph node. */
describe("frontmatter object meta keys: graph boundary", () => {
  it("compiles a normal node together with an attack document, and only the normal one counts", async () => {
    const root = vault();
    writeFileSync(
      join(root, "safe.md"),
      "---\nuid: 51890f3e-7b5d-4c0a-8f14-123456789abc\nkind: domain\ntitle: Safe\n---\n",
    );
    writeFileSync(
      join(root, "forged.md"),
      "---\n__proto__:\n  uid: 61890f3e-7b5d-4c0a-8f14-123456789abc\n  kind: domain\n  title: Forged\nsafe: value\n---\n",
    );

    expect((await compileSummary(root)).nodeCount).toBe(1);
    expect((await listedSlugs(root)).slugs).toEqual(["safe"]);
  });
});

/**
 * **Same characters means same node — NFC/NFD.**
 *
 * macOS commonly hands back Korean in filenames as NFD (decomposed jamo), while what
 * a user types into frontmatter is NFC. The two strings have **exactly the same
 * characters and different bytes.** Unnormalized, a check warns that a name does not
 * resolve while the listing shows that very node, and the compiler drops the edge as
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

  it("a slug made from an NFD file name is NFC", async () => {
    const root = vault();
    writeFileSync(
      join(root, `${NFD}.md`),
      "---\nuid: 01890f3e-7b5d-4c0a-8f14-123456789abc\nkind: domain\ntitle: NFD\n---\nx\n",
    );
    expect((await listedSlugs(root)).slugs).toEqual([NFC]);
  });

  it("the compiler links an NFC reference to an NFD file, and merely silencing the warning is not enough", async () => {
    const root = vault();
    writeFileSync(
      join(root, `${NFD}.md`),
      "---\nuid: 01890f3e-7b5d-4c0a-8f14-123456789abc\nkind: domain\ntitle: NFD\n---\nx\n",
    );
    writeFileSync(
      join(root, "ref.md"),
      `---\nuid: 11890f3e-7b5d-4c0a-8f14-123456789abc\nkind: capability\ntitle: Ref\ndomain: ${NFC}\n---\nx\n`,
    );
    const answer = await callServerTool(root, "compile_ontology", { full: true });
    expect(answer.isError, JSON.stringify(answer.value)).toBe(false);
    const compiled = answer.value as { edges?: { resolved?: boolean }[] };
    expect(compiled.edges?.length ?? 0).toBeGreaterThan(0);
    expect(compiled.edges?.every((edge) => edge.resolved !== false)).toBe(true);
  });
});

/**
 * **The node count is the same whichever layer you ask.**
 *
 * The contract in `AGENTS.md`: *"each `.md` with a frontmatter `kind:` is an
 * ontology node"*. The listing, the validation, and the web runtime (`deriveDocNode` returns
 * `null` when kind is empty) all kept it, but **only the compiler accepted every
 * `.md` as a node.** One ordinary memo in the vault made it `list 97 · compile 98`,
 * and inside a single artifact `nodeCount 4` contradicted a `byKind` sum of 1.
 *
 * The existing `graph-truth-parity` contract missed this because its loader
 * **pre-filtered** the input. The server's own reader does not filter, so it is asked as is.
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

  it("only a document with a kind becomes a node, and the skipped files are counted", async () => {
    const summary = await compileSummary(mixedVault());
    expect(summary.nodeCount).toBe(1);
    const byKindTotal = Object.values(summary.byKind ?? {}).reduce((a, b) => a + b, 0);
    // A single artifact must not contradict itself either.
    expect(byKindTotal).toBe(summary.nodeCount);
    // Skipped files are not swallowed quietly.
    expect(summary.skippedNonNodeCount).toBe(2);
  });

  it("a normal vault skips nothing, so the filter has no false positives", async () => {
    const root = vault();
    writeFileSync(
      join(root, "a.md"),
      "---\nuid: 31890f3e-7b5d-4c0a-8f14-123456789abc\nkind: domain\ntitle: A\n---\nx\n",
    );
    writeFileSync(
      join(root, "b.md"),
      "---\nuid: 41890f3e-7b5d-4c0a-8f14-123456789abc\nkind: capability\ntitle: B\n---\nx\n",
    );
    const summary = await compileSummary(root);
    expect(summary.nodeCount).toBe(2);
    expect(summary.skippedNonNodeCount).toBe(0);
  });
});

/**
 * **A file that could not be read is never certified "clean".**
 *
 * A read failure is never skipped while still counting toward `scanned`: one unreadable `.md`
 * must not produce `6 files scanned — 0 issues. vault clean ✓` while `compile` on the same
 * vault fails with EACCES.
 *
 * In CI running as root, `chmod 000` does not block reading, so this check skips
 * itself when the block did not take — it **confirms the block first** rather than
 * emitting a false green in an environment where it cannot measure.
 */
describe("files that could not be read", () => {
  it("does not swallow a file outside the check range", async () => {
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
      const answer = await callServerTool(root, "compile_ontology", { summary: true });
      expect(answer.isError, JSON.stringify(answer.value)).toBe(true);
    } finally {
      chmodSync(secret, 0o644);
    }
  });
});
