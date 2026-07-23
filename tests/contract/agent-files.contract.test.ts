import { describe, expect, it } from "vitest";
import { CASES } from "../fixtures/agent-files-cases.mjs";
import { analyzeAgentFiles as analyzeWeb } from "@/views/docs-vault/lib/agent-files";
import { analyzeAgentFiles as analyzeCli } from "../../cli/src/lib/agent-files.mjs";

/**
 * Agent-files detection contract — the read-only agent-file scanner lives in
 * 2 places that cannot share a physical module:
 *   - cli/src/lib/agent-files.mjs (별도 npm 패키지 — `ontology-atlas
 *     agent-files`, full-fs scanner: dot-dirs 포함 4종 drift 체크 전부)
 *   - src/views/docs-vault/lib/agent-files.ts (웹 문서함 — FSA 스캐너,
 *     dot-dir 불가시 → unverifiable 옵션으로 정직 강등)
 *
 * 같은 fixture 매트릭스(tests/fixtures/agent-files-cases.mjs)에 대해 두 구현
 * + fixture 의 expected 판정이 모두 일치해야 한다 (사실상 3-way: expected ×
 * cli × web). 메시지 phrasing 은 자유, 구조적 계약(records / check status /
 * drift check·code·path)은 strict — R11 contract 패턴.
 */

type AnalyzeInput = Parameters<typeof analyzeWeb>[0];
type Analysis = ReturnType<typeof analyzeWeb>;

const IMPLEMENTATIONS = {
  "cli/src/lib/agent-files.mjs": analyzeCli as unknown as typeof analyzeWeb,
  "src/views/docs-vault/lib/agent-files.ts": analyzeWeb,
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
