import { execFileSync } from "node:child_process";
import { FULL_LANE_COMMANDS } from "../../../scripts/ci/classify-change.mjs";
import { suggestFocusedChecks } from "../../../scripts/lib/ci/focused-check-suggestions.mjs";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * A `node --test` suite is outside the Vitest include, so it runs only where a workflow or git hook
 * names it. Reachable: named in a workflow or hook, a reachable script, or the impact planner.
 */

const ROOT = process.cwd();
const scripts = (JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8")) as {
  scripts: Record<string, string>;
}).scripts;


function readAll(dir: string): string {
  return readdirSync(join(ROOT, dir), { withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => readFileSync(join(ROOT, dir, entry.name), "utf8"))
    .join("\n");
}

const workflows = readAll(".github/workflows");
const gitHooks = readAll(".githooks");
const ciCommands = Object.values(FULL_LANE_COMMANDS).flat().join("\n");
const subjectPaths = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z'], { encoding: 'utf8' }).split('\0').filter(Boolean);
// The same authority feeds affected CI. Count its actual commands, not mentions in comments.
const focusedCallers = suggestFocusedChecks(subjectPaths).commands.map((row: { command: string }) => row.command).join('\n');
const callers = `${workflows}\n${gitHooks}\n${ciCommands}\n${focusedCallers}`;

const nodeTestScripts = Object.entries(scripts)
  .filter(([, command]) => command.includes("node --test"))
  .map(([name]) => name)
  .sort();

function namedDirectly(script: string): boolean {
  return new RegExp(`\\bpnpm ${script.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![\\w:-])`).test(
    callers,
  );
}

function reachable(script: string, seen = new Set<string>()): boolean {
  if (seen.has(script)) return false;
  seen.add(script);
  if (namedDirectly(script)) return true;
  return Object.entries(scripts).some(
    ([name, command]) =>
      name !== script
      && new RegExp(`\\bpnpm ${script.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![\\w:-])`).test(
        command,
      )
      && reachable(name, seen),
  );
}

describe("node:test reachability", () => {
  it("has suites to protect — an empty sweep would pass vacuously", () => {
    expect(nodeTestScripts.length).toBeGreaterThan(0);
    expect(subjectPaths.length).toBeGreaterThan(0);
  });

  it("the workflow actually invokes the registry counted as a caller", () => {
    expect(workflows).toContain("node scripts/ci/run-ci-lane.mjs --lane=gates");
  });

  it("runs every node:test suite somewhere, through the full or affected plan", () => {
    const orphans = nodeTestScripts.filter(
      (script) => !reachable(script),
    );
    expect(
      orphans,
      "Vitest cannot see these and no workflow or git hook names them, so they run "
        + `nowhere and pass forever:\n${orphans.map((s) => `  pnpm ${s}`).join("\n")}\n`
        + "Wire the suite through a workflow, reachable script, or affected-check rule.",
    ).toEqual([]);
  });

});
