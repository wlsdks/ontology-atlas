'use client';

import { createContext, useContext, useMemo, type ReactNode } from 'react';

import { useAppUpdate } from './use-app-update';
import type { UpdatePhase } from './update-state';

/**
 * 앱 갱신 상태 기계를 **앱 전체에서 한 벌만** 둔다.
 *
 * ## 왜 필요해졌나 (2026-08-20)
 *
 * 종전에는 `AppShell` 안의 토스트 한 곳만 이 훅을 썼다. 그런데 설정에
 * 「업데이트 확인」 버튼이 생기면서 소비처가 둘이 됐고, 각자 `useAppUpdate()`
 * 를 부르면 **상태 기계가 둘**이 된다 — 설정에서 「새 버전이 있어요」를 보는데
 * 토스트는 아무 말도 안 하거나, 하루 한 번 자동 확인 타이머가 두 번 돈다.
 *
 * 이 저장소가 값에 대해 정해 둔 것과 같은 규율이다: **같은 개념의 값을 두 곳에
 * 두고 둘 다 정답으로 삼지 않는다**(`forbidden.md`).
 *
 * ## 없는 곳에서는 어떻게 되나
 *
 * `null` 이 나온다. 소비처는 그때 **아무것도 그리지 않는다** — 없는 능력을
 * 있는 척하지 않는 것이 이 저장소의 강등 규율이고, 웹에서는 애초에
 * `useAppUpdate` 가 확인 자체를 안 한다.
 */
export interface AppUpdateValue {
  readonly phase: UpdatePhase;
  /** 사용자가 직접 눌렀다 — 하루 한 번 간격을 무시하고 지금 확인한다. */
  readonly checkNow: () => void;
  readonly install: () => void;
  readonly restart: () => void;
  readonly dismiss: () => void;
}

const AppUpdateContext = createContext<AppUpdateValue | null>(null);

export function AppUpdateProvider({ children }: { children: ReactNode }) {
  const { phase, check, install, restart, dismiss } = useAppUpdate();
  const value = useMemo<AppUpdateValue>(
    () => ({
      phase,
      checkNow: () => void check(true),
      install: () => void install(),
      restart: () => void restart(),
      dismiss,
    }),
    [phase, check, install, restart, dismiss],
  );
  return <AppUpdateContext.Provider value={value}>{children}</AppUpdateContext.Provider>;
}

/** 없으면 `null`. 소비처는 그때 아무것도 그리지 않는다. */
export function useAppUpdateContext(): AppUpdateValue | null {
  return useContext(AppUpdateContext);
}
