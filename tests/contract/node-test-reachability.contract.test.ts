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
 * reachable, or listed below with a reason. The list is exclusions, not
 * forbidden words: each entry names one script and why running it in CI is a
 * scheduling decision rather than a wiring fix.
 */

const ROOT = process.cwd();
const scripts = (JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8")) as {
  scripts: Record<string, string>;
}).scripts;

const DELIBERATELY_UNWIRED: Record<string, string> = {
  "integration:mcp":
    "measured past two minutes against a live MCP server. Promoting it is a "
    + "scheduling decision about CI wall-clock, not a wiring oversight.",
  "integration:cli":
    "measured 94 seconds. CI runs a filtered subset of the same file through "
    + "`integration:cli:setup` (--test-name-pattern \"^(init|agent-setup)\"), so the "
    + "harness is covered and the tail is a scheduling decision. Widening the "
    + "pattern is the cheaper move if more coverage is wanted.",
};

function readAll(dir: string): string {
  return readdirSync(join(ROOT, dir), { withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => readFileSync(join(ROOT, dir, entry.name), "utf8"))
    .join("\n");
}

const workflows = readAll(".github/workflows");
const gitHooks = readAll(".githooks");
const callers = `${workflows}\n${gitHooks}`;

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
    expect(nodeTestScripts.length).toBeGreaterThanOrEqual(20);
  });

  it("runs every node:test suite somewhere, or says why it does not", () => {
    const orphans = nodeTestScripts.filter(
      (script) => !reachable(script) && !(script in DELIBERATELY_UNWIRED),
    );
    expect(
      orphans,
      "Vitest cannot see these and no workflow or git hook names them, so they run "
        + `nowhere and pass forever:\n${orphans.map((s) => `  pnpm ${s}`).join("\n")}\n`
        + "Name them in .github/workflows/checks.yml, or add them to "
        + "DELIBERATELY_UNWIRED in this file with the reason.",
    ).toEqual([]);
  });

  it("keeps the exclusion list honest — an entry that became reachable is stale", () => {
    const stale = Object.keys(DELIBERATELY_UNWIRED).filter((script) => reachable(script));
    expect(
      stale,
      `these are excluded but already run somewhere:\n${stale.join("\n")}`,
    ).toEqual([]);
  });

  it("excludes only scripts that exist", () => {
    const missing = Object.keys(DELIBERATELY_UNWIRED).filter((script) => !(script in scripts));
    expect(missing, `excluded scripts that no longer exist:\n${missing.join("\n")}`).toEqual([]);
  });
});
