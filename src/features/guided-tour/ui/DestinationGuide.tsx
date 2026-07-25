"use client";

import { useCallback, useEffect, useMemo, useRef } from "react";
import { canAutoStartGuidedTour } from "../model/auto-start-guard";
import { useRegisterGuideReplay } from "../model/guide-replay-context";
import { resolveAnchorRect } from "../model/resolve-anchor-rect";
import {
  DESTINATION_TOURS,
  type DestinationTourId,
  type TourAnchor,
} from "../model/tour-steps";
import { destinationTourStatusKey, readGuidedTourStatus } from "../model/tour-storage";
import { useGuidedTour } from "../model/use-guided-tour";
import { GuidedTourOverlay } from "./GuidedTourOverlay";

export interface DestinationGuideProps {
  /** 지금 화면의 목적지. 지도(`map`)와 그 밖의 라우트는 `null` — 지도는 자기
   *  8단계 여정을 직접 소유한다. */
  destination: DestinationTourId | null;
}

const NO_STEPS = Object.freeze([]) as readonly never[];

/**
 * 문서함·공방·인사이트·프로젝트·기록의 첫 방문 안내.
 *
 * 지도가 쓰던 것과 **같은 투어 기제**(카드·스크림·컷아웃·진행 점·건너뛰기)를
 * 목적지별 스텝 배열만 갈아끼워 재사용한다. 셸에 상주하며 목적지가 바뀔 때
 * `key` 로 remount 되므로(=투어 상태 초기화) 이동 중 이전 화면의 카드가 남지
 * 않는다.
 *
 * 방해 금지 계약: 목적지마다 따로 "봤음"을 기록하고(`guided-tour:<id>:v1`),
 * 기록이 있으면 다시 자동으로 뜨지 않는다. 다시 보려면 설정 메뉴의 행.
 */
export function DestinationGuide({ destination }: DestinationGuideProps) {
  const steps = useMemo(
    () => (destination ? DESTINATION_TOURS[destination] : NO_STEPS),
    [destination],
  );
  const storageKey = destinationTourStatusKey(destination ?? "none");
  // 이 안내가 가리키는 요소들 — 자동 시작 가드가 "안내가 설명하려는 바로 그
  // 모달"(공방의 시작 선택 카드)을 차단 사유로 세지 않게 넘긴다.
  const anchorTestIds = useMemo(
    () =>
      steps
        .map((step) => (step.anchor?.type === "testid" ? step.anchor.value : null))
        .filter((value): value is string => value !== null),
    [steps],
  );

  // 목적지 안내는 DOM(testid) 앵커만 쓴다 — 캔버스 노드 앵커는 지도 전용.
  const canResolveAnchor = useCallback((anchor: TourAnchor) => {
    if (anchor === null) return true;
    if (anchor.type !== "testid") return false;
    return resolveAnchorRect(anchor.value) !== null;
  }, []);

  const tour = useGuidedTour({
    steps,
    hasSelection: false,
    canResolveAnchor,
    storageKey,
  });

  const start = tour.start;
  const startRef = useRef(start);
  useEffect(() => {
    startRef.current = start;
  }, [start]);

  useRegisterGuideReplay(destination ? () => startRef.current() : null);

  // 첫 방문 자동 시작. 지도(HomePage)와 같은 리듬 — 레이아웃이 앉은 뒤에 열고,
  // 그 순간 모달/차단 표면이 떠 있거나 문서 포커스가 나가 있으면(백그라운드 탭
  // 로드) 겹쳐 쏘지 않고 잠시 뒤 다시 본다.
  useEffect(() => {
    if (!destination) return undefined;
    if (readGuidedTourStatus(storageKey) !== null) return undefined;
    let timerId = 0;
    let attempts = 0;
    let fired = false;
    const tick = () => {
      if (fired) return;
      if (canAutoStartGuidedTour(document, anchorTestIds)) {
        fired = true;
        startRef.current();
        return;
      }
      attempts += 1;
      if (attempts < 6) timerId = window.setTimeout(tick, 1500);
    };
    timerId = window.setTimeout(tick, 700);
    return () => window.clearTimeout(timerId);
  }, [destination, storageKey, anchorTestIds]);

  // Esc 로 닫기 — 화면을 덮는 표면은 Esc 로 물러나야 한다. 지도는 자체 Esc
  // 래더가 투어를 포함하므로 여기서만 건다(이중 반응 방지). 닫힘은 '건너뛰기'
  // 와 같은 취급 — 다시 자동으로 뜨지 않는다.
  const open = tour.open;
  const skip = tour.skip;
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      skip();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, skip]);

  if (!destination) return null;
  return <GuidedTourOverlay tour={tour} />;
}
