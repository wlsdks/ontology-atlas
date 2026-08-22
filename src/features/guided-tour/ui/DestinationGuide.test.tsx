import { act, fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ko from "../../../../messages/ko.json";
import { GuideReplayProvider, useGuideReplay } from "../model/guide-replay-context";
import { destinationTourStatusKey } from "../model/tour-storage";
import { DestinationGuide } from "./DestinationGuide";

const DOCS_KEY = destinationTourStatusKey("docs");
/** The global auto-display switch — one test turning it off leaves it off for the next. */
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
  // The auto-start guard looks at document focus (so guidance is not fired into a
  // background tab). jsdom defaults to unfocused, so it is set explicitly.
  vi.spyOn(document, "hasFocus").mockReturnValue(true);
  window.localStorage.removeItem(DOCS_KEY);
  // Auto-display has been off by default (opt-in) since 2026-08-13 — the tests below
  // that examine automatic firing assume the switch is on. The default itself is
  // checked separately by the "with no stored value" test.
  window.localStorage.setItem(AUTO_START_KEY, "1");
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

  // Regression 2026-07-26 — the workshop is a screen where the entry choice
  // (`role=dialog aria-modal`) stands the moment you arrive. Firing guidance over it
  // covers the very choices the card meant to introduce and puts two `aria-modal`
  // elements up at once (the card vanishes for a screen reader). The contract is to
  // wait until the decision is made and appear on the work surface.
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

  // Audit 2026-07-27 — pressing any other navigation while the guidance was up
  // swallowed the click with no response. Blocking that does not say "blocked" reads
  // to the user as "broken". Pressing a blocked spot withdraws the guidance, and a
  // second press goes through.
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

  // Verdict ① of 2026-07-28 — the "cancel the firing if the user moves first while
  // waiting" guard, which only the map had, was ported to the five destination tours.
  // With a 30-second waiting window, a card appearing belatedly over someone who had
  // started exploring on their own was the defect.
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
 * The switch's real contract — **off stops only the automatic, and calling it still works.**
 *
 * Why both are in one test: honouring only half becomes a different defect each way.
 * If the automatic does not stop, the switch is a lie; if it also does not come when
 * called, that is not a switch but **deletion**. The owner asked for the former
 * ("아니면 클릭했을때나" — or else when clicked).
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
    window.localStorage.setItem(AUTO_START_KEY, "1");
    renderGuide();
    await act(async () => {
      vi.advanceTimersByTime(6000);
    });
    expect(screen.getByRole("heading", { level: 2 })).toBeInTheDocument();
  });

  it("기본(저장값 없음)이면 저절로 뜨지 않는다 — 2026-08-13 소유자 확정", async () => {
    window.localStorage.removeItem(AUTO_START_KEY);
    renderGuide();
    await act(async () => {
      vi.advanceTimersByTime(6000);
    });
    expect(screen.queryByRole("heading", { level: 2 })).toBeNull();
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
