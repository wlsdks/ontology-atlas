import { readdirSync, readFileSync } from "node:fs";
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

  it("규칙 파일이 실제로 있다 — 빈 디렉터리를 통과시키지 않는다", () => {
    expect(rules.length).toBeGreaterThanOrEqual(8);
  });

  it("상주로 정한 셋은 `paths:` 를 갖지 않는다", () => {
    for (const name of ALWAYS_LOADED) {
      const rule = rules.find((r) => r.file === name);
      expect(rule, `${name} 이 없다`).toBeDefined();
      expect(rule?.paths, `${name} 은 조건 없이 실려야 한다`).toBeNull();
    }
  });

  it("나머지는 전부 조건부다 — 상주 목록은 명시적으로만 늘어난다", () => {
    // Promoting a new rule to resident requires adding it to ALWAYS_LOADED above with
    // its reason. Otherwise the road back to 73KB is free.
    const unconditional = rules.filter((r) => r.paths === null).map((r) => r.file);
    expect(unconditional.sort()).toEqual([...ALWAYS_LOADED].sort());
  });

  it("frontmatter 를 연 규칙은 비지 않은 `paths` 목록을 갖는다", () => {
    for (const rule of rules) {
      if (rule.paths === null) continue;
      expect(rule.paths.length, `${rule.file} 의 paths 가 비었다`).toBeGreaterThan(0);
    }
  });

  it("**모든 글롭이 오늘 무언가를 맞춘다** — 0개짜리는 조용히 사라진 규칙이다", () => {
    const dead: string[] = [];
    for (const rule of rules) {
      if (rule.paths === null) continue;
      for (const pattern of rule.paths) {
        let hits = 0;
        try {
          hits = globSync(pattern).length;
        } catch {
          dead.push(`${rule.file}: ${pattern} (글롭 오류)`);
          continue;
        }
        if (hits === 0) dead.push(`${rule.file}: ${pattern}`);
      }
    }
    expect(dead, `아무 파일도 안 맞는 글롭 — 이 규칙은 실리지 않는다:\n${dead.join("\n")}`).toEqual(
      [],
    );
  }, 15_000);

  it("keeps the resident rules under 20 KB — resistance on the way back", () => {
    // The exact ceiling does not matter; what matters is that **somewhere notices** when
    // the resident share swells again. Raising this number requires the commit that
    // raises it to say why.
    const bytes = rules
      .filter((r) => r.paths === null)
      .reduce((sum, r) => sum + readFileSync(join(RULES_DIR, r.file)).byteLength, 0);
    expect(bytes).toBeLessThan(20_000);
  });

  /**
   * `CLAUDE.md` tells the reader which rules load every turn and which wait for a
   * matching path. That sentence is how someone decides where a new rule goes,
   * and nothing checked it: the resident set is guarded above, but the wrapper's
   * description of it could go stale the moment a rule was added or a
   * frontmatter block was opened, and the reader would be confidently wrong.
   *
   * Both sides are computed rather than written down. `documentation.md` allows
   * a prose gate only when it derives its expectation from code; a hand-written
   * list here would be the pinned sentence that rule forbids.
   */
  it("describes its own loading conditions correctly in CLAUDE.md", () => {
    const wrapper = readFileSync(join(process.cwd(), "CLAUDE.md"), "utf8");
    const section = wrapper.slice(wrapper.indexOf("## Claude Code loading"));
    const sentence = section.slice(0, section.indexOf("\n\n`.claude/agents/`"));

    const named = new Set([...sentence.matchAll(/`([a-z-]+)`/g)].map((m) => m[1]));
    const resident = rules.filter((r) => r.paths === null).map((r) => r.file.replace(/\.md$/, ""));
    const conditional = rules.filter((r) => r.paths !== null).map((r) => r.file.replace(/\.md$/, ""));

    for (const name of [...resident, ...conditional]) {
      expect(
        named.has(name),
        `CLAUDE.md's loading sentence never names \`${name}\`, so a reader cannot tell when it loads`,
      ).toBe(true);
    }
  });

  it("leaves no rule unmentioned by the two files every agent reads", () => {
    const both =
      readFileSync(join(process.cwd(), "CLAUDE.md"), "utf8")
      + readFileSync(join(process.cwd(), "AGENTS.md"), "utf8");
    const unmentioned = rules
      .map((r) => r.file)
      .filter((file) => !both.includes(file.replace(/\.md$/, "")));
    expect(
      unmentioned,
      `these rules exist but nothing an agent reads points at them:\n${unmentioned.join("\n")}`,
    ).toEqual([]);
  });

  /**
   * The rules are only part of what loads before the task does. `AGENTS.md` and
   * the `CLAUDE.md` wrapper that imports it are read every turn too, and the
   * 32 KiB Codex cap is far above what is healthy — it is a truncation limit,
   * not a budget.
   *
   * A plain ceiling was not enough here. Over five sessions of harness work the
   * resident share was trimmed by 1,667 bytes and then quietly grew 484 bytes
   * back, one justified documentation paragraph at a time, and nothing noticed
   * because every individual addition was small and correct (2026-08-24). So
   * this ratchets in one direction only: a commit that saves bytes must record
   * the saving, which is what makes the saving permanent.
   */
  const RESIDENT_CONTEXT_BYTES = 27_678;

  it("ratchets the whole resident context downward, never up", () => {
    const files = ["AGENTS.md", "CLAUDE.md", ...ALWAYS_LOADED.map((f) => join(".claude/rules", f))];
    const bytes = files.reduce(
      (sum, file) => sum + readFileSync(join(process.cwd(), file)).byteLength,
      0,
    );
    const detail = files
      .map((file) => `  ${readFileSync(join(process.cwd(), file)).byteLength} ${file}`)
      .join("\n");

    expect(
      bytes,
      `the resident context grew to ${bytes} bytes:\n${detail}\n`
        + "Every turn pays this before the task is read. Move detail to a path-loaded "
        + "rule or a skill, or state in the commit why this must be resident.",
    ).toBeLessThanOrEqual(RESIDENT_CONTEXT_BYTES);

    expect(
      bytes,
      `the resident context is down to ${bytes} bytes: lower RESIDENT_CONTEXT_BYTES `
        + "in this file so the saving cannot be spent again.",
    ).toBeGreaterThan(RESIDENT_CONTEXT_BYTES - 512);
  });
});
