import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * The contract that **every shipped skill is reachable**.
 *
 * A skill is only as good as the moment someone learns it exists. `AGENTS.md` is
 * the one routing surface every agent reads: Claude Code imports it through
 * `CLAUDE.md`, and Codex, Cursor and Gemini CLI read it directly. `.claude/skills`
 * is invisible to those three, and whether they surface `.agents/skills`
 * descriptions on their own is not something this repository can promise.
 *
 * Two skills were unreachable when this was measured (2026-08-24).
 * `ontology-absorb-confluence` is a documented product feature backed by the live
 * `absorb_document` tool, named only in `FEATURES.md` and `CHANGELOG.md` — product
 * prose, not agent instruction. `design-directions` was named only inside
 * `design-council` and `design-build`, the two skills it is supposed to run
 * *before*: you could learn it existed only by opening the thing it should have
 * preceded.
 *
 * The expectation is derived from the filesystem rather than written down, so a
 * new skill fails here on the day it lands rather than the day someone notices
 * nothing calls it. If a skill is not worth one line of routing, it is not worth
 * shipping.
 */

const SKILLS_DIR = join(process.cwd(), ".claude/skills");
const MIRROR_DIR = join(process.cwd(), ".agents/skills");
const AGENTS_MD = join(process.cwd(), "AGENTS.md");

function shippedSkills(): string[] {
  return readdirSync(SKILLS_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && existsSync(join(SKILLS_DIR, entry.name, "SKILL.md")))
    .map((entry) => entry.name)
    .sort();
}

const skills = shippedSkills();
const agentsMd = readFileSync(AGENTS_MD, "utf8");

describe("skill routing", () => {
  it("has skills to protect — an empty sweep would pass vacuously", () => {
    expect(skills.length).toBeGreaterThanOrEqual(10);
  });

  it("names every shipped skill in AGENTS.md, the one surface every agent reads", () => {
    const unrouted = skills.filter((name) => !new RegExp(`/${name}\\b`).test(agentsMd));
    expect(
      unrouted,
      `no agent can discover these skills:\n${unrouted.map((n) => `  /${n}`).join("\n")}`,
    ).toEqual([]);
  });

  it("ships the same skill set in both trees", () => {
    const mirrored = readdirSync(MIRROR_DIR, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && existsSync(join(MIRROR_DIR, entry.name, "SKILL.md")))
      .map((entry) => entry.name)
      .sort();
    expect(mirrored).toEqual(skills);
  });

  it("gives every skill a description, which is all an agent sees before opening it", () => {
    for (const name of skills) {
      const text = readFileSync(join(SKILLS_DIR, name, "SKILL.md"), "utf8");
      const frontmatter = text.split("---")[1] ?? "";
      const declared = /^name:\s*(.+)$/m.exec(frontmatter)?.[1]?.trim();
      const description = /^description:\s*(.+)$/m.exec(frontmatter)?.[1]?.trim();
      expect(declared, `${name}/SKILL.md has no name`).toBe(name);
      expect(description?.length ?? 0, `${name}/SKILL.md has no description`).toBeGreaterThan(40);
    }
  });
});
