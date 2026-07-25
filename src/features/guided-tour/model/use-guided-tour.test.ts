import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useGuidedTour } from "./use-guided-tour";
import { GUIDED_TOUR_STATUS_KEY } from "./tour-storage";
import type { TourAnchor } from "./tour-steps";

const TEST_KEY = "guided-tour:v1:test";

afterEach(() => {
  window.localStorage.removeItem(TEST_KEY);
  window.localStorage.removeItem(GUIDED_TOUR_STATUS_KEY);
});

function setup(hasSelection = false) {
  return renderHook(
    ({ hasSelection: sel }: { hasSelection: boolean }) =>
      useGuidedTour({
        hasSelection: sel,
        canResolveAnchor: () => true,
        storageKey: TEST_KEY,
      }),
    { initialProps: { hasSelection } },
  );
}

describe("useGuidedTour", () => {
  it("starts closed, and start() opens on the welcome step", () => {
    const { result } = setup();
    expect(result.current.open).toBe(false);

    act(() => result.current.start());
    expect(result.current.open).toBe(true);
    expect(result.current.step?.id).toBe("welcome");
    expect(result.current.stepIndex).toBe(0);
  });

  it("advance() moves forward through the linear steps", () => {
    const { result } = setup();
    act(() => result.current.start());
    act(() => result.current.advance());
    expect(result.current.step?.id).toBe("nodes");
    act(() => result.current.advance());
    expect(result.current.step?.id).toBe("relations");
  });

  it("back() moves backward and is a no-op at the first step", () => {
    const { result } = setup();
    act(() => result.current.start());
    act(() => result.current.advance());
    expect(result.current.step?.id).toBe("nodes");
    act(() => result.current.back());
    expect(result.current.step?.id).toBe("welcome");
    act(() => result.current.back());
    expect(result.current.step?.id).toBe("welcome");
  });

  it("skip() ends the tour and records 'skipped'", () => {
    const { result } = setup();
    act(() => result.current.start());
    act(() => result.current.skip());
    expect(result.current.open).toBe(false);
    expect(window.localStorage.getItem(TEST_KEY)).toBe("skipped");
  });

  // 2026-07-23 최종 스윕 P2 — 앵커 해석 가능 여부가 순간마다 바뀌어도(선택 중
  // 유틸리티 레인 접힘 → recent 증발) 진행 표시 분모는 페르소나 고정 여정
  // (비개발 7) 그대로여야 한다. "5/5" 다음이 "5/6" 이 되는 요동 회귀 차단.
  it("keeps the display denominator (personaSteps) fixed while anchor resolvability fluctuates", () => {
    let resolvable = true;
    const { result, rerender } = renderHook(
      ({ hasSelection: sel }: { hasSelection: boolean }) =>
        useGuidedTour({
          hasSelection: sel,
          canResolveAnchor: () => resolvable,
          storageKey: TEST_KEY,
        }),
      { initialProps: { hasSelection: false } },
    );
    act(() => result.current.start());
    expect(result.current.personaSteps).toHaveLength(7);
    expect(result.current.personaStepIndex).toBe(0);

    // recent/relations 등 testid 앵커가 일시적으로 전부 해석 불가가 돼도
    // (visibleSteps 는 줄어들지만) 표시 여정은 7 그대로.
    resolvable = false;
    rerender({ hasSelection: true });
    expect(result.current.visibleSteps.length).toBeLessThan(7);
    expect(result.current.personaSteps).toHaveLength(7);

    // dev 분기 시에만 8 로 — 사용자가 명시적으로 한 단계를 더 선택한 경우다.
    resolvable = true;
    rerender({ hasSelection: true });
    act(() => result.current.chooseDevBranch());
    expect(result.current.personaSteps).toHaveLength(8);
    expect(result.current.step?.id).toBe("agent");
    expect(result.current.personaStepIndex).toBe(7);
  });

  it("datasheet only appears in visibleSteps once a selection exists", () => {
    const { result, rerender } = setup(false);
    act(() => result.current.start());
    expect(result.current.visibleSteps.map((s) => s.id)).not.toContain("datasheet");

    rerender({ hasSelection: true });
    expect(result.current.visibleSteps.map((s) => s.id)).toContain("datasheet");
  });

  it("auto-advances off try-click the moment a selection appears (false→true transition)", async () => {
    const { result, rerender } = setup(false);
    act(() => result.current.start());
    act(() => result.current.advance()); // welcome -> nodes
    act(() => result.current.advance()); // nodes -> relations
    act(() => result.current.advance()); // relations -> try-click
    expect(result.current.step?.id).toBe("try-click");

    rerender({ hasSelection: true });
    await waitFor(() => {
      expect(result.current.step?.id).toBe("datasheet");
    });
  });

  it("still reaches the datasheet step when its DOM anchor only resolves after the commit that flips hasSelection (commit-race regression)", async () => {
    // Regression: React finishes the render that flips `hasSelection` BEFORE
    // committing the new DOM (the datasheet panel mounts in that same
    // commit). The `visibleSteps` memo evaluated during that render still
    // sees the OLD DOM (no panel yet), so if the auto-advance effect used
    // that stale memo it would skip straight past "datasheet". Model the
    // pre-commit/post-commit gap explicitly with a resolver flag that only
    // flips true right after the `hasSelection` rerender.
    let panelMounted = false;
    const canResolveAnchor = (anchor: TourAnchor) => {
      if (anchor && anchor.type === "testid" && anchor.value === "topology-v2-detail-panel") {
        return panelMounted;
      }
      return true;
    };
    const { result, rerender } = renderHook(
      ({ hasSelection }: { hasSelection: boolean }) =>
        useGuidedTour({ hasSelection, canResolveAnchor, storageKey: TEST_KEY }),
      { initialProps: { hasSelection: false } },
    );
    act(() => result.current.start());
    act(() => result.current.advance()); // welcome -> nodes
    act(() => result.current.advance()); // nodes -> relations
    act(() => result.current.advance()); // relations -> try-click
    expect(result.current.step?.id).toBe("try-click");

    // The render that flips hasSelection happens with the panel NOT yet
    // resolvable (pre-commit) — then the "commit" lands right after.
    rerender({ hasSelection: true });
    panelMounted = true;

    await waitFor(() => {
      expect(result.current.step?.id).toBe("datasheet");
    });
  });

  it("does not auto-advance when a selection already existed before opening the tour", () => {
    const { result } = setup(true);
    act(() => result.current.start());
    act(() => result.current.advance()); // welcome -> nodes
    act(() => result.current.advance()); // nodes -> relations
    act(() => result.current.advance()); // relations -> try-click
    expect(result.current.step?.id).toBe("try-click");
    // hasSelection stayed true the whole time (no false->true transition) — no auto-advance.
    expect(result.current.step?.id).toBe("try-click");
  });

  it("calls onLeaveDatasheet exactly once when advancing past the datasheet step, not on other transitions", async () => {
    // Regression: leaving a real node selection open while the tour moved on
    // to "index"/"recent" made the map's node-focus mode collapse the
    // utility lane (including the spotlight toggle 7th step anchors), making
    // the "recent" step — and the dev-branch step behind it — permanently
    // unreachable. `onLeaveDatasheet` is the hook's way of asking the host
    // to release the selection at exactly the right moment.
    const onLeaveDatasheet = vi.fn();
    const { result, rerender } = renderHook(
      ({ hasSelection }: { hasSelection: boolean }) =>
        useGuidedTour({
          hasSelection,
          canResolveAnchor: () => true,
          storageKey: TEST_KEY,
          onLeaveDatasheet,
        }),
      { initialProps: { hasSelection: false } },
    );
    act(() => result.current.start());
    act(() => result.current.advance()); // welcome -> nodes
    act(() => result.current.advance()); // nodes -> relations
    act(() => result.current.advance()); // relations -> try-click
    expect(onLeaveDatasheet).not.toHaveBeenCalled();

    rerender({ hasSelection: true }); // simulates the click — auto-advances to datasheet
    await waitFor(() => {
      expect(result.current.step?.id).toBe("datasheet");
    });
    expect(onLeaveDatasheet).not.toHaveBeenCalled();

    act(() => result.current.advance()); // requests the host release the selection
    expect(onLeaveDatasheet).toHaveBeenCalledTimes(1);
    // Still on datasheet — the transition waits for `hasSelection` to
    // actually settle false (mirrors how HomePage's `handleClose` flows
    // back through a prop, not synchronously inside the callback).
    expect(result.current.step?.id).toBe("datasheet");

    // The host (HomePage, in production) reacts to onLeaveDatasheet by
    // clearing the selection, which flows back in as `hasSelection: false`.
    rerender({ hasSelection: false });
    await waitFor(() => {
      expect(result.current.step?.id).toBe("index");
    });
    expect(onLeaveDatasheet).toHaveBeenCalledTimes(1);

    act(() => result.current.advance()); // index -> recent
    expect(onLeaveDatasheet).toHaveBeenCalledTimes(1);
  });

  it("chooseDevBranch() jumps to the 'agent' step and includes it in persona:'dev'", () => {
    const { result } = setup(true);
    act(() => result.current.start());
    act(() => result.current.chooseDevBranch());
    expect(result.current.persona).toBe("dev");
    expect(result.current.step?.id).toBe("agent");
    expect(result.current.visibleSteps.map((s) => s.id)).toContain("agent");
  });

  it("reports devBranchAvailable=false and finishes as 'done' (not a welcome reset) when the agent anchor can't resolve", () => {
    // 2026-07-23 Guardian 실측 회귀 가드 — 첫 실행 카드(`first-run-starter`)를
    // 이미 dismiss 한 사용자: "저는 개발자예요 →" 가 해석 불가 stepId 로
    // 점프해 첫 단계(welcome)로 조용히 리셋되는 루프가 있었다.
    const { result } = renderHook(() =>
      useGuidedTour({
        hasSelection: true,
        canResolveAnchor: (anchor: TourAnchor) =>
          !(anchor?.type === "testid" && anchor.value === "first-run-starter"),
        storageKey: TEST_KEY,
      }),
    );
    act(() => result.current.start());
    expect(result.current.devBranchAvailable).toBe(false);

    act(() => result.current.chooseDevBranch());
    expect(result.current.open).toBe(false);
    expect(window.localStorage.getItem(TEST_KEY)).toBe("done");
  });

  it("finishAsDone() closes the tour and records 'done'", () => {
    const { result } = setup(true);
    act(() => result.current.start());
    act(() => result.current.chooseDevBranch());
    act(() => result.current.finishAsDone());
    expect(result.current.open).toBe(false);
    expect(window.localStorage.getItem(TEST_KEY)).toBe("done");
  });

  it("advancing past the last visible step finishes the tour as 'done'", () => {
    const { result } = setup(true);
    act(() => result.current.start());
    // walk to the very last linear step (recent) — 7 steps once selection exists
    // (welcome, nodes, relations, try-click, datasheet, index, recent)
    for (let i = 0; i < 6; i += 1) {
      act(() => result.current.advance());
    }
    expect(result.current.step?.id).toBe("recent");
    act(() => result.current.advance());
    expect(result.current.open).toBe(false);
    expect(window.localStorage.getItem(TEST_KEY)).toBe("done");
  });
});

/**
 * 목적지 안내(문서함·공방 등)는 **같은 상태기계**에 스텝 배열만 갈아 끼운다 —
 * 두 번째 가이드 체계를 만들지 않았다는 것을 이 테스트가 고정한다.
 */
describe("useGuidedTour — 주입된 스텝 배열", () => {
  const DEST_KEY = "guided-tour:docs:v1:test";
  const steps = [
    { id: "a", anchor: null, persona: "all", copyKey: "a" },
    { id: "b", anchor: null, persona: "all", copyKey: "b" },
  ] as const;

  afterEach(() => window.localStorage.removeItem(DEST_KEY));

  function setupDestination() {
    return renderHook(() =>
      useGuidedTour({
        steps,
        hasSelection: false,
        canResolveAnchor: () => true,
        storageKey: DEST_KEY,
      }),
    );
  }

  it("지도 여정 대신 주입된 배열을 밟는다", () => {
    const { result } = setupDestination();
    act(() => result.current.start());
    expect(result.current.step?.id).toBe("a");
    expect(result.current.personaSteps).toHaveLength(2);
    act(() => result.current.advance());
    expect(result.current.step?.id).toBe("b");
  });

  it("마지막 장에서 진행하면 그 목적지 키에만 '봤음'이 기록된다", () => {
    const { result } = setupDestination();
    act(() => result.current.start());
    act(() => result.current.advance());
    act(() => result.current.advance());
    expect(result.current.open).toBe(false);
    expect(window.localStorage.getItem(DEST_KEY)).toBe("done");
    expect(window.localStorage.getItem(GUIDED_TOUR_STATUS_KEY)).toBeNull();
  });
});
