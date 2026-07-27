'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { isDesktopShell } from '@/shared/lib/desktop-shell';
import {
  DISMISSED_VERSION_KEY,
  LAST_CHECK_KEY,
  shouldCheckForUpdate,
  shouldSurfaceVersion,
  type UpdatePhase,
} from './update-state';

/**
 * 업데이터 런타임 배선.
 *
 * 판단은 전부 `update-state.ts` 의 순수 함수가 하고, 여기서는 그 판단을 Tauri
 * 플러그인과 `localStorage` 에 연결하기만 한다 — 정책이 부수효과와 섞이면
 * "언제 말을 거는가" 를 검사할 수 없게 된다.
 *
 * 플러그인은 **동적 import** 로 가져온다. 이 앱은 같은 정적 export 를 웹과
 * 데스크톱이 함께 쓰므로, 웹 번들에 데스크톱 전용 모듈이 들어가면 안 된다.
 */
export function useAppUpdate() {
  const [phase, setPhase] = useState<UpdatePhase>({ kind: 'idle' });
  // 설치는 한 번만. 사용자가 버튼을 두 번 누르면 두 번 내려받는다.
  const installing = useRef(false);

  const read = (key: string) => {
    try {
      return window.localStorage.getItem(key);
    } catch {
      // 프라이빗 모드 등에서 접근이 막히면 "기억이 없다" 로 취급한다 —
      // 기억을 못 하는 것이 갱신을 못 하는 것보다 낫다.
      return null;
    }
  };
  const write = (key: string, value: string) => {
    try {
      window.localStorage.setItem(key, value);
    } catch {
      /* 기억하지 못해도 갱신 자체는 계속된다 */
    }
  };

  const check = useCallback(async (manual = false) => {
    if (
      !shouldCheckForUpdate({
        isDesktop: isDesktopShell(),
        now: Date.now(),
        lastCheckedAt: Number(read(LAST_CHECK_KEY)) || null,
        manual,
      })
    ) {
      return;
    }

    setPhase({ kind: 'checking' });
    try {
      const { check: checkForUpdate } = await import('@tauri-apps/plugin-updater');
      const update = await checkForUpdate();
      write(LAST_CHECK_KEY, String(Date.now()));

      if (!update) {
        setPhase(manual ? { kind: 'current' } : { kind: 'idle' });
        return;
      }
      if (!manual && !shouldSurfaceVersion(update.version, read(DISMISSED_VERSION_KEY))) {
        setPhase({ kind: 'idle' });
        return;
      }
      setPhase({ kind: 'available', version: update.version, notes: update.body ?? null });
    } catch (error) {
      // 자동 확인의 실패는 조용히 넘긴다 — 네트워크가 없다는 이유로 사용자에게
      // 말을 걸 이유가 없다. 사용자가 직접 눌렀을 때만 실패를 보고한다.
      if (manual) {
        setPhase({ kind: 'failed', message: error instanceof Error ? error.message : String(error) });
      } else {
        setPhase({ kind: 'idle' });
      }
    }
  }, []);

  const install = useCallback(async () => {
    if (installing.current) return;
    installing.current = true;
    try {
      const { check: checkForUpdate } = await import('@tauri-apps/plugin-updater');
      const update = await checkForUpdate();
      if (!update) {
        setPhase({ kind: 'idle' });
        return;
      }

      let received = 0;
      let total: number | null = null;
      setPhase({ kind: 'downloading', version: update.version, received, total });

      await update.downloadAndInstall((event) => {
        if (event.event === 'Started') {
          total = event.data.contentLength ?? null;
        } else if (event.event === 'Progress') {
          received += event.data.chunkLength;
          setPhase({ kind: 'downloading', version: update.version, received, total });
        }
      });

      setPhase({ kind: 'ready', version: update.version });
    } catch (error) {
      setPhase({ kind: 'failed', message: error instanceof Error ? error.message : String(error) });
    } finally {
      installing.current = false;
    }
  }, []);

  const restart = useCallback(async () => {
    const { relaunch } = await import('@tauri-apps/plugin-process');
    await relaunch();
  }, []);

  const dismiss = useCallback(() => {
    setPhase((current) => {
      // 거절은 그 버전에 한해 기억한다. 다음 버전에는 다시 물어야 한다.
      if (current.kind === 'available') write(DISMISSED_VERSION_KEY, current.version);
      return { kind: 'idle' };
    });
  }, []);

  useEffect(() => {
    if (!isDesktopShell()) return;
    // 진입 직후가 아니라 한 박자 뒤에 확인한다 — 첫 화면이 뜨는 일과 경쟁하지
    // 않게 한다. 업데이트는 급한 적이 없다.
    const timer = window.setTimeout(() => void check(false), 4_000);
    return () => window.clearTimeout(timer);
  }, [check]);

  return { phase, check, install, restart, dismiss };
}
