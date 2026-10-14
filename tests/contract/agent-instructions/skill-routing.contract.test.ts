import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

// Name and description identity per skill belong to `pnpm agents:check`
// (.agents/check-instructions.mjs). What stays here is the one fact that check
// does not read: Codex enforces the Agent Skills frontmatter standard, and an
// unknown key there fails the whole SKILL.md.
const CODEX_SKILLS_DIR = join(process.cwd(), ".agents/skills");

describe("skill routing", () => {
  const AGENT_SKILLS_SPEC_FIELDS = new Set([
    "name",
    "description",
    "license",
    "compatibility",
    "metadata",
    "allowed-tools",
  ]);

  it("keeps Codex skill frontmatter inside its supported standard", () => {
    const names = readdirSync(CODEX_SKILLS_DIR).filter((name) => existsSync(join(CODEX_SKILLS_DIR, name, "SKILL.md")));
    expect(names.length, "no Codex skills found; this check would pass vacuously").toBeGreaterThan(0);
    for (const name of names) {
      const text = readFileSync(join(CODEX_SKILLS_DIR, name, "SKILL.md"), "utf8");
      const frontmatter = text.split("---")[1] ?? "";
      const keys = [...frontmatter.matchAll(/^([A-Za-z][A-Za-z0-9_-]*):/gm)].map((m) => m[1]);
      expect(keys.length, `${name}/SKILL.md has no frontmatter keys`).toBeGreaterThan(0);
      const extensions = keys.filter((key) => !AGENT_SKILLS_SPEC_FIELDS.has(key));
      expect(
        extensions,
        `${name}/SKILL.md uses ${extensions.join(", ")}, which the Agent Skills standard `
          + "does not define. Where the standard is enforced an unknown key fails the whole file.",
      ).toEqual([]);
    }
  });
});
