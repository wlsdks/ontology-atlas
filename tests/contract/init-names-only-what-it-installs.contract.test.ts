import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = process.cwd();
const read = (relativePath: string) => readFileSync(join(ROOT, relativePath), "utf8");

const CLI_SOURCE = "cli/src/index.mjs";
const TEMPLATE_SKILLS = "cli/templates/vault/.claude/skills";
const TEMPLATE_README = "cli/templates/vault/README.md";

/**
 * **A setup command may only name things the person now has.**
 *
 * `init` used to finish by telling every new user to "use a connected agent's
 * `ontology-bootstrap` flow", in two separate output paths. That skill lives only
 * in this repository and `init` has never installed it; `agent-prompts.ts` says so
 * in its own header. So the last thing the product said to a stranger was an
 * instruction they could not follow, and the funnel's second step was a dead end
 * for every installed copy.
 *
 * This is the same defect class as a walkthrough finding already fixed once: a
 * surface naming a destination that is not there. It is cheap to reintroduce,
 * because the repository's own agents really do have that skill, so the sentence
 * reads as true to whoever writes it here.
 *
 * The gate reads the shipped template rather than a hard-coded list, so adding a
 * skill to `init` widens what the output may name, and removing one narrows it.
 */
describe("init describes only what it installed", () => {
  const installedSkills = readdirSync(join(ROOT, TEMPLATE_SKILLS), { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name);

  it("the template really ships skills for this gate to be about", () => {
    expect(installedSkills.length, "no skills ship, so this gate has no subject").toBeGreaterThan(0);
    expect(installedSkills).toContain("atlas-grow");
  });

  it("the CLI never sends a new user to a skill init does not install", () => {
    const cli = read(CLI_SOURCE);
    // Every `/name` or bare `name` that looks like one of this project's skills.
    const named = new Set(
      [...cli.matchAll(/\b(?:\/)?((?:atlas|ontology)-[a-z-]+)\b/g)]
        .map((match) => match[1])
        // Not skills. `ontology-atlas` and anything built on it is the command,
        // package, MCP server, or config key; `atlas-web` is the architecture
        // profile. Skills are the `atlas-*` set plus the `/ontology-<verb>` ones.
        .filter((name) => !name.startsWith("ontology-atlas") && name !== "atlas-web"),
    );

    for (const name of named) {
      expect(
        installedSkills,
        `cli/src/index.mjs names "${name}" to a user whose init installed only [${installedSkills.join(", ")}]. Name an installed skill, or install this one.`,
      ).toContain(name);
    }
  });

  it("the vault README never names a retired surface", () => {
    const readme = read(TEMPLATE_README);
    // This file lands *inside* the vault beside AGENTS.md, so an agent reads it
    // too and will repeat whatever it says back to the person.
    expect(
      readme,
      "`Studio` is a legacy redirect, not a surface a new user can open",
    ).not.toMatch(/\bStudio\b/);
  });
});
