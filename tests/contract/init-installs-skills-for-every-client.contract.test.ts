import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = process.cwd();
const CLI_SOURCE = join(ROOT, "cli/src/index.mjs");
const TEMPLATE_SKILLS = join(ROOT, "cli/templates/vault/.claude/skills");

/**
 * **`agent-setup` advertises three clients, so `init` owes three clients.**
 *
 * Claude Code discovers skills from `.claude/skills/`. Codex and Cursor read
 * `.agents/skills/` and never look inside `.claude/` — this repository's own
 * visibility table says so. `init` installed only the Claude tree, so two of the
 * three clients the CLI names in its own help received the MCP server wired and
 * no procedure at all, while the vault README promised the skills appear "with
 * no extra setup".
 *
 * The install copies one template directory into both trees, so they cannot
 * diverge: there is no second committed copy to keep in sync, and no checker is
 * needed to prove they match. What this gate protects is that the copy still
 * reaches both destinations, because dropping one is silent — the client that
 * reads the missing tree simply finds nothing and says nothing.
 *
 * The client list is read from the CLI's own advertisement rather than restated
 * here, so retiring a client narrows the obligation instead of leaving a stale
 * assertion behind.
 */
describe("init installs skills for every client the CLI advertises", () => {
  const cli = readFileSync(CLI_SOURCE, "utf8");

  it("the template really ships skills for this gate to be about", () => {
    const skills = readdirSync(TEMPLATE_SKILLS, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name);
    expect(skills, "no skills ship, so this gate has no subject").toContain("atlas-grow");
  });

  it("still advertises the clients this obligation is owed to", () => {
    for (const client of ["Claude Code", "Cursor", "Codex"]) {
      expect(
        cli,
        `the CLI no longer advertises ${client}; recheck what init owes before narrowing this gate`,
      ).toContain(client);
    }
  });

  it("copies the skills into both agent trees", () => {
    // Written as path segments because the source joins them: join('.claude', 'skills').
    for (const [tree, client] of [
      [".claude", "Claude Code"],
      [".agents", "Codex and Cursor"],
    ]) {
      expect(
        cli,
        `init must install skills into ${tree}/skills — ${client} read only that tree and would get no procedure at all`,
      ).toMatch(new RegExp(`join\\(\\s*'\\${tree}'\\s*,\\s*'skills'\\s*\\)`));
    }
  });
});
