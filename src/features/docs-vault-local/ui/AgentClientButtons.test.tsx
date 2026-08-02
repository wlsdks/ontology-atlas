// 도구 버튼 렌더 순서 계약 — 「하나의 목록, 두 진실」 재발 차단.
//
// 2026-07-30 실측: 이 컴포넌트는 도구 버튼을 JSX 로 Claude Code → Cursor →
// Antigravity → Codex 순서로 하드코딩했고, 같은 시트의 전역 스코프 탭은
// `AGENT_CLIENTS`(Claude Code → Codex → Cursor → Antigravity)를 그대로 썼다 —
// 한 시트 안에서 같은 목록이 두 순서를 가졌다. 수선은 렌더 순서를 그 배열에서
// 파생시키는 것이고, 이 테스트가 그 파생이 계속 참인지 잠근다: 배열 순서가
// 바뀌면 화면 순서도 따라 바뀌어야 하고, 화면이 배열을 무시하면 여기서 빨개진다.
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { AgentClientButtons } from "./AgentClientButtons";
import { AGENT_CLIENTS } from "../lib/agent-clients";
import ko from "../../../../messages/ko.json";

const CLIENT_TESTID: Record<string, string> = {
  "claude-code": "agent-client-claude-code",
  codex: "agent-client-codex",
  cursor: "agent-client-cursor",
  antigravity: "agent-client-antigravity",
};

function renderButtons() {
  return render(
    <NextIntlClientProvider locale="ko" messages={ko}>
      <AgentClientButtons
        serverAvailability={{
          kind: "app-bundled",
          launch: { kind: "app-bundled", command: "/bundle/ontology-atlas-mcp", args: [] },
          binaryPath: "/bundle/ontology-atlas-mcp",
          reason: null,
        }}
        onWriteConfigs={() => undefined}
        cursorDeeplink={null}
        mcpJsonSnippet="{}"
        codexCommand="codex mcp add"
        needsManualPath={false}
      />
    </NextIntlClientProvider>,
  );
}

describe("AgentClientButtons — 렌더 순서는 AGENT_CLIENTS 에서 파생된다", () => {
  it("renders one control per client, in AGENT_CLIENTS order", () => {
    renderButtons();
    const container = screen.getByTestId("agent-client-buttons");
    const controls = [...container.querySelectorAll("[data-testid^='agent-client-']")].filter(
      (el) => el.getAttribute("data-testid") !== "agent-client-app-cta",
    );
    const renderedIds = controls.map((el) => el.getAttribute("data-testid"));
    const expectedIds = AGENT_CLIENTS.map((client) => CLIENT_TESTID[client.id]);
    // 순서까지 포함한 동등 비교 — 집합이 같아도 순서가 다르면 결함이다.
    expect(renderedIds).toEqual(expectedIds);
  });

  it("probe: the expected order really comes from the array, not a copy", () => {
    // 배열이 바뀌면 기대값도 자동으로 바뀌는 구조인지 스스로 증명한다 —
    // 기대값을 리터럴로 복제하면 이 테스트가 두 번째 진실이 된다.
    const expectedIds = AGENT_CLIENTS.map((client) => CLIENT_TESTID[client.id]);
    expect(expectedIds).toHaveLength(AGENT_CLIENTS.length);
    expect(new Set(expectedIds).size).toBe(AGENT_CLIENTS.length);
  });
});

/**
 * 넷은 **동등한 선택지**다 (2026-08-02, 디자인 카운슬 S2).
 *
 * 종전엔 `claudeCode` 렌더 함수만 `primary` 를 무조건 참으로 하드코딩했고,
 * 나머지 셋에는 그 값을 넘기는 경로 자체가 없었다. 실측: 넷 다 `750×38, x=407`
 * 로 치수 분산이 0인데 하나만 `rgba(94,106,210,0.24)` 채움 — 「선택지 넷」이
 * 아니라 **「정답 하나 + 탈락 셋」**으로 읽혔다. 넷은 서로 다른 파일에 쓰므로
 * 배타적 단일 선택이 아니고, 그래서 «정답» 이 있을 수 없다.
 */
describe("AgentClientButtons — 넷은 같은 무게다", () => {
  it("gives no client a filled treatment the others cannot get", () => {
    renderButtons();
    const classNames = AGENT_CLIENTS.map(
      (client) => screen.getByTestId(CLIENT_TESTID[client.id]).className,
    );
    // 한 벌로 읽혀야 하는 세트라 표면 클래스가 **한 종류**여야 한다.
    expect(new Set(classNames).size).toBe(1);
    // 그리고 그 한 종류에 인디고 채움 워시가 없다.
    for (const className of classNames) {
      expect(className).not.toContain("--color-indigo-a24");
    }
  });

  /**
   * 「>_」 터미널 글리프 ×4 제거. 같은 자리가 상태에 따라 Check(완료)·
   * Copy(복사)·Loader(진행)를 그리는데 Terminal 만 아무 상태도 안 날랐다 —
   * 잉크는 데이터에 쓴다(Tufte).
   */
  it("draws no glyph on the connect action — only state carries one", () => {
    renderButtons();
    for (const client of AGENT_CLIENTS) {
      const control = screen.getByTestId(CLIENT_TESTID[client.id]);
      expect(
        control.querySelectorAll("svg").length,
        `${client.id} 연결 버튼에 상태 없는 글리프가 있다`,
      ).toBe(0);
    }
  });
});
