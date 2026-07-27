"use client";

import { useEffect, useRef, useState } from "react";

/**
 * 표면이 **나가는 길**을 갖게 하는 presence 게이트 두 종.
 *
 * 왜 한 파일에 모으나: 세 표면(노드 데이터시트 · INDEX 슬롯 · 설정 시트)이
 * 같은 문제를 각자 풀고 있었고, 그중 둘은 아예 안 풀려 있었다. 지도 위
 * 표면의 **퇴장 창은 하나**여야 하고(`EXIT_WINDOW_MS`), 그 사실이 한 곳에
 * 적혀 있어야 다음 표면이 또 하드컷으로 태어나지 않는다.
 *
 * 이 창(140ms)은 **모션 값이 아니라 언마운트 타이머**다 — 실제 퇴장 시간은
 * CSS 가 소유한다(등장의 2/3 ≈ 120ms). 여유 20ms 는 타이머와 컴포지터가
 * 어긋나도 마지막 프레임이 잘리지 않게 하는 몫이다. 램프 토큰이 아니므로
 * `--motion-*` 을 여기서 읽지 않는다.
 */
export const EXIT_WINDOW_MS = 140;

/**
 * 하나의 표면이 열리고 닫히는 경우. `open` 이 꺼져도 퇴장 애니가 끝날 때까지
 * `mounted` 를 유지하고, 그 동안 `exiting` 으로 퇴장 클래스를 입힌다.
 */
export function usePanelPresence(
  open: boolean,
  exitMs: number = EXIT_WINDOW_MS,
): { mounted: boolean; exiting: boolean } {
  const [mounted, setMounted] = useState(open);
  const [exiting, setExiting] = useState(false);
  useEffect(() => {
    if (open) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- presence 게이트의 본질은 "React 상태를 타이머라는 외부 시스템과 동기화" 다. 렌더 중 파생으로 옮기면 퇴장 창이 사라져 표면이 다시 1프레임에 소멸한다(2026-07-28 실측: INDEX 패널 delta 13.25 @17ms).
      setMounted(true);
      setExiting(false);
      return;
    }
    // open=false: 즉시 언마운트 대신 퇴장 애니 창을 연다.
    setExiting(true);
    const id = setTimeout(() => {
      setMounted(false);
      setExiting(false);
    }, exitMs);
    return () => clearTimeout(id);
  }, [open, exitMs]);
  return { mounted, exiting };
}

/**
 * 같은 자리를 두 표면이 **번갈아 쓰는 교체**. 위와 다른 점은 나가는 표면과
 * 들어오는 표면이 **동시에** 존재해야 크로스페이드가 성립한다는 것이다.
 *
 * 왜 필요한가 (2026-07-28 프레임 실측): INDEX 접기에서 사용자가 누른 목적물
 * (폭 300px, 뷰포트의 23%)이 `animation: none · opacity 1` 인 채 1프레임에
 * 사라지고(delta 13.25 @17ms), 결과일 뿐인 지도가 217ms 이징을 받았다. 도착
 * 표면만 등장 문법을 입고 있었고 떠나는 표면에는 아무것도 없었다 — 헌장
 * 판정식① "winner 가 하드컷인데 배경이 이징이면 결함" 그대로다.
 *
 * `leaving` 은 직전 값을 퇴장 창 동안 붙들어 둔다. 소비처는 두 프레임을 같은
 * 슬롯에 겹쳐 그리고, 나가는 쪽에 `inert` + `pointer-events-none` 을 준다.
 */
export function useSurfaceSwap<T>(
  current: T,
  exitMs: number = EXIT_WINDOW_MS,
): { leaving: T | null } {
  const [leaving, setLeaving] = useState<T | null>(null);
  const previousRef = useRef(current);
  useEffect(() => {
    if (previousRef.current === current) return;
    const previous = previousRef.current;
    previousRef.current = current;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 위 usePanelPresence 와 같은 이유. 교체가 **일어난 뒤에야** 직전 값을 알 수 있으므로 렌더 중에는 판정 자체가 불가능하다.
    setLeaving(previous);
    const id = setTimeout(() => setLeaving(null), exitMs);
    return () => clearTimeout(id);
  }, [current, exitMs]);
  return { leaving };
}
