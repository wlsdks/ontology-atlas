"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

const AGENT_CONNECT_ROUTE_QUERY_KEY = "agentConnect";
const AGENT_CONNECT_TILE_SELECTOR = '[data-testid="app-nav-rail-agent-status"]';

/** 지형도 밖 타일 → 지형도 시트 열기 의도를 탐색 전환에도 남기는 URL 계약. */
export const AGENT_CONNECT_ROUTE_HREF = "/topology/?agentConnect=1";

/**
 * 지형도 도착 직후 전역 시트 열기 마커만 소비한다. 다른 지도 query/hash 는
 * 그대로 두고 history 만 정리해 뒤로가기와 공유 URL에 일회성 UI 상태가 남지
 * 않게 한다.
 */
export function consumeAgentConnectRouteIntent(): boolean {
  if (typeof window === "undefined") return false;
  const url = new URL(window.location.href);
  if (url.searchParams.get(AGENT_CONNECT_ROUTE_QUERY_KEY) !== "1") return false;
  url.searchParams.delete(AGENT_CONNECT_ROUTE_QUERY_KEY);
  window.history.replaceState(
    window.history.state,
    "",
    `${url.pathname}${url.search}${url.hash}`,
  );
  return true;
}

/**
 * 에이전트 연결 시트의 *전역 열기 의도*. LNB(AppNavRail)는 AppShell 상주라
 * 어느 페이지에서도 보이지만, 시트 본체(데이터 조립 + 렌더)는 지형도
 * (HomePage)가 소유한다 — 인계 브리프 텍스트가 지형도의 무거운 토폴로지
 * 분석 파생에 기대기 때문에 시트를 전역으로 hoist 하면 그 조립을 중복
 * 파생해야 한다(진실원 이중화 위험). 대신 "열려는 의도" 만 이 작은 컨텍스트로
 * 올린다:
 *
 * - AppShell 이 레일에 액션을 내려주고(레일↔레일 cross-widget import 회피),
 *   레일 클릭 → `open()` 으로 `wantOpen` 을 세운다.
 * - HomePage 는 `wantOpen` 을 구독해 자기 시트를 연다. 지형도 밖에서 눌렀다면
 *   AppShell 이 지형도로 이동시키고, 도착한 HomePage 가 여전히 살아있는(레이아웃
 *   상주) 이 컨텍스트의 `wantOpen=true` 를 보고 마운트 직후 연다. 일부
 *   static-export/WebView 전환이 provider state commit 보다 빨라지는 경우에는
 *   일회성 `agentConnect=1` marker 를 도착 화면이 소비해 같은 의도를 복구한다.
 * - `wantOpen` 은 레일 타일의 `aria-expanded` 진실원이기도 하다.
 */
interface AgentConnectLauncherValue {
  /** 시트를 열려는 전역 의도. 레일이 set, HomePage 가 소비. */
  wantOpen: boolean;
  /** 시트 열기 요청(레일·INDEX 푸터). */
  open: () => void;
  /** 시트가 닫힐 때 HomePage 가 호출 — 의도 리셋. */
  close: () => void;
}

const AgentConnectLauncherContext = createContext<AgentConnectLauncherValue | null>(null);

export function AgentConnectLauncherProvider({ children }: { children: ReactNode }) {
  const [wantOpen, setWantOpen] = useState(false);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const shouldRestoreFocusRef = useRef(false);
  const open = useCallback(() => {
    const active = document.activeElement;
    returnFocusRef.current =
      active instanceof HTMLElement &&
      active !== document.body &&
      active !== document.documentElement
        ? active
        : document.querySelector<HTMLElement>(AGENT_CONNECT_TILE_SELECTOR);
    shouldRestoreFocusRef.current = true;
    setWantOpen(true);
  }, []);
  const close = useCallback(() => {
    setWantOpen(false);
    if (!shouldRestoreFocusRef.current) return;
    shouldRestoreFocusRef.current = false;
    const preferredTarget = returnFocusRef.current;
    window.setTimeout(() => {
      const target = preferredTarget?.isConnected
        ? preferredTarget
        : document.querySelector<HTMLElement>(AGENT_CONNECT_TILE_SELECTOR);
      target?.focus({ preventScroll: true });
      returnFocusRef.current = null;
    }, 0);
  }, []);
  const value = useMemo<AgentConnectLauncherValue>(
    () => ({ wantOpen, open, close }),
    [wantOpen, open, close],
  );
  return (
    <AgentConnectLauncherContext.Provider value={value}>
      {children}
    </AgentConnectLauncherContext.Provider>
  );
}

export function useAgentConnectLauncher(): AgentConnectLauncherValue {
  const ctx = useContext(AgentConnectLauncherContext);
  if (!ctx) {
    throw new Error(
      "useAgentConnectLauncher must be used within <AgentConnectLauncherProvider> (mounted once in AppShell).",
    );
  }
  return ctx;
}
