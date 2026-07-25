"use client";

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";

/**
 * 발자취(Atlas Git) 패널을 여는 **전역 의도** (#65).
 *
 * 패널 본체는 셸이 소유한다(`app/providers/NavRailGitTile`). 레일은 `lg:flex`
 * 라 `<lg` 에서 숨으므로, 그 폭에서는 지도의 크롬 타일이 같은 패널을 열어야
 * 한다 — 두 진입점이 각자 패널을 복제하지 않도록 "열려는 의도" 만 공유한다.
 * `AgentConnectLauncher` 와 같은 문법.
 *
 * shared 레이어에 두는 이유: 프로바이더는 app(셸)이, 소비자는 views(지도)가
 * 쓴다. FSD 는 views→app import 를 금지하므로 계약만 아래 레이어로 내린다.
 */
export interface AtlasGitLauncher {
  open: () => void;
  isOpen: boolean;
}

const AtlasGitLauncherContext = createContext<AtlasGitLauncher | null>(null);

/** 프로바이더 밖에서도 안전하게 no-op 으로 강등한다(테스트/격리 렌더). */
export function useAtlasGitLauncher(): AtlasGitLauncher {
  return useContext(AtlasGitLauncherContext) ?? { open: () => {}, isOpen: false };
}

export function AtlasGitLauncherProvider({
  children,
  renderPanel,
}: {
  children: ReactNode;
  /** 패널 렌더러 — 셸이 주입한다(패널 자체는 widget 이라 shared 가 모른다). */
  renderPanel: (args: { open: boolean; onClose: () => void }) => ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const value = useMemo<AtlasGitLauncher>(
    () => ({ open: () => setOpen(true), isOpen: open }),
    [open],
  );
  const onClose = useCallback(() => setOpen(false), []);
  return (
    <AtlasGitLauncherContext.Provider value={value}>
      {children}
      {renderPanel({ open, onClose })}
    </AtlasGitLauncherContext.Provider>
  );
}
