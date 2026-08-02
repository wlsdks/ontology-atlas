import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  buildAgentAnalyzePrompt,
  buildAgentSetupPrompt,
} from "@/shared/config/agent-prompts";

/**
 * **붙여넣는 순간 실패하는 지시문은 도움이 아니라 함정이다.**
 *
 * 이 프롬프트들은 사용자가 그대로 복사해 자기 에이전트에 넣는 문자열이다.
 * 거기 적힌 도구 이름이 하나라도 실재하지 않으면 에이전트는 그 줄에서 멈추고,
 * 사용자는 우리가 준 문장을 의심하지 못한 채 자기 설정을 뒤진다.
 *
 * 그래서 이름을 **MCP 서버의 실제 도구 목록과 대조**한다 — 우리가 손으로 적은
 * 두 번째 목록이 아니라 서버 소스 자체가 진실원이다(복제하면 그 순간부터
 * 드리프트가 시작된다).
 *
 * 못 쓰는 것 둘도 함께 막는다: 우리 저장소에만 있는 스킬(`/ontology-*`)과
 * 레지스트리에 없는 `npx ontology-atlas`. 둘 다 사용자 환경에서는 404 다.
 */
const MCP_INDEX = join(process.cwd(), "mcp", "src", "index.js");

function registeredToolNames(): Set<string> {
  const source = readFileSync(MCP_INDEX, "utf8");
  const names = new Set<string>();
  for (const match of source.matchAll(/name:\s*["']([a-z][a-z0-9_]*)["']/g)) {
    names.add(match[1]);
  }
  return names;
}

/**
 * 프롬프트 안의 `snake_case` 토큰 중 **도구 이름인 것**만 고른다.
 *
 * 같은 문법을 쓰지만 도구가 아닌 어휘가 둘 있다 — vault 스키마의 **관계 타입**
 * (`depends_on` 등)과 에이전트 **설정 파일 이름**(`mcp_config.json`). 둘은 MCP
 * 도구 목록에 없는 게 정상이므로, 도구로 세면 이 게이트가 매번 거짓으로
 * 붉어지고 그러면 아무도 안 본다.
 */
const NOT_TOOLS = new Set([
  // vault 관계 타입 — `mcp/src/schema.mjs` 의 어휘다.
  "depends_on",
  "is_a",
  "relates_to",
  // 에이전트 설정 파일 이름.
  "mcp_config",
]);

function citedToolNames(prompt: string): string[] {
  const cited = new Set<string>();
  for (const match of prompt.matchAll(/\b([a-z][a-z0-9]*(?:_[a-z0-9]+)+)\b/g)) {
    if (!NOT_TOOLS.has(match[1])) cited.add(match[1]);
  }
  return [...cited];
}

describe("복사 지시문 — 실재하는 것만 부른다", () => {
  const registered = registeredToolNames();

  it("탐지기가 빈 집합 위에서 돌지 않는다 — MCP 도구 목록이 실제로 읽힌다", () => {
    expect(registered.size).toBeGreaterThan(20);
    expect(registered.has("connection_info")).toBe(true);
  });

  for (const [label, prompt] of [
    ["analyze", buildAgentAnalyzePrompt({ vaultPath: "/tmp/vault" })],
    ["setup", buildAgentSetupPrompt({ vaultPath: "/tmp/vault" })],
  ] as const) {
    it(`${label} 프롬프트가 부르는 도구는 전부 MCP 에 등록돼 있다`, () => {
      const unknown = citedToolNames(prompt).filter((n) => !registered.has(n));
      expect(unknown).toEqual([]);
    });

    it(`${label} 프롬프트는 사용자 환경에 없는 경로를 안 부른다`, () => {
      expect(prompt).not.toContain("npx ontology-atlas");
      expect(prompt).not.toMatch(/\/ontology-(bootstrap|sync|extract)/);
    });

    it(`${label} 프롬프트는 볼트 경로를 문장 안에 싣는다`, () => {
      // 경로가 빠지면 에이전트는 어느 폴더 이야기인지 모른다 — `.` 하드코딩
      // 사고가 정확히 그 형태였다.
      expect(prompt).toContain("/tmp/vault");
    });
  }

  it("analyze 프롬프트는 **승인 전 쓰기 금지**를 명시한다", () => {
    /*
     * 같은 부류의 설치 프롬프트는 대개 자율 실행으로 끝난다. 이 한 문단이
     * 「사람이 의미의 심판」이라는 계약을 지시문 안에 적는 자리이고, 지우면
     * 우리 프롬프트는 남의 것의 번역이 된다.
     */
    const prompt = buildAgentAnalyzePrompt({ vaultPath: "/tmp/vault" });
    expect(prompt).toMatch(/do not call add_concept/i);
    expect(prompt).toMatch(/approved/i);
  });

  it("경로를 모르면 그 사실을 문장으로 말한다 — 빈 자리를 남기지 않는다", () => {
    const prompt = buildAgentAnalyzePrompt({ vaultPath: null });
    expect(prompt).toContain("the folder you are opened in");
  });
});
