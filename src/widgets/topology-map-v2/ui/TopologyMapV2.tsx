"use client";

import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import { Orbit } from "lucide-react";
import { MAP_CANVAS_SURFACE_ROLE } from "@/shared/lib/focus-map-canvas";
import { ICON_SIZE } from "@/shared/ui/icon-size";
import { useTopologyLoop } from "./use-topology-loop";
import type { TierRevealConfig } from "../model/tier-visibility";
import type { ClusterBarLabels } from "../render/cluster-chips";
import { DEFAULT_EXPAND, DEFAULT_MAP_ARRANGEMENT } from "@/shared/lib/appearance-preferences";
import type { CanvasBackground, ExpandPreference, FootprintPreference, GlyphSet, MapArrangement } from "@/shared/lib/appearance-preferences";
import { controlClass } from '@/shared/ui/control-class';
import { usePanelPresence } from "@/shared/lib/use-presence";

/**
 * 안내가 화면에 머무는 시간.
 *
 * ⚠️ 처음 1100ms 로 뒀다가 **시험이 먼저 잡았다** — 여덟 번 누르는 동안 이미
 * 사라져서 안내를 한 번도 못 봤다. 사람도 같은 처지다: 한 줄을 읽는 데 그보다
 * 오래 걸린다. 1900ms 는 읽고 다음 방향을 누를 만큼이고, 여전히 스스로 사라진다.
 *
 * 쿨다운(`DEAD_END_NOTICE_COOLDOWN_MS` 1200ms)보다 길어도 된다 — 다시 막히면
 * 타이머가 새로 서고 안내가 **새 노드 옆으로** 옮겨 간다.
 */
const WALK_NOTICE_HOLD_MS = 1900;

/** 노드 중심에서 안내 아래변까지 — 노드 반지름 최대(30) + 숨 8. */
const WALK_NOTICE_NODE_GAP = 38;
import { useReducedMotion } from "framer-motion";
import { transientSurface } from "@/shared/ui/transient-surface";

/**
 * `TopologyMapV2` — the product's single current canvas-2D topology renderer.
 * The former DOM canvas and Sigma/WebGL implementations are retired and
 * deleted; `HomePage` supplies the current adapter contract (selected slug,
 * path query, visibility and interaction callbacks) directly to this widget.
 *
 * The component itself stays a thin JSX shell — mount/resize/rAF-loop/
 * pointer/camera/draw wiring all live in `use-topology-loop.ts` (+ its
 * `topology-world.ts`/`topology-camera-math.ts`/`topology-frame-draw.ts`
 * helpers), per this file's own 300-line budget (`.claude/rules/*`).
 */

export interface TopologyV2Node {
  id: string;
  label: string;
  kind: "project" | "domain" | "capability" | "element";
  size: number;
  x: number;
  y: number;
  isHub: boolean;
  ownerKey: string | null;
  recentlyUpdated: boolean;
  /**
   * 저작 출처(`created_by`) 원문 — `human` · `agent:<name>` · 부재.
   * 값이 **정확히** `human` 일 때만 검수 대기 링을 그린다. 부재는 unknown 이지
   * 사람이 아니다(2026-07-31 원장 — 소급 추론 금지).
   */
  createdBy?: string;
  /** 살아있는 지도 드리프트 — vault mtime 파생 dusty 판정(`views/home/lib/topology-dusty.ts`).
   *  true 면 기존 stale 채널(dash + 불투명 stale 토큰)로 렌더. 생략 = fresh. */
  stale?: boolean;
  fullDegree: number;
  /** Transitive contained-descendant count — the engraved numeral shown on project/domain chips in circuit range (prototype `n.count`). */
  descendantCount: number;
}

export interface TopologyV2Edge {
  source: string;
  target: string;
  relationType: string;
  relationQuality: "strong" | "weak" | null;
  evidenceCount: number;
  kind: "contains" | "depends";
  /** P3b — 이 관계를 선언한 vault 문서 slug (frontmatter 가 곧 그래프이므로 출처 표시 비용 0). */
  declaredBySlug: string | null;
}

export interface TopologyV2Focus {
  /**
   * v2 캔버스 loop 가 실제로 소비하는 유일한 focus 필드. 구
   * depthLimit/searchQuery/activeCategory/hubsOnly 는 렌더러가 읽지 않는
   * 죽은 필드였고 조절 패널 철거와 함께 제거됐다 (loop 는 ego 포커스만 계산).
   */
  selectedSlug: string | null;
}

export interface TopologyV2PreviewEdge {
  sourceId: string;
  targetId: string;
  relationType: string;
  phase: "draft" | "committing";
}

/**
 * Adapter contract (`docs/plans/TOPOLOGY-V2-PHASE0.md` §4.2, confirmed unchanged
 * by `docs/TOPOLOGY-V2-DESIGN.md` §5.3 — v2 only replaces rendering, not
 * the upstream state/callback contract).
 */
export interface TopologyMapV2Props {
  nodes: readonly TopologyV2Node[];
  edges: readonly TopologyV2Edge[];
  focus: TopologyV2Focus;
  /**
   * **이 그래프가 어느 볼트에서 왔나** — 값이 바뀌면 오버뷰를 다시 맞춘다.
   *
   * 정체성 문자열의 단일 출처는 `useVaultIdentityScope()`(`features/vault-scope`)
   * 다. 여기서 트리거로 쓰는 것은 **노드 수가 아니라 출처**다: 사용자가 작업
   * 중에 노드 하나를 더할 때 카메라를 낚아채는 것이 원래 결함보다 나쁘므로,
   * 샘플↔로컬 · 샘플↔샘플 전환에서만 다시 선다. 생략하면 종전대로 최초 1회만
   * 맞춘다.
   */
  dataSourceKey?: string | null;
  /** Increment to re-run fit-to-bounds (HomePage "지도 맞추기"). */
  fitViewToken: number;
  /** 렌즈/기간 변경 시 강조 노드로 카메라를 맞추는 토큰. */
  spotlightFitToken?: number;
  /** Increment to force a full relayout. */
  relayoutToken: number;
  /** P3d(E1) — 첫 지도 연출 트리거 (부트스트랩 완료 시 증가). */
  revealToken?: number;
  /** P3b — 엣지 클릭 (노드 미히트 지점). */
  onSelectEdge?: (edge: { sourceId: string; targetId: string; relationType: string; declaredBySlug: string | null }) => void;
  /** 엣지 선택 = 페어 포커스 — 양끝만 밝히고 나머지 dim, 선택 엣지는 pale 인디고. */
  selectedEdge?: { sourceId: string; targetId: string } | null;
  /** Pre-write relation overlay. It never enters the force/layout graph. */
  previewEdge?: TopologyV2PreviewEdge | null;
  /** P3c — 엣지 호버 마이크로카드 (식별 변경 시 발화, null=해제). */
  onHoverEdge?: (
    edge: { sourceId: string; targetId: string; relationType: string; declaredBySlug: string | null } | null,
    position: { x: number; y: number } | null,
  ) => void;
  /**
   * The connected-node slug the user is hovering in the detail panel's
   * "연결된 노드" list. Under focus, that node + its connecting edge light up on
   * the canvas so panel and map read as one (lead spec §4). Optional — the
   * panel-hover wiring is a follow-up; omitting it keeps the map behavior
   * identical.
   */
  emphasizedNeighborSlug?: string | null;
  onSelect?: (slug: string) => void;
  /** 방향키를 눌렀는데 그 방향에 갈 곳이 없을 때. 문구는 페이지가 정한다. */
  onWalkDeadEnd?: ((point: { x: number; y: number } | null) => void) | null;
  onOpen?: (slug: string) => void;
  onPaneClick?: () => void;
  onVisibleCountChange?: (visible: number) => void;
  onGraphStatsChange?: (stats: { nodes: number; relations: number }) => void;
  /**
   * M-5 — semantic-zoom tier (spine → circuit → element) changed. Fires only
   * on transitions; HomePage feeds it to the corner readout so the "zoom in to
   * see elements" hint drops once elements are actually on screen.
   */
  onZoomTierChange?: (tier: "spine" | "circuit" | "element") => void;
  /**
   * W2-B node right-click context menu — called with the hit node's id and
   * viewport-space cursor position. Omitted keeps right-click behavior
   * unchanged (browser default menu everywhere, same as before this slice).
   */
  onContextMenuNode?: (slug: string, position: { x: number; y: number }) => void;
  /** 빈 캔버스 우클릭 — 「여기에 개념 만들기」. 생략하면 종전대로 no-op. */
  onContextMenuPane?: (position: { x: number; y: number }) => void;
  /**
   * 밀도 게이트 (fable 설계) — 사용자가 펼친 부모 slug Set(URL `?open=`).
   * 임계(12) 초과 자식을 가진 부모는 기본 접힘(클러스터 칩)이고 여기 담긴
   * 부모만 자식을 노출한다. 생략/빈 Set = 전부 접힘.
   */
  expandedParents?: ReadonlySet<string>;
  /** 밀도 게이트 — 클러스터 칩 클릭 시 해당 부모 확장 토글(HomePage 가 URL 왕복). */
  onToggleCluster?: (parentId: string) => void;
  /** S2 파트 5C — 클러스터 칩 호버 툴팁 (식별 변경 시 발화, null=해제). */
  onHoverCluster?: (
    info: {
      parentId: string;
      /** 이 티어에서 접힌 직속 게이트 자식 수(칩 `+N`). */
      count: number;
      /** 패널3-S6 — 부모의 하위 전체 자손 수(노드 뱃지 = descendantCount). */
      descendantTotal: number;
      expanded: boolean;
      position: { x: number; y: number };
    } | null,
  ) => void;
  /**
   * 밀도 게이트 — 클러스터 칩 어포던스의 접근성 힌트(i18n, HomePage 가 주입).
   * 칩은 canvas 글리프라 개별 aria 를 못 달아, 컨테이너 안 sr-only 설명으로
   * "무엇이 접혔고 어떻게 펼치는가"를 스크린리더에 전달한다.
   */
  clusterHint?: string;
  /** Embed mode (project detail neighbor map) — reduced physics/chrome. */
  minimal?: boolean;
  /**
   * W6 agent visibility — the graph node id matching the agent heartbeat's
   * current focus (already resolved to `kind:slug` form by `HomePage`), or
   * `null`/omitted when there's no fresh heartbeat focus. Draws a static
   * amber ring + label activity mark on that one node; never fabricated.
   */
  agentFocusNodeId?: string | null;
  /**
   * 최근 변경 스포트라이트 (`?recent=`, 협의회 설계 2026-07-23) — non-null 이면
   * 이 집합 밖 노드/엣지를 rest 알파까지 침강시키는 렌즈 ON. 집합 안 노드는
   * HomePage 가 fresh 채널 키(changedSlugs)를 같은 창으로 교체해 켠다.
   * null/생략 = off.
   */
  spotlightIds?: ReadonlySet<string> | null;
  /**
   * S4 "영역 전개" — 지도가 이 노드의 세계로 전환된 상태 (`?realm=slug`), 없으면
   * 전체 지도. HomePage 가 URL 에서 내린다.
   */
  realmRootId?: string | null;
  /** S4 — 궤도 "전개" 버튼 클릭 → 이 slug 로 영역 진입 (HomePage 가 URL 왕복). */
  onEnterRealm?: (slug: string) => void;
  /** S4 — 궤도 버튼 접근성 라벨 (i18n, HomePage 주입). 사용자 어휘는 "이것만 보기"(2026-07-23 소유자 결정), 내부명 realm 유지. */
  realmEnterLabel?: string;
  /** S4 — 궤도 버튼 호버 마이크로 툴팁 문구 ("이 노드 안쪽만 봐요"). */
  realmEnterTooltip?: string;
  /**
   * 결계 하단 센서스 각인 — "○○ · 요소 N" (i18n, HomePage 주입). 원장 패널의
   * census 와 단일 출처가 되도록 위젯이 직접 세지 않고 문자열로 받는다.
   * null/생략 = 각인 없음.
   */
  realmCaption?: string | null;
  /**
   * 「머리 위 막대」의 문구(i18n, HomePage 주입) — 「모두 펼치기」/「N개
   * 펼치기」/「접기」. 캔버스 렌더러는 문자열을 만들지 않는다(결계 캡션과
   * 같은 규약). 생략하면 영문 폴백이 그려지므로 배선은 계약 테스트가 잡는다.
   */
  clusterBarLabels?: ClusterBarLabels | null;
  /**
   * H3 P2 — 캔버스 접근성 라벨(i18n, HomePage 주입). canvas 는 회화 픽셀이라
   * 스크린리더에 빈 그래픽으로 읽힌다 → `role="img"` + 이 라벨로 "무엇인지 +
   * 키보드 대안(INDEX 패널)"을 한 문장으로 알린다. 생략하면 role/label 을 안
   * 단다(회귀 0).
   */
  canvasLabel?: string;
  /**
   * 막다른 길 안내 문구 — **문구는 페이지의 것이다**(`canvasLabel` 과 같은 이유:
   * 이 위젯은 프로바이더 없이 렌더되는 시험을 가진다). 자리와 사라지는 시점은
   * 위젯이 정한다 — 그 둘은 캔버스 좌표를 아는 쪽만 알 수 있다.
   */
  walkNoticeLabel?: string;
  /**
   * 발자국 트레일 (fable 설계) — 세션 동안 방문(ego 포커스)한 노드 id 목록
   * (오래된 → 최근). 각 방문 노드에 최근성 감쇠 pale 인디고 헤어라인 링을
   * 얹는다(정적 표기). HomePage 세션 state 가 내려보낸다. 생략/빈 배열 =
   * 발자국 없음.
   */
  visitedTrail?: readonly string[];
  /**
   * 걸어온 길 렌즈 on/off 를 담는 ref — 트레일 팝오버가 열려 있는 동안 true.
   * 지도가 잠시 관계 읽기를 접고 궤적 읽기에 양보한다: `visitedTrail` 노드만
   * 값과 라벨을 지키고 나머지 노드·클러스터 칩·라벨·엣지 전부가 기존 dim 값으로
   * 물러난다. 새 모드/URL 상태가 아니라 팝오버 열림과 동치(transient surface).
   * ref 인 이유는 아래 브러싱과 같다 — 전환마다 페이지 트리를 다시 렌더하지
   * 않기 위해서다.
   */
  trailLensActiveRef?: RefObject<boolean>;
  /**
   * 걸어온 길 브러싱 — 팝오버에서 hover 중인 행의 노드 id를 담는 ref(렌즈
   * 동안만 유효). 값이 아니라 ref 인 이유: 행을 훑는 동안 연속으로 바뀌는
   * 신호를 state 로 올리면 hover 한 번에 페이지 트리가 통째로 다시 렌더된다
   * (실측 ~100ms). 프레임 루프가 매 프레임 읽으므로 렌더 0회로 같은 결과.
   */
  trailHoverNodeIdRef?: RefObject<string | null>;
  /** 옆 패널(대화창·데이터시트)에서 노드 이름에 마우스를 올렸을 때
   *  (`use-topology-loop` 참고). */
  panelHoverNodeIdRef?: RefObject<string | null>;
  /**
   * 슬라이스 C (개발/비개발 모드 토글) — 표시-렌즈 티어 게이트 config. 생략
   * 시 `DEFAULT_TIER_REVEAL`(개발 모드). HomePage 가 비개발(plain) 모드에서
   * `PLAIN_TIER_REVEAL`(element 상시 숨김)을 넘긴다.
   */
  tierReveal?: TierRevealConfig;
  /**
   * 오버뷰 카메라가 맞출 bbox — `"spine"`(기본)은 project/domain/hub, `"full"`
   * 은 전 노드. 진입에 전 티어를 그리는 소비처(관문 증거 절 —
   * `GATEWAY_TIER_REVEAL`)만 `"full"` 을 넘긴다: 전 티어를 그리면서 스파인
   * bbox 로 맞추면 그래프 질량이 스파인 중심 아래라 프레임에서 낮게 앉는다
   * (실측 2026-08-18, 1512: 위 143px 공백 · 아래 17px). 워크벤치 기본은
   * 그대로다 — 스파인만 그리는 진입에서 전 bbox 핏은 8노드를 점으로 줄이는
   * 회귀였다(`use-topology-loop` trySnapInitialCamera 독블록).
   */
  overviewFit?: "spine" | "full";
  /**
   * 가이드 투어 (2026-07-23, `src/features/guided-tour`) — 캔버스 노드 앵커
   * (2·4단계) 프로젝션 계약. DOM 이 아닌 노드를 가리키므로 realm "전개" 버튼
   * 선례(`use-topology-loop.ts` 의 매 프레임 `worldToScreen` 블록)를 그대로
   * 복제한다. 이 노드 id 가 non-null 인 동안 loop 가 `tourAnchorRef` 의 DOM
   * 에 매 프레임 transform + `--tour-anchor-r` 를 써넣는다. id 해석(project/
   * domain/hub 선택)은 HomePage(`resolve-tour-anchor-node.ts`)가 담당 — 이
   * 위젯은 순수 프로젝션만 한다.
   */
  tourAnchorNodeId?: string | null;
  /**
   * 가이드 투어 앵커 원 DOM — HomePage/`GuidedTourOverlay` 가 만들어 이
   * 위젯에도 같이 내려준다(오버레이가 컷아웃 배치 기준 rect 를 읽는 쪽).
   * 실제 엘리먼트는 이 컴포넌트가 렌더하고 ref 만 외부에서 공유한다.
   */
  tourAnchorRef?: RefObject<HTMLDivElement | null>;
  /**
   * rank18 (설계협의회 batch B1) — DOM 오버레이(GlobalSearch 등) 가 열려
   * 있는 동안 캔버스를 키보드/스크린리더 트리에서 제외한다. 캔버스는
   * 회화 픽셀이라 자체 키보드 순회가 불가능하고, INDEX/데이터시트가 이미
   * 접근 가능한 대체 목록이므로 오버레이가 열린 동안만 이 캔버스 쪽을
   * 숨긴다(신규 대체 UI 없음 — 기존 INDEX/데이터시트 재사용).
   */
  overlayOpen?: boolean;
  /**
   * 아이콘 세트 (Phase 5 #21) — 노드 바디 렌더 스타일. HomePage 가
   * `useGlyphSet()` 으로 읽어 내려보낸다. DOM 글리프(`TopologyV2KindGlyph`)는
   * 같은 스토어를 스스로 읽으므로 캔버스·DOM 이 lockstep 으로 스왑된다.
   * 생략 시 `"geometric"`.
   */
  glyphSet?: GlyphSet;
  /**
   * 캔버스 배경 세트 (Phase 5 #20) — 도트(기본)·성좌·등고선. HomePage 가
   * `useCanvasBackground()` 로 읽어 내려보낸다. 생략 시 `"dot"`.
   */
  canvasBackground?: CanvasBackground;
  /**
   * 3D 보기 (2026-08-18, 옵트인) — 지도를 kind 동심 링의 돔으로 다시 배치해
   * 그리는 뷰 모드(`model/dome-view.ts`). 상단 툴바의 「3D」 칩이 켜고,
   * HomePage 가 `useView3d()` 로 읽어 내려보낸다. 생략 시 false(종전 2D — 기본).
   */
  view3d?: boolean;
  /**
   * 3D 돔의 **방위**를 무엇이 정하나 — 「소유」(containment 부모, 기본) /
   * 「결합」(모든 관계의 각도 완화). 근거와 기하:
   * `model/dome-view.ts` 의 `DomeArrangement` 독블록. 2D 에서는 무시된다.
   */
  mapArrangement?: MapArrangement;
  /**
   * 3D 리프레임 입력 (2026-08-18 2차) — 노드 상세 패널이 실제로 화면을 덮고
   * 있는가. 패널의 열림/닫힘은 돔 카메라에게 「창 크기가 바뀐 사건」이라,
   * 이 값이 플립될 때마다 선택된 노드를 보이는 영역 기준으로 부드럽게
   * 재프레이밍한다. 2D 에서는 무시된다(생략 시 false).
   */
  detailPanelVisible?: boolean;
  /** 발자국 표현 설정 — `useFootprint()` 로 읽어 내려보낸다. 생략 시 발자국 없음. */
  footprint?: FootprintPreference | null;
  /**
   * 확장 설정 — 펼치기 표시(알약/막대/배지) · 자식 배치 · 한 번에 여는 개수 ·
   * 이름을 시도할 개수 · 동시에 펼쳐 둘 부모 수. HomePage 가 `useExpand()` 로
   * 읽어 내려보낸다. 생략 시 `DEFAULT_EXPAND`(설정을 안 건드린 화면과 동일).
   */
  expand?: ExpandPreference;
  /**
   * 휠과 세로 스와이프가 누구 것인가 — `topology-pointer-handlers.ts` 의
   * `wheelIntent` 문서 참고. 워크벤치는 생략(= `"zoom"`, 현행 무변경),
   * 스크롤하는 문서 안에 밴드로 박히는 표면만 `"page-scroll"` 을 넘긴다.
   */
  wheelIntent?: "zoom" | "page-scroll";
  /**
   * 앰비언트 모션이 잠들기까지의 무입력 시간. 생략 시 워크벤치 기본
   * (`AMBIENT_SLEEP_DELAY_MS`, 30초 — 사람이 지도를 **오래 열어 두고** 판단하는
   * 표면의 값).
   *
   * 관문처럼 세션 자체가 그보다 짧을 수 있는 표면은 짧게 넘긴다. 실측
   * (2026-07-28 모션석): `/download` 방문자는 **구조적으로 휴면에 도달할 수
   * 없었다** — 캔버스가 뷰포트의 62% 라 CTA 로 마우스를 옮기는 동작만으로도
   * `pointermove` 가 30초 시계를 리셋했다. 그런데 이 표면에는 그 연소가 사는
   * 것이 없다(각성 상태 캔버스 변화량 초당 0.056% — 혜성이 지각되지 않는다).
   * 포스터에 워크벤치 요금을 내던 셈이다.
   */
  ambientSleepDelayMs?: number;
}

export function TopologyMapV2(props: TopologyMapV2Props) {
  const { nodes, edges, focus, minimal, emphasizedNeighborSlug, dataSourceKey = null, overviewFit = "spine", fitViewToken, spotlightFitToken = 0, relayoutToken, revealToken, onSelectEdge, onSelect, onPaneClick, onVisibleCountChange, onGraphStatsChange, onZoomTierChange, onContextMenuNode, onContextMenuPane, agentFocusNodeId, spotlightIds = null, onHoverEdge, selectedEdge = null, previewEdge = null, expandedParents, onToggleCluster, onHoverCluster, clusterHint, realmRootId = null, onEnterRealm, realmEnterLabel, realmEnterTooltip, realmCaption = null, clusterBarLabels = null, canvasLabel, walkNoticeLabel, visitedTrail, trailLensActiveRef, trailHoverNodeIdRef, panelHoverNodeIdRef, tierReveal, tourAnchorNodeId = null, tourAnchorRef, overlayOpen = false, glyphSet = "geometric", canvasBackground = "dot", view3d = false, mapArrangement = DEFAULT_MAP_ARRANGEMENT, detailPanelVisible = false, footprint = null, expand = DEFAULT_EXPAND, wheelIntent = "zoom", ambientSleepDelayMs, onWalkDeadEnd = null } = props;

  const realmEnterButtonRef = useRef<HTMLButtonElement | null>(null);

  // 설치 앱 검증기는 canvas 내부의 픽셀 엣지를 DOM selector 로 찾을 수 없다.
  // 검증 전용 이벤트가 오면 현재 포커스와 맞닿은 실제 그래프 엣지를 같은
  // onSelectEdge 계약으로 선택한다. 평상시에는 이벤트가 발생하지 않으며,
  // 별도 상태나 사용자 vault 를 쓰지 않는다.
  useEffect(() => {
    if (!onSelectEdge) return;
    const handleVerifySelectEdge = (event: Event) => {
      const preferredNodeId =
        event instanceof CustomEvent &&
        typeof event.detail?.preferredNodeId === "string"
          ? event.detail.preferredNodeId
          : focus.selectedSlug;
      const edge =
        edges.find(
          (candidate) =>
            candidate.source === preferredNodeId || candidate.target === preferredNodeId,
        ) ?? edges[0];
      if (!edge) {
        window.dispatchEvent(
          new CustomEvent("ontology-atlas:verify-edge-selected", {
            detail: { error: "missing-edge" },
          }),
        );
        return;
      }
      onSelectEdge({
        sourceId: edge.source,
        targetId: edge.target,
        relationType: edge.relationType,
        declaredBySlug: edge.declaredBySlug,
      });
      window.dispatchEvent(
        new CustomEvent("ontology-atlas:verify-edge-selected", {
          detail: {
            sourceId: edge.source,
            targetId: edge.target,
            relationType: edge.relationType,
          },
        }),
      );
    };
    window.addEventListener("ontology-atlas:verify-select-edge", handleVerifySelectEdge);
    return () => {
      window.removeEventListener("ontology-atlas:verify-select-edge", handleVerifySelectEdge);
    };
  }, [edges, focus.selectedSlug, onSelectEdge]);

  // `handleWheel` is wired natively (non-passive) inside `useTopologyLoop` —
  // see its own FIX comment — not bound here as a JSX prop.
  /**
   * 막다른 길 안내 — **노드 옆에, 스스로 사라지고, 초점을 빼앗지 않는다**
   * (2026-08-10 소유자 실사용 지적 3건).
   *
   * ## 왜 앱 공용 토스트를 버렸나
   *
   * 처음에는 토스트로 띄웠다. 「새 표면을 만들지 않는다」는 판단은 그때도 옳았지만,
   * 실물에서 세 가지가 한꺼번에 틀렸다 — 셋 다 **한 원인**에서 나왔다:
   *
   * | 소유자가 본 것 | 원인 |
   * |---|---|
   * | *"이렇게 나오면 모르겠는데?"* | 토스트 자리는 화면 우하단이다. 막힌 노드는 화면 가운데 어딘가에 있고, 500px 떨어진 곳의 문장은 「지금 누른 것」과 이어지지 않는다 |
   * | *"사라지지도 않고 계속떠있고"* | 닫기 버튼이 초점을 받으면 sonner 는 스스로 사라지는 시계를 멈춘다 |
   * | *"x버튼 안누르면 아예 이동도 안됨"* | 초점이 토스트로 넘어가면 방향키가 캔버스에 도착하지 않는다 |
   *
   * 그래서 이 안내는 **초점을 받을 수 없는 것**이어야 한다 — 버튼이 없고
   * `pointer-events: none` 이다. 놓쳐도 잃는 것이 없으므로(그 방향에 노드가 없다는
   * 사실은 다시 눌러 보면 또 알 수 있다) 토스트의 규율(*"놓치면 곤란한 일은 상주
   * 표면이 맡는다"*)과도 맞다. 보조기술에는 `aria-live` 로 읽힌다.
   *
   * 모션은 **이미 있는 기구**를 쓴다 — `usePanelPresence` + `overlay-spring-surface`
   * (감속 사용자는 `overlay-fade-only`). 새 키프레임 0 · 새 토큰 0.
   */
  const [notice, setNotice] = useState<{ x: number; y: number; key: number } | null>(null);
  const noticeTimerRef = useRef<number | null>(null);
  const reducedMotion = useReducedMotion();
  const noticePresence = usePanelPresence(notice !== null);
  const handleWalkDeadEnd = useCallback(
    (point: { x: number; y: number } | null) => {
      onWalkDeadEnd?.(point);
      if (!walkNoticeLabel || !point) return;
      if (noticeTimerRef.current !== null) window.clearTimeout(noticeTimerRef.current);
      setNotice({ x: point.x, y: point.y, key: performance.now() });
      noticeTimerRef.current = window.setTimeout(() => {
        noticeTimerRef.current = null;
        setNotice(null);
      }, WALK_NOTICE_HOLD_MS);
    },
    [onWalkDeadEnd, walkNoticeLabel],
  );
  useEffect(
    () => () => {
      if (noticeTimerRef.current !== null) window.clearTimeout(noticeTimerRef.current);
    },
    [],
  );

  const { canvasRef, containerRef, handlePointerDown, handlePointerMove, handlePointerUp, handlePointerCancel, handleContextMenu, handleKeyDown } =
    useTopologyLoop({
      nodes,
      edges,
      onWalkDeadEnd: handleWalkDeadEnd,
      wheelIntent,
      ambientSleepDelayMs,
      focusedSlug: focus.selectedSlug,
      emphasizedNeighborSlug,
      dataSourceKey,
      fitViewToken,
      spotlightFitToken,
      relayoutToken,
      revealToken,
      onSelectEdge,
      onHoverEdge,
      selectedEdge,
      previewEdge,
      onSelect,
      onPaneClick,
      onVisibleCountChange,
      onGraphStatsChange,
      onZoomTierChange,
      onContextMenuNode,
      onContextMenuPane,
      agentFocusNodeId,
      spotlightIds,
      expandedParents,
      onToggleCluster,
      onHoverCluster,
      realmRootId,
      onEnterRealm,
      realmEnterButtonRef,
      realmCaption,
      clusterBarLabels,
      visitedTrail,
      trailLensActiveRef,
      trailHoverNodeIdRef,
      panelHoverNodeIdRef,
      tierReveal,
      overviewFit,
      tourAnchorNodeId,
      tourAnchorRef,
      glyphSet,
      canvasBackground,
      view3d,
      mapArrangement,
      detailPanelVisible,
      footprint,
      expand,
    });

  return (
    <div
      ref={containerRef}
      data-testid="topology-map-v2"
      data-map-engine="v2"
      data-minimal={minimal ? "true" : "false"}
      data-preview-edge={
        previewEdge
          ? `${previewEdge.sourceId}>${previewEdge.targetId}:${previewEdge.relationType}`
          : undefined
      }
      data-preview-phase={previewEdge?.phase}
      // rank18 — 오버레이가 열린 동안 캔버스를 aria 트리 + Tab 순회에서
      // 제외(inert 는 포인터도 함께 막는다). INDEX/데이터시트가 대체 목록.
      aria-hidden={overlayOpen}
      inert={overlayOpen}
      style={{ position: "relative", width: "100%", height: "100%" }}
    >
      <canvas
        ref={canvasRef}
        data-testid="topology-map-v2-canvas"
        /* `G M` 이 이 캔버스를 찾아 초점을 주는 표식 — 자세한 이유는
           `shared/lib/focus-map-canvas.ts`. `data-testid` 는 시험의 것이라
           런타임 선택자로 쓰지 않는다. */
        data-surface-role={MAP_CANVAS_SURFACE_ROLE}
        /**
         * **끌 수 있는 것은 그림이 아니다** (2026-07-28 모션석 P3).
         *
         * 예전에는 `role="img"` 로 AT 에 "정지 이미지" 라고 선언하면서 라벨로는
         * "끌어서 움직여 볼 수 있어요" 라고 말했다 — 접근성 트리 안에 어포던스
         * 모순이 그대로 박혀 있었다. `tabIndex` 도 없어 키보드 사용자에게는
         * 신호가 **0개**였다.
         *
         * `role="application"` 이 아니라 `group` 인 이유: `application` 은 AT 의
         * 기본 키 처리를 통째로 뺏는다. 예전 근거는 *"이 캔버스는 자체 키보드
         * 순회를 제공하지 않으므로 뺏고 안 주는 것이 가장 나쁘다"* 였다.
         *
         * ⚠️ **그 전제는 2026-08-09 에 사실이 아니게 됐다** — 방향키로 이웃을 걷는
         * 순회가 붙었다(`onKeyDown`). 그런데도 `group` 을 유지한다: 우리가 삼키는
         * 키는 **네 방향키뿐**이고 나머지는 AT 에 그대로 남기는 것이, 키 처리
         * 전부를 뺏는 것보다 잃는 게 적다. 스크린리더 읽기 모드가 방향키를 먼저
         * 가져가는 환경이 관측되면 그때 `application` 을 다시 본다 — 실제 보조기술
         * 로 재 보지 않고 미리 뺏지 않는다.
         *
         * 포커스 링은 **정지 프레임의 어포던스이기도 하다** — 모션 예산 0이다.
         */
        role={canvasLabel ? "group" : undefined}
        aria-label={canvasLabel}
        tabIndex={canvasLabel ? 0 : undefined}
        // `cursor-grab` 이 **기본 상태**인 이유 (2026-07-28 카운슬 「상호작용」):
        // 이 캔버스의 1차 행동은 팬이다. 포인터 핸들러가 노드/엣지 위에서
        // `pointer` 로, 미는 동안 `grabbing` 으로 인라인 덮어쓴다.
        //
        // **클래스여야 한다 — 인라인 style 이면 안 된다.** 드래그가 끝나며
        // `style.cursor = ""` 로 되돌릴 때 인라인 기본값은 그 자체가 지워져
        // `auto` 로 떨어진다(실측). 클래스로 두면 인라인이 걷힌 자리에서
        // 캐스케이드가 `grab` 을 되돌려 준다 — 되돌림이 저절로 옳아진다.
        className="cursor-grab outline-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-indigo-accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[color:var(--color-canvas)]"
        style={{
          display: "block",
          width: "100%",
          height: "100%",
          // `none` 은 세로 스와이프까지 삼킨다 — 스크롤하는 문서 안의 밴드에서는
          // 폰에서 페이지가 아예 안 움직인다. `pan-y` 면 세로는 페이지가,
          // 가로 드래그는 지도가 가져간다.
          touchAction: wheelIntent === "page-scroll" ? "pan-y" : "none",
        }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerCancel}
        onContextMenu={handleContextMenu}
        /**
         * 방향키로 이웃을 걷는다 (2026-08-09, 갈래 B). 규칙은
         * `../interaction/keyboard-walk`, 배선은 `use-topology-loop` 의
         * `handleKeyDown`. 이것이 붙기 전까지 이 캔버스는 초점을 받을 수는 있어도
         * **키로 할 수 있는 일이 0개**였다.
         */
        onKeyDown={handleKeyDown}
      />
      {/* S4 궤도 "전개" 버튼 — 캔버스 좌표 앵커(loop 가 매 프레임 transform 갱신).
          기본 숨김; 포커스 노드에 자식이 있고 영역 밖일 때만 노출. 방사형 메뉴
          금지 — 버튼 하나. 호버 시 마이크로 툴팁(평문 한 줄). */}
      {onEnterRealm ? (
        <button
          ref={realmEnterButtonRef}
          type="button"
          data-testid="topology-realm-enter-button"
          aria-label={realmEnterLabel}
          /**
           * **보이지 않는 동안은 탭 정지가 아니다** (2026-07-29 키보드 실측).
           *
           * 이 버튼은 매 프레임 `opacity`/`pointerEvents` 로만 나타났다 사라지는데
           * (레이아웃 유지가 목적), `opacity: 0` 은 **포커스 가능성을 끄지 않는다.**
           * 그래서 지도에서 Tab 26번째가 여기 멈췄다: 링은 alpha 0 으로 그려져
           * 화면 어디에도 안 보이고, Enter 를 눌러도 아무 일이 없다(클릭 판정은
           * 캔버스의 히트 테스트에 있다). 키보드 사용자에게는 **포커스가 사라진
           * 한 칸**이다.
           *
           * `pointer-events: none` 과 짝을 맞춰 탭 순서에서도 빼고, 스크린리더
           * 에서도 감춘다. 보일 때는 둘 다 되돌아온다.
           */
          tabIndex={-1}
          aria-hidden
          // rank6 — 항상 flex 로 레이아웃하고 opacity/pointer-events(loop 이
          // 매 프레임 갱신)로만 나타나고 사라진다. display 하드 토글의 "툭"
          // 대신 opacity 전이로 페이드 — 카메라 추종은 유지.
          // duration 은 램프의 "이동"(--motion-base)을 명시한다: 이 전이의
          // 주역은 hover 색이 아니라 컨트롤의 등장/퇴장이라 기본(확인, 120ms)
          // 에 맡기면 페이드가 툭 튀는 쪽으로 되돌아간다. 이징은 지도 표면과
          // 같은 커브를 유지한다.
          className={controlClass({ shape: "icon", className: "group absolute left-0 top-0 z-40 flex h-7 w-7 rounded-full border border-[color:var(--topology-v2-panel-border)] bg-[color:var(--topology-v2-panel-surface)] text-[color:var(--topology-v2-indigo-bright)] shadow-[var(--topology-v2-panel-shadow)] transition-[opacity,background-color] duration-[var(--motion-fast)] ease-[var(--topology-motion-ease-out)] hover:bg-[color:var(--topology-v2-panel-row-hover)]" })}
          style={{ opacity: 0, pointerEvents: "none" }}
        >
          <Orbit size={ICON_SIZE.md} aria-hidden />
          {/*
           * **3D 에서는 이 툴팁을 안 그린다** (2026-08-18 소유자 지시).
           *
           * 이 버튼은 매 프레임 노드의 **투영된** 자리로 옮겨 다닌다. 2D 에서는
           * 카메라가 멈춰 있으면 자리도 멈추니 그 밑에 뜬 글상자가 가만히 있는데,
           * 돔에서는 노드가 회전·원근으로 계속 움직여서 같은 글상자가 장면 위를
           * 미끄러진다 — 읽으려고 눈을 두면 이미 딴 데 가 있다.
           *
           * 기능을 끄는 것이 아니라 **설명만** 끈다: 버튼도 `aria-label`
           * (「이것만 보기」)도 그대로라 마우스로도 보조기술로도 똑같이 닿는다.
           */}
          {realmEnterTooltip && !view3d ? (
            <span
              role="tooltip"
              className="pointer-events-none absolute left-1/2 top-full mt-2 hidden -translate-x-1/2 whitespace-nowrap rounded-[var(--topology-v2-panel-radius)] border border-[color:var(--topology-v2-panel-border)] bg-[color:var(--topology-v2-panel-surface)] px-2 py-1 text-label font-[var(--font-weight-signature)] text-[color:var(--topology-v2-panel-text-primary)] shadow-[var(--topology-v2-panel-shadow)] group-hover:block"
            >
              {realmEnterTooltip}
            </span>
          ) : null}
        </button>
      ) : null}
      {/* 가이드 투어 캔버스 노드 앵커(2·4단계) — realm 버튼과 같은 프로젝션
          기법(loop 가 매 프레임 transform + `--tour-anchor-r` 갱신). 페인트
          없는 **측정 프로브**다: 스크림/컷아웃 페인트는 GuidedTourOverlay 가
          z-70 오버레이 레이어에서 이 rect 를 읽어 그린다 (2026-07-23 Guardian
          정정 — 위젯 내부 z-40 에서 스크림을 그리면 상단 툴바 등 바깥 크롬이
          스크림 위에 떠서 testid 단계와 감광 레이어링이 어긋났다). */}
      {tourAnchorRef ? (
        <div
          ref={tourAnchorRef}
          data-testid="topology-tour-anchor"
          aria-hidden
          className="pointer-events-none absolute left-0 top-0 z-40"
          style={{
            width: "calc(var(--tour-anchor-r, 0px) * 2)",
            height: "calc(var(--tour-anchor-r, 0px) * 2)",
            visibility: tourAnchorNodeId ? "visible" : "hidden",
          }}
        />
      ) : null}
      {noticePresence.mounted && notice ? (
        <div
          key={notice.key}
          data-walk-notice=""
          {...transientSurface("notice")}
          /* 보조기술에는 읽히고, 포인터·초점에는 존재하지 않는다. */
          role="status"
          aria-live="polite"
          data-state={noticePresence.exiting ? "closed" : "open"}
          className={[
            reducedMotion ? "overlay-fade-only" : "overlay-spring-surface",
            "pointer-events-none absolute z-40 max-w-[240px] -translate-x-1/2 -translate-y-full rounded-[var(--topology-v2-panel-radius)] border border-[color:var(--topology-v2-panel-border)] bg-[color:var(--topology-v2-panel-surface)] px-2.5 py-1.5 text-label text-[color:var(--topology-v2-panel-text-primary)] shadow-[var(--topology-v2-panel-shadow)]",
          ].join(" ")}
          style={{
            left: notice.x,
            // 노드 **위쪽**에 띄운다 — 아래는 라벨 자리다(`LABEL_OFFSET`).
            top: notice.y - WALK_NOTICE_NODE_GAP,
            ["--overlay-spring-origin" as string]: "center bottom",
          }}
        >
          {walkNoticeLabel}
        </div>
      ) : null}
      {clusterHint ? (
        <span
          data-testid="topology-cluster-hint"
          style={{
            position: "absolute",
            width: 1,
            height: 1,
            padding: 0,
            margin: -1,
            overflow: "hidden",
            clip: "rect(0 0 0 0)",
            whiteSpace: "nowrap",
            border: 0,
          }}
        >
          {clusterHint}
        </span>
      ) : null}
    </div>
  );
}
