/**
 * 성좌 배경의 시차 원점 — 순수 계산.
 *
 * ## 왜 필요한가 (2026-07-28 디자인 카운슬)
 *
 * 소유자: *"배경같은것도 좀 우주처럼 관성있어보이게 하는 그런 배경도 설정에
 * 1개 추가되면 좋겠는데"*
 *
 * 카운슬 7석이 독립적으로 같은 답에 도착했다 — **자율(시간 구동) 배경은 반려,
 * 입력 결합 시차는 승인.** 그리고 「체계」가 결정적인 것을 찾았다: 그 설정은
 * **이미 있다**(`appearance-preferences.ts` 의 `CanvasBackground` 3택 중
 * `constellation` 이 이미 별점 배경). 소유자가 원한 델타는 새 배경이 아니라
 * **그 성좌에 카메라 연동 시차를 더하는 것**이었다.
 *
 * ## 지금까지 무엇이 없었나
 *
 * 배경은 `worldToScreen(camera, 0, 0)` 을 그대로 타서 **계수 1.0 — 세계에
 * 용접**돼 있었다. 청사진 격자에겐 옳다(그건 지면이다). 성좌에겐 틀렸다 —
 * 별은 먼 층이라 지면보다 덜 움직여야 하고, 그 **차이**가 곧 깊이 정보다.
 *
 * ## 자율 운동 0 — 이것이 헌장을 통과하는 이유
 *
 * 반환값은 카메라 원점의 함수일 뿐이다. 카메라가 서면 배경도 선다:
 * 유휴 프레임 비용 0, `forbidden.md` 의 "움직이는 그라디언트 배경·오로라"
 * (시간 구동 장식)와 축이 다르며, WCAG 2.2 §2.3.3 의 사용자-개시 예외 안이다.
 *
 * 선행 조건도 이미 충족돼 있다 — 「상호작용」이 건 조건이 *"카메라 관성 없이
 * 배경만 넣으면 거짓말이다"* 였는데, 실측 결과 카메라는 플릭 릴리즈 후 819ms
 * 활공한다(2026-07-28, 앰비언트 휴면으로 오염원을 없앤 뒤 측정).
 */

/**
 * 시차가 적용된 배경 타일 원점.
 *
 * @param origin 세계 원점(0,0)의 현재 화면 좌표 — 계수 1.0 일 때의 배경 원점.
 * @param viewport 뷰포트 크기. 계수의 회전축(카메라가 원점일 때 배경도 제자리).
 * @param k 시차 계수. 1 = 세계에 용접(종전 동작), 0 = 화면에 용접.
 *
 * 계수를 **뷰포트 중심 기준**으로 거는 이유: 화면 중앙이 카메라가 보는 곳이고,
 * 그 점에서는 어느 층이든 어긋나지 않아야 한다. 좌상단 기준으로 걸면 정지
 * 상태에서도 층이 어긋난 채 시작해 "처음부터 틀어져 있는" 배경이 된다.
 */
export function backgroundParallaxOrigin(
  origin: { x: number; y: number },
  viewport: { width: number; height: number },
  k: number,
): { x: number; y: number } {
  const cx = viewport.width / 2;
  const cy = viewport.height / 2;
  const f = Number.isFinite(k) ? k : 1;
  return {
    x: cx + (origin.x - cx) * f,
    y: cy + (origin.y - cy) * f,
  };
}

/**
 * 이 프레임에 쓸 시차 계수.
 *
 * `prefers-reduced-motion` 에서 **1.0** 이다 — 0 이 아니다. 전정 자극을 만드는
 * 것은 층간 **상대 운동**이므로, 1.0 이면 배경이 내용과 정확히 같은 속도로
 * 움직여 상대 운동이 사라진다(= 종전 동작). 0 으로 두면 배경이 화면에 용접돼
 * 오히려 내용 대비 상대 운동이 **생긴다** — 없애려던 것을 만드는 셈이다.
 *
 * 근접 성좌가 아닌 배경은 여기서 1.0 이다. 도트 격자는 지면이라 그렇고,
 * **깊이 도트는 층마다 계수가 달라** 이 단일 계수로 표현되지 않는다 —
 * `render/grid.ts` 의 `DEPTH_DOT_LAYERS` 가 층별 값을 갖고 `topology-frame-draw`
 * 가 층마다 따로 원점을 계산한다.
 */
export function resolveBackgroundOrigin(
  gridOrigin: { x: number; y: number },
  viewport: { width: number; height: number },
  variant: string | undefined,
  token: number,
  reducedMotion: boolean,
): { x: number; y: number } {
  return backgroundParallaxOrigin(
    gridOrigin,
    viewport,
    resolveBackgroundParallax(variant, token, reducedMotion),
  );
}

export function resolveBackgroundParallax(
  variant: string | undefined,
  token: number,
  reducedMotion: boolean,
): number {
  if (variant !== "web") return 1;
  if (reducedMotion) return 1;
  if (!Number.isFinite(token)) return 1;
  // 1 을 넘으면 배경이 내용보다 빨라져 "가까운 층" 으로 읽힌다 — 성좌의 의미와
  // 반대다. 음수는 반대 방향으로 흘러 멀미를 만든다. 둘 다 막는다.
  return Math.min(1, Math.max(0, token));
}
