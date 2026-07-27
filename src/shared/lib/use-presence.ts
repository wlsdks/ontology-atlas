"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";

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

/**
 * 표면이 바뀔 때 **상자가 튀지 않게** 한다.
 *
 * 실측(2026-07-28, 인사이트 탭 전환): 내용은 `--motion-fast` 크로스페이드로
 * 제대로 들어오는데(첫프레임 5.4% · 램프 ~120ms), 같은 프레임에 컨테이너 높이가
 * `878.5 → 605` **1프레임**에 바뀌고 문서 전체가 246px 튀었다. 크로스페이드가
 * **리플로우를 감싸지 못한** 것이다 — 글은 배어들고 상자는 튄다.
 *
 * 기법은 「목록 행 펼침」 계약과 같다: 교체 직후 이전 높이로 되돌려 놓고
 * 실측한 새 높이까지 한 스텝(`--motion-base`)으로 전이한 뒤, 끝나면 `auto` 로
 * 돌려준다. 레이아웃을 영구히 고정하지 않으므로 반응형/스크롤이 그대로다.
 *
 * `prefers-reduced-motion` 에서는 **걸지 않는다** — 높이는 흔들리는 축이고,
 * 감속 사용자에게 없애야 할 바로 그 축이다(내용 크로스페이드는 그대로 남아
 * "무엇이 바뀌었나" 는 계속 읽힌다).
 *
 * 새 duration/easing 값 0 — 램프 토큰을 인라인으로 참조만 한다.
 */
export function useSwapHeight<T>(token: T) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const fromHeightRef = useRef<number | null>(null);

  /**
   * 교체를 **일으키는 쪽**이 부른다 — 이전 높이는 DOM 이 바뀌기 전에만 잴 수
   * 있고, 그 시점을 아는 것은 상태를 바꾸는 핸들러뿐이다. effect 안에서 재면
   * 이미 새 레이아웃이라 늘 자기 자신에서 자기 자신으로 전이한다.
   */
  const capture = useCallback(() => {
    const host = hostRef.current;
    fromHeightRef.current = host ? host.getBoundingClientRect().height : null;
  }, []);

  useLayoutEffect(() => {
    const host = hostRef.current;
    const from = fromHeightRef.current;
    fromHeightRef.current = null;
    if (!host || from === null) return;
    const to = host.getBoundingClientRect().height;
    if (Math.abs(from - to) < 1) return;
    if (
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
    ) {
      return;
    }
    host.style.height = `${from}px`;
    // 강제 리플로우 — 이 한 줄이 없으면 브라우저가 두 대입을 합쳐 전이가 없다.
    void host.offsetHeight;
    host.style.transition = "height var(--motion-base) var(--motion-ease)";
    host.style.height = `${to}px`;
    let done = false;
    const settle = () => {
      if (done) return;
      done = true;
      host.style.height = "";
      host.style.transition = "";
      host.removeEventListener("transitionend", settle);
    };
    host.addEventListener("transitionend", settle);
    // 안전망: 전이가 중단되면(탭 연타·언마운트) 높이가 고정된 채 남는다.
    const id = setTimeout(settle, 400);
    return () => {
      clearTimeout(id);
      settle();
    };
  }, [token]);

  return { hostRef, capture };
}
