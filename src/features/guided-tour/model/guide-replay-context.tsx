"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

/**
 * "이 화면 안내 다시 보기" 배선.
 *
 * 안내는 한 번 보면 다시 안 뜨는 게 맞지만(방해 금지), 다시 볼 길이 아예 없으면
 * 그건 한 번 지나가면 사라지는 정보다. 지도는 우상단 나침반 타일이 그 역할을
 * 하는데 나머지 목적지에는 그런 상시 크롬이 없다 — 화면마다 도움말 버튼을
 * 새로 만들면 화면별로 아이콘 수가 달라지는 결함(`#65` 계열)이 재발한다.
 *
 * 그래서 재진입은 **모든 화면에 이미 있는 설정 메뉴 한 곳**으로 모은다. 지금
 * 화면이 자기 안내를 여는 함수를 여기 등록하면, 설정 메뉴가 그 함수만 읽어
 * 행을 그린다(등록이 없으면 행 자체가 없다). 셸이 provider 를 소유하므로
 * 페이지는 등록만 하면 되고, provider 밖에서 렌더되는 설정 메뉴도 조용히
 * "등록 없음" 으로 떨어진다.
 */
interface GuideReplayValue {
  /** 지금 화면의 안내를 여는 함수 — 등록된 게 없으면 `null`. */
  replay: (() => void) | null;
  register: (fn: (() => void) | null) => void;
}

const GuideReplayContext = createContext<GuideReplayValue>({
  replay: null,
  register: () => {},
});

export function GuideReplayProvider({ children }: { children: ReactNode }) {
  const [replay, setReplay] = useState<(() => void) | null>(null);
  // setState 의 함수 인자는 updater 로 해석되므로 함수를 값으로 담을 땐 한 겹
  // 감싼다 — 안 그러면 등록한 함수가 즉시 실행돼 안내가 저절로 열린다.
  const register = useCallback((fn: (() => void) | null) => {
    setReplay(() => fn);
  }, []);
  const value = useMemo<GuideReplayValue>(() => ({ replay, register }), [replay, register]);
  return <GuideReplayContext.Provider value={value}>{children}</GuideReplayContext.Provider>;
}

/** 설정 메뉴가 읽는 쪽. */
export function useGuideReplay(): (() => void) | null {
  return useContext(GuideReplayContext).replay;
}

/**
 * 화면이 자기 안내를 등록하는 쪽. `fn` 은 매 렌더 새로 만들어져도 되게 ref 로
 * 미러하고, 등록되는 값은 언마운트까지 안정적인 래퍼 하나로 고정한다.
 */
export function useRegisterGuideReplay(fn: (() => void) | null): void {
  const { register } = useContext(GuideReplayContext);
  const latest = useRef(fn);
  useEffect(() => {
    latest.current = fn;
  }, [fn]);
  const enabled = fn !== null;
  useEffect(() => {
    if (!enabled) {
      register(null);
      return undefined;
    }
    register(() => latest.current?.());
    return () => register(null);
  }, [enabled, register]);
}
