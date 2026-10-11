import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * Non-Claude agents do not read `.claude/**`, so each directory a rule reaches needs a nested
 * `AGENTS.md` that points at exactly those rules, derived from frontmatter. `docs/` is excluded
 * because `scripts/build-docs-vault.mjs` would ship a nested agent file there as product surface.
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
