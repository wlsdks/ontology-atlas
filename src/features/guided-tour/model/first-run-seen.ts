import { DESTINATION_TOURS } from "./tour-steps";
import { destinationTourStatusKey } from "./tour-storage";

/**
 * "첫 방문 자동 표면을 이미 본 사용자" 의 localStorage 상태 — **단일 출처**.
 *
 * 지도와 다섯 목적지(문서함·공방·인사이트·프로젝트·기록)는 첫 방문에 스크림 +
 * 카드로 화면을 덮는 안내를 자동으로 띄운다. 의도된 동작이지만, 화면을 **재는**
 * 일(모션 프레임 실측·치수 감사·반응형 스윕)에서는 그 오버레이가 측정 대상을
 * 가리거나 클릭을 삼켜 감사 자체를 불가능하게 만든다.
 *
 * 키 목록을 손으로 적으면 목적지가 늘 때 조용히 썩으므로 `DESTINATION_TOURS`
 * 에서 직접 파생한다 — 안내를 추가하면 이 목록도 같이 는다.
 *
 * ## 왜 Playwright 밖에서도 닿아야 하나 (2026-07-28)
 *
 * 이 목록은 원래 `tests/e2e/first-run-seed.ts` 안에 살았고 `page.addInitScript`
 * 로만 쓸 수 있었다. 그래서 Playwright 가 아닌 감사 도구(chrome-devtools MCP ·
 * 앱 내장 브라우저 · 손으로 여는 세션)에서는 **매번 안내를 손으로 닫고** 재야
 * 했다. 닫는 동작 자체가 화면을 바꾸므로 "첫 프레임" 을 재는 모션 감사에서는
 * 그 방법이 아예 성립하지 않는다.
 *
 * 그래서 같은 목록에 URL 진입점을 준다 — `?guides=off`. 새 기제가 아니라
 * 같은 키를 같은 값으로 쓰는 두 번째 문이고, 목록이 하나라 드리프트가 없다.
 */
export const FIRST_RUN_SEEN_ENTRIES: readonly (readonly [string, string])[] = [
  // 폴더-우선 안내 시트 — 이 키만 '1' 을 읽는다.
  ["vault-open-guide:auto:v1", "1"],
  // 지도의 여러 단계 여정.
  ["guided-tour:v1", "done"],
  ...Object.keys(DESTINATION_TOURS).map(
    (id) => [destinationTourStatusKey(id), "done"] as const,
  ),
];

/** 감사 세션용 URL 스위치. 값은 둘뿐이고 그 외는 무시한다. */
export type GuideOverride = "off" | "reset";

/**
 * `?guides=` 파싱 — 순수 함수. 알 수 없는 값은 `null` 이라 오타가 조용히
 * 안내를 끄지 않는다.
 */
export function resolveGuideOverride(search: string): GuideOverride | null {
  let value: string | null = null;
  try {
    value = new URLSearchParams(search).get("guides");
  } catch {
    return null;
  }
  return value === "off" || value === "reset" ? value : null;
}

/** 모든 첫 방문 안내를 "이미 봤음" 으로 표시한다. */
export function applyFirstRunSeen(): void {
  if (typeof window === "undefined") return;
  for (const [key, value] of FIRST_RUN_SEEN_ENTRIES) {
    try {
      window.localStorage.setItem(key, value);
    } catch {
      /* private mode — skip */
    }
  }
}

/**
 * 첫 방문 상태로 되돌린다 — 안내 **자체**를 검수할 때 쓴다. 끄는 문만 있고
 * 켜는 문이 없으면 감사자가 안내를 한 번 끈 뒤로는 영영 못 보게 된다.
 */
export function clearFirstRunSeen(): void {
  if (typeof window === "undefined") return;
  for (const [key] of FIRST_RUN_SEEN_ENTRIES) {
    try {
      window.localStorage.removeItem(key);
    } catch {
      /* private mode — skip */
    }
  }
}

/**
 * `?guides=` 를 읽어 적용한다. 반환값은 실제로 한 일 — 아무것도 안 했으면
 * `null`.
 *
 * **호출 시점이 계약이다**: 안내 표면들은 자기 effect/state 초기화에서
 * localStorage 를 읽으므로, 이 함수는 그 자식들이 렌더되기 **전에** 돌아야
 * 한다. `AppShell` 의 lazy state 초기화가 그 자리다(부모 렌더 > 자식 렌더 >
 * 자식 effect 순서라 부모 effect 는 이미 늦다).
 */
export function applyGuideOverride(search: string): GuideOverride | null {
  const override = resolveGuideOverride(search);
  if (override === "off") applyFirstRunSeen();
  else if (override === "reset") clearFirstRunSeen();
  return override;
}
