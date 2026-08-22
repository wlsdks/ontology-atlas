// Blocks 2-way drift in the activity log parser: the mcp reader (file-based, shared
// with the CLI's --log) and the web parser (shared/lib) must reconstruct the same
// entries from the same set of lines.
import { describe, expect, it } from "vitest";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  readActivityEntries,
  ACTIVITY_LOG_RELATIVE_PATH,
} from "../../mcp/src/activity-log.mjs";
import { parseAgentActivityLog } from "@/shared/lib/agent-activity-log";

const LINES = [
  '{"v":1,"at":"2026-07-21T10:00:00.000Z","tool":"add_relation","target":"a","summary":"a --depends_on--> b","agent":"claude-code","why":"근거"}',
  "broken-line-not-json",
  '{"v":2,"at":"2026-07-21T10:01:00.000Z","tool":"future","target":"x","summary":"미래 스키마"}',
  '{"v":1,"at":"2026-07-21T10:02:00.000Z","tool":"patch_concept","target":"c","summary":"patch c","agent":null,"why":null}',
];

describe("agent-activity-log 파서 계약 (mcp ↔ web)", () => {
  it("같은 줄 집합 → 같은 항목 (깨진 줄·미래 v 건너뛰기 포함)", () => {
    const raw = `${LINES.join("\n")}\n`;

    const webEntries = parseAgentActivityLog(raw);

    const root = mkdtempSync(join(tmpdir(), "actlog-contract-"));
    try {
      mkdirSync(join(root, ".ontology-atlas"), { recursive: true });
      writeFileSync(join(root, ACTIVITY_LOG_RELATIVE_PATH), raw, "utf-8");
      const mcpEntries = readActivityEntries(root, { limit: 100 });

      expect(webEntries.map((e) => e.summary)).toEqual(mcpEntries.map((e: { summary: string }) => e.summary));
      expect(webEntries).toHaveLength(2);
      expect(webEntries[0]).toMatchObject({ agent: "claude-code", why: "근거" });
      expect(webEntries[1]).toMatchObject({ agent: null, why: null });
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
