import { execFileSync } from "node:child_process";
import { FULL_LANE_COMMANDS } from "../../scripts/classify-change.mjs";
import { suggestFocusedChecks } from "../../scripts/lib/focused-check-suggestions.mjs";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * The contract that **a test suite nobody calls does not exist**.
 *
 * `pnpm test:run` is Vitest, and its include covers `app/**`, `src/**` and
 * `tests/contract/**`. A `node --test` suite is outside all three, so it runs
 * only where a workflow or a git hook names it. Define one and forget to name it
 * and it runs nowhere — passing forever, including while broken.
 *
 * `.github/workflows/checks.yml` records this failure twice in its own comments:
 * two suites broken on main with nobody knowing (2026-07-26), then `check:tokens`
 * and its unit test defined and never called (2026-08-05), under the line "a gate
 * that doesn't trigger is not a gate but a comment". On 2026-08-24 it had
 * happened a third time, and larger: nineteen of thirty-one `node --test` suites
 * were unreachable, `test:claude:hooks` among them — the only coverage the
 * publish guard, the Git guard, the generated-output guard, the commit-message
 * gate, the drift reporter and the secret-read guard have.
 *
 * Two comments were not enough, so this is a test. Reachable means named in a
 * workflow, named in a git hook, composed by another script that is itself
 * reachable, or selected for an actual source path by the impact planner.
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
    expect(workflows).toContain("node scripts/run-ci-lane.mjs --lane=gates");
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
