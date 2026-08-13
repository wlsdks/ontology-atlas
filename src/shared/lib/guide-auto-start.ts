import { useCallback, useSyncExternalStore } from "react";

/**
 * 화면 안내를 **자동으로** 띄울지 — 전역 스위치.
 *
 * ## 왜 필요한가 (소유자 실보고 2026-07-29)
 *
 * *"매번 나오는건 좀 그렇긴한데.. 처음만 나오면 되거든? 아니면 클릭했을때나"*.
 *
 * 각 안내는 이미 화면당 한 번만 뜬다(`guided-tour:<destination>:v1`). 그런데
 * 안내가 **여섯 개**다 — 지도 하나 + 목적지 다섯(문서함·공방·인사이트·프로젝트·
 * 기록). 화면을 옮길 때마다 그 화면의 첫 안내가 뜨므로, 사용자에게는 "처음 한
 * 번"이 아니라 **매번**으로 느껴진다. 여섯이 각자 정직하게 동작하는데 합이
 * 성가신 것이라, 개별 키를 고쳐서는 못 고친다.
 *
 * 그래서 축을 하나 더 만든다: **자동으로 뜨느냐**. 끄면 어디서도 저절로 뜨지
 * 않고, 나침반 타일과 설정 › 다시 보기로는 **여전히 열린다** — 소유자가 말한
 * "아니면 클릭했을때나" 가 이 상태다. 안내를 지우는 게 아니라 **부를 때만
 * 오게** 하는 것이다.
 *
 * ## 기본값은 끔 (2026-08-13 소유자 확정 — 2026-07-29 의 「기본 켬」을 뒤집음)
 *
 * *"이런거 이제 안나오게 안되나? 맨날 나와서 불편한데.. 가이드는 기본적으로
 * 설정에서 off해놓는건 어떤지? 필요한 사람만 키도록.."* — 전역 스위치를 만든
 * 뒤에도 「매번 나온다」는 실보고가 다시 왔다. 처음 오는 사람의 설명 경로는
 * 나침반 타일과 설정 › 다시 보기가 맡는다. 명시적으로 켠 저장값("1")은
 * 그대로 존중된다.
 */

const GUIDE_AUTO_START_KEY = "ontology-atlas:guide-auto-start:v1";

/** 같은 탭 구독자에게 알리는 커스텀 이벤트(cross-tab 은 `storage`). */
const GUIDE_AUTO_START_EVENT = "ontology-atlas:guide-auto-start-change";

export const DEFAULT_GUIDE_AUTO_START = false;

/**
 * 저장값 → 불리언. 순수 함수 — 명시적 선택("1" 켬 · "0" 끔)만 존중하고
 * 모르는 값·빈 값은 기본값(끔)이다. 기본을 끔으로 뒤집을 때 켜 둔 사람의
 * "1" 은 그대로 살아남는다.
 */
export function resolveGuideAutoStart(saved: string | null): boolean {
  if (saved === "1") return true;
  if (saved === "0") return false;
  return DEFAULT_GUIDE_AUTO_START;
}

export function readGuideAutoStart(): boolean {
  if (typeof window === "undefined") return DEFAULT_GUIDE_AUTO_START;
  try {
    return resolveGuideAutoStart(window.localStorage.getItem(GUIDE_AUTO_START_KEY));
  } catch {
    return DEFAULT_GUIDE_AUTO_START;
  }
}

export function writeGuideAutoStart(value: boolean): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(GUIDE_AUTO_START_KEY, value ? "1" : "0");
  } catch {
    /* private mode — 세션 내 이벤트만으로도 라이브 갱신은 된다 */
  }
  window.dispatchEvent(new CustomEvent(GUIDE_AUTO_START_EVENT));
}

function subscribe(onChange: () => void): () => void {
  if (typeof window === "undefined") return () => undefined;
  window.addEventListener(GUIDE_AUTO_START_EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(GUIDE_AUTO_START_EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

export function useGuideAutoStart(): boolean {
  const getSnapshot = useCallback(() => readGuideAutoStart(), []);
  const getServerSnapshot = useCallback(() => DEFAULT_GUIDE_AUTO_START, []);
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
