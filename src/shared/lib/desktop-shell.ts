import { isTauriVaultRuntime } from './tauri-vault-fs';

/**
 * 데스크톱 셸 (설치된 macOS 앱, Tauri WebView) 여부 판정.
 *
 * 제품 정체성 분기 하나를 위해 존재한다: 설치 앱의 `/` 는 마케팅 랜딩이
 * 아니라 로컬 작업 진입(FirstRun)이어야 한다. 빌드 분리 없이 런타임에서
 * 한 번 분기 — 웹과 데스크톱은 같은 정적 export 를 쓴다.
 *
 * 판정은 `resolveDesktopShell` 순수 함수로 분리해 테스트 seam 을 확보한다.
 * SSR (window 없음) 에서는 항상 false — 웹 첫 HTML 은 데스크톱 분기를 타지
 * 않는다.
 */
export interface DesktopShellSignals {
  /** `typeof window !== 'undefined'` — SSR 이면 false. */
  hasWindow: boolean;
  /** 실제 Tauri invoke 브리지 존재 여부 (`isTauriVaultRuntime`). */
  tauriRuntime: boolean;
  /** dev 빌드 여부 — dev override 는 dev 빌드에서만 유효. */
  isDevBuild: boolean;
  /**
   * dev 전용 override 값 (`?shell=desktop` query 또는 localStorage
   * `dev:desktop-shell`). production 빌드에서는 무시된다 — 브라우저에서
   * FirstRun surface 를 검증/스크린샷하기 위한 seam 이지 기능 아님.
   */
  devOverride: string | null;
}

export function resolveDesktopShell(signals: DesktopShellSignals): boolean {
  if (!signals.hasWindow) return false;
  if (signals.tauriRuntime) return true;
  return signals.isDevBuild && signals.devOverride === 'desktop';
}

/** dev 전용 override 를 localStorage 에 둘 때 쓰는 키. */
export const DESKTOP_SHELL_DEV_OVERRIDE_KEY = 'dev:desktop-shell';

function readDevOverride(): string | null {
  try {
    const fromQuery = new URLSearchParams(window.location.search).get('shell');
    if (fromQuery) return fromQuery;
    return window.localStorage.getItem(DESKTOP_SHELL_DEV_OVERRIDE_KEY);
  } catch {
    return null;
  }
}

export function isDesktopShell(): boolean {
  const hasWindow = typeof window !== 'undefined';
  return resolveDesktopShell({
    hasWindow,
    tauriRuntime: hasWindow ? isTauriVaultRuntime() : false,
    isDevBuild: process.env.NODE_ENV !== 'production',
    devOverride: hasWindow ? readDevOverride() : null,
  });
}
