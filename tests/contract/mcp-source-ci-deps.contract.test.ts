import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = process.cwd();
const read = (relativePath: string) => readFileSync(join(ROOT, relativePath), "utf8");

function jobBlock(source: string, jobName: string): string {
  const startMatch = new RegExp(`^  ${jobName}:\\s*$`, "m").exec(source);
  if (!startMatch) throw new Error(`workflow job not found: ${jobName}`);
  const start = startMatch.index;
  const rest = source.slice(start + startMatch[0].length);
  const next = /^  [A-Za-z0-9_-]+:\s*$/m.exec(rest);
  return source.slice(start, next ? start + startMatch[0].length + next.index : source.length);
}

describe("Unit CI can launch the source MCP used by contract tests", () => {
  it("the contract suite really contains source MCP launch probes", () => {
    const probes = [
      read("tests/contract/mcp-vault-safety.contract.test.ts"),
      read("tests/contract/starter-templates.contract.test.ts"),
      read("tests/contract/vault-agent-guide.contract.test.ts"),
    ].filter((source) => source.includes("mcp/src/index.js") || source.includes("cli\", \"src\", \"index.mjs"));

    expect(probes.length, "MCP dependency gate is idling without a source-server consumer").toBeGreaterThan(2);
  });

  /**
   * **An install that is skipped makes the next step lie about why it failed.**
   *
   * A step with no `if:` inherits `success()`, so the first red step in a job skips
   * it. Steps marked `if: always()` keep running regardless. Put those two next to
   * each other and a single real failure, say `Vault path drift`, silently skips the
   * MCP install and then nineteen always-run suites all die on
   * `ERR_MODULE_NOT_FOUND`. The log shows a wall of "dependencies missing" and the
   * one failure worth reading scrolls off the top.
   *
   * So the rule is not "always install". It is that an install must run under at
   * least the conditions of the step that needs it. A third install site is
   * deliberately left bare: nothing after it runs on `always()`, so an ordinary
   * short circuit there is correct and honest.
   */
  it("an install whose dependent step runs on always() runs on always() too", () => {
    const workflow = read(".github/workflows/checks.yml");
    const steps = workflow.split(/\n(?=      - name: )/).slice(1);

    const installIndexes = steps
      .map((step, index) => (step.includes("pnpm --dir mcp install --frozen-lockfile") ? index : -1))
      .filter((index) => index >= 0);

    expect(installIndexes.length, "the MCP install steps this gate protects are gone").toBeGreaterThan(1);

    for (const index of installIndexes) {
      const next = steps[index + 1] ?? "";
      if (!/\n\s+if: always\(\)/.test(next)) continue;

      const stepName = /- name: (.+)/.exec(steps[index])?.[1] ?? "?";
      const nextName = /- name: (.+)/.exec(next)?.[1] ?? "?";
      expect(
        /\n\s+if: always\(\)/.test(steps[index]),
        `"${stepName}" is skipped when an earlier step fails, but "${nextName}" runs on always() and needs it. That combination reports a missing module instead of the real failure.`,
      ).toBe(true);
    }
  });

  it("installs the MCP lockfile before the full Unit + Contract suite", () => {
    const unit = jobBlock(read(".github/workflows/checks.yml"), "unit");
    const installAt = unit.indexOf("pnpm --dir mcp install --frozen-lockfile");
    const testAt = unit.indexOf("run: pnpm test:run");

    expect(installAt, "Unit job cannot import @modelcontextprotocol/sdk from mcp/src/index.js").toBeGreaterThan(-1);
    expect(testAt, "Unit job no longer runs the full suite this gate protects").toBeGreaterThan(-1);
    expect(installAt, "MCP dependencies must exist before contract tests spawn the server").toBeLessThan(testAt);
  });
});
