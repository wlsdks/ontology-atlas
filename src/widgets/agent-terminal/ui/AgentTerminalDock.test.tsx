import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, describe, expect, it, vi } from "vitest";
import koMessages from "../../../../messages/ko.json";
import { AgentTerminalDock, elideCwdHead } from "./AgentTerminalDock";
import { readDockHeight } from "../model/dock-height";

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
  window.localStorage.clear();
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

  /**
   * FitAddon 은 측정 대상(host)의 computed 크기에서 `.xterm` 요소의 패딩만 뺀다.
   * host 가 스스로 패딩을 가지면 그만큼 cols/rows 를 과대 산정해 우측 열이 여백
   * 밑으로 잘린다. 여백은 래퍼가 갖고 host 는 패딩 0 이어야 한다.
   */
  it("셀 여백은 래퍼가 갖고 측정 대상(host)은 패딩 0 이다", () => {
    bridgeMock.available = true;
    renderDock(<AgentTerminalDock open onClose={() => {}} vaultPath="/vault" />);

    const host = screen.getByTestId("agent-terminal-host");
    expect(host.className).not.toMatch(/\b[pm][xytrbl]?-/);

    const inset = host.parentElement;
    expect(inset?.style.padding).toBe(
      "var(--terminal-inset-y) var(--terminal-inset-x)",
    );
  });

  /**
   * xterm 은 자기 스타일시트를 요구한다. 없으면 셀 폭 측정용 span 이 숨겨지지
   * 않아 터미널 위에 쓰레기 글자 줄로 그려지고(설치 앱 실측), `.xterm-viewport`
   * 가 스크롤 컨테이너가 아니게 된다. jsdom 은 CSS 를 적용하지 않아 렌더 결과로는
   * 이 회귀를 못 잡으므로 import 자체를 지킨다.
   */
  it("xterm 스타일시트를 함께 싣는다", () => {
    const source = readFileSync(
      resolve(__dirname, "./AgentTerminalDock.tsx"),
      "utf8",
    );
    expect(source).toContain('import "@xterm/xterm/css/xterm.css"');
  });

  it("닫기 버튼이 호스트에게 알린다 (세션 정리는 언마운트 effect 가 한다)", () => {
    const onClose = vi.fn();
    renderDock(<AgentTerminalDock open onClose={onClose} vaultPath={null} />);
    screen.getByTestId("agent-terminal-close").click();
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  /**
   * `customGlyphs`(E0B0–E0B7 절차 드로잉)는 canvas/webgl 렌더러 전용이라 DOM
   * 렌더러에서는 죽은 옵션이다. 애드온 로드가 사라지면 Nerd Font 를 안 깐
   * 기기에서 다시 두부(□)가 나는데, jsdom 에는 WebGL 컨텍스트가 없어 렌더
   * 결과로는 이 회귀를 못 잡는다 — 그래서 로드 자체를 지킨다.
   */
  it("WebGL 렌더러를 싣되 실패는 조용히 넘긴다 (DOM 폴백)", () => {
    const source = readFileSync(resolve(__dirname, "./AgentTerminalDock.tsx"), "utf8");
    expect(source).toContain('await import("@xterm/addon-webgl")');
    // 애드온 로드가 try 밖으로 나가면 WebGL2 없는 기기에서 터미널 자체가 안 뜬다.
    const load = source.indexOf('await import("@xterm/addon-webgl")');
    expect(source.lastIndexOf("try {", load)).toBeGreaterThan(-1);
    expect(source).toContain("onContextLoss");
  });
});

describe("AgentTerminalDock — 높이 그립", () => {
  it("강등 상태에는 그립이 없다 — 잡아 늘릴 내용이 없다", () => {
    bridgeMock.available = false;
    renderDock(<AgentTerminalDock open onClose={() => {}} vaultPath="/vault" />);
    expect(screen.queryByTestId("agent-terminal-resize-grip")).not.toBeInTheDocument();
  });

  it("그립은 드래그 전용이 아니다 — 포커스를 받고 ↑↓ 로도 움직인다", () => {
    bridgeMock.available = true;
    renderDock(<AgentTerminalDock open onClose={() => {}} vaultPath="/vault" />);
    const grip = screen.getByTestId("agent-terminal-resize-grip");
    expect(grip).toHaveAttribute("role", "separator");
    expect(grip).toHaveAttribute("tabindex", "0");
    expect(grip).toHaveAccessibleName("터미널 높이 조절");
  });

  it("↑ 로 높이를 올리면 px 로 굳고 저장된다", () => {
    bridgeMock.available = true;
    renderDock(<AgentTerminalDock open onClose={() => {}} vaultPath="/vault" />);
    fireEvent.keyDown(screen.getByTestId("agent-terminal-resize-grip"), { key: "ArrowUp" });

    const style = screen.getByTestId("agent-terminal-dock").getAttribute("style") ?? "";
    expect(style).toMatch(/\d+px/);
    expect(readDockHeight()).not.toBeNull();
  });

  /**
   * 드래그 리스너는 6px 그립이 아니라 window 가 받아야 한다. 포인터는 잡자마자
   * 그 띠 밖으로 나가고, 포인터 캡처가 안 되는 환경(합성 포인터 등)에서는
   * 캡처가 대신 잡아주지도 않는다 — 그립에 달면 드래그가 첫 픽셀에서 끊긴다.
   */
  it("드래그는 그립 밖으로 나가도 이어진다 (리스너는 window)", () => {
    bridgeMock.available = true;
    renderDock(<AgentTerminalDock open onClose={() => {}} vaultPath="/vault" />);
    const grip = screen.getByTestId("agent-terminal-resize-grip");

    fireEvent.pointerDown(grip, { button: 0, clientY: 700, pointerId: 1 });
    // 그립에서 한참 벗어난 좌표 — 캡처 없이도 window 가 받는다.
    fireEvent.pointerMove(window, { clientY: 300, pointerId: 1 });
    fireEvent.pointerUp(window, { pointerId: 1 });

    const style = screen.getByTestId("agent-terminal-dock").getAttribute("style") ?? "";
    expect(style).toMatch(/\d+px/);
    expect(readDockHeight()).not.toBeNull();
  });

  it("Enter(=더블클릭)는 사용자의 선택을 지우고 토큰 기본값으로 되돌린다", () => {
    bridgeMock.available = true;
    renderDock(<AgentTerminalDock open onClose={() => {}} vaultPath="/vault" />);
    const grip = screen.getByTestId("agent-terminal-resize-grip");
    fireEvent.keyDown(grip, { key: "ArrowUp" });
    fireEvent.keyDown(grip, { key: "Enter" });

    const style = screen.getByTestId("agent-terminal-dock").getAttribute("style") ?? "";
    expect(style).toContain("var(--agent-terminal-dock-height)");
    expect(readDockHeight()).toBeNull();
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
