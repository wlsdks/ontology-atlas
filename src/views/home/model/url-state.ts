import { DEFAULT_EXPAND } from "@/shared/lib/appearance-preferences";
import type { ProjectCategory } from "@/entities/project";
import type { ProjectImpactMode } from "@/entities/project";
import {
  buildInsightsReturnMarker,
  ONTOLOGY_DEEPLINK_ASK_KEY,
  ONTOLOGY_DEEPLINK_REVIEW_KEY,
  ONTOLOGY_DEEPLINK_VIA_KEY,
  parseInsightsReturnMarker,
} from "@/entities/knowledge-graph";
import {
  parseNodeIntentKind,
  type FirstWordsNodeIntentKind,
} from "@/features/vault-agent";
import {
  parseIndexPanelStateParam,
  type IndexPanelState,
} from "@/widgets/topology-index-panel";

export type HomePulseMode = "all" | "7d" | "30d";
export type TopologyAnalysisMode =
  | "overview"
  | "focus"
  | "path"
  | "health";

export interface HomeRouteState {
  selectedSlug: string | null;
  activeCategory: ProjectCategory | null;
  focusedHubSlug: string | null;
  impactMode: ProjectImpactMode;
  pulseMode: HomePulseMode;
  analysisMode: TopologyAnalysisMode;
  pathSourceSlug: string | null;
  pathTargetSlug: string | null;
  createNodeIntent: boolean;
  /** 지도 안 의미 편집기를 여는 URL intent (`?workbench=edit`). */
  meaningEditorIntent: boolean;
  /** `edit=<relation>:<targetId>` — 첫 콜론 파싱은 entity parser가 맡는다. */
  meaningEditParam: string | null;
  /**
   * INDEX panel expand/collapse deep-link intent (B3 허브가 곧 지도,
   * `?index=expanded|collapsed`). `null` = not specified in THIS url — the
   * caller (HomePage) falls back to the localStorage preference, then the
   * "expanded" default (`resolveIndexPanelState`,
   * `@/widgets/topology-index-panel`). Kept nullable rather than defaulting
   * here so a URL round-trip never clobbers a preference the URL didn't ask
   * to change.
   */
  indexState: IndexPanelState | null;
  /**
   * 인사이트발 딥링크 복귀 마커 (`?via=insights:<tab>`) — 값은 원래 보던
   * 인사이트 탭 slug. non-null 이면 HomePage 가 상단 중앙 크롬 열에
   * "인사이트로 돌아가기" 칩을 렌더한다.
   *
   * 수명 계약: 마커는 URL 에 살고, 지도 안의 다른 상호작용(노드 클릭·모드
   * 전환 등)에도 round-trip 으로 유지된다 — 탐색이 깊어질수록 브라우저
   * 뒤로가기가 무력해지는 바로 그 순간을 위한 어포던스라서다. 제거는 명시
   * dismiss(칩의 X) 또는 마커 없는 새 URL 진입뿐. 칩 클릭(복귀)은 마커를
   * 지우지 않는다 — 뒤로가기로 지도에 돌아오면 같은 딥링크 문맥이므로 칩도
   * 다시 보이는 게 맞다. Esc 사다리(M-7)에는 참여하지 않는다.
   */
  insightsReturnTab: string | null;
  /**
   * `할 일`에서 출발한 정확한 검토 행 id (`?review=`). 유효한 insights
   * via 마커가 있을 때만 읽고, 지도 상호작용 동안 같이 보존한다.
   */
  insightsReturnReviewId: string | null;
  /**
   * S7 이음새 — 인사이트 큐 행에서 「에이전트에게 말로 시키기」로 건너왔다는
   * 표시 (`?ask=missing-definition` 등). 값은 **의도의 종류**뿐이고 문장은
   * 지도가 첫 마디 생성기로 짓는다 — 주소에 사람이 읽을 문장을 싣지 않는다.
   *
   * 수명 계약: URL 이 곧 상태다. 별도 React state 로 복사하지 않으므로
   * "열려 있는가" 와 "무엇을 물을 것인가" 가 한 곳에만 있고, 에이전트 패널을
   * 닫으면 이 값도 함께 지워진다(닫았는데 다시 열리면 그건 결함이다).
   * 알 수 없는 값은 파싱 단계에서 null 로 강등한다.
   */
  askIntent: FirstWordsNodeIntentKind | null;
  /**
   * 밀도 게이트 (fable 설계) — 클러스터 칩으로 접힌 부모 중 사용자가 펼친
   * 부모 slug 목록 (`?open=slug1,slug2`). 임계(12) 초과 자식을 가진 부모는
   * 지도에서 기본 접힘이고, 여기 담긴 부모만 자식을 노출한다. URL 에 사는
   * 이유: 공유 링크·에이전트가 "무엇이 펼쳐졌나"를 그대로 재현/가독할 수
   * 있어야 하기 때문(`design.md` "나머지는 클릭 시 expand" 헌장과 정합).
   * HomePage 가 Set 으로 변환해 지도로 내린다.
   */
  expandedParents: string[];
  /**
   * "영역 전개" (S4, fable 설계) — 지도가 이 노드의 세계로 전환된 상태
   * (`?realm=slug`). non-null 이면 그 노드의 containment 서브트리만 남기고
   * 그 노드를 임시 루트로 재배치한 "영역" 뷰를 렌더한다. URL 에 사는 이유:
   * 공유 링크·에이전트가 "지금 어느 영역 안인가"를 그대로 재현/가독할 수 있어야
   * 하기 때문. 진입 시 기존 `p`(선택)·`open`(밀도 게이트 확장)은 클리어된다
   * (`enterRealmRouteState`) — 영역은 새 좌표계이므로 이전 확장 상태가 무의미하다.
   */
  realmSlug: string | null;
  /**
   * 최근 변경 스포트라이트 (`?recent=auto|1|7|30`, 협의회 설계 2026-07-23) —
   * non-null 이면 지도가 "지난 N일 동안 디스크가 바뀐 노드"를 fresh 채널로
   * 켜고 나머지를 침강시키는 렌즈 모드다. `"auto"` = 기존 적응 램프
   * (`useAdaptiveRecentChanges` 7→3→1일)가 창을 고른다; 숫자 = 명시 창 고정.
   * URL 에 사는 이유: 공유 링크·에이전트가 "사람이 보던 것과 같은 창"을
   * 재현/가독할 수 있어야 하고, INDEX 렌즈와 지도 침강이 **단일 진실원**
   * (이 값 하나)에서 구동돼야 두 표면의 창 불일치가 구조적으로 불가능해진다.
   * null = off (파라미터 부재).
   */
  recentWindow: RecentSpotlightWindow | null;
}

/** 스포트라이트 창 — "auto"(적응 램프) 또는 명시 일수 프리셋. */
export type RecentSpotlightWindow = "auto" | 1 | 7 | 30;

/**
 * 지도의 주소 어휘 — **이 객체가 등록부의 정본이다.**
 *
 * `tests/contract/scope-registry.contract.test.ts` 가 여기 있는 키 전부에
 * `global` / `vault-scoped` 태그를 요구한다. 새 키를 더하면 그 시험이 먼저
 * 터진다 — 태그를 안 붙이면 "볼트가 바뀌면 걷어내야 하나" 라는 질문 자체를
 * 아무도 안 하게 되고, 그게 「범위를 넘긴 상태」가 태어나는 자리다.
 */
export const HOME_QUERY_KEYS = {
  project: "p",
  category: "c",
  hub: "hub",
  impact: "impact",
  pulse: "pulse",
  mode: "mode",
  pathSource: "pathFrom",
  pathTarget: "pathTo",
  pathSourceAlias: "from",
  pathTargetAlias: "to",
  create: "create",
  workbench: "workbench",
  edit: "edit",
  index: "index",
  open: "open",
  realm: "realm",
  recent: "recent",
  via: ONTOLOGY_DEEPLINK_VIA_KEY,
  review: ONTOLOGY_DEEPLINK_REVIEW_KEY,
  ask: ONTOLOGY_DEEPLINK_ASK_KEY,
} as const;

/**
 * **한 볼트 안에서만 뜻이 있는 주소 키** — 값이 그 볼트의 *이름*(노드 슬러그 ·
 * 프로젝트 슬러그 · 카테고리)이라, 볼트가 바뀌면 그 이름은 아무것도 가리키지
 * 않는다.
 *
 * ## 왜 목록이 따로 필요한가 (2026-08-01 수리)
 *
 * 나머지 키(`mode` · `impact` · `pulse` · `index` · `recent` · `create` ·
 * `via` · `review` · `ask`)는 **고정된 열거값**이라 어느 볼트에서나 같은 뜻이다.
 * 그래서 볼트가 바뀌어도 살아남는 게 맞다. 이 목록의 키만 다르다 — 살아남으면
 * **없는 것을 가리킨 채** 남아서 화면이 그것을 사실로 읽는다:
 *
 * - `p` — 유령 노드를 선택한 것으로 판정돼 지도가 통째로 흐려졌다(ego 포커스가
 *   `focusedNodeId !== null` 만 보고 실재를 안 봤다). 덤으로 그 슬러그가 첫
 *   방문 힌트를 영구 소멸시켰다.
 * - `pathFrom`/`pathTo` — 이 볼트에 없는 노드 둘을 놓고 화면이 **「경로 없음」**
 *   이라고 단언했다. 진실은 "둘 다 여기 없다" 인데 화면은 "둘 다 있고 안
 *   이어져 있다" 고 말한 것이다.
 * - `hub` — 오늘 소비처가 0이지만 파서가 읽고 URL 왕복에 실린다. 소비처가
 *   생기는 날 같은 결함이 되는 잠복 함정이라 지금 등재한다.
 * - `c` · `open` · `realm` — 같은 축(슬러그 값).
 *
 * `from`/`to` 는 `pathFrom`/`pathTo` 의 옛 별칭이라 같은 취급이다.
 */
export const VAULT_SCOPED_HOME_QUERY_KEYS = [
  "p",
  "c",
  "hub",
  "pathFrom",
  "pathTo",
  "from",
  "to",
  "open",
  "realm",
  "edit",
] as const;

/**
 * 볼트 정체성이 바뀌는 **그 순간에** 볼트 전용 주소 상태를 걷어낸다.
 *
 * 증상 치료(화면마다 "이 슬러그 실재하나?" 를 방어)와 원인 치료의 차이가 여기
 * 있다 — 이름이 의미를 잃는 순간에 지우면, 낡은 슬러그가 볼트 경계를 넘어
 * 살아남지 못해 그 뒤의 모든 거짓 판정이 **구조적으로** 사라진다.
 *
 * 경로 모드는 끝점이 둘 다 사라지므로 개요로 되돌린다 — 끝점 없는 「경로」
 * 모드는 그 자체가 빈 주장이다.
 *
 * ⚠️ 첫 마운트에는 부르지 않는다. 그때의 `?p=` 는 잔재가 아니라 **누군가 준
 * 것**이다(딥링크 · 에이전트 핸드오프 · 북마크). 밖에서 온 링크가 깨진 것은
 * 조용히 지울 일이 아니라 정직하게 말할 일이다.
 */
export function clearVaultScopedRouteState(current: HomeRouteState): HomeRouteState {
  return {
    ...current,
    selectedSlug: null,
    activeCategory: null,
    focusedHubSlug: null,
    pathSourceSlug: null,
    pathTargetSlug: null,
    expandedParents: [],
    realmSlug: null,
    meaningEditorIntent: false,
    meaningEditParam: null,
    analysisMode: current.analysisMode === "path" ? "overview" : current.analysisMode,
  };
}

const VALID_IMPACT: ProjectImpactMode[] = [
  "none",
  "upstream",
  "downstream",
  "network",
];
const VALID_PULSE: HomePulseMode[] = ["all", "7d", "30d"];
const VALID_ANALYSIS_MODE: TopologyAnalysisMode[] = [
  "overview",
  "focus",
  "path",
  "health",
];

export const DEFAULT_HOME_ROUTE_STATE: HomeRouteState = {
  selectedSlug: null,
  activeCategory: null,
  focusedHubSlug: null,
  impactMode: "none",
  pulseMode: "all",
  analysisMode: "overview",
  pathSourceSlug: null,
  pathTargetSlug: null,
  createNodeIntent: false,
  meaningEditorIntent: false,
  meaningEditParam: null,
  indexState: null,
  insightsReturnTab: null,
  insightsReturnReviewId: null,
  askIntent: null,
  expandedParents: [],
  realmSlug: null,
  recentWindow: null,
};

/**
 * 스포트라이트 — `?recent=` 값 파싱. `auto`/`1`/`7`/`30` 만 유효, 그 외/부재는
 * null(off). 순수 함수 — 잘못된 값은 조용히 off 로 강등(범례 없는 상태 오염
 * 방지).
 */
export function parseRecentWindowParam(raw: string | null): RecentSpotlightWindow | null {
  if (raw === "auto") return "auto";
  if (raw === "1") return 1;
  if (raw === "7") return 7;
  if (raw === "30") return 30;
  return null;
}

/** 스포트라이트 창 → URL 값 직렬화 (null = 파라미터 제거). */
export function serializeRecentWindowParam(window: RecentSpotlightWindow | null): string | null {
  if (window === null) return null;
  return window === "auto" ? "auto" : String(window);
}

/**
 * 밀도 게이트 — `?open=` 값 파싱: 콤마 분리, 트림, 빈 항목 무시, 중복 제거.
 * 순서는 등장 순서를 보존한다(왕복 안정). 순수 함수라 테스트 가능.
 */
export function parseExpandedParentsParam(
  raw: string | null,
  max: number = MAX_EXPANDED_PARENTS,
): string[] {
  if (!raw) return [];
  const seen = new Set<string>();
  const result: string[] = [];
  for (const part of raw.split(",")) {
    const slug = part.trim();
    if (slug === "" || seen.has(slug)) continue;
    seen.add(slug);
    result.push(slug);
  }
  // 딥링크도 같은 상한을 받는다 — 안 그러면 링크 하나로 상한을 우회해, 받은
  // 사람이 보낸 사람보다 나쁜 화면을 본다. **뒤쪽을 남긴다**(토글의 LRU 축출과
  // 같은 방향: 나중에 적힌 것이 더 최근 의도다).
  const cap = Math.max(1, Math.floor(max));
  return result.length > cap ? result.slice(result.length - cap) : result;
}

/**
 * 밀도 게이트 — 확장 부모 목록에서 한 부모를 토글한 새 목록을 낸다(순수).
 * HomePage 의 칩 클릭 핸들러가 이걸로 `expandedParents` 를 갱신해 URL 왕복한다.
 */
/**
 * 동시에 펼쳐 둘 수 있는 부모의 상한.
 *
 * **왜 상한이 필요한가** — 부모 **하나**의 자식 수는 이미 제한돼 있다(배치
 * 24개 + `+N 더보기`). 그런데 **펼친 부모의 수**에는 아무 제한이 없어서,
 * `?open=` 에 부모가 쌓이는 만큼 화면 위 노드가 곱해졌다. 소유자 실측
 * (2026-07-31 스크린샷): 부모 5개를 펼치자 노드 약 150개에 **이름표가 2개**
 * 남았다 — 나머지는 정체를 알 수 없는 동일한 사각형이었다. 지도의 유일한
 * 임무가 "무엇이 어디 있나"인데 그 답을 못 주는 상태다.
 *
 * 제한이 **부모 수**인 이유: 밀도의 곱셈 인자가 거기 있다. 배치 크기를 더
 * 줄이면 부모 하나를 보는 경험이 나빠지는데, 정작 화면을 무너뜨린 건 부모
 * 하나가 아니라 **여러 부모의 합**이었다.
 *
 * 3 인 이유는 픽셀이 아니라 사람이다 — 비교는 보통 둘(이것 vs 저것)이고,
 * 거기에 "내가 어디서 왔나" 하나가 붙는다. 넷째부터는 비교가 아니라 누적이다.
 *
 * **이제 사용자가 이 값을 옮길 수 있다**(설정 →「확장 → 동시에 펼쳐 둘 부모」,
 * 1~6). 위 문단은 여전히 **기본값의 근거**이고, 단일 출처는 설정 쪽
 * (`DEFAULT_EXPAND.maxOpenParents`)이다 — 같은 숫자를 두 곳에 적지 않는다.
 */
export const MAX_EXPANDED_PARENTS = DEFAULT_EXPAND.maxOpenParents;

/**
 * 이미 정해진 목록을 상한에 맞춘다 — **뒤쪽을 남긴다**(`toggleExpandedParent`
 * 의 LRU 축출과 같은 방향: 나중에 적힌 것이 더 최근 의도다).
 *
 * 왜 파싱과 별도인가: `parseHomeRouteState` 는 설정을 모르는 순수 함수라
 * 기본값 상한만 쓸 수 있다. 그래서 딥링크로 들어온 목록이 **사용자가 내려 둔
 * 상한을 통과하지 않았다**(실측 2026-08-02: 「동시에 펼쳐 둘 부모」를 1 로 둔
 * 화면이 링크 하나로 부모 셋을 펼쳤다). 상한을 아는 자리(화면)가 한 번 더
 * 거른다.
 */
export function limitExpandedParents(slugs: readonly string[], max: number): string[] {
  const cap = Math.max(1, Math.floor(max));
  return slugs.length > cap ? slugs.slice(slugs.length - cap) : [...slugs];
}

/**
 * 클러스터 펼침 토글 — 접기는 언제나 되고, 펼치기는 상한을 넘으면 **가장
 * 오래 펼쳐 둔 것을 닫는다**(LRU).
 *
 * 넘칠 때 클릭을 **무시하지 않는 것**이 요점이다. 누른 것이 아무 일도 안
 * 하면 사용자는 고장으로 읽고, 왜 안 되는지 설명할 자리도 없다. 가장 오래된
 * 것이 닫히는 건 작업대가 좁을 때 사람이 실제로 하는 일과 같아서 배우기 쉽다.
 */
export function toggleExpandedParent(
  current: readonly string[],
  parentId: string,
  max: number = MAX_EXPANDED_PARENTS,
): string[] {
  if (current.includes(parentId)) {
    return current.filter((id) => id !== parentId);
  }
  const next = [...current, parentId];
  // 앞에서부터 버린다 — 배열 순서가 곧 펼친 순서다(append-only 로 쌓였으므로).
  const cap = Math.max(1, Math.floor(max));
  return next.length > cap ? next.slice(next.length - cap) : next;
}

/**
 * 딥링크 focus dive 조상 파생 (패널2-D1, R4 모션 헌법, fable 설계) — 한 방향
 * contains 엣지 목록에서 자식 id → 부모 id 맵을 만든다. 밀도 게이트
 * (`model/density-gate.ts`) 가 임계 초과 부모를 접었을 때, `?p=slug` 딥링크
 * 대상이 그 접힘 서브트리 안에 있으면 조상 체인을 펼쳐 드러내야 한다 —
 * 그 조상 체인을 걷기 위한 부모 조회 맵이다. 한 자식이 둘 이상 contains
 * 부모를 가지면(드묾) 먼저 나온 부모를 채택한다(딥링크 노출엔 유효한 한
 * 체인이면 충분). 순수·결정론.
 */
export function buildContainmentParentMap(
  edges: readonly { source: string; target: string; kind: string }[],
): Map<string, string> {
  const parentOf = new Map<string, string>();
  for (const edge of edges) {
    if (edge.kind !== "contains") continue;
    if (!parentOf.has(edge.target)) parentOf.set(edge.target, edge.source);
  }
  return parentOf;
}

/**
 * 딥링크 focus dive 조상 파생 (패널2-D1, fable 설계) — `targetId` 의 contains
 * 조상 전부를 `currentExpanded` 에 더한 새 펼침 목록을 낸다. 대상 자신은
 * 부모가 아니므로 넣지 않고, 그 부모·조부모…를 가까운 순으로 append 한다
 * (URL `?open=` 왕복 안정). 이미 펼쳐진 조상은 중복 추가하지 않고, 사이클은
 * 방문 집합으로 차단한다. 추가할 조상이 없으면(대상 없음/최상위/전부 이미
 * 펼침) 내용이 같은 새 배열을 낸다. 순수 함수 — HomePage 가 로드 1회
 * 적용해 URL 왕복하면, 대상이 드러난 뒤 기존 focus dive 가 클릭과 동일한
 * 이징 문법으로 1회 발화한다.
 */
export function deriveDeeplinkAncestorExpansion(
  targetId: string | null,
  parentOf: ReadonlyMap<string, string>,
  currentExpanded: readonly string[],
): string[] {
  if (!targetId) return [...currentExpanded];
  const seen = new Set<string>(currentExpanded);
  const guard = new Set<string>([targetId]);
  const additions: string[] = [];
  let cursor = parentOf.get(targetId);
  while (cursor !== undefined && !guard.has(cursor)) {
    guard.add(cursor);
    if (!seen.has(cursor)) {
      seen.add(cursor);
      additions.push(cursor);
    }
    cursor = parentOf.get(cursor);
  }
  return additions.length === 0
    ? [...currentExpanded]
    : [...currentExpanded, ...additions];
}

/**
 * "영역 전개" 진입 — 지도를 `slug` 노드의 세계로 전환한다. 영역은 새 좌표계라
 * 이전 선택(`p`)·밀도 게이트 확장(`open`)·경로 소스는 클리어한다(spec: "realm
 * 전환 시 기존 open/p 는 클리어"). 순수 함수 — HomePage 가 URL 왕복한다.
 */
export function enterRealmRouteState(
  current: HomeRouteState,
  slug: string,
): HomeRouteState {
  return {
    ...current,
    realmSlug: slug,
    selectedSlug: null,
    focusedHubSlug: null,
    expandedParents: [],
  };
}

/** "영역 전개" 해제 — 전체 지도로 복귀 (`?realm=` 제거). 선택도 함께 비운다. */
export function exitRealmRouteState(current: HomeRouteState): HomeRouteState {
  return { ...current, realmSlug: null, selectedSlug: null, focusedHubSlug: null };
}

/**
 * "영역 전개" realm slug 해석 (패널3-S7) — URL 의 `?realm=` 값을 실제 노드
 * id 로 맞춘다. 노드 id 는 `kind:slug`(예: `capability:mcp-server`) 공간이라,
 * 사용자가 손으로 친 bare slug(`?realm=ai-agent-partner`, kind prefix 없음)는
 * 그냥은 어떤 노드와도 안 맞아 raw 칩 + 전체 지도가 조용히 렌더됐다. 이 함수는
 * (1) 정확히 일치하는 id 가 있으면 그대로, (2) prefix 없는 bare slug 면
 * `<kind>:<slug>` 형태의 노드를 찾아 canonical id 로 승격, (3) 못 찾으면 null.
 * null 이면 caller 가 칩을 숨기고 영역을 활성화하지 않는다(조용한 fallback 대신
 * 명시적 미해석). 순수 — `nodeIds` 는 canonical 노드 id 목록.
 */
export function resolveRealmNodeId(
  realmSlug: string | null,
  nodeIds: Iterable<string>,
): string | null {
  if (!realmSlug) return null;
  const hasKindPrefix = realmSlug.includes(":");
  let bareMatch: string | null = null;
  for (const id of nodeIds) {
    if (id === realmSlug) return id; // 정확 일치가 최우선
    if (!hasKindPrefix && bareMatch === null) {
      const colon = id.indexOf(":");
      if (colon >= 0 && id.slice(colon + 1) === realmSlug) bareMatch = id;
    }
  }
  return bareMatch;
}

export function parseHomeRouteState(
  searchParams: URLSearchParams,
): HomeRouteState {
  const impactParam = searchParams.get(HOME_QUERY_KEYS.impact);
  const pulseParam = searchParams.get(HOME_QUERY_KEYS.pulse);
  const modeParam = searchParams.get(HOME_QUERY_KEYS.mode);
  const rawSelectedSlug = searchParams.get(HOME_QUERY_KEYS.project);
  // 딥링크는 명시된 mode 를 존중한다. selectedSlug 만으로 parse 단계에서
  // focus 로 승격하지 않는다. click selection 의 승격은 아래
  // selectTopologyNodeRouteState 에서만 수행해 load 와 interaction 을 분리한다.
  const analysisMode = VALID_ANALYSIS_MODE.includes(modeParam as TopologyAnalysisMode)
    ? (modeParam as TopologyAnalysisMode)
    : DEFAULT_HOME_ROUTE_STATE.analysisMode;
  const pathSourceSlug =
    searchParams.get(HOME_QUERY_KEYS.pathSource) ??
    searchParams.get(HOME_QUERY_KEYS.pathSourceAlias) ??
    (analysisMode === "path" ? rawSelectedSlug : null);
  const pathTargetSlug =
    searchParams.get(HOME_QUERY_KEYS.pathTarget) ??
    searchParams.get(HOME_QUERY_KEYS.pathTargetAlias);
  const selectedSlug =
    analysisMode === "path" && pathSourceSlug && pathTargetSlug
      ? null
      : rawSelectedSlug;
  const pathResultComplete = Boolean(
    analysisMode === "path" && pathSourceSlug && pathTargetSlug,
  );
  const impactMode = pathResultComplete
    ? DEFAULT_HOME_ROUTE_STATE.impactMode
    : VALID_IMPACT.includes(impactParam as ProjectImpactMode)
      ? (impactParam as ProjectImpactMode)
      : DEFAULT_HOME_ROUTE_STATE.impactMode;
  const insightsReturnTab = parseInsightsReturnMarker(
    searchParams.get(HOME_QUERY_KEYS.via),
  );
  const workbench = searchParams.get(HOME_QUERY_KEYS.workbench);
  const meaningEditorIntent = workbench === "edit";

  return {
    selectedSlug,
    activeCategory: searchParams.get(HOME_QUERY_KEYS.category),
    focusedHubSlug: pathResultComplete
      ? null
      : searchParams.get(HOME_QUERY_KEYS.hub),
    impactMode,
    pulseMode: VALID_PULSE.includes(pulseParam as HomePulseMode)
      ? (pulseParam as HomePulseMode)
      : DEFAULT_HOME_ROUTE_STATE.pulseMode,
    analysisMode,
    pathSourceSlug,
    pathTargetSlug,
    createNodeIntent:
      searchParams.get(HOME_QUERY_KEYS.create) === "concept" || workbench === "create",
    meaningEditorIntent,
    meaningEditParam: meaningEditorIntent
      ? searchParams.get(HOME_QUERY_KEYS.edit)
      : null,
    indexState: parseIndexPanelStateParam(searchParams.get(HOME_QUERY_KEYS.index)),
    insightsReturnTab,
    insightsReturnReviewId: insightsReturnTab
      ? searchParams.get(HOME_QUERY_KEYS.review)
      : null,
    askIntent: parseNodeIntentKind(searchParams.get(HOME_QUERY_KEYS.ask)),
    expandedParents: parseExpandedParentsParam(
      searchParams.get(HOME_QUERY_KEYS.open),
    ),
    realmSlug: searchParams.get(HOME_QUERY_KEYS.realm) || null,
    recentWindow: parseRecentWindowParam(searchParams.get(HOME_QUERY_KEYS.recent)),
  };
}

export function selectTopologyNodeRouteState(
  current: HomeRouteState,
  slug: string,
  options?: { isHub?: boolean; preserveImpact?: boolean },
): HomeRouteState {
  return {
    ...current,
    selectedSlug: slug,
    focusedHubSlug: options?.isHub ? slug : null,
    impactMode: options?.preserveImpact ? current.impactMode : "none",
    meaningEditorIntent: false,
    meaningEditParam: null,
    // 클릭 = 선택(안전한 탐색)만 — 어떤 모드에서도 mode 를 바꾸지 않는다.
    // 이전의 overview→focus 자동 승격은 [선택+확장+재배치+카메라핏]을 한
    // 클릭에 겹쳐 인과를 지웠다 (R+ 소유자 피드백 "클릭하면 그냥 바뀌어서
    // 헷갈린다"). 확장(초점)은 카드 배지/더블클릭/딥링크의 명시적 의도로만.
    analysisMode: current.analysisMode,
  };
}

export function selectTopologyPathRouteState(
  current: HomeRouteState,
  selection: { sourceSlug: string | null; targetSlug: string | null },
): HomeRouteState {
  const hasCompletePath = Boolean(selection.sourceSlug && selection.targetSlug);
  return {
    ...current,
    analysisMode: "path",
    selectedSlug: hasCompletePath
      ? null
      : selection.sourceSlug ?? current.selectedSlug,
    focusedHubSlug: hasCompletePath ? null : current.focusedHubSlug,
    impactMode: hasCompletePath ? "none" : current.impactMode,
    pathSourceSlug: selection.sourceSlug,
    pathTargetSlug: selection.targetSlug,
    meaningEditorIntent: false,
    meaningEditParam: null,
  };
}

/**
 * 캔버스 노드 클릭의 단일 진입점 — path 모드인지 여부로
 * `selectTopologyNodeRouteState` (일반 선택) 과 `selectTopologyPathRouteState`
 * (경로 소스/대상 확정) 사이를 분기한다.
 *
 * persona QA 발견 (fix/persona-findings ②): 이전엔 `HomePage.tsx` 의
 * `handleSelect` 가 analysisMode 를 전혀 보지 않고 항상
 * `selectTopologyNodeRouteState` 로만 흘렀다 — path 모드에서 소스 노드를
 * 고른 뒤 두 번째 노드를 클릭해도 `pathTargetSlug` 가 절대 채워지지 않아,
 * 캔버스는 새로 선택된 노드의 ego 이웃을 그려 "경로가 확정된 것처럼"
 * 보였지만 `TopologyPathChip` 은 `pathTargetSlug` 를 엄격히 요구해 "대상
 * 선택" 문구에 고정되고 경로 패킷 복사 버튼도 끝내 나타나지 않았다.
 *
 * 판정: path 모드 + 소스 미확정 → 클릭한 노드를 소스로. path 모드 + 소스
 * 확정 + 클릭한 노드가 소스와 다름 → 그 노드를 대상으로 확정(다시 클릭해
 * 대상을 갈아끼우는 재선택 흐름 유지). 그 외(overview/focus/health 등,
 * 또는 소스 노드 자체를 다시 클릭) → 기존 일반 선택 그대로.
 */
export function resolveTopologyNodeClickRouteState(
  current: HomeRouteState,
  slug: string,
  options?: { isHub?: boolean; preserveImpact?: boolean },
): HomeRouteState {
  if (current.analysisMode === "path") {
    if (!current.pathSourceSlug) {
      return selectTopologyPathRouteState(current, {
        sourceSlug: slug,
        targetSlug: null,
      });
    }
    if (slug !== current.pathSourceSlug) {
      return selectTopologyPathRouteState(current, {
        sourceSlug: current.pathSourceSlug,
        targetSlug: slug,
      });
    }
    return current;
  }
  return selectTopologyNodeRouteState(current, slug, options);
}

export function applyHomeRouteState(
  searchParams: URLSearchParams,
  state: HomeRouteState,
): URLSearchParams {
  const next = new URLSearchParams(searchParams);

  setOrDelete(next, HOME_QUERY_KEYS.project, state.selectedSlug);
  setOrDelete(next, HOME_QUERY_KEYS.category, state.activeCategory);
  setOrDelete(next, HOME_QUERY_KEYS.hub, state.focusedHubSlug);
  setOrDelete(
    next,
    HOME_QUERY_KEYS.impact,
    state.impactMode === "none" ? null : state.impactMode,
  );
  setOrDelete(
    next,
    HOME_QUERY_KEYS.pulse,
    state.pulseMode === "all" ? null : state.pulseMode,
  );
  setOrDelete(
    next,
    HOME_QUERY_KEYS.mode,
    state.analysisMode === "overview" ? null : state.analysisMode,
  );
  setOrDelete(
    next,
    HOME_QUERY_KEYS.pathSource,
    state.analysisMode === "path" ? state.pathSourceSlug : null,
  );
  setOrDelete(
    next,
    HOME_QUERY_KEYS.pathTarget,
    state.analysisMode === "path" ? state.pathTargetSlug : null,
  );
  next.delete(HOME_QUERY_KEYS.pathSourceAlias);
  next.delete(HOME_QUERY_KEYS.pathTargetAlias);
  next.delete(HOME_QUERY_KEYS.create);
  setOrDelete(
    next,
    HOME_QUERY_KEYS.workbench,
    state.meaningEditorIntent
      ? "edit"
      : state.createNodeIntent
        ? "create"
        : null,
  );
  setOrDelete(
    next,
    HOME_QUERY_KEYS.edit,
    state.meaningEditorIntent ? state.meaningEditParam : null,
  );
  setOrDelete(next, HOME_QUERY_KEYS.index, state.indexState);
  setOrDelete(
    next,
    HOME_QUERY_KEYS.open,
    state.expandedParents.length > 0 ? state.expandedParents.join(",") : null,
  );
  setOrDelete(next, HOME_QUERY_KEYS.realm, state.realmSlug);
  setOrDelete(next, HOME_QUERY_KEYS.recent, serializeRecentWindowParam(state.recentWindow));
  setOrDelete(next, HOME_QUERY_KEYS.ask, state.askIntent);
  setOrDelete(
    next,
    HOME_QUERY_KEYS.via,
    state.insightsReturnTab
      ? buildInsightsReturnMarker(state.insightsReturnTab)
      : null,
  );
  setOrDelete(
    next,
    HOME_QUERY_KEYS.review,
    state.insightsReturnTab ? state.insightsReturnReviewId : null,
  );

  return next;
}

function setOrDelete(
  searchParams: URLSearchParams,
  key: string,
  value: string | null,
) {
  if (value) {
    searchParams.set(key, value);
    return;
  }

  searchParams.delete(key);
}
