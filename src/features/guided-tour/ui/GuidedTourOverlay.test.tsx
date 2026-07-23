import { act, render, screen } from "@testing-library/react";
import { createRef } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GuidedTourOverlay } from "./GuidedTourOverlay";
import { useGuidedTour } from "../model/use-guided-tour";
import { GUIDED_TOUR_STATUS_KEY } from "../model/tour-storage";

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, params?: Record<string, unknown>) =>
    params ? `${key}:${JSON.stringify(params)}` : key,
}));

function Harness({ hasSelection = false }: { hasSelection?: boolean }) {
  const ref = createRef<HTMLDivElement>();
  const tour = useGuidedTour({ hasSelection, canResolveAnchor: () => true });
  return (
    <div>
      <button type="button" data-testid="test-start" onClick={tour.start}>
        start
      </button>
      <div ref={ref} data-testid="test-canvas-anchor" />
      <GuidedTourOverlay tour={tour} canvasAnchorRef={ref} />
    </div>
  );
}

afterEach(() => {
  window.localStorage.removeItem(GUIDED_TOUR_STATUS_KEY);
  vi.useRealTimers();
});

beforeEach(() => {
  Object.defineProperty(window, "innerWidth", { writable: true, configurable: true, value: 1440 });
  Object.defineProperty(window, "innerHeight", { writable: true, configurable: true, value: 900 });
});

describe("GuidedTourOverlay", () => {
  it("renders nothing before start()", () => {
    render(<Harness />);
    expect(screen.queryByTestId("guided-tour-overlay")).not.toBeInTheDocument();
  });

  it("renders the welcome step with a full scrim (no cutout) and a blocking blocker", () => {
    render(<Harness />);
    act(() => screen.getByTestId("test-start").click());

    const overlay = screen.getByTestId("guided-tour-overlay");
    expect(overlay).toHaveAttribute("data-tour-step", "welcome");
    expect(screen.getByTestId("guided-tour-scrim")).toBeInTheDocument();
    expect(screen.queryByTestId("guided-tour-cutout")).not.toBeInTheDocument();
    expect(screen.getByTestId("guided-tour-blocker")).toHaveAttribute("data-blocking", "true");
  });

  it("moves focus into the dialog card on open and restores it to the trigger on skip", () => {
    render(<Harness />);
    const startBtn = screen.getByTestId("test-start");
    act(() => {
      startBtn.focus();
      startBtn.click();
    });
    expect(document.activeElement).toBe(screen.getByTestId("guided-tour-card"));

    act(() => screen.getByTestId("guided-tour-skip").click());
    expect(screen.queryByTestId("guided-tour-overlay")).not.toBeInTheDocument();
    expect(document.activeElement).toBe(startBtn);
  });

  it("shows progress dots matching visibleSteps.length, one active", () => {
    render(<Harness />);
    act(() => screen.getByTestId("test-start").click());

    const dots = screen.getAllByTestId("guided-tour-dot");
    expect(dots.length).toBeGreaterThan(0);
    const active = dots.filter((d) => d.getAttribute("data-active") === "true");
    expect(active).toHaveLength(1);
  });

  it("keeps a FULL blocking blocker on the interactive step while the canvas anchor hole is unresolved", () => {
    // jsdom 의 앵커 프로브는 0-크기 → 구멍 해석 불가 → 전면 차단 폴백 유지
    // (2026-07-23 Guardian 정정 — 구 계약의 전면 pointer-events-none 은 투어
    // 위로 다른 transient 표면을 쌓을 수 있었다).
    render(<Harness />);
    act(() => screen.getByTestId("test-start").click());
    // advance welcome -> nodes -> relations -> try-click
    act(() => screen.getByTestId("guided-tour-next").click());
    act(() => screen.getByTestId("guided-tour-next").click());
    act(() => screen.getByTestId("guided-tour-next").click());

    const overlay = screen.getByTestId("guided-tour-overlay");
    expect(overlay).toHaveAttribute("data-tour-step", "try-click");
    expect(screen.getByTestId("guided-tour-blocker")).toHaveAttribute("data-blocking", "true");
    expect(screen.queryAllByTestId("guided-tour-blocker-strip")).toHaveLength(0);
    expect(screen.getByTestId("guided-tour-waiting")).toBeInTheDocument();
  });

  it("swaps to a 4-strip funnel blocker + circular cutout once the canvas anchor hole resolves", () => {
    vi.useFakeTimers();
    render(<Harness />);
    act(() => screen.getByTestId("test-start").click());
    act(() => screen.getByTestId("guided-tour-next").click());
    act(() => screen.getByTestId("guided-tour-next").click());
    act(() => screen.getByTestId("guided-tour-next").click());
    expect(screen.getByTestId("guided-tour-overlay")).toHaveAttribute("data-tour-step", "try-click");

    // 앵커 프로브가 실제 원 rect 를 갖게 스텁 → 다음 프레임 tick 이 읽는다.
    const probe = screen.getByTestId("test-canvas-anchor");
    probe.getBoundingClientRect = () =>
      ({ top: 400, left: 700, width: 48, height: 48, right: 748, bottom: 448, x: 700, y: 400, toJSON: () => ({}) }) as DOMRect;
    act(() => {
      vi.advanceTimersToNextFrame();
      vi.advanceTimersToNextFrame();
    });

    const strips = screen.getAllByTestId("guided-tour-blocker-strip");
    expect(strips).toHaveLength(4);
    expect(screen.queryByTestId("guided-tour-blocker")).not.toBeInTheDocument();
    const cutout = screen.getByTestId("guided-tour-cutout");
    expect(cutout).toHaveAttribute("data-cutout-shape", "circle");
    // 구멍 위 스트립 높이 = 컷아웃 top (컷아웃 bbox 만 클릭 통과).
    expect(strips[0].style.height).toBe("400px");
  });

  it("applies the reduced-motion utility class to the scrim and cutout so transitions are removed for those users", () => {
    render(<Harness />);
    act(() => screen.getByTestId("test-start").click());
    expect(screen.getByTestId("guided-tour-scrim").className).toContain("motion-reduce:transition-none");
  });
});
