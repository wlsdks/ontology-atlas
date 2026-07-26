import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, describe, expect, it, vi } from "vitest";
import koMessages from "../../../../messages/ko.json";
import { AgentTerminalDock, elideCwdHead } from "./AgentTerminalDock";

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
      "터미널은 데스크톱 앱에서 열려요",
    );
    // 브라우저는 프로세스를 못 띄운다 — 열려 있어도 세션 시도 자체가 없어야 한다.
    expect(bridgeMock.open).not.toHaveBeenCalled();
    expect(screen.queryByTestId("agent-terminal-host")).not.toBeInTheDocument();
  });

  // Design Guardian 2026-07-26 — 정직한 강등이 "안 된다" 로 끝나면 막다른 길이다.
  it("웹 강등은 다음 한 걸음(데스크톱 앱)을 같이 준다", () => {
    bridgeMock.available = false;
    renderDock(<AgentTerminalDock open onClose={() => {}} vaultPath="/vault" />);
    expect(screen.getByTestId("agent-terminal-download-link")).toHaveAttribute(
      "href",
      expect.stringContaining("/download"),
    );
  });

  // 고정 320px 인라인 높이 재발 차단 — 14"에서 본문의 36.7% 를 먹었다.
  it("높이는 토큰에서 온다 (JSX 하드코딩 px 금지)", () => {
    renderDock(<AgentTerminalDock open onClose={() => {}} vaultPath={null} />);
    const style = screen.getByTestId("agent-terminal-dock").getAttribute("style") ?? "";
    // 강등 상태는 문단 두 줄이 전부 — 30vh 를 예약하면 빈 검은 상자가 된다.
    expect(style).toContain("var(--agent-terminal-dock-height-degraded)");
    expect(style).not.toMatch(/\d+px/);
  });

  // in-flow 도크가 화면 안에 들어오려면 페이지 루트가 읽는 `--app-viewport-h`
  // 가 줄어야 한다. 그 단일 입력이 이 attribute 다.
  it("본문에서 가져가는 높이를 문서 루트에 선언한다", () => {
    const { unmount } = renderDock(
      <AgentTerminalDock open onClose={() => {}} vaultPath={null} />,
    );
    expect(document.documentElement.dataset.agentTerminal).toBe("degraded");
    unmount();
    expect(document.documentElement.dataset.agentTerminal).toBeUndefined();
  });

  it("닫혀 있으면 본문 높이를 건드리지 않는다", () => {
    renderDock(<AgentTerminalDock open={false} onClose={() => {}} vaultPath="/vault" />);
    expect(document.documentElement.dataset.agentTerminal).toBeUndefined();
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

/**
 * Design Guardian 2026-07-26 — 헤더의 `program · cwd` 는 "무엇이 · 어디서
 * 도는지" 를 증명하는 영수증이다. 오른쪽 말줄임이면 정체성인 **끝**(폴더
 * 이름)부터 사라져 영수증이 영수증 구실을 못 한다.
 */
describe("elideCwdHead — 경로는 꼬리가 정체성", () => {
  it("짧은 경로는 건드리지 않는다", () => {
    expect(elideCwdHead("/tmp/vault")).toBe("/tmp/vault");
  });

  it("긴 경로는 머리를 접고 꼬리 2단계를 남긴다", () => {
    expect(elideCwdHead("/Users/jinan/side-project/ontology-atlas")).toBe(
      "…/side-project/ontology-atlas",
    );
  });

  it("단계가 부족하면 자르지 않는다 (잘라도 얻는 게 없다)", () => {
    const flat = `/${"a".repeat(60)}`;
    expect(elideCwdHead(flat)).toBe(flat);
  });
});
