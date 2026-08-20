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

    /*
     * ⚠️ **자동 확인은 「새 버전이 있다」일 때만 말한다** (2026-08-20 실측으로
     * 정정). 그 밖의 경우에는 상태를 **아예 건드리지 않는다.**
     *
     * 종전에는 자동 경로도 `checking` 과 `idle` 을 썼다. 그래서 사용자가
     * 「업데이트 확인」을 누른 직후 예약된 자동 확인이 발화하면, 방금 받은 답을
     * **조용히 지웠다** — 눌렀더니 뭔가 떴다가 아무 말 없이 사라지는 화면이 된다.
     *
     * 하필 **실패일 때만** 그랬다: 성공하면 `LAST_CHECK_KEY` 가 쓰여 자동 확인이
     * 간격에 걸려 건너뛰는데, 실패는 그 값을 안 쓰므로 자동 확인이 그대로 돈다.
     * 그리고 오늘 이 저장소의 엔드포인트는 정식 릴리스가 없어 **항상 실패**다 —
     * 즉 이 결함은 예외가 아니라 기본 경로였다.
     *
     * 이건 원래 의도이기도 하다. 토스트가 자기 문서에 적어 둔 그대로:
     * *"`checking` 단계는 그리지 않는다 … 결과가 「새 버전 있음」일 때 처음
     * 말을 건다."* 코드가 그 약속을 안 지키고 있었다.
     */
    if (manual) setPhase({ kind: 'checking' });
    try {
      const { check: checkForUpdate } = await import('@tauri-apps/plugin-updater');
      const update = await checkForUpdate();
      write(LAST_CHECK_KEY, String(Date.now()));

      if (!update) {
        if (manual) setPhase({ kind: 'current' });
        return;
      }
      if (!manual && !shouldSurfaceVersion(update.version, read(DISMISSED_VERSION_KEY))) {
        // 이미 거절한 버전이다. 조용히 넘어가되 **화면은 그대로 둔다.**
        return;
      }
      setPhase({ kind: 'available', version: update.version, notes: update.body ?? null });
    } catch (error) {
      // 자동 확인의 실패는 조용히 넘긴다 — 네트워크가 없다는 이유로 사용자에게
      // 말을 걸 이유가 없다. 사용자가 직접 눌렀을 때만 실패를 보고한다.
      // **「조용히」는 「지운다」가 아니다** — 위 주석의 결함이 그 혼동이었다.
      if (manual) {
        setPhase({ kind: 'failed', message: error instanceof Error ? error.message : String(error) });
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
