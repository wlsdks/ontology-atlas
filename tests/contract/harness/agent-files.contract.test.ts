import { describe, expect, it } from "vitest";
import { CASES } from "../../fixtures/agent-files-cases.mjs";
import { analyzeAgentFiles as analyzeWeb } from "@/entities/agent-files";

/**
 * The classifier in `src/entities/agent-files/model/agent-files.ts` serves the Harness tab and
 * `pnpm agents:check`. Against the fixtures it must give the expected structure; message phrasing is free.
 */

type AnalyzeInput = Parameters<typeof analyzeWeb>[0];
type Analysis = ReturnType<typeof analyzeWeb>;

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

describe("agent-files contract", () => {
  for (const c of CASES) {
    it(c.name, () => {
      const result = analyzeWeb(c.input as AnalyzeInput);
      expect(project(result)).toEqual(c.expected);
      // summary bookkeeping must stay consistent with the findings
      expect(result.summary.driftCount).toBe(result.drift.length);
      expect(result.summary.files).toBe(result.records.length);
    });
  }
});
