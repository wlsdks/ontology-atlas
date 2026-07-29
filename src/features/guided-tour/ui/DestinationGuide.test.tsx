import { act, fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ko from "../../../../messages/ko.json";
import { GuideReplayProvider, useGuideReplay } from "../model/guide-replay-context";
import { destinationTourStatusKey } from "../model/tour-storage";
import { DestinationGuide } from "./DestinationGuide";

const DOCS_KEY = destinationTourStatusKey("docs");
/** 전역 자동 표시 스위치 — 한 테스트가 끄면 다음 테스트까지 꺼진 채로 넘어간다. */
const AUTO_START_KEY = "ontology-atlas:guide-auto-start:v1";

function renderGuide(destination: "docs" | null = "docs") {
  return render(
    <NextIntlClientProvider locale="ko" messages={ko}>
      <GuideReplayProvider>
        <div data-testid="docs-vault-doc-list">문서 목록</div>
        <DestinationGuide destination={destination} />
        <ReplayButton />
      </GuideReplayProvider>
    </NextIntlClientProvider>,
  );
}

function ReplayButton() {
  const replay = useGuideReplay();
  if (!replay) return null;
  return (
    <button type="button" data-testid="replay" onClick={replay}>
      다시 보기
    </button>
  );
}

beforeEach(() => {
  // 자동 시작 가드는 문서 포커스를 본다(백그라운드 탭에 안내를 쏘지 않기 위해).
  // jsdom 기본값은 포커스 없음이라 명시적으로 세운다.
  vi.spyOn(document, "hasFocus").mockReturnValue(true);
  window.localStorage.removeItem(DOCS_KEY);
  window.localStorage.removeItem(AUTO_START_KEY);
  vi.useFakeTimers({ shouldAdvanceTime: true });
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
  window.localStorage.removeItem(DOCS_KEY);
  window.localStorage.removeItem(AUTO_START_KEY);
});

describe("DestinationGuide", () => {
  it("첫 방문이면 잠시 뒤 그 목적지의 안내가 뜬다", async () => {
    renderGuide();
    expect(screen.queryByTestId("guided-tour-card")).toBeNull();
    await act(async () => {
      vi.advanceTimersByTime(1000);
    });
    expect(screen.getByTestId("guided-tour-card")).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 2 })).toHaveTextContent(
      ko.guidedTour.steps.docsWhat.title,
    );
  });

  it("이미 본 목적지에서는 다시 자동으로 뜨지 않는다 — 매번 뜨는 안내는 방해다", async () => {
    window.localStorage.setItem(DOCS_KEY, "skipped");
    renderGuide();
    await act(async () => {
      vi.advanceTimersByTime(5000);
    });
    expect(screen.queryByTestId("guided-tour-card")).toBeNull();
  });

  it("본 뒤에도 설정 메뉴가 쓰는 '다시 보기' 로 되돌아올 수 있다", async () => {
    window.localStorage.setItem(DOCS_KEY, "done");
    renderGuide();
    await act(async () => {
      vi.advanceTimersByTime(5000);
    });
    expect(screen.queryByTestId("guided-tour-card")).toBeNull();
    await act(async () => {
      fireEvent.click(screen.getByTestId("replay"));
    });
    expect(screen.getByTestId("guided-tour-card")).toBeInTheDocument();
  });

  // 2026-07-26 회귀 — 공방은 도착하자마자 진입 선택(`role=dialog aria-modal`)이
  // 서는 화면이다. 그 위에 안내를 쏘면 카드가 소개하려던 선택지를 덮고
  // `aria-modal` 이 둘이 된다(스크린리더에서 카드 소실). 결정이 끝날 때까지
  // 기다렸다가 작업 표면에서 뜨는 것이 계약이다.
  it("결정 모달이 서 있는 동안은 겹쳐 쏘지 않고, 물러난 뒤에 뜬다", async () => {
    const modal = document.createElement("section");
    modal.setAttribute("role", "dialog");
    modal.setAttribute("aria-modal", "true");
    document.body.appendChild(modal);

    renderGuide();
    await act(async () => {
      vi.advanceTimersByTime(5000);
    });
    expect(screen.queryByTestId("guided-tour-card")).toBeNull();

    modal.remove();
    await act(async () => {
      vi.advanceTimersByTime(2000);
    });
    expect(screen.getByTestId("guided-tour-card")).toBeInTheDocument();
  });

  // 2026-07-27 감사 D3 — 안내가 떠 있는 동안 다른 내비를 누르면 클릭이 아무
  // 반응 없이 삼켜졌다. "막혔다" 를 말하지 않는 차단은 사용자에게 "고장" 으로
  // 읽힌다. 막힌 자리를 누르면 안내가 물러나고, 한 번 더 누르면 간다.
  it("막힌 자리를 누르면 안내가 물러난다 — 말없이 삼키지 않는다", async () => {
    renderGuide();
    await act(async () => {
      vi.advanceTimersByTime(1000);
    });
    expect(screen.getByTestId("guided-tour-card")).toBeInTheDocument();

    const blocker = screen.getByTestId("guided-tour-blocker");
    expect(blocker).toHaveAttribute("data-dismissable", "true");
    await act(async () => {
      fireEvent.click(blocker);
    });
    expect(screen.queryByTestId("guided-tour-card")).toBeNull();
  });

  // 2026-07-28 판정 ① — 지도만 받았던 「대기 중 사용자가 먼저 움직이면 발화
  // 취소」 가드를 목적지 투어 다섯에도 이식했다. 대기 창이 30초라, 그 사이
  // 스스로 탐색을 시작한 사람 위로 뒤늦게 카드가 뜨는 것이 결함이었다.
  it("대기 중 사용자가 먼저 움직이면 안내가 아예 뜨지 않는다", async () => {
    renderGuide();
    await act(async () => {
      fireEvent.pointerDown(document.body);
    });
    await act(async () => {
      vi.advanceTimersByTime(5000);
    });
    expect(screen.queryByTestId("guided-tour-card")).toBeNull();
  });

  it("취소돼도 길이 막히지 않는다 — 기록을 남기지 않고 '다시 보기' 가 연다", async () => {
    renderGuide();
    await act(async () => {
      fireEvent.pointerDown(document.body);
    });
    await act(async () => {
      vi.advanceTimersByTime(5000);
    });
    expect(window.localStorage.getItem(DOCS_KEY)).toBeNull();
    await act(async () => {
      fireEvent.click(screen.getByTestId("replay"));
    });
    expect(screen.getByTestId("guided-tour-card")).toBeInTheDocument();
  });

  it("안내가 이미 뜬 뒤의 클릭은 취소가 아니다 — 카드는 그대로 서 있다", async () => {
    renderGuide();
    await act(async () => {
      vi.advanceTimersByTime(1000);
    });
    expect(screen.getByTestId("guided-tour-card")).toBeInTheDocument();
    await act(async () => {
      fireEvent.pointerDown(document.body);
    });
    expect(screen.getByTestId("guided-tour-card")).toBeInTheDocument();
  });

  it("지도(목적지 없음)에서는 아무것도 렌더하지 않는다 — 지도는 자기 여정을 따로 갖는다", async () => {
    renderGuide(null);
    await act(async () => {
      vi.advanceTimersByTime(5000);
    });
    expect(screen.queryByTestId("guided-tour-card")).toBeNull();
    expect(screen.queryByTestId("replay")).toBeNull();
  });
});

/**
 * 스위치의 진짜 계약 — **끄면 자동만 멎고, 부르면 여전히 온다.**
 *
 * 이 둘을 한 테스트에 묶는 이유: 반쪽만 지키면 각각 다른 결함이 된다. 자동이
 * 안 멎으면 스위치가 거짓말이고, 부를 때도 안 오면 스위치가 아니라 **삭제**다.
 * 소유자가 요청한 것은 후자가 아니다("아니면 클릭했을때나").
 */
describe("화면 안내 자동 표시 스위치", () => {
  it("끄면 목적지 안내가 저절로 뜨지 않는다", async () => {
    window.localStorage.setItem(AUTO_START_KEY, "0");
    renderGuide();
    await act(async () => {
      vi.advanceTimersByTime(6000);
    });
    expect(screen.queryByRole("heading", { level: 2 })).toBeNull();
  });

  it("켜져 있으면 저절로 뜬다 — 스위치가 실제로 그 발화를 막고 있다는 증거", async () => {
    renderGuide();
    await act(async () => {
      vi.advanceTimersByTime(6000);
    });
    expect(screen.getByRole("heading", { level: 2 })).toBeInTheDocument();
  });

  it("꺼져 있어도 「다시 보기」로는 열린다 — 스위치는 삭제가 아니다", async () => {
    window.localStorage.setItem(AUTO_START_KEY, "0");
    renderGuide();
    await act(async () => {
      vi.advanceTimersByTime(6000);
    });
    expect(screen.queryByRole("heading", { level: 2 })).toBeNull();
    fireEvent.click(screen.getByTestId("replay"));
    expect(screen.getByRole("heading", { level: 2 })).toBeInTheDocument();
  });
});
