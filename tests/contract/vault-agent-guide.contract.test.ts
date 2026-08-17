import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import surface from "../../docs/.generated/mcp-surface.json";
import {
  VAULT_AGENT_GUIDE_PATH,
  VAULT_CLAUDE_BRIDGE_PATH,
  vaultAgentGuideForLocale,
  vaultClaudeBridgeForLocale,
} from "@/features/docs-vault-local/lib/ontology-starter";
import { analyzeAgentFiles } from "../../cli/src/lib/agent-files.mjs";

/**
 * 볼트에 두는 **에이전트 안내문** 계약.
 *
 * ## 왜 이 파일이 볼트에 생기나 (2026-08-17 실측)
 *
 * MCP 서버가 붙어 있어도 에이전트는 그걸 안 집었다. 설치된 앱에서 codex 에게
 * *"이 폴더에 있는 개념들의 slug 를 전부 알려줘"* 라고 물었더니:
 *
 * | | 무엇을 했나 | MCP 호출 |
 * |---|---|---|
 * | 안내문 없음 | 다섯 파일을 `sed` 로 읽고 `grep '^slug:'` 로 한 번 더 | **0회** |
 * | 안내문 있음 | *"list_concepts 를 먼저 호출하겠습니다"* → 바로 호출 | **1회** |
 *
 * ## 이 계약이 잠그는 두 가지
 *
 * **① CLI 와 앱이 같은 파일을 만든다.** 스타터 문서가 이미 같은 이유로 잠겨
 * 있다(`starter-templates.contract.test.ts`) — 두 경로로 만든 볼트가 다르면
 * 같은 제품을 두 갈래로 쓰는 사람이 서로 다른 안내를 읽는다.
 *
 * **② 안내문이 가리키는 도구가 실재한다.** 이게 이 파일의 진짜 일이다. 안내문은
 * 산문이라 아무도 안 고치는 사이 낡고, 낡은 안내는 없는 도구를 부르라고 시킨다 —
 * 바로 전날 「없는 설정 칸으로 사람을 보낸」 결함과 같은 갈래다. 그래서 문장을
 * 못박는 대신(`documentation.md` 금지) **관계**를 잰다: 백틱 안의 `snake_case`
 * 이름이 전부 등록된 MCP 도구인가. 판정의 출처는 생성물
 * `docs/.generated/mcp-surface.json` 이라 사람이 유지하지 않는다.
 */

const templatePath = (locale: "en" | "ko", relPath: string) =>
  join(process.cwd(), "cli", "templates", locale === "ko" ? "vault-ko" : "vault", relPath);

type SurfaceTool = { name: string; arguments?: string[] };
const surfaceTools = (surface as { mcp?: { tools?: SurfaceTool[] } }).mcp?.tools ?? [];

const registeredTools = new Set(surfaceTools.map((tool) => tool.name));
/**
 * 도구 이름 **과 그 인자 이름**. 안내문은 `patch_concept(expected_mtime)` 처럼
 * 인자도 이름으로 부르고, 그건 낡을 수 있는 이름이라 같이 잠근다. 둘 다 생성물
 * 에서 나오므로 사람이 유지할 목록은 없다.
 */
const knownNames = new Set([
  ...registeredTools,
  ...surfaceTools.flatMap((tool) => tool.arguments ?? []),
]);

/** 백틱 안의 `snake_case` 낱말 — 이 문서에서 도구 이름의 모양이다. */
const toolMentions = (markdown: string): string[] =>
  [...markdown.matchAll(/`([a-z][a-z0-9]*(?:_[a-z0-9]+)+)\b[^`]*`/gu)].map((m) => m[1]);

describe("볼트 에이전트 안내문", () => {
  it("등록된 MCP 도구 목록을 실제로 읽었다 — 아니면 아래가 전부 헛돈다", () => {
    expect(registeredTools.size).toBeGreaterThan(20);
    expect(registeredTools.has("list_concepts")).toBe(true);
  });

  for (const locale of ["en", "ko"] as const) {
    describe(`locale: ${locale}`, () => {
      const guide = vaultAgentGuideForLocale(locale);

      const bridge = vaultClaudeBridgeForLocale(locale);

      it("CLI 템플릿과 바이트 동일하다", () => {
        expect(guide.content).toBe(
          readFileSync(templatePath(locale, VAULT_AGENT_GUIDE_PATH), "utf8"),
        );
        expect(bridge.content).toBe(
          readFileSync(templatePath(locale, VAULT_CLAUDE_BRIDGE_PATH), "utf8"),
        );
      });

      /*
       * ⚠️ **안내문 하나로는 두 런타임 중 한쪽이 아무것도 못 받는다.** 이
       * 저장소 자신의 도구 표: `AGENTS.md` 를 Codex 는 직접 읽고, Claude Code 는
       * `CLAUDE.md` 의 `@AGENTS.md` 임포트를 거쳐 읽는다.
       *
       * 판정은 **제품 자신의 검사기**(`analyzeAgentFiles` 의
       * `claude-agents-bridge`)로 한다 — 여기서 규칙을 다시 구현하면 그 사본이
       * 언젠가 본체와 어긋나고, 이 저장소는 그 실패를 여러 번 겪었다.
       */
      it("Claude Code 로 가는 다리가 실제로 이어져 있다 — 제품 자신의 검사기로 판정", () => {
        const analysis = analyzeAgentFiles({
          files: [
            { path: VAULT_AGENT_GUIDE_PATH, content: guide.content },
            { path: VAULT_CLAUDE_BRIDGE_PATH, content: bridge.content },
          ],
        });
        expect(analysis.checks.claudeAgentsBridge.status).toBe("ok");
        expect(analysis.drift).toEqual([]);
      });

      it("다리만 있고 안내문이 없으면 그 검사가 빨개진다 — 헛돌지 않는다", () => {
        const analysis = analyzeAgentFiles({
          files: [{ path: VAULT_CLAUDE_BRIDGE_PATH, content: bridge.content }],
        });
        expect(analysis.checks.claudeAgentsBridge.status).toBe("drift");
      });

      it("도구를 실제로 추천한다 — 안 하면 이 안내문은 있으나 마나다", () => {
        // 실측에서 행동을 바꾼 것은 「먼저 이걸 부르라」는 표였다.
        expect(toolMentions(guide.content).length).toBeGreaterThanOrEqual(6);
      });

      it("추천한 도구가 전부 실재한다", () => {
        const missing = [...new Set(toolMentions(guide.content))].filter(
          (name) => !knownNames.has(name),
        );
        expect(missing, "안내문이 없는 도구를 부르라고 한다").toEqual([]);
      });

      it("서버 이름을 대 준다 — 이름을 모르면 못 부른다", () => {
        // 실측: 이름을 대 주기 전에는 에이전트가 도구 목록에서 우리를 못 찾았다.
        expect(guide.content).toContain("ontology-atlas");
      });

      it("직접 읽지 말라고 말한다 — 그게 종전의 기본 행동이었다", () => {
        expect(guide.content).toContain("grep");
        expect(guide.content).toContain("sed");
      });
    });
  }

  it("두 언어가 같은 도구를 추천한다 — 한쪽만 고치면 다른 쪽이 낡는다", () => {
    const named = (locale: "en" | "ko") =>
      [...new Set(toolMentions(vaultAgentGuideForLocale(locale).content))].sort();
    expect(named("ko")).toEqual(named("en"));
  });

  it("모르는 로케일은 영어로 떨어진다 — 스타터와 같은 규율", () => {
    expect(vaultAgentGuideForLocale("fr")).toEqual(vaultAgentGuideForLocale("en"));
  });
});
