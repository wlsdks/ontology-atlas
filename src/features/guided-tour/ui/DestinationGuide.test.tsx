import { act, fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ko from "../../../../messages/ko.json";
import { GuideReplayProvider, useGuideReplay } from "../model/guide-replay-context";
import { destinationTourStatusKey } from "../model/tour-storage";
import { DestinationGuide } from "./DestinationGuide";

const DOCS_KEY = destinationTourStatusKey("docs");

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
  vi.useFakeTimers({ shouldAdvanceTime: true });
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
  window.localStorage.removeItem(DOCS_KEY);
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

  it("지도(목적지 없음)에서는 아무것도 렌더하지 않는다 — 지도는 자기 여정을 따로 갖는다", async () => {
    renderGuide(null);
    await act(async () => {
      vi.advanceTimersByTime(5000);
    });
    expect(screen.queryByTestId("guided-tour-card")).toBeNull();
    expect(screen.queryByTestId("replay")).toBeNull();
  });
});
