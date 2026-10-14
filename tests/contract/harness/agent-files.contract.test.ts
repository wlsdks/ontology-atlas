import { describe, expect, it } from "vitest";
import { CASES } from "../../fixtures/agent-files-cases.mjs";
import { analyzeAgentFiles as analyzeWeb } from "@/entities/agent-files";
import { analyzeAgentFiles as analyzeCli } from "../../../cli/src/lib/agent-setup/agent-files.mjs";

/**
 * The scanner lives in `cli/src/lib/agent-setup/agent-files.mjs` and
 * `src/entities/agent-files/model/agent-files.ts`, which cannot share a module. Against the same
 * fixtures, expected, cli and web must agree structurally; message phrasing is free.
 */

type AnalyzeInput = Parameters<typeof analyzeWeb>[0];
type Analysis = ReturnType<typeof analyzeWeb>;

const IMPLEMENTATIONS = {
  "cli/src/lib/agent-setup/agent-files.mjs": analyzeCli as unknown as typeof analyzeWeb,
  "src/entities/agent-files/model/agent-files.ts": analyzeWeb,
};

/** Structural projection — message phrasing and byte counts stay unpinned
 * except through the record fields the fixtures name explicitly. */
function project(result: Analysis) {
  return {
    records: result.records.map((record) => ({
      path: record.path,
      ruleId: record.ruleId,
      kind: record.kind,
      tools: record.tools,
      drift: record.drift,
    })),
    checkStatuses: result.summary.checkStatuses,
    drift: result.drift.map((finding) => ({
      check: finding.check,
      code: finding.code,
      path: finding.path,
    })),
  };
}

describe("agent-files contract — CLI and web implementations agree", () => {
  for (const [implName, analyze] of Object.entries(IMPLEMENTATIONS)) {
    describe(implName, () => {
      for (const c of CASES) {
        it(c.name, () => {
          const result = analyze(c.input as AnalyzeInput);
          expect(project(result)).toEqual(c.expected);
          // summary bookkeeping must stay consistent with the findings
          expect(result.summary.driftCount).toBe(result.drift.length);
          expect(result.summary.files).toBe(result.records.length);
        });
      }
    });
  }

  it("both implementations agree byte-for-byte on the full result structure", () => {
    for (const c of CASES) {
      const cli = (analyzeCli as unknown as typeof analyzeWeb)(c.input as AnalyzeInput);
      const web = analyzeWeb(c.input as AnalyzeInput);
      expect(JSON.parse(JSON.stringify(cli))).toEqual(JSON.parse(JSON.stringify(web)));
    }
  });
});
