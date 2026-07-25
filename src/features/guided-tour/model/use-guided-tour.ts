import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  computeVisibleSteps,
  TOUR_STEPS,
  type TourAnchor,
  type TourPersona,
  type TourStep,
} from "./tour-steps";
import {
  GUIDED_TOUR_STATUS_KEY,
  writeGuidedTourStatus,
  type GuidedTourStatus,
} from "./tour-storage";

export interface UseGuidedTourArgs {
  /**
   * 이 투어가 밟을 단계 배열. 기본값은 지도의 8단계 여정(`TOUR_STEPS`) —
   * 목적지 안내(문서함·공방·인사이트·프로젝트·기록)는 `DESTINATION_TOURS[id]`
   * 를 넣어 **같은 상태기계**를 재사용한다(가이드 체계는 하나뿐이다). 아래
   * 지도 전용 분기(`datasheet` 이탈 · `try-click` 자동 진행 · `agent` 개발자
   * 분기)는 전부 step id 로 갈리므로 다른 배열에서는 조용히 지나간다.
   */
  steps?: readonly TourStep[];
  /** 지도에서 지금 노드가 선택돼 있는가 (`canvasSelectedSlug != null`). */
  hasSelection: boolean;
  /** testid/canvas-node 앵커가 지금 해석 가능한가 — HomePage 가 DOM/그래프
   *  상태로 판정해 내려준다(feature 는 위젯을 모른다). */
  canResolveAnchor: (anchor: TourAnchor) => boolean;
  /** localStorage 키 주입(테스트용). 기본 `guided-tour:v1`. */
  storageKey?: string;
  /**
   * 5단계(datasheet)를 떠날 때 한 번 호출된다(6단계 index 로 진행하든,
   * [건너뛰기]로 투어를 끝내든 상관없이 "더 이상 그 카드가 필요 없어진
   * 순간"). HomePage 가 노드 선택 해제(예: `handleClose`)를 넘긴다 —
   * 실측 회귀: 선택이 남아 있으면 지도가 "노드 포커스" 모드로 유틸리티
   * 레인(스포트라이트 토글 포함)을 접어, 7단계(recent) 앵커가 영구히
   * 해석 불가능해지고 8단계(dev 분기)가 아예 도달 불가능해졌다. 생략하면
   * 선택을 그대로 둔다(회귀 0 — 이전 동작 유지).
   */
  onLeaveDatasheet?: () => void;
}

export interface UseGuidedTourResult {
  open: boolean;
  persona: TourPersona;
  step: TourStep | null;
  stepIndex: number;
  visibleSteps: readonly TourStep[];
  /**
   * 진행 표시 전용 (2026-07-23 최종 스윕 P2 정정) — 페르소나 필터만 적용한
   * 전체 여정. `visibleSteps` 는 순간의 앵커 해석 가능 여부에 따라 길이가
   * 요동쳐(선택 중 유틸리티 레인 접힘 → recent 단계 증발 → "5/5" 다음이
   * "5/6") 진행률 신뢰를 깼다. 분모/진행 점은 이 고정 여정(비개발 7 · dev
   * 분기 8)으로 그리고, 내비게이션(스킵 규칙)은 계속 `visibleSteps` 를 쓴다 —
   * 스킵된 단계는 그냥 지나친 점으로 보인다.
   */
  personaSteps: readonly TourStep[];
  /** 현재 단계의 `personaSteps` 내 위치 (진행 점/N-of-M 표시용). */
  personaStepIndex: number;
  /** 지도 선택 상태 그대로 미러 — 카드가 4단계(try-click) 대기/성공 문구를
   *  고르는 데 쓴다(`GuidedTourCard`). */
  hasSelection: boolean;
  start: () => void;
  advance: () => void;
  back: () => void;
  /** 카드의 [건너뛰기] — 투어 전체를 'skipped' 로 종료. */
  skip: () => void;
  /** 7단계 "구경 끝 — 지도로" — 투어를 'done' 으로 종료. */
  finishAsDone: () => void;
  /** 7단계 "저는 개발자예요 →" — 8단계(dev 분기)로 진입. */
  chooseDevBranch: () => void;
  /**
   * 8단계(agent) 앵커가 지금 해석 가능한가 — false 면 카드가 dev 분기
   * 버튼 자체를 숨긴다 (2026-07-23 Guardian 실측 정정: 첫 실행 카드를 이미
   * dismiss 한 사용자에게 "저는 개발자예요 →" 가 해석 불가 stepId 로
   * 점프해 welcome 으로 조용히 리셋되는 루프가 있었다).
   */
  devBranchAvailable: boolean;
}

/**
 * 가이드 투어 상태기계. 선형 진행/역행/건너뛰기 + 4단계(try-click) 선택
 * 발생 시 자동 진행 + 7→8단계 개발자 분기. `visibleSteps` 는 스킵 규칙 적용
 * 후의 배열이라 진행 점 분모(N/M)가 곧 `visibleSteps.length`.
 */
export function useGuidedTour(args: UseGuidedTourArgs): UseGuidedTourResult {
  const {
    steps = TOUR_STEPS,
    hasSelection,
    canResolveAnchor,
    storageKey = GUIDED_TOUR_STATUS_KEY,
    onLeaveDatasheet,
  } = args;

  const [open, setOpen] = useState(false);
  const [persona, setPersona] = useState<TourPersona>("all");
  const [stepId, setStepId] = useState<string>(steps[0]?.id ?? "");
  // testid 앵커의 DOM 해석은 resize/레이아웃 변화에 따라 바뀔 수 있어 별도
  // tick 으로 재계산을 강제한다(persona/hasSelection 변화만으론 부족).
  const [resolveTick, setResolveTick] = useState(0);

  useEffect(() => {
    if (!open) return undefined;
    const bump = () => setResolveTick((t) => t + 1);
    window.addEventListener("resize", bump);
    return () => window.removeEventListener("resize", bump);
  }, [open]);

  // 선택 상태가 바뀌면(노드 클릭/해제 — `onLeaveDatasheet` 포함) 주변 크롬
  // (예: 유틸리티 레인의 스포트라이트 토글)이 다음 커밋에서 나타나거나
  // 사라진다. `visibleSteps` 는 이미 `hasSelection` 을 dep 으로 걸어 그
  // 렌더에서도 재계산되지만, 그 시점은 아직 이 커밋이 DOM에 반영되기
  // 전이라(§ 4단계 자동 진행 주석과 같은 race) 최신 상태를 못 읽을 수
  // 있다. 커밋+페인트가 끝난 다음 프레임에 한 번 더 재해석해 정착시킨다.
  useEffect(() => {
    if (!open) return undefined;
    const raf = window.requestAnimationFrame(() => setResolveTick((t) => t + 1));
    return () => window.cancelAnimationFrame(raf);
  }, [hasSelection, open]);

  const visibleSteps = useMemo(
    () =>
      computeVisibleSteps(steps, {
        persona,
        hasSelection,
        canResolveAnchor,
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- resolveTick은 DOM 재해석 트리거일 뿐 값을 안 읽는다
    [steps, persona, hasSelection, canResolveAnchor, resolveTick],
  );

  const stepIndex = visibleSteps.findIndex((s) => s.id === stepId);
  const step = stepIndex >= 0 ? visibleSteps[stepIndex] : (visibleSteps[0] ?? null);

  // 진행 표시 전용 고정 여정 — 위 인터페이스 주석 참조.
  const personaSteps = useMemo(
    () => steps.filter((s) => s.persona === "all" || s.persona === persona),
    [steps, persona],
  );
  const personaStepIndex = step ? personaSteps.findIndex((s) => s.id === step.id) : -1;

  // datasheet 이탈이 대기 중 — `onLeaveDatasheet` 가 선택을 지운 뒤
  // `hasSelection` 이 실제로 false 로 정착할 때까지 다음 단계 결정을
  // 미룬다(아래 별도 effect). 이 ref 는 그 사이 아래 "스킵 보정" effect가
  // 끼어들어 stepId 를 먼저 "welcome" 으로 되돌리는 경합을 막는 가드로도
  // 쓰인다(실측 회귀 — 두 effect 가 같은 hasSelection 전이에 동시에
  // 반응해 서로 다른 stepId 를 썼다).
  const pendingLeaveDatasheetRef = useRef(false);

  // 현재 단계가 스킵 규칙에 걸려 목록에서 빠지면(예: 5단계가 선택 실패로
  // 제외) 첫 번째 남은 단계로 보정한다. datasheet 이탈 처리가 대기 중이면
  // 그 전용 effect 가 다음 단계를 정할 때까지 이 보정을 양보한다.
  useEffect(() => {
    if (!open) return;
    if (pendingLeaveDatasheetRef.current) return;
    if (stepIndex < 0 && visibleSteps.length > 0 && visibleSteps[0].id !== stepId) {
      setStepId(visibleSteps[0].id);
    }
  }, [open, stepIndex, visibleSteps, stepId]);

  // 포커스 복원 (2026-07-23 Guardian 정정) — 카드가 매 단계 포커스를
  // 가져가므로(`GuidedTourCard`), 닫힐 때 투어를 연 트리거(우측 레일 Compass
  // 타일)로 돌려준다. 캡처는 start() 안에서 동기적으로 — effect 로 캡처하면
  // 자식(카드)의 focus effect 가 먼저 돌아 카드 자신이 캡처되는 오염이 있다.
  const restoreFocusElRef = useRef<HTMLElement | null>(null);

  const finish = useCallback(
    (status: GuidedTourStatus) => {
      writeGuidedTourStatus(status, storageKey);
      setOpen(false);
      const el = restoreFocusElRef.current;
      restoreFocusElRef.current = null;
      if (el && el.isConnected) el.focus({ preventScroll: true });
    },
    [storageKey],
  );

  const start = useCallback(() => {
    restoreFocusElRef.current =
      typeof document !== "undefined" && document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    setPersona("all");
    setStepId(steps[0]?.id ?? "");
    setResolveTick((t) => t + 1);
    setOpen(true);
  }, [steps]);

  const advance = useCallback(() => {
    if (stepIndex < 0) return;
    if (step?.id === "datasheet" && onLeaveDatasheet && hasSelection) {
      pendingLeaveDatasheetRef.current = true;
      onLeaveDatasheet();
      return;
    }
    const next = visibleSteps[stepIndex + 1];
    if (!next) {
      finish("done");
      return;
    }
    setStepId(next.id);
  }, [stepIndex, visibleSteps, step, onLeaveDatasheet, hasSelection, finish]);

  // datasheet 이탈 완결 — `hasSelection` 이 false 로 정착하면(= 위 콜백이
  // 요청한 선택 해제가 실제로 커밋됨) 그 순간의 DOM 을 다시 읽어 다음 단계를
  // 고른다. try-click 자동 진행과 같은 커밋-레이스 방지 패턴.
  useEffect(() => {
    if (!pendingLeaveDatasheetRef.current) return undefined;
    if (!open || hasSelection) return undefined;
    pendingLeaveDatasheetRef.current = false;
    let cancelled = false;
    window.queueMicrotask(() => {
      if (cancelled) return;
      const fresh = computeVisibleSteps(steps, {
        persona,
        hasSelection: false,
        canResolveAnchor,
      });
      const tryClickIdx = fresh.findIndex((s) => s.id === "try-click");
      const next = tryClickIdx >= 0 ? fresh[tryClickIdx + 1] : fresh[0];
      setResolveTick((t) => t + 1);
      if (next) {
        setStepId(next.id);
      } else {
        finish("done");
      }
    });
    return () => {
      cancelled = true;
    };
  }, [steps, hasSelection, open, persona, canResolveAnchor, finish]);

  const back = useCallback(() => {
    if (stepIndex <= 0) return;
    const prev = visibleSteps[stepIndex - 1];
    if (prev) setStepId(prev.id);
  }, [stepIndex, visibleSteps]);

  const skip = useCallback(() => {
    finish("skipped");
  }, [finish]);

  const finishAsDone = useCallback(() => {
    finish("done");
  }, [finish]);

  // 8단계(agent) 앵커 해석 가능 여부 — visibleSteps 와 같은 재해석 트리거
  // (resolveTick)를 공유해 DOM 변화(첫 실행 카드 dismiss 등)를 따라간다.
  const devBranchAvailable = useMemo(() => {
    const agentStep = steps.find((s) => s.id === "agent");
    if (!agentStep) return false;
    return agentStep.anchor === null ? true : canResolveAnchor(agentStep.anchor);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- resolveTick은 DOM 재해석 트리거일 뿐 값을 안 읽는다
  }, [steps, canResolveAnchor, resolveTick]);

  const chooseDevBranch = useCallback(() => {
    // 방어선 — 버튼이 숨겨지기 전의 stale 클릭이라도 welcome 리셋 루프 대신
    // 정상 종료("구경 끝"과 동일)로 수렴시킨다.
    const agentStep = steps.find((s) => s.id === "agent");
    const resolvable =
      agentStep !== undefined &&
      (agentStep.anchor === null || canResolveAnchor(agentStep.anchor));
    if (!resolvable) {
      finish("done");
      return;
    }
    setPersona("dev");
    setStepId("agent");
  }, [steps, canResolveAnchor, finish]);

  // 4단계(try-click) 자동 진행 — 실제 노드 클릭(hasSelection false→true 전환)
  // 을 기다렸다가 다음으로. `queueMicrotask` defer 는 `use-sample-node-hint.ts`
  // 의 동기 setState-cascade 회피 관례를 그대로 따른다.
  //
  // 커밋 레이스 주의 (2단계) — ① 클로저에 갇힌 `advance()`(= 이 렌더의
  // `visibleSteps`) 를 그대로 호출하면 안 된다: `hasSelection` 이 true 로
  // 바뀐 바로 그 렌더에서 `visibleSteps` useMemo 가 재계산될 때는 아직 이
  // 커밋이 DOM에 반영되기 전이라(React 는 render → commit → paint → effect
  // 순서), 5단계(datasheet) 앵커(`topology-v2-detail-panel`)가 아직 DOM에
  // 없어 `canResolveAnchor` 가 false 를 돌려주고 datasheet 가 통째로
  // 스킵된다(실측 회귀 — 4단계 클릭 직후 5단계 없이 7단계로 점프). effect 는
  // commit 이후에 실행되므로 이 microtask 안에서 `computeVisibleSteps` 를
  // **새로** 호출해 지금 DOM 을 다시 읽고 다음 단계를 고른다.
  // ② 그 새 결과로 `setStepId` 만 호출하면 또 다른 함정에 걸린다 — 이 훅
  // 자신의 `visibleSteps` useMemo 는 `[persona, hasSelection, ...,
  // resolveTick]` 이 안 바뀌면 방금 계산한 (datasheet 없는) 캐시를 그대로
  // 재사용하므로, 다음 렌더에서 `stepId="datasheet"` 를 그 캐시에서 못 찾아
  // -1 로 떨어지고 "첫 단계로 보정" 이펙트가 다시 welcome 으로 되돌린다.
  // 그래서 같은 microtask 안에서 `resolveTick` 도 같이 올려 memo 캐시를
  // 무효화한다 — `setStepId`/`setResolveTick` 은 배치돼 한 렌더에서 함께
  // 반영된다.
  const prevHasSelectionRef = useRef(hasSelection);
  useEffect(() => {
    const prev = prevHasSelectionRef.current;
    prevHasSelectionRef.current = hasSelection;
    if (!open) return undefined;
    if (step?.id !== "try-click") return undefined;
    if (prev || !hasSelection) return undefined;
    let cancelled = false;
    window.queueMicrotask(() => {
      if (cancelled) return;
      const fresh = computeVisibleSteps(steps, {
        persona,
        hasSelection: true,
        canResolveAnchor,
      });
      const idx = fresh.findIndex((s) => s.id === "try-click");
      const next = idx >= 0 ? fresh[idx + 1] : undefined;
      setResolveTick((t) => t + 1);
      if (next) {
        setStepId(next.id);
      } else {
        finish("done");
      }
    });
    return () => {
      cancelled = true;
    };
  }, [steps, hasSelection, open, step, persona, canResolveAnchor, finish]);

  // 투어를 새로 열 때는 그 이전 세션의 선택 여부를 기준선으로 다시 잡는다 —
  // 이미 선택된 노드가 있는 채로 열려도 "방금 클릭" 으로 오판해 4단계를
  // 건너뛰지 않게.
  useEffect(() => {
    if (open) prevHasSelectionRef.current = hasSelection;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- open 전이 시점만 캡처
  }, [open]);

  return {
    open,
    persona,
    step,
    stepIndex,
    visibleSteps,
    personaSteps,
    personaStepIndex,
    hasSelection,
    start,
    advance,
    back,
    skip,
    finishAsDone,
    chooseDevBranch,
    devBranchAvailable,
  };
}
