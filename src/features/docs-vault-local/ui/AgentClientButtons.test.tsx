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
