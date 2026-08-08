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
 * **0ms 짜리 일에 로딩 표시를 그리지 않는다.**
 *
 * 실측(2026-08-08, 소유자 제보 — *"회색선이 3개 생겼다가 사라지거든? 거의
 * 1초도 안걸려서 깜빡이다 사라져서"*): 문서함에서 문서를 바꿀 때 뷰어의 3줄
 * 스켈레톤이 **8.2~15.9ms**(중앙값 9.7ms) 동안 그려졌다 — 60Hz 한 프레임
 * (16.7ms) 안쪽이다. 8회 전환 전부에서 났다.
 *
 * 원인은 느린 로딩이 아니다. 부모가 `key={doc.slug}` 로 뷰어를 **리마운트**
 * 하므로 본문 상태가 매번 `null` 로 시작하고, 본문이 이미 메모리에 있어도
 * 프로미스는 다음 틱에 풀리므로 **최소 한 프레임은 스켈레톤이 이긴다.**
 * 즉 기다릴 것이 없는데 기다리라고 말하는 표시였다.
 *
 * 그래서 이 창이 지나기 전에 끝나는 일은 **아무것도 그리지 않는다.**
 *
 * 값의 근거: Nielsen(1993)의 0.1초 — 그 안에 끝나면 사람은 지연을 아예
 * 느끼지 않으므로 알릴 것이 없다. 여유 50ms 는 느린 프레임 두어 장에
 * 스켈레톤이 걸려 도로 깜빡이지 않게 하는 몫이고, 진짜 느린 읽기는 여전히
 * 「생각의 흐름이 끊긴다」는 1초 경계보다 훨씬 앞서 표시를 받는다.
 *
 * `EXIT_WINDOW_MS` 와 같은 부류다 — **모션 값이 아니라 마운트 타이머**라서
 * `--motion-*` 램프를 읽지 않는다.
 */
export const SKELETON_DELAY_MS = 150;

/**
 * `active` 가 이 창보다 오래 유지될 때만 `true` 가 된다. 먼저 끝나면 한 번도
 * `true` 가 되지 않으므로 화면에 아무것도 안 나타난다.
 */
export function useDelayedVisible(
  active: boolean,
  delayMs: number = SKELETON_DELAY_MS,
): boolean {
  const [elapsed, setElapsed] = useState(false);
  useEffect(() => {
    if (!active) return;
    const timer = setTimeout(() => setElapsed(true), delayMs);
    /*
     * 정리 단계에서 되돌린다 — effect 본문에서 동기로 state 를 바꾸면 렌더가
     * 연쇄된다(lint 가 경고한다). 그리고 `active` 를 곱해서 돌려주므로,
     * 되돌리기가 한 틱 늦어도 그 사이에 표시가 새지 않는다.
     */
    return () => {
      clearTimeout(timer);
      setElapsed(false);
    };
  }, [active, delayMs]);
  return active && elapsed;
}

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
    // 교체가 **일어난 뒤에야** 직전 값을 알 수 있다 — 렌더 중에는 판정 자체가
    // 불가능하다(위 `usePanelPresence` 와 같은 이유).
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

/**
 * 퇴장 창 동안 **직전 값을 붙든다.**
 *
 * ## 왜 필요한가
 *
 * `<Surface open={Boolean(model)}>` 로 감싸면 표면은 퇴장 창 동안 남는다. 그런데
 * **내용은 부모가 준다** — `model` 이 `null` 이 되는 순간 자식이 빈 채로 그려져,
 * 표면은 예쁘게 사라지는데 그 안이 텅 빈다. 등장/퇴장을 붙이려던 것이 오히려
 * 더 나쁜 화면이 된다.
 *
 * 그래서 값도 함께 붙들어야 한다. 이게 「부모의 렌더 게이트가 퇴장 창 동안 모델을
 * 붙들어야 해서 기계적이지 않다」의 정체이고, 그래서 훅으로 만든다 — 표면마다
 * 다시 발명하면 어느 하나는 틀린다.
 *
 * ## 왜 effect 가 아니라 렌더 중 조정인가
 *
 * `useEffect` 로 붙들면 **한 프레임 늦다** — 그 한 프레임 동안 자식이 `null` 을
 * 받아 깜빡인다. 렌더 중 `setState` 는 React 가 문서에서 권하는 «prop 이 바뀔 때
 * 상태 조정» 패턴이고, 화면에 칠하기 전에 즉시 다시 렌더하므로 깜빡임이 없다.
 * 조건이 있어야 무한 루프가 안 난다 — 아래 `value !== held` 가 그것이다.
 */
export function useHeldValue<T>(value: T | null | undefined, key?: string | number | null): T | null {
  /*
   * ★ **정체성이 아니라 키로 비교한다** (2026-08-03 실측으로 배웠다).
   *
   * 첫 판은 `value !== held` 로 비교했고, 지도 엣지 패널에 붙이자마자
   * **React #301(무한 재렌더)로 지도가 통째로 죽었다.** 원인은 소비처의 모델이
   * `useMemo` 인데 그 정체성이 매 렌더 새로 만들어진다는 것이었다 — 그러면
   * 렌더마다 `setState` 가 돌아 루프가 끝나지 않는다.
   *
   * 그래서 **키를 요구한다.** 객체를 붙들 때는 그 표면을 식별하는 **원시값**을
   * 함께 넘긴다(예: `` `${sourceId}→${targetId}` ``). 키가 없으면 값 자체를
   * 키로 쓰므로, **원시값이 아닌 값에는 키를 반드시 넘겨야 한다.**
   */
  const identity = key ?? (value as unknown as string | number | null | undefined) ?? null;
  const [state, setState] = useState<{ key: unknown; value: T | null }>({
    key: value == null ? null : identity,
    value: value ?? null,
  });
  if (value != null && identity !== state.key) {
    // 렌더 중 setState — React 가 즉시 재렌더하고 화면에는 한 번만 칠한다.
    setState({ key: identity, value });
  }
  return value ?? state.value;
}
