import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it, vi } from "vitest";
import enMessages from "../../../../messages/en.json";
import { agentServerFromBundle, agentServerUnavailable } from "@/shared/config";
import { AgentConnectSheet } from "./AgentConnectSheet";

const bundledServer = agentServerFromBundle(
  "/Applications/Ontology Atlas.app/Contents/MacOS/ontology-atlas-mcp",
);

const noServer = agentServerUnavailable(
  "The bundled MCP server is only available in the installed app.",
);

function renderSheet(onClose = vi.fn()) {
  render(
    <NextIntlClientProvider locale="en" messages={enMessages}>
      <AgentConnectSheet
        open
        onClose={onClose}
        status={{ kind: "none" }}
        snippets={{
          mcpJson: '{"mcpServers":{}}',
          replacementMcpJson: '{"mcpServers":{"ontology-atlas":{"env":{"OATLAS_VAULT":"."}}}}',
          codexCommand: "codex mcp add ontology-atlas",
          codexConfig: '[mcp_servers.ontology-atlas]',
          needsManualPath: false,
          cursorDeeplink: null,
          vscodeDeeplink: null,
        }}
        domainTitles={["Product"]}
        handoffText="Continue the ontology task."
        serverAvailability={bundledServer}
      />
    </NextIntlClientProvider>,
  );
  return onClose;
}

describe("AgentConnectSheet focus contract", () => {
  it("moves focus into the dialog and traps Tab in both directions", async () => {
    renderSheet();

    const close = screen.getByTestId("agent-connect-close");
    await waitFor(() => expect(close).toHaveFocus());

    const buttons = screen.getAllByRole("button");
    const last = buttons[buttons.length - 1];
    last.focus();
    fireEvent.keyDown(window, { key: "Tab" });
    expect(close).toHaveFocus();

    fireEvent.keyDown(window, { key: "Tab", shiftKey: true });
    expect(last).toHaveFocus();
  });

  it("closes with Escape while focus is owned by the dialog", async () => {
    const onClose = renderSheet();
    await waitFor(() => expect(screen.getByTestId("agent-connect-close")).toHaveFocus());

    fireEvent.keyDown(window, { key: "Escape" });

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("forwards invalid vault config states as replacement-copy actions", () => {
    render(
      <NextIntlClientProvider locale="en" messages={enMessages}>
        <AgentConnectSheet
          open
          onClose={vi.fn()}
          status={{ kind: "none" }}
          snippets={{
            mcpJson: '{"env":{"OATLAS_VAULT":"/private/tmp/vault"}}',
            replacementMcpJson: '{"env":{"OATLAS_VAULT":"."}}',
            codexCommand: "codex mcp add ontology-atlas",
            codexConfig: '[mcp_servers.ontology-atlas]\nOATLAS_VAULT = "."',
            needsManualPath: false,
            cursorDeeplink: null,
            vscodeDeeplink: null,
          }}
          domainTitles={[]}
          handoffText=""
          onWriteConfigs={vi.fn()}
          mcpJsonState="invalid"
          codexConfigState="invalid"
          serverAvailability={bundledServer}
        />
      </NextIntlClientProvider>,
    );

    expect(
      screen.getByRole("button", { name: "Copy correct .mcp.json" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Copy correct Codex config" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByText("Created .mcp.json in this folder"),
    ).not.toBeInTheDocument();
  });

  it("fails closed instead of offering actions when the server cannot be started here", () => {
    render(
      <NextIntlClientProvider locale="en" messages={enMessages}>
        <AgentConnectSheet
          open
          onClose={vi.fn()}
          status={{ kind: "none" }}
          snippets={{
            mcpJson: '{"command":"npx"}',
            replacementMcpJson: '{"command":"npx"}',
            codexCommand: "codex mcp add ontology-atlas -- npx -y ontology-atlas-mcp",
            codexConfig: 'command = "npx"',
            needsManualPath: false,
            cursorDeeplink: "cursor://broken-npx-config",
            vscodeDeeplink: "vscode:mcp/install?broken-npx-config",
          }}
          domainTitles={[]}
          handoffText=""
          onWriteConfigs={vi.fn()}
          serverAvailability={noServer}
        />
      </NextIntlClientProvider>,
    );

    expect(screen.getByTestId("agent-server-unavailable")).toHaveTextContent(
      "cannot connect an agent",
    );
    // 실행 방법을 모르면 쓰기 행동 자체를 그리지 않는다 — 붙지 않는 설정을
    // 만드는 버튼은 도움이 아니라 나중에 진단해야 할 함정이다.
    expect(screen.queryByTestId("agent-connect-action")).not.toBeInTheDocument();
    expect(screen.queryByTestId("agent-connect-step-2")).not.toBeInTheDocument();
    expect(screen.queryByTestId("agent-connect-step-3")).not.toBeInTheDocument();
    expect(screen.queryByTestId("agent-client-cursor")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Connect to Claude Code" }),
    ).not.toBeInTheDocument();
  });
});

/**
 * **적용 범위 세그먼트** — 소유자 관측(*"대부분 … 전역으로 할텐데"*)을 받은 갈래.
 *
 * 왜 이 자리에 컴포넌트 테스트가 필요한가: 전역 스코프는 `serverAvailability.launch`
 * 와 볼트 절대 경로가 **둘 다** 있을 때만 그려진다 — 즉 **설치 앱 전용 표면**이다.
 * 웹 스모크로는 한 번도 지나가지 않으므로, 실물 없이 얻을 수 있는 가장 강한 증명이
 * 이것이다. 계약(경계·문구·기본값)은 `tests/contract/agent-global-scope.contract.test.ts`
 * 가 따로 잡는다.
 */
describe("AgentConnectSheet scope segment", () => {
  function renderWithVault() {
    render(
      <NextIntlClientProvider locale="en" messages={enMessages}>
        <AgentConnectSheet
          open
          onClose={vi.fn()}
          status={{ kind: "none" }}
          snippets={{
            mcpJson: '{"mcpServers":{}}',
            replacementMcpJson: '{"mcpServers":{"ontology-atlas":{"env":{"OATLAS_VAULT":"."}}}}',
            codexCommand: "codex mcp add ontology-atlas",
            codexConfig: "[mcp_servers.ontology-atlas]",
            needsManualPath: false,
            cursorDeeplink: null,
            vscodeDeeplink: null,
          }}
          domainTitles={["Product"]}
          handoffText="Continue the ontology task."
          serverAvailability={bundledServer}
          vaultPath="/Users/someone/vault"
        />
      </NextIntlClientProvider>,
    );
  }

  it("starts on this folder and swaps the step body when the computer-wide scope is picked", () => {
    window.localStorage.clear();
    renderWithVault();

    // 기본값은 프로젝트 — 되돌릴 수 있는 쪽이 기본이다.
    expect(screen.getByTestId("agent-scope-project")).toHaveAttribute("aria-checked", "true");
    expect(screen.getByTestId("agent-connect-action")).toBeInTheDocument();
    expect(screen.queryByTestId("agent-global-scope")).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId("agent-scope-global"));

    // 갈래는 **교체**다 — 두 방법이 동시에 보이면 어느 쪽이 실제인지 사용자가 판단해야 한다.
    expect(screen.getByTestId("agent-global-scope")).toBeInTheDocument();
    expect(screen.queryByTestId("agent-connect-action")).not.toBeInTheDocument();

    // 상실 문장이 그 자리에 있어야 한다 — 홈 폴더는 git diff 에 안 남는다.
    expect(screen.getByTestId("agent-global-scope-loss")).toBeInTheDocument();

    /*
     * **한 번에 한 도구.** 넷을 동시에 펼치던 첫 판은 실측에서 이 패널만 977px 이
     * 돼 시트(836px)를 넘겼고, 단계 ②③ 이 스크롤 밖으로 밀렸다. 그래서 탭은 넷,
     * 렌더는 하나가 계약이다 — 그 "하나" 를 여기서 단언한다.
     */
    for (const id of ["claude-code", "codex", "cursor", "antigravity"]) {
      expect(screen.getByTestId(`agent-global-scope-tool-${id}`)).toBeInTheDocument();
    }
    expect(screen.getByTestId("agent-global-scope-claude-code")).toHaveTextContent(
      "claude mcp add --scope user",
    );
    expect(screen.queryByTestId("agent-global-scope-codex")).not.toBeInTheDocument();

    // 도구를 바꾸면 그 도구의 것만 남는다.
    fireEvent.click(screen.getByTestId("agent-global-scope-tool-codex"));
    expect(screen.getByTestId("agent-global-scope-codex")).toBeInTheDocument();
    expect(screen.queryByTestId("agent-global-scope-claude-code")).not.toBeInTheDocument();
    // 볼트 절대 경로가 이미 박혀 있다 — 사용자가 조립하지 않는다.
    expect(screen.getByTestId("agent-global-scope-codex")).toHaveTextContent("/Users/someone/vault");
    window.localStorage.clear();
  });
});
