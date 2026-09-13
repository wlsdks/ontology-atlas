import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

// Each harness owns discovery and metadata. Root routing remains a portable
// fallback; Codex also discovers .agents/skills directly. Content, inventory,
// and client-specific extensions do not need a counterpart in the other tree.
const CLAUDE_SKILLS_DIR = join(process.cwd(), ".claude/skills");
const CODEX_SKILLS_DIR = join(process.cwd(), ".agents/skills");
const AGENTS_MD = join(process.cwd(), "AGENTS.md");

const agentsMd = readFileSync(AGENTS_MD, "utf8");

describe("skill routing", () => {
  // Each harness owns its inventory. Shared frontmatter remains portable, but
  // discovery and metadata are checked independently instead of copying prose.
  const AGENT_SKILLS_SPEC_FIELDS = new Set([
    "name",
    "description",
    "license",
    "compatibility",
    "metadata",
    "allowed-tools",
  ]);

  it("keeps Codex skill frontmatter inside its supported standard", () => {
    for (const dir of [CODEX_SKILLS_DIR]) {
      for (const name of readdirSync(dir).filter((name) => existsSync(join(dir, name, "SKILL.md")))) {
        const text = readFileSync(join(dir, name, "SKILL.md"), "utf8");
        const frontmatter = text.split("---")[1] ?? "";
        const keys = [...frontmatter.matchAll(/^([A-Za-z][A-Za-z0-9_-]*):/gm)].map((m) => m[1]);
        expect(keys.length, `${name}/SKILL.md has no frontmatter keys`).toBeGreaterThan(0);
        const extensions = keys.filter((key) => !AGENT_SKILLS_SPEC_FIELDS.has(key));
        expect(
          extensions,
          `${name}/SKILL.md uses ${extensions.join(", ")}, which the Agent Skills standard `
            + "does not define. Where "
            + "the standard is enforced an unknown key fails the whole file.",
        ).toEqual([]);
      }
    }
  });

  for (const dir of [CLAUDE_SKILLS_DIR, CODEX_SKILLS_DIR]) {
    const names = readdirSync(dir).filter((name) => existsSync(join(dir, name, "SKILL.md")));
    it(`keeps ${dir} independently discoverable`, () => {
      expect(names.length).toBeGreaterThan(0);
      for (const name of names) {
        const text = readFileSync(join(dir, name, "SKILL.md"), "utf8");
        const frontmatter = text.split("---")[1] ?? "";
        expect(/^name:\s*(.+)$/m.exec(frontmatter)?.[1]?.trim(), name).toBe(name);
        expect(/^description:\s*(.+)$/m.exec(frontmatter)?.[1]?.trim(), name).toBeTruthy();
        expect(agentsMd, `${dir}/${name} is unreachable`).toMatch(new RegExp(`/${name}\\b`));
      }
    });
  }
});
