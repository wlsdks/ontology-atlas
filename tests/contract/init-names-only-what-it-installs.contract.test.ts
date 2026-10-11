import { globSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = process.cwd();
const read = (relativePath: string) => readFileSync(join(ROOT, relativePath), "utf8");

/** Every file whose text reaches a user of the installed CLI: printing sources and the README. */
const CLI_SURFACE = [
  ...globSync("cli/src/**/*.mjs", { cwd: ROOT }).filter((path) => !path.endsWith(".test.mjs")),
  "cli/README.md",
];

/** Tokens shaped like a skill name that are not skills: flags, values, modules, screens. */
const NOT_SKILLS = new Set(["ontology-focus", "ontology-map", "ontology-compiler", "ontology-editing"]);

/** Comments are for contributors, who have this repository's own skills. */
const withoutComments = (text: string) =>
  text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`])\/\/[^\n]*/g, "$1");
const TEMPLATE_SKILLS = "cli/templates/vault/.claude/skills";

/**
 * A setup command may only name things the person now has. The gate reads the shipped template
 * rather than a hard-coded list, so the allowed skill names follow what `init` installs.
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
    expect(CLI_SURFACE.length, "no CLI sources found, so this gate has no subject").toBeGreaterThan(10);
    for (const path of CLI_SURFACE) {
      const text = path.endsWith(".md") ? read(path) : withoutComments(read(path));
      // Every `/name` or bare `name` that looks like one of this project's skills.
      const named = new Set(
        [...text.matchAll(/(?<!-)\b(?:\/)?((?:atlas|ontology)-[a-z-]+)\b/g)]
          .map((match) => match[1])
          // Not skills. `ontology-atlas` and anything built on it is the command,
          // package, MCP server, or config key; `atlas-web` is the architecture
          // profile. Skills are the `atlas-*` set plus the `/ontology-<verb>` ones.
          .filter((name) => !name.startsWith("ontology-atlas") && name !== "atlas-web" && !NOT_SKILLS.has(name)),
      );

      for (const name of named) {
        expect(
          installedSkills,
          `${path} names "${name}" to a user whose init installed only [${installedSkills.join(", ")}]. Name an installed skill, or install this one.`,
        ).toContain(name);
      }
    }
  });
});
