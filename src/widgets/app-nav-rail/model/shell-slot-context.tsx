"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

/**
 * perf/persistent-shell — AppNavRail이 `app/[locale]/layout.tsx`로 승격되며
 * (모든 라우트 이동에서 레일 DOM identity 유지, 콘텐츠 영역만 교체) 페이지별로
 * 달랐던 두 가지를 더는 prop 으로 직접 넘길 수 없다: (1) 지형도(HomePage)만
 * 꽂던 `settingsSlot` 게어, (2) 빌더(OntologyEditPage)의 fullscreen 레일 숨김.
 * 둘 다 "리프 페이지 state → 레이아웃에 상주하는 레일" 역방향 데이터 흐름이라
 * Context 로 해결한다 — 페이지는 훅으로 값을 등록만 하고, 레일은 그 값을
 * 그대로 렌더한다. 레일 컴포넌트 자체는 마운트/언마운트되지 않는다(hidden 은
 * CSS 로만 처리 — `AppNavRail`의 `hidden` prop 참고).
 */
interface NavRailShellState {
  settingsSlot: ReactNode | null;
  hidden: boolean;
}

interface NavRailShellContextValue extends NavRailShellState {
  setSettingsSlot: (slot: ReactNode | null) => void;
  setHidden: (hidden: boolean) => void;
}

const NavRailShellContext = createContext<NavRailShellContextValue | null>(null);

export function NavRailShellProvider({ children }: { children: ReactNode }) {
  const [settingsSlot, setSettingsSlot] = useState<ReactNode | null>(null);
  const [hidden, setHidden] = useState(false);

  const value = useMemo(
    () => ({ settingsSlot, hidden, setSettingsSlot, setHidden }),
    [settingsSlot, hidden],
  );

  return (
    <NavRailShellContext.Provider value={value}>
      {children}
    </NavRailShellContext.Provider>
  );
}

function useNavRailShellContext(): NavRailShellContextValue {
  const ctx = useContext(NavRailShellContext);
  if (!ctx) {
    throw new Error(
      "NavRailShellContext is missing — this hook must render under <NavRailShellProvider> (mounted once in app/[locale]/layout.tsx).",
    );
  }
  return ctx;
}

/** 레일 자신이 렌더할 현재 슬롯/hidden 값 — `AppShell` 내부에서만 사용. */
export function useNavRailShellValue(): NavRailShellState {
  const { settingsSlot, hidden } = useNavRailShellContext();
  return { settingsSlot, hidden };
}

/**
 * 페이지가 레일 하단에 자기 설정 UI(예: 지형도의 `TopologyV2SettingsGear`)를
 * 꽂을 때 쓴다. `slot`이 리렌더마다 새 객체여도 무방 — 실제 내용이 바뀔 때만
 * effect 가 다시 돈다는 보장은 없으니 호출 측에서 `useMemo`로 슬롯 자체를
 * 안정화하는 편이 불필요한 재등록을 줄인다. 언마운트 시 자동으로 비운다.
 */
export function useNavRailSettingsSlot(slot: ReactNode | null): void {
  const { setSettingsSlot } = useNavRailShellContext();
  useEffect(() => {
    setSettingsSlot(slot);
    return () => setSettingsSlot(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slot]);
}

/**
 * 페이지가 레일을 CSS 로만 숨길 때 쓴다(빌더 fullscreen). 레일은 언마운트되지
 * 않는다 — identity 유지가 이 승격의 핵심이라 unmount 는 회귀.
 */
export function useNavRailHidden(hidden: boolean): void {
  const { setHidden } = useNavRailShellContext();
  useEffect(() => {
    setHidden(hidden);
    return () => setHidden(false);
  }, [hidden, setHidden]);
}
