import { existsSync, readdirSync, readFileSync } from "node:fs";
import { globSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * The contract that **conditional rules actually load**.
 *
 * Background: all 8 of `.claude/rules/*.md` were resident every turn, costing 73KB.
 * Moving five to conditional loading via the `paths:` frontmatter documented by
 * Claude Code brought the resident share to 13.6KB — the rules were not deleted,
 * they **load only when needed**.
 *
 * That method brings its own silent failure: **a glob matching no file means the
 * rule never loads.** The file is still there, the YAML is valid, no error is
 * raised — the rule simply ceases to exist. On the first attempt `i18n/**` matched 0
 * files (the real location is `src/i18n`); `src/**` happened to cover it so no
 * symptom appeared, and without that cover the whole architecture rule would have
 * silently dropped out.
 *
 * So what is measured is not "is the YAML valid" but **"does this glob match
 * something in this repository today"**. A refactor that moves a directory breaks
 * here first.
 *
 * ⚠️ Resident rules (those without `paths:`) are out of scope — with no condition
 * they cannot fall silent. Which rules stay resident is a design decision, and
 * `ALWAYS_LOADED` below states it.
 */

const HARNESS_RUNBOOK = "docs/engineering/agent-instructions.md";

const RULES_DIR = join(process.cwd(), ".claude/rules");

/**
 * Rules that must load every turn, unconditionally.
 *
 * The test is **"is it needed before any file is read"**. A conditional rule loads
 * when Claude *reads* a matching file, so a decision that must be made before
 * opening a file arrives too late if it is conditional.
 *
 * - `forbidden.md` — the forbidden list. Deciding whether to run `npm publish`
 *   happens without reading any file.
 * - `git.md` — commit and branch discipline. Independent of what was read.
 * - `local-first.md` — design decisions such as whether to introduce a backend. The
 *   conclusion must exist before any code is opened.
 */
const ALWAYS_LOADED = ["forbidden.md", "git.md", "local-first.md"];

type Rule = { file: string; paths: string[] | null };

function readRules(): Rule[] {
  return readdirSync(RULES_DIR)
    .filter((f) => f.endsWith(".md"))
    .sort()
    .map((file) => {
      const text = readFileSync(join(RULES_DIR, file), "utf8");
      const match = /^---\n([\s\S]*?)\n---\n/.exec(text);
      if (match === null) return { file, paths: null };
      const body = match[1];
      const paths = body
        .split("\n")
        .filter((line) => /^\s*- /.test(line))
        .map((line) => line.trim().slice(2).replace(/^["']|["']$/g, ""));
      return { file, paths };
    });
}

describe("`.claude/rules` path scoping contract", () => {
  const rules = readRules();

  it("the rule files really exist — an empty directory does not pass", () => {
    expect(rules.length).toBeGreaterThanOrEqual(8);
  });

  it("the three set as resident have no `paths:`", () => {
    for (const name of ALWAYS_LOADED) {
      const rule = rules.find((r) => r.file === name);
      expect(rule, `${name} is missing`).toBeDefined();
      expect(rule?.paths, `${name} must be loaded unconditionally`).toBeNull();
    }
  });

  it("all the rest are conditional — the resident list grows only explicitly", () => {
    // Promoting a new rule to resident requires adding it to ALWAYS_LOADED above with
    // its reason. Otherwise the road back to 73KB is free.
    const unconditional = rules.filter((r) => r.paths === null).map((r) => r.file);
    expect(unconditional.sort()).toEqual([...ALWAYS_LOADED].sort());
  });

  it("a rule that opens frontmatter has a non-empty `paths` list", () => {
    for (const rule of rules) {
      if (rule.paths === null) continue;
      expect(rule.paths.length, `the paths of ${rule.file} are empty`).toBeGreaterThan(0);
    }
  });

  it("**every glob matches something today** — one with zero matches is a silently vanished rule", () => {
    const dead: string[] = [];
    for (const rule of rules) {
      if (rule.paths === null) continue;
      for (const pattern of rule.paths) {
        let hits = 0;
        try {
          hits = globSync(pattern).length;
        } catch {
          dead.push(`${rule.file}: ${pattern} (glob error)`);
          continue;
        }
        if (hits === 0) dead.push(`${rule.file}: ${pattern}`);
      }
    }
    expect(dead, `globs that match no file — this rule is not loaded:\n${dead.join("\n")}`).toEqual(
      [],
    );
  // The pre-push hook intentionally runs this contract in both the full unit lane
  // and the contract lane while saturating the machine. The same 42-glob scan is
  // ~3.2s alone but measured 15.9–17.0s in that supported parallel path, so its
  // timeout covers the hook's execution model rather than assuming an idle CPU.
  }, 30_000);

  /**
   * The harness runbook tells the reader which rules load every turn and which wait for a
   * matching path. That sentence is how someone decides where a new rule goes;
   * it goes stale the moment a rule is added or a frontmatter block opens.
   *
   * Both sides are computed rather than written down. `documentation.md` allows
   * a prose gate only when it derives its expectation from code; a hand-written
   * list here would be the pinned sentence that rule forbids.
   */
  it("describes its own loading conditions correctly in the harness runbook", () => {
    const agents = readFileSync(join(process.cwd(), HARNESS_RUNBOOK), "utf8");
    const start = agents.indexOf("## Loading and hooks");
    expect(start, `${HARNESS_RUNBOOK} has no loading section`).toBeGreaterThan(-1);
    const section = agents.slice(start);
    const end = section.indexOf("\n## ", 1);
    const sentence = end === -1 ? section : section.slice(0, end);

    const named = new Set([...sentence.matchAll(/`([a-z-]+)`/g)].map((m) => m[1]));
    const resident = rules.filter((r) => r.paths === null).map((r) => r.file.replace(/\.md$/, ""));
    const conditional = rules.filter((r) => r.paths !== null).map((r) => r.file.replace(/\.md$/, ""));

    for (const name of [...resident, ...conditional]) {
      expect(
        named.has(name),
        `the runbook's loading section never names \`${name}\`, so a reader cannot tell when it loads`,
      ).toBe(true);
    }
  });

  /**
   * Claude Code reads `AGENTS.md` only when no `CLAUDE.md` (beside it or in `.claude/`)
   * or `CLAUDE.local.md` sits in the working directory or above it. A committed one,
   * even an empty one, silently replaces every rule `AGENTS.md` alone states.
   */
  it("keeps AGENTS.md the only root instruction file Claude reads", () => {
    const shadows = ["CLAUDE.md", ".claude/CLAUDE.md", "CLAUDE.local.md"].filter((file) =>
      existsSync(join(process.cwd(), file)),
    );
    expect(
      shadows,
      `these files make Claude Code skip AGENTS.md:\n${shadows.join("\n")}\n`
        + "Move what they say into AGENTS.md and delete them.",
    ).toEqual([]);
  });

  /**
   * `AGENTS.md` lists which addresses are live and which only redirect. A redirect page is identifiable
   * by importing a view from `@/views/*-redirect` and rendering nothing else, so the set is derived.
   */
  /**
   * The harness runbook inventories hooks and says which are mirrored into `.codex/hooks/`. Only one-sided hooks
   * are required by name; the mirrored ones are covered by `pnpm test:claude:hooks`, and a size cap
   * cannot catch a claim rotting without changing size.
   */
  it("names every hook that exists on one side only", () => {
    const shellScripts = (dir: string): string[] =>
      readdirSync(join(process.cwd(), dir)).filter((name) => name.endsWith(".sh")).sort();
    const claude = shellScripts(".claude/hooks");
    const codex = shellScripts(".codex/hooks");
    expect(claude.length + codex.length, "no hooks found — this sweep would pass vacuously")
      .toBeGreaterThan(4);

    const asymmetric = [
      ...claude.filter((name) => !codex.includes(name)),
      ...codex.filter((name) => !claude.includes(name)),
    ].sort();
    const runbook = readFileSync(join(process.cwd(), HARNESS_RUNBOOK), "utf8");
    const unnamed = asymmetric.filter((name) => !runbook.includes(name));
    expect(
      unnamed,
      `these hooks run for one tool and not the other, and the harness runbook never says so:\n`
        + `${unnamed.join("\n")}\n`
        + "An asymmetry nobody wrote down reads as an oversight the next time someone "
        + "tries to restore parity.",
    ).toEqual([]);
  });

  it("names every legacy redirect route in AGENTS.md", () => {
    const appDir = join(process.cwd(), "app/[locale]");
    const pages = globSync("**/page.tsx", { cwd: appDir });
    expect(pages.length, "no app pages found — this sweep would pass vacuously").toBeGreaterThan(5);

    const redirects = pages
      .filter((page) => /from ["']@\/views\/[a-z-]*redirect["']/.test(
        readFileSync(join(appDir, page), "utf8"),
      ))
      .map((page) => `/${page.replace(/\/?page\.tsx$/, "")}`)
      .sort();
    expect(redirects.length, "no redirect pages matched the import pattern").toBeGreaterThan(0);

    const agents = readFileSync(join(process.cwd(), "AGENTS.md"), "utf8");
    const unnamed = redirects.filter((route) => !agents.includes(`\`${route}\``));
    expect(
      unnamed,
      `these routes only redirect, and AGENTS.md never says so:\n${unnamed.join("\n")}\n`
        + "An agent that cannot tell a redirect from a live surface cannot route a user to either.",
    ).toEqual([]);
  });

  it("leaves no rule unmentioned by the file every agent reads", () => {
    const agents = readFileSync(join(process.cwd(), "AGENTS.md"), "utf8");
    const unmentioned = rules
      .map((r) => r.file)
      .filter((file) => !agents.includes(file.replace(/\.md$/, "")));
    expect(
      unmentioned,
      `these rules exist but nothing an agent reads points at them:\n${unmentioned.join("\n")}`,
    ).toEqual([]);
  });

  function authoredBytes(file: string): number {
    return Buffer.byteLength(readFileSync(join(process.cwd(), file), "utf8"), "utf8");
  }

  it("carries no region a build tool writes into the file", () => {
    // `next dev` used to re-add a block here; the dev server is Vite now, and nothing rewrites this file.
    expect(readFileSync(join(process.cwd(), "AGENTS.md"), "utf8")).not.toContain("nextjs-agent-rules");
  });

  it("keeps the whole resident context at or under 20,000 bytes", () => {
    const files = ["AGENTS.md", ...ALWAYS_LOADED.map((f) => join(".claude/rules", f))];
    const total = files.reduce((sum, file) => sum + authoredBytes(file), 0);
    const detail = files.map((file) => `  ${authoredBytes(file)} ${file}`).join("\n");

    expect(
      total,
      `the resident context is ${total} bytes:\n${detail}\n`
        + "Every turn pays this before the task is read. Move detail to a path-loaded "
        + "rule or a skill.",
    ).toBeLessThanOrEqual(20_000);
  });

  /**
   * A path-scoped rule arrives on top of `AGENTS.md` in the same turn, and 32 KiB is the cap the
   * nested pointers already keep for Codex. When a rule outgrows it, split it by subject into
   * another path-scoped rule, as `surface-exceptions.md` was split from `surfaces.md`.
   */
  it("keeps AGENTS.md plus any one path-scoped rule at or under 32 KiB", () => {
    const agents = authoredBytes("AGENTS.md");
    const over = rules
      .filter((rule) => rule.paths !== null)
      .map((rule) => ({ file: rule.file, total: agents + authoredBytes(join(".claude/rules", rule.file)) }))
      .filter(({ total }) => total > 32_768)
      .map(({ file, total }) => `  ${total} AGENTS.md + ${file}`);
    expect(over, `over 32,768 bytes:\n${over.join("\n")}\n`).toEqual([]);
  });
});
