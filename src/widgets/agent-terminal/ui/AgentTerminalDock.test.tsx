import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, describe, expect, it, vi } from "vitest";
import koMessages from "../../../../messages/ko.json";
import { AgentTerminalDock } from "./AgentTerminalDock";

const bridgeMock = vi.hoisted(() => ({
  available: false,
  open: vi.fn(),
  write: vi.fn(),
  close: vi.fn(),
}));

vi.mock("@/shared/lib/tauri-terminal", () => ({
  isTerminalAvailable: () => bridgeMock.available,
  termOpen: bridgeMock.open,
  termWrite: bridgeMock.write,
  termResize: vi.fn(),
  termClose: bridgeMock.close,
  onTermData: vi.fn(async () => () => {}),
  onTermExit: vi.fn(async () => () => {}),
}));

afterEach(() => {
  bridgeMock.available = false;
  bridgeMock.open.mockReset();
  bridgeMock.write.mockReset();
  bridgeMock.close.mockReset();
});

function renderDock(ui: React.ReactElement) {
  return render(
    <NextIntlClientProvider locale="ko" messages={koMessages}>
      {ui}
    </NextIntlClientProvider>,
  );
}

describe("AgentTerminalDock — 신뢰 계약", () => {
  it("닫혀 있으면 아무것도 렌더하지 않는다", () => {
    renderDock(<AgentTerminalDock open={false} onClose={() => {}} vaultPath="/vault" />);
    expect(screen.queryByTestId("agent-terminal-dock")).not.toBeInTheDocument();
  });

  it("자동 실행 0 — 닫힌 상태에서는 세션이 시작되지 않는다", () => {
    bridgeMock.available = true;
    renderDock(<AgentTerminalDock open={false} onClose={() => {}} vaultPath="/vault" />);
    expect(bridgeMock.open).not.toHaveBeenCalled();
  });

  it("웹에서는 되는 척하지 않고 정직하게 강등한다", () => {
    bridgeMock.available = false;
    renderDock(<AgentTerminalDock open onClose={() => {}} vaultPath="/vault" />);

    expect(screen.getByTestId("agent-terminal-unavailable")).toHaveTextContent(
      "터미널은 앱에서 열려요",
    );
    // 브라우저는 프로세스를 못 띄운다 — 열려 있어도 세션 시도 자체가 없어야 한다.
    expect(bridgeMock.open).not.toHaveBeenCalled();
    expect(screen.queryByTestId("agent-terminal-host")).not.toBeInTheDocument();
  });

  it("볼트가 없으면 어디서 돌지가 없으므로 시작하지 않는다", () => {
    bridgeMock.available = true;
    renderDock(<AgentTerminalDock open onClose={() => {}} vaultPath={null} />);

    expect(screen.getByTestId("agent-terminal-unavailable")).toHaveTextContent(
      "먼저 폴더를 열어주세요",
    );
    expect(bridgeMock.open).not.toHaveBeenCalled();
  });

  it("닫기 버튼이 호스트에게 알린다 (세션 정리는 언마운트 effect 가 한다)", () => {
    const onClose = vi.fn();
    renderDock(<AgentTerminalDock open onClose={onClose} vaultPath={null} />);
    screen.getByTestId("agent-terminal-close").click();
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
