export interface ViewportReframeState {
  /** 마지막 카메라 이동이 지도 팬·휠·핀치처럼 사용자가 직접 만든 것인가. */
  userDriven: boolean;
  /** 현재 실제로 그려지는 3D 돔 런타임이 활성 상태인가. */
  domeActive: boolean;
  /** 노드 하나가 선택되어 그 노드의 ego가 현재 읽기 대상인가. */
  focused: boolean;
  /** 엣지 두 끝점이 선택되어 기존 카메라 문맥을 보존해야 하는가. */
  pairFocused: boolean;
  /** 영역 전개가 진입 중이거나 활성 상태인가. */
  realmActive: boolean;
  /** 최근 변경·경로·전체 펼치기처럼 명시적인 노드 집합 렌즈가 있는가. */
  spotlightActive: boolean;
}

export type ViewportReframeMode =
  | "preserve"
  | "dome-focus"
  | "dome-overview"
  | "focus"
  | "realm"
  | "spotlight"
  | "overview";

/**
 * 지도 뷰포트가 정착한 뒤 어느 카메라 의미를 다시 계산할지 정한다.
 *
 * 패널 폭 변화는 단순한 resize가 아니다. 같은 화면에서도 선택 노드, 영역,
 * 경로 렌즈가 각각 다른 "지금 보고 있는 것"을 소유한다. 이 우선순위를 한 곳에
 * 두지 않으면 에이전트 패널을 열 때마다 무조건 전체 보기로 돌아가거나, 반대로
 * 이전 화면 폭의 카메라가 남아 그래프가 한쪽으로 치우친다.
 */
export function resolveViewportReframeMode(state: ViewportReframeState): ViewportReframeMode {
  // 사람이 잡아 둔 카메라와 엣지 페어 문맥은 프로그램이 빼앗지 않는다.
  if (state.userDriven || state.pairFocused) return "preserve";

  // 돔은 자세(yaw/pitch)를 보존하는 자기 리프레임 경로가 먼저다.
  if (state.domeActive) return state.focused ? "dome-focus" : "dome-overview";

  // 선택 노드는 영역·렌즈 안에서도 가장 구체적인 현재 읽기 대상이다.
  if (state.focused) return "focus";
  if (state.realmActive) return "realm";
  if (state.spotlightActive) return "spotlight";
  return "overview";
}
