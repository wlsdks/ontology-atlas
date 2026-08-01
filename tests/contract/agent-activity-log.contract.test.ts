// B3 — 활동 로그 파서 2-way drift 차단: mcp 리더(파일 기반, CLI --log 공용)
// 와 웹 파서(shared/lib)가 같은 줄 집합에서 같은 항목을 복원해야 한다.
import { describe, expect, it } from "vitest";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  readActivityEntries,
  buildActivityEntry,
  ACTIVITY_LOG_RELATIVE_PATH,
} from "../../mcp/src/activity-log.mjs";
import {
  AGENT_WRITING_WINDOW_MS,
  deriveAgentWritingActivity,
  parseAgentActivityLog,
} from "@/shared/lib/agent-activity-log";

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

// 「지금 쓰는 중」은 서버가 선언하지 않는다 — 서버는 쓰기 사실만 append 하고
// 화면이 그 로그에서 파생한다. 그래서 파생이 **서버가 실제로 만드는 줄**을
// 먹는지가 계약이다 (테스트가 손으로 지어낸 줄만 먹으면 drift 를 못 잡는다).
describe("활동 로그 → 「쓰는 중」 파생 계약 (mcp 가 쓴 줄 그대로)", () => {
  const now = Date.parse("2026-08-01T12:00:00.000Z");

  // `buildActivityEntry` 의 `at` 은 JS 기본값(null)에서 타입이 추론돼 문자열을
  // 직접 못 받는다. 줄 모양은 서버 빌더가 만들게 두고 시각만 덮어쓴다
  // (빌더가 `at ?? now` 로 하는 것과 같은 자리).
  function serverLine(input: { tool: string; target: string; summary: string }, at: number) {
    return { ...buildActivityEntry(input), at: new Date(at).toISOString() };
  }

  function writeLines(root: string, entries: unknown[]): string {
    mkdirSync(join(root, ".ontology-atlas"), { recursive: true });
    const raw = `${entries.map((entry) => JSON.stringify(entry)).join("\n")}\n`;
    writeFileSync(join(root, ACTIVITY_LOG_RELATIVE_PATH), raw, "utf-8");
    return raw;
  }

  it("서버가 방금 append 한 줄이 곧바로 「쓰는 중 + 어디」가 된다", () => {
    const root = mkdtempSync(join(tmpdir(), "actlog-writing-"));
    try {
      const raw = writeLines(root, [
        serverLine(
          { tool: "add_relation", target: "storage", summary: "storage --depends_on--> vault" },
          now - 5_000,
        ),
      ]);

      const derived = deriveAgentWritingActivity(parseAgentActivityLog(raw), now);
      expect(derived).toEqual({
        writing: true,
        lastAt: now - 5_000,
        lastTarget: "storage",
        lastTool: "add_relation",
      });
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("창을 벗어난 마지막 쓰기는 「쓰는 중」이 아니지만 언제·어디였는지는 남는다", () => {
    const root = mkdtempSync(join(tmpdir(), "actlog-writing-idle-"));
    try {
      const lastAt = now - AGENT_WRITING_WINDOW_MS - 1_000;
      const raw = writeLines(root, [
        serverLine({ tool: "patch_concept", target: "storage", summary: "patch_concept storage" }, lastAt),
      ]);

      const derived = deriveAgentWritingActivity(parseAgentActivityLog(raw), now);
      expect(derived).toMatchObject({ writing: false, lastAt, lastTarget: "storage" });
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("서버가 슬러그 대신 쓰는 대상(`(batch)`)은 슬러그로 넘기지 않는다", () => {
    const root = mkdtempSync(join(tmpdir(), "actlog-writing-batch-"));
    try {
      const raw = writeLines(root, [
        serverLine({ tool: "add_concepts", target: "(batch)", summary: "add_concepts 12행 성공" }, now - 1_000),
      ]);

      const derived = deriveAgentWritingActivity(parseAgentActivityLog(raw), now);
      expect(derived).toMatchObject({ writing: true, lastTool: "add_concepts", lastTarget: null });
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
