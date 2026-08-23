import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * The contract that **non-Claude agents can find the rules that bind them**.
 *
 * `.claude/rules/` holds roughly 70 KB of guidance and Claude Code loads it from
 * the `paths:` frontmatter. Nothing surfaces it to Codex, Cursor or Gemini CLI:
 * the repository's own visibility table records that those tools do not read
 * `.claude/**`. They do read `AGENTS.md`, and Codex merges one root-down along
 * the working directory, so a nested `AGENTS.md` is the only mechanism that puts
 * the right rule in front of them at the right moment.
 *
 * The standing decision of 2026-07-31 is that these files carry **a pointer, a
 * reference and not a copy** — duplicating rule bodies would blow Codex's 32 KiB
 * `project_doc_max_bytes`, past which it truncates in silence.
 *
 * A pointer's failure mode is going stale: a rule gains a glob, or a directory
 * is renamed, and the nested file keeps naming yesterday's set. Nobody notices,
 * because a wrong pointer looks exactly like a right one. So the expectation
 * here is derived from the frontmatter rather than written down: every directory
 * a rule reaches must have a nested `AGENTS.md`, and it must name exactly the
 * rules that reach it.
 *
 * `docs/` is deliberately excluded. `scripts/build-docs-vault.mjs` sweeps
 * `docs/**\/*.md` into the shipped documentation vault, so a nested agent file
 * there would become product surface.
 */

const RULES_DIR = join(process.cwd(), ".claude/rules");
const EXCLUDED_DIRECTORIES = new Set(["docs"]);

type Coverage = Map<string, Map<string, string[]>>;

function ruleCoverageByDirectory(): Coverage {
  const coverage: Coverage = new Map();
  for (const file of readdirSync(RULES_DIR).filter((name) => name.endsWith(".md")).sort()) {
    const text = readFileSync(join(RULES_DIR, file), "utf8");
    if (!text.startsWith("---")) continue;
    const frontmatter = text.split("---")[1] ?? "";
    for (const line of frontmatter.split("\n")) {
      const match = /^\s*-\s*"(.+)"\s*$/.exec(line);
      if (!match) continue;
      const glob = match[1];
      const [head, ...rest] = glob.split("/");
      // A root-level file or a bare `**/…` pattern has no directory to anchor to.
      if (rest.length === 0 || head.includes("*")) continue;
      if (head.startsWith(".") || EXCLUDED_DIRECTORIES.has(head)) continue;
      if (!existsSync(join(process.cwd(), head))) continue;
      const perRule = coverage.get(head) ?? new Map<string, string[]>();
      perRule.set(file, [...(perRule.get(file) ?? []), glob]);
      coverage.set(head, perRule);
    }
  }
  return coverage;
}

const coverage = ruleCoverageByDirectory();

describe("nested AGENTS.md pointers", () => {
  it("has a directory set to protect — an empty sweep would pass vacuously", () => {
    expect(coverage.size).toBeGreaterThanOrEqual(5);
  });

  it("gives every rule-covered directory a nested AGENTS.md", () => {
    const missing = [...coverage.keys()]
      .filter((dir) => !existsSync(join(process.cwd(), dir, "AGENTS.md")))
      .sort();
    expect(
      missing,
      `these directories are governed by a rule no non-Claude agent can find:\n${missing.join("\n")}`,
    ).toEqual([]);
  });

  it("names exactly the rules that reach each directory", () => {
    for (const [dir, perRule] of coverage) {
      const path = join(process.cwd(), dir, "AGENTS.md");
      if (!existsSync(path)) continue;
      const text = readFileSync(path, "utf8");
      const named = [...text.matchAll(/`\.claude\/rules\/([a-z-]+\.md)`/g)]
        .map((m) => m[1])
        .filter((name, index, all) => all.indexOf(name) === index)
        .sort();
      expect(named, `${dir}/AGENTS.md names the wrong rule set`).toEqual([...perRule.keys()].sort());
    }
  });

  it("quotes each rule's globs so the reader knows why it applies here", () => {
    for (const [dir, perRule] of coverage) {
      const path = join(process.cwd(), dir, "AGENTS.md");
      if (!existsSync(path)) continue;
      const text = readFileSync(path, "utf8");
      for (const globs of perRule.values()) {
        for (const glob of globs) {
          expect(text, `${dir}/AGENTS.md omits the glob ${glob}`).toContain(`\`${glob}\``);
        }
      }
    }
  });

  it("stays a pointer — no rule body is copied in", () => {
    for (const dir of coverage.keys()) {
      const path = join(process.cwd(), dir, "AGENTS.md");
      if (!existsSync(path)) continue;
      const bytes = Buffer.byteLength(readFileSync(path, "utf8"));
      expect(bytes, `${dir}/AGENTS.md is ${bytes} bytes: that is a copy, not a pointer`).toBeLessThan(
        2_000,
      );
    }
  });

  it("leaves the starter-vault templates alone — they are product data", () => {
    for (const template of ["cli/templates/vault/AGENTS.md", "cli/templates/vault-ko/AGENTS.md"]) {
      const path = join(process.cwd(), template);
      if (!existsSync(path)) continue;
      expect(readFileSync(path, "utf8")).not.toContain(".claude/rules/");
    }
  });
});
