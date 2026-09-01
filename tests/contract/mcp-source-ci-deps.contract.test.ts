import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { buildImpactPlan, FULL_LANE_COMMANDS } from "../../scripts/classify-change.mjs";

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

  it("every active lane installs MCP dependencies before its executor", () => {
    const workflow = read(".github/workflows/checks.yml");
    const lanes = ["gates", "unit", "mcp"];
    expect(lanes.length, "the lane inventory is empty").toBeGreaterThan(2);
    for (const lane of lanes) {
      const job = jobBlock(workflow, lane);
      const installAt = job.indexOf("pnpm --dir mcp install --frozen-lockfile");
      const runAt = job.indexOf(`node scripts/run-ci-lane.mjs --lane=${lane}`);
      expect(installAt, `${lane} lost its conditional MCP install`).toBeGreaterThan(-1);
      expect(runAt, `${lane} lost its executor`).toBeGreaterThan(installAt);
    }
    expect(jobBlock(workflow, "unit")).toContain("NEED_MCP:");
  });

  it("installs the MCP lockfile before the full Unit + Contract suite", () => {
    const unit = jobBlock(read(".github/workflows/checks.yml"), "unit");
    const installAt = unit.indexOf("pnpm --dir mcp install --frozen-lockfile");
    const testAt = unit.indexOf("node scripts/run-ci-lane.mjs --lane=unit");
    const contractPlan = buildImpactPlan({
      files: ["src/widgets/docs-vault/ui/DocsVaultEditor.tsx"],
    });

    expect(installAt, "Unit job cannot import @modelcontextprotocol/sdk from mcp/src/index.js").toBeGreaterThan(-1);
    expect(FULL_LANE_COMMANDS.unit).toContain("pnpm test:run");
    expect(contractPlan.lanes.unit.contract).toBe("full");
    expect(contractPlan.lanes.unit.needsMcp).toBe(true);
    expect(testAt, "Unit job no longer invokes the planned suite").toBeGreaterThan(-1);
    expect(installAt, "MCP dependencies must exist before contract tests spawn the server").toBeLessThan(testAt);
  });
});
