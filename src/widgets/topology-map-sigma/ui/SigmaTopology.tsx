'use client';

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useMediaQuery } from 'usehooks-ts';
import { useTranslations } from 'next-intl';
import { Check, Clipboard, Maximize2 } from 'lucide-react';
import { ErrorBoundary } from '@/shared/ui';
import { SigmaErrorFallback } from './SigmaErrorFallback';
import { Tooltip } from '@/shared/ui';
import Sigma from 'sigma';
import EdgeCurveProgram from '@sigma/edge-curve';
import { createNodeBorderProgram } from '@sigma/node-border';
import type Graph from 'graphology';
import type { Category } from '@/entities/category';
import {
  detectOrphanProjects,
  detectPromotionCandidates,
  detectStaleProjects,
  type Project,
} from '@/entities/project';
import { buildOntologyHealthSignals } from '@/entities/knowledge-graph';
import {
  buildGraph,
  settleLayout,
  toneForOwnerKey,
  type SigmaEdgeAttrs,
  type SigmaNodeAttrs,
} from '../lib/graph-build';
import {
  buildProjectOntologyCounts,
  formatAgentPostChangeSyncPacket,
  isContainmentRelation,
  type OntologyCountsForProject,
} from '@/shared/lib/ontology-tree';
import { useOntologyInsight } from '@/features/vault-ontology';
import { useOntologyKindLabel } from '@/entities/ontology-class';
import { ontologyFillTone } from '../lib/ontology-tone';
import { entranceSizeFactor, NODE_ENTRANCE_MS, reconcileFirstSeen } from '../lib/reducer-entrance';
import { snapshotNodeCoords, restoreNodeCoords, type NodeCoord } from '../lib/coord-preservation';
import { resolveOwnerDomainLabel } from '../lib/owner-domain';
import { indigoRgba } from '@/shared/config/indigo-tokens';
import { useSyncedCallbackRef } from '@/shared/lib/use-synced-callback-ref';
import { computeDepthMap, shortestPath } from '../lib/depth';
import { useCameraUrlSync } from '../lib/use-camera-url-sync';
import { resolveTopologyPalette } from '../lib/topology-palette';
import { useGraphKeyboardNav } from '../lib/use-graph-keyboard-nav';
import type { SigmaForces, SigmaOverlays } from '../model/controls-state';
import { startPhysics, type PhysicsController } from '../lib/physics';
import { createWorkerLayoutController } from '../lib/worker-layout-controller';
import { extractDomainLabel } from '../lib/labels';
import {
  BOUNCE_DURATION_MS,
  computeBounceFactor,
} from '../lib/reducer-anim';
import {
  AUDIT_ORPHAN_COLOR,
  AUDIT_PROMOTION_COLOR,
  AUDIT_STALE_COLOR,
  applyAuditOverlay,
} from '../lib/reducer-audit';
import {
  buildPathRelationSteps,
  formatPathAllPathsMcpCheck,
  formatPathAllPathsPlanMcpCheck,
  formatPathEvidenceBrief,
  formatPathExplainRelationMcpCheck,
  formatPathMcpCheck,
  formatPathRelationPreflightMcpCheck,
  formatPathRelationPreflightReason,
  inferPathRelationPreflightType,
  resolvePathGraphNodeId,
  shouldUsePathSelectionGesture,
} from '../lib/path-interaction';
import { applyFocusEdgeOverlay, applyFocusOverlay } from '../lib/reducer-focus';
import {
  matchesCategory as matchesCategoryFn,
  matchesSearch as matchesSearchFn,
  passesDepth as passesDepthFn,
} from '../lib/reducer-filter';
import {
  shouldHideDenseOverviewEdge,
  shouldSuppressDenseOverviewEdges,
} from '../lib/reducer-edge-lod';
import { applyContextDimOverlay } from '../lib/reducer-context-dim';
import { applyOwnerTintOverlay } from '../lib/reducer-owner-tint';
import {
  HUB_LABEL_RATIO,
  isOverviewLandmark,
  isSkeletonAlwaysLabeled,
  isTopologyLabelAnchor,
  shouldCullLabelAtZoom,
} from '../lib/label-lod';
import {
  applyOverlaySize,
  shouldHideNode,
} from '../lib/reducer-overlay-flags';
import { SigmaContextMenu, type SigmaContextMenuData } from './SigmaContextMenu';
import { SigmaFocusLabel } from './SigmaFocusLabel';
import { SigmaEdgeTooltip, type SigmaEdgeTooltipData } from './SigmaEdgeTooltip';
import { SigmaLegendRow } from './SigmaLegendRow';
import { SigmaSkeletonCards, type SkeletonCardModel } from './SigmaSkeletonCards';
import {
  resolveSafeAreaCameraFit,
  resolveSkeletonSafeInsets,
} from '../lib/camera-fit';
import { SigmaNodeTooltip, type SigmaNodeTooltipData } from './SigmaNodeTooltip';
import { copyText } from '@/shared/lib/copy-text';
import { pruneRuntimeRecentSlugs } from '@/shared/lib/ontology-description';

const POSITION_STORAGE_KEY = 'demo:sigma-node-positions:v1';
/** 안정 참조 빈 set — impactNodes 미지정 시 매 render 새 Set 생성 회피. */
const EMPTY_SLUG_SET: ReadonlySet<string> = new Set();

// audit overlay 임계값 — 30 일 이상 비변경 노드를 stale 강조, fan-in 4
// 이상이면 promotion 후보. dogfood 18 노드 규모 default.
const AUDIT_STALE_DAYS_THRESHOLD = 30;
const AUDIT_PROMOTION_MIN_FAN_IN = 4;

// overlay 3종 색상 — 디자인 시스템 무채색 + 단일 인디고 원칙을 유지하되
// audit 경고만 warm tone 셋으로 구분. 셋 중 같은 노드에 겹치면 우선순위:
// stale > orphan > promotion (stale 이 가장 수리 우선순위 높음).
// Demo camera motion curve — cubic-bezier(0.22, 1, 0.36, 1) 근사치.
// 토스·애플 감성의 "빠르게 출발해서 부드럽게 안착" — 기존 cubicInOut 의
// 양 끝 대칭 감 대신 arrival 쪽을 더 길게 풀어 준다. easeOutQuart.
const CAMERA_EASING = (k: number) => 1 - Math.pow(1 - k, 4);

// vault / 빌드타임 dogfood 진실원에 ontology 노드가 0 인 경우 fallback —
// referential stability 보장 (매 render 새 Map 생성 회피).
const EMPTY_ONTOLOGY_COUNTS: Map<string, OntologyCountsForProject> = new Map();

// 선택 bounce — 토스 버튼 / 애플 아이콘 탭 탄성. 280ms sine curve 로
// 1.0 → 1.2 → 1.0. 너무 길면 요란, 너무 짧으면 안 느껴짐. 280 이 체감 스윗스팟.
// BOUNCE / CONTAINER_HOVER 상수와 phase 함수는 ../lib/reducer-anim 으로
// 추출 (A2-4 1 차 슬라이스). 컴포넌트는 import 한 동일 이름을 그대로 사용.

// AUDIT_* 색·border 상수와 applyAuditOverlay 는 ../lib/reducer-audit 으로
// 추출 (A2-4 1 차 슬라이스). 위 import 통해 동일 이름으로 사용.

/**
 * 현재 html data-theme 을 보고 sigma 의 labelColor 에 들어갈 rgba 문자열을
 * 돌려준다. 라이트 모드에선 어두운 텍스트, 다크 모드에선 기존 밝은 톤.
 * SSR 평가 시점엔 document 가 없으므로 다크 톤 fallback.
 */
function resolveSigmaLabelColor(): string {
  if (typeof document === 'undefined') return 'rgba(235, 240, 250, 0.95)';
  const theme = document.documentElement.getAttribute('data-theme');
  return theme === 'light'
    ? 'rgba(20, 22, 26, 0.95)'
    : 'rgba(235, 240, 250, 0.95)';
}

function createSigma(
  graph: Graph<SigmaNodeAttrs, SigmaEdgeAttrs>,
  container: HTMLDivElement,
  minimal = false,
) {
  // 3-layer 노드 렌더링: outer halo → crisp border → fill.
  //  · outer (2.5px): 허브는 인디고 α 글로우 — 정적 "중력감", 선택 시 nodeReducer
  //    가 α 를 올려 선택 halo 역할 겸용. 비허브는 transparent.
  //  · border (1.2px): 배경 대비 분리감. cycle 48 — 1.5 → 1.2 로 살짝
  //    줄여 leaf 가 \"링\" 보다 \"solid disc with hairline\" 으로 읽히도록
  //    조정 (0.8 까지 줄였더니 leaf 가 사라짐 — 1.2 가 균형점).
  //  · fill: 본체 색.
  const borderNodeProgram = createNodeBorderProgram<SigmaNodeAttrs, SigmaEdgeAttrs>({
    borders: [
      { size: { value: 2.5, mode: 'pixels' }, color: { attribute: 'outerBorderColor' } },
      { size: { value: 1.2, mode: 'pixels' }, color: { attribute: 'borderColor' } },
      { size: { fill: true }, color: { attribute: 'color' } },
    ],
  });

  // @sigma/edge-curve의 타입 선언이 제네릭을 받지 않아 Sigma<NodeAttrs, EdgeAttrs>
  // 생성자의 programs 맵 타입과 완벽히 맞지 않는다. 런타임 동작은 동일하므로
  // 설정 객체를 한 번에 unknown 경유로 캐스팅.
  const settings = {
    renderLabels: true,
    renderEdgeLabels: false,
    defaultEdgeType: 'curve',
    defaultNodeType: 'bordered',
    nodeProgramClasses: {
      bordered: borderNodeProgram,
    },
    edgeProgramClasses: {
      curve: EdgeCurveProgram,
    },
    // 라벨 표시 정책 — sigma 는 (1) rendered size threshold, (2) grid
    // collision filter 두 단계로 라벨을 솎아낸다. 작은 노드 (size < 7) 가
    // 영원히 라벨 후보에서 제외돼 "같은 줌인데 어떤 노드만 라벨 보이는"
    // 비대칭이 생기던 문제를 수정 — threshold 0 으로 모든 사이즈를 후보로
    // 두고, grid 도 줄여 zoom in 시 더 많은 노드가 라벨을 받게 한다.
    // overview (zoom out) 에서도 grid collision 이 자동 솎아주므로 화면이
    // 빽빽해지진 않는다.
    // minimal 모드: reducer 에서 모든 노드를 forceLabel 로 표시.
    labelRenderedSizeThreshold: minimal ? 1 : 0,
    labelDensity: minimal ? 1 : 1.2,
    labelGridCellSize: minimal ? 80 : 110,
    labelFont: "'Inter', system-ui, -apple-system, sans-serif",
    labelSize: 11,
    labelWeight: '600',
    // 라이트/다크 모드 모두 가독성을 위해 첫 렌더 시점 html data-theme 으로
    // 분기. 토글 시 dom mutation observer 가 setSetting 으로 갱신 (line 1040 부근).
    labelColor: { color: resolveSigmaLabelColor() },
    edgeLabelSize: 10,
    zIndex: true,
    allowInvalidContainer: true,
    minCameraRatio: 0.08,
    maxCameraRatio: 4,
    // 줌 민감도 — sigma default 1.7 은 트랙패드 작은 입력에도 "확확
    // 빨려드는" 느낌. 1.5 로 낮춰 세밀한 제어 + 자연스러운 점프 균형.
    zoomingRatio: 1.5,
    zoomDuration: 180,
  } as unknown as ConstructorParameters<typeof Sigma<SigmaNodeAttrs, SigmaEdgeAttrs>>[2];

  return new Sigma<SigmaNodeAttrs, SigmaEdgeAttrs>(graph, container, settings);
}

export interface TopologyRelationVisibilityStats {
  visible: number;
  total: number;
}

function countVisibleOverviewRelations(
  graph: Graph<SigmaNodeAttrs, SigmaEdgeAttrs>,
  cameraRatio: number,
  lodHideRatio: number,
  overviewEdgesReady: boolean,
): TopologyRelationVisibilityStats {
  if (
    shouldSuppressDenseOverviewEdges({
      edgeCount: graph.size,
      overviewEdgesReady,
    })
  ) {
    return { visible: 0, total: graph.size };
  }
  let visible = 0;
  graph.forEachEdge((edge) => {
    const [src, tgt] = graph.extremities(edge);
    const srcAttrs = graph.getNodeAttributes(src);
    const tgtAttrs = graph.getNodeAttributes(tgt);
    if (cameraRatio > lodHideRatio && !(srcAttrs.isHub && tgtAttrs.isHub)) {
      return;
    }
    if (
      shouldHideDenseOverviewEdge({
        edgeCount: graph.size,
        cameraRatio,
        edge: graph.getEdgeAttributes(edge),
        source: srcAttrs,
        target: tgtAttrs,
      })
    ) {
      return;
    }
    visible += 1;
  });
  return { visible, total: graph.size };
}

function getInitialSettleIterations(nodeCount: number, minimal: boolean): number {
  if (minimal) return nodeCount > 200 ? 120 : 180;
  if (nodeCount > 600) return 32;
  if (nodeCount > 200) return 56;
  if (nodeCount > 80) return 96;
  return 140;
}

interface SigmaTopologyProps {
  projects: Project[];
  categories: Category[];
  selectedSlug?: string | null;
  onSelectProject?: (slug: string) => void;
  onProjectOpen?: (slug: string) => void;
  onPaneClick?: () => void;
  /** 선택된 카테고리 ID. 설정되면 해당 카테고리 노드만 밝게 두고 나머지는 dim. */
  activeCategory?: string | null;
  /** 선택된 노드 기준 몇 hop 이웃까지 살릴지. null/undefined면 필터 off. */
  depthLimit?: number | null;
  /** 라이브 검색 필터 — 이 문자열이 이름·slug에 부분일치하지 않는 노드는 dim. */
  searchQuery?: string;
  /** d3-force 파라미터 실시간 조정. */
  forces?: SigmaForces;
  /** 허브만 보기 — true면 비허브 노드·엣지 숨김. */
  hubsOnly?: boolean;
  /**
   * 지도 위에 겹쳐 보는 3종 overlay 토글. 각 플래그는 독립 on/off:
   * - recentPulse: 최근 업데이트 노드의 size sine 변조 (기본 on)
   * - ownerTint: 노드 색을 owner 해시 기반으로 override
   * - backrefHighlight: 선택 노드가 있을 때 "이 노드를 의존으로 가진" 프로젝트(in-neighbors)만 별도 색으로 강조
   */
  overlays?: SigmaOverlays;
  /**
   * 증가할 때마다 전체 fit-to-view 애니메이션 실행. HomePage의 "지도 맞추기"
   * 버튼이 증분해서 카메라를 리셋한다.
   */
  fitViewToken?: number;
  /** 증가할 때마다 physics를 reheat (자동 정렬). 상단 툴바의 "자동 정렬" 버튼이
   *  증분한다. 드래그로 고정한 노드는 유지되고 자유 노드만 다시 settle. */
  relayoutToken?: number;
  /** 필터 후 "남은 노드" 수를 부모에게 알려 stats 패널 등에서 활용. */
  onVisibleCountChange?: (visible: number) => void;
  /** Sigma가 실제로 만든 graphology 그래프의 노드/관계 수. */
  onGraphStatsChange?: (stats: { nodes: number; relations: number }) => void;
  /** Overview edge LOD 이후 현재 화면에 대표로 남는 관계 수. */
  onRelationVisibilityChange?: (stats: TopologyRelationVisibilityStats) => void;
  /** 사용자가 처음으로 drag/더블클릭 했을 때 한 번 호출. 온보딩 hint 자동 dismiss
   *  같은 용도. 이후 재호출은 없다 (컴포넌트가 마운트 유지되는 한). */
  onFirstInteraction?: () => void;
  /**
   * true 면 보조 UI 를 전부 끈다: minimap · hub aurora · stats pill · URL sync ·
   * 키보드 nav. 프로젝트 상세의 "로컬 토폴로지" 처럼 컴포넌트가 작은 영역에
   * 임베드될 때 사용. physics/drag/hover/tooltip 은 유지.
   */
  minimal?: boolean;
  /**
   * Layer 1 에서 라벨 prefix 를 단축하기 위한 컨테이너 이름. e.g. "Demo Reactor"
   * 를 넘기면 "Demo Reactor · Router" → "Router" 로 표시. 미지정이면 원본 유지.
   */
  stripNamePrefix?: string;
  /**
   * 변경점 baseline 대비 added/changed 된 노드 id 집합. 여기 든 노드는 기존
   * recent-pulse 로 시각 강조된다 — 회의·리뷰에서 "기준 이후 바뀐 개념"을
   * 토폴로지에서 바로 본다. 비어있으면 기존 동작 유지.
   */
  changedSlugs?: ReadonlySet<string>;
  /**
   * R14: true 면 vault 의 ontology 도메인/역량/요소 노드와 그 관계를 같은
   * 그래프에 그린다. project↔project dependencies 는 그대로 살아있고
   * 그 위에 ontology 골격이 얹힌다. `/topology` 라우트 (HomePage) 에서 켠다.
   * project mini map 같은 작은 임베드는 끈 채로 두어 시야가 복잡해지지
   * 않게 한다.
   */
  showOntologyNodes?: boolean;
  /** true면 Path analysis mode용 primer를 그래프 위에 표시한다. */
  pathWorkflowActive?: boolean;
  pathSelection?: {
    sourceSlug: string | null;
    targetSlug: string | null;
  } | null;
  onPathSelectionChange?: (selection: {
    sourceSlug: string | null;
    targetSlug: string | null;
  }) => void;
  /**
   * "지도에서 영향 보기" — 비어 있지 않으면 이 set 의 노드(선택 노드의 전이
   * blast radius)만 인디고로 띄우고 나머지는 deep dim. drawer 의 blast-radius
   * 숫자(iter 3)를 *공간적으로* 보게 하는 graph-DB reachability 시각화.
   */
  impactNodes?: ReadonlySet<string>;
  /**
   * 구조 골격 진입(structural skeleton entry). 제공되면 토폴로지는 ForceAtlas2
   * scatter 대신 결정론적 radial 골격으로 그려진다 — 부모(HomePage)가
   * buildOntologySkeleton + buildSkeletonRadialLayout 로 계산해 넘긴다(FSD: widget
   * 은 view import 불가 → 데이터 주도). `skeletonLayout` 은 slug→{x,y(이미 Sigma
   * +y-up 으로 부호반전),size} precomputed 좌표; `skeletonSlugs` 는 진입에 보일
   * anchor+landmark 집합. 나머지 노드는 reducer 가 deep-dim(상주, 미제거).
   */
  skeletonLayout?: ReadonlyMap<string, { x: number; y: number; size: number }> | null;
  skeletonSlugs?: ReadonlySet<string> | null;
  /**
   * 골격 노드의 "상(form)" 을 DOM 카드로 — 제공되면 Sigma 는 엣지 hairline
   * 만 그리고 노드 시각(타이포·kind data-mark·count·선택 ring)은
   * SigmaSkeletonCards 오버레이가 책임진다. 카드 수는 골격+클릭 확장으로
   * ~20-60 바운드.
   */
  skeletonCards?: readonly SkeletonCardModel[] | null;
  className?: string;
}

function SigmaTopologyImpl({
  projects,
  categories,
  selectedSlug,
  onSelectProject,
  onProjectOpen,
  onPaneClick,
  activeCategory,
  depthLimit,
  searchQuery,
  forces,
  hubsOnly,
  overlays,
  fitViewToken,
  relayoutToken,
  onVisibleCountChange,
  onGraphStatsChange,
  onRelationVisibilityChange,
  onFirstInteraction,
  minimal = false,
  stripNamePrefix,
  changedSlugs,
  showOntologyNodes = false,
  pathWorkflowActive = false,
  pathSelection = null,
  onPathSelectionChange,
  impactNodes,
  skeletonLayout = null,
  skeletonSlugs = null,
  skeletonCards = null,
  className,
}: SigmaTopologyProps) {
  // 골격 진입 활성 — layout 이 주어지고 minimal(상세 임베드) 이 아닐 때만.
  const skeletonMode = !minimal && skeletonLayout != null && skeletonLayout.size > 0;
  // 카드 모드 — 골격 노드 시각을 DOM 카드가 대체. 캔버스 노드는 엣지 anchor
  // 로만 남는다 (투명 렌더).
  const skeletonCardsActive =
    skeletonMode && skeletonCards != null && skeletonCards.length > 0;
  const t = useTranslations('topologyWidgets.sigma');
  const kindLabel = useOntologyKindLabel();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const sigmaRef = useRef<ReturnType<typeof createSigma> | null>(null);
  // 미니맵 · aurora 처럼 sigma 인스턴스를 render 에 쓰는 자식들은 ref 를 직접
  // 읽으면 react-hooks/refs 룰 위반. state 로 들고 있어서 인스턴스 생성 시점에
  // setSigmaInstance → 자식 재렌더링 트리거.
  const [sigmaInstance, setSigmaInstance] = useState<ReturnType<typeof createSigma> | null>(null);
  const [overviewEdgesReadyGraph, setOverviewEdgesReadyGraph] = useState<
    Graph<SigmaNodeAttrs, SigmaEdgeAttrs> | null
  >(null);
  const physicsRef = useRef<PhysicsController | null>(null);
  const selectedSlugRef = useRef<string | null | undefined>(selectedSlug);
  const activeCategoryRef = useRef<string | null | undefined>(activeCategory);
  const depthLimitRef = useRef<number | null | undefined>(depthLimit);
  const searchQueryRef = useRef<string | undefined>(searchQuery);
  const hubsOnlyRef = useRef<boolean>(hubsOnly ?? false);
  const skeletonModeRef = useRef<boolean>(skeletonMode);
  const skeletonSlugsRef = useRef<ReadonlySet<string>>(skeletonSlugs ?? EMPTY_SLUG_SET);
  const skeletonCardsActiveRef = useRef<boolean>(skeletonCardsActive);
  // 골격 잉크 — CSS 토큰을 resolve 해 캐시 (라이트 모드에서 백색 알파가
  // 잉크 0 으로 소실되던 결함의 해소; 테마 전환 effect 가 재해석).
  const skeletonInkRef = useRef<{ hairline: string; spoke: string }>({
    hairline: 'rgba(255, 255, 255, 0.05)',
    spoke: 'rgba(255, 255, 255, 0.10)',
  });
  const pathWorkflowActiveRef = useRef(pathWorkflowActive);
  const pathSelectionRef = useRef(pathSelection);
  const onPathSelectionChangeRef = useSyncedCallbackRef(onPathSelectionChange);
  useEffect(() => {
    hubsOnlyRef.current = hubsOnly ?? false;
    // toggle 즉시 반영
    sigmaRef.current?.refresh();
  }, [hubsOnly]);
  // 골격 safe-area fit — autoRescale 은 컨테이너 *전체* 에 맞추므로 떠 있는
  // chrome(상단 툴바·우측 팝오버) 밑으로 카드가 파고든다. 가시 노드 bbox 를
  // chrome inset 을 뺀 safe rect 에 맞춰 카메라를 이동시킨다.
  //
  // 카메라 모션 체계 — 헌장의 "200ms 미만 default" 예외: 골격 reframe 은
  // 공간 연속성(어디서 어디로 이동했는지)이 목적이라 420ms 를 쓴다. 카드
  // 슬라이드(420ms)와 같은 duration/easing 으로 레이어 비동기 아티팩트 방지.
  const skeletonCameraMotion = useCallback(
    () => ({
      duration: reduceMotionRef.current ? 0 : 420,
      easing: CAMERA_EASING,
    }),
    [],
  );
  const runSkeletonSafeFit = useCallback(() => {
    const renderer = sigmaRef.current;
    if (!renderer) return false;
    const liveGraph = renderer.getGraph();
    if (liveGraph.order === 0) return false;
    // 선택 활성(카드 모드): 자식 열은 부모 카드 rect 기준 *px 도킹*이라
    // 줌과 무관 — 카메라는 줌하지 않고 부모 노드를 safe rect 중심으로
    // *팬만* 한다 (확장마다 줌이 출렁이면 공간 밀도가 매번 달라진다).
    const selected = selectedSlugRef.current ?? null;
    if (selected && skeletonCardsActiveRef.current && liveGraph.hasNode(selected)) {
      const { width, height } = renderer.getDimensions();
      const attrs = liveGraph.getNodeAttributes(selected);
      const nodeFramed = renderer.viewportToFramedGraph(
        renderer.graphToViewport({ x: attrs.x, y: attrs.y }),
      );
      const camera = renderer.getCamera();
      const state = camera.getState();
      // safe rect 중심(상단 chrome/우측 팝오버 inset 반영)으로 팬.
      const insets = resolveSkeletonSafeInsets(width, Boolean(selected));
      const safeCx =
        insets.left + Math.max(240, width - insets.left - insets.right) / 2;
      const safeCy = insets.top + (height - insets.top - insets.bottom) / 2;
      const va = renderer.viewportToFramedGraph({ x: width / 2, y: height / 2 });
      const vb = renderer.viewportToFramedGraph({ x: safeCx, y: safeCy });
      // 클릭 = 중앙 + 약한 줌인(읽기 배율 0.8 고정 — 곱연산이면 클릭마다
      // 누적 줌인됨), 바깥 클릭 = 선택 해제 → overview fit 이 줌아웃.
      const readingRatio = Math.min(state.ratio, 0.8);
      const k2 = state.ratio > 0 ? readingRatio / state.ratio : 1;
      camera.animate(
        {
          x: nodeFramed.x + (va.x - vb.x) * k2,
          y: nodeFramed.y + (va.y - vb.y) * k2,
          ratio: readingRatio,
        },
        skeletonCameraMotion(),
      );
      return true;
    }
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    liveGraph.forEachNode((id, attrs) => {
      // 골격 밖 dust(centroid park)는 fit 대상에서 제외.
      if (!skeletonSlugsRef.current.has(id)) return;
      const vp = renderer.graphToViewport({ x: attrs.x, y: attrs.y });
      if (vp.x < minX) minX = vp.x;
      if (vp.x > maxX) maxX = vp.x;
      if (vp.y < minY) minY = vp.y;
      if (vp.y > maxY) maxY = vp.y;
    });
    if (!Number.isFinite(minX)) return false;
    const { width, height } = renderer.getDimensions();
    const fit = resolveSafeAreaCameraFit({
      bbox: { minX, minY, maxX, maxY },
      viewport: { width, height },
      insets: resolveSkeletonSafeInsets(width, Boolean(selectedSlugRef.current)),
    });
    const camera = renderer.getCamera();
    const state = camera.getState();
    const newRatio = state.ratio * fit.ratioScale;
    // bbox 중심 → framed 좌표. safe rect 중심으로의 px 오프셋은 새 ratio
    // 기준 framed 거리로 환산(framedPerPx ∝ ratio)해 카메라를 평행이동.
    const centerFramed = renderer.viewportToFramedGraph(fit.bboxCenter);
    const va = renderer.viewportToFramedGraph({ x: width / 2, y: height / 2 });
    const vb = renderer.viewportToFramedGraph(fit.safeCenter);
    const k = state.ratio > 0 ? newRatio / state.ratio : 1;
    camera.animate(
      {
        x: centerFramed.x + (va.x - vb.x) * k,
        y: centerFramed.y + (va.y - vb.y) * k,
        ratio: newRatio,
      },
      skeletonCameraMotion(),
    );
    return true;
  }, [skeletonCameraMotion]);

  useEffect(() => {
    skeletonModeRef.current = skeletonMode;
    skeletonSlugsRef.current = skeletonSlugs ?? EMPTY_SLUG_SET;
    skeletonCardsActiveRef.current = skeletonCardsActive;
    const renderer = sigmaRef.current;
    if (!renderer) return;
    renderer.refresh();
    if (!skeletonMode) return;
    // rAF: refresh/graph swap 후 정규화가 확정된 다음 측정.
    const frame = requestAnimationFrame(() => {
      runSkeletonSafeFit();
    });
    return () => cancelAnimationFrame(frame);
  }, [skeletonMode, skeletonSlugs, skeletonLayout, skeletonCardsActive, sigmaInstance, runSkeletonSafeFit]);
  useEffect(() => {
    pathWorkflowActiveRef.current = pathWorkflowActive;
  }, [pathWorkflowActive]);
  useEffect(() => {
    pathSelectionRef.current = pathSelection;
  }, [pathSelection]);
  // impact (blast radius) highlight set — reducer closure 가 매 프레임 읽으므로
  // ref 로. 토글 즉시 반영 위해 변경 시 refresh.
  const impactNodesRef = useRef<ReadonlySet<string>>(impactNodes ?? EMPTY_SLUG_SET);
  useEffect(() => {
    impactNodesRef.current = impactNodes ?? EMPTY_SLUG_SET;
    sigmaRef.current?.refresh();
  }, [impactNodes]);
  // overlay 플래그들은 reducer closure 안에서 매 프레임 읽히므로 ref 로.
  // 기본값: recentPulse on (prop 미지정 시에도 기존 동작 유지), 나머지 off.
  const overlaysRef = useRef<SigmaOverlays>({
    recentPulse: overlays?.recentPulse ?? true,
    ownerTint: overlays?.ownerTint ?? false,
    backrefHighlight: overlays?.backrefHighlight ?? false,
    auditHighlight: overlays?.auditHighlight ?? false,
  });
  useEffect(() => {
    overlaysRef.current = {
      recentPulse: overlays?.recentPulse ?? true,
      ownerTint: overlays?.ownerTint ?? false,
      backrefHighlight: overlays?.backrefHighlight ?? false,
      auditHighlight: overlays?.auditHighlight ?? false,
    };
    sigmaRef.current?.refresh();
  }, [
    overlays?.recentPulse,
    overlays?.ownerTint,
    overlays?.backrefHighlight,
    overlays?.auditHighlight,
  ]);

  const { insight: ontologyInsight } = useOntologyInsight();
  // audit overlay 용 slug 집합. overlay 가 off 인 동안은 빈 Set 로 cheap.
  // 위의 AUDIT_STALE_DAYS_THRESHOLD / AUDIT_PROMOTION_MIN_FAN_IN 임계값
  // 사용 — stale 노드 / orphan / promotion 후보 3 종을 한 번에 분류.
  const auditSets = useMemo(() => {
    if (!overlays?.auditHighlight) {
      return {
        stale: new Set<string>(),
        orphan: new Set<string>(),
        promotion: new Set<string>(),
      };
    }
    const now = new Date();
    const ontologySignals =
      showOntologyNodes && ontologyInsight
        ? buildOntologyHealthSignals(ontologyInsight.nodes, ontologyInsight.edges, {
            now,
            staleDaysThreshold: AUDIT_STALE_DAYS_THRESHOLD,
            promotionMinFanIn: AUDIT_PROMOTION_MIN_FAN_IN,
          })
        : { stale: [], orphan: [], promotion: [] };
    return {
      stale: new Set(
        [
          ...detectStaleProjects(projects, {
            now,
            daysThreshold: AUDIT_STALE_DAYS_THRESHOLD,
          }).map((p) => p.slug),
          ...ontologySignals.stale.map((node) => node.slug),
        ],
      ),
      orphan: new Set([
        ...detectOrphanProjects(projects).map((p) => p.slug),
        ...ontologySignals.orphan.map((node) => node.slug),
      ]),
      promotion: new Set(
        [
          ...detectPromotionCandidates(projects, {
            minFanIn: AUDIT_PROMOTION_MIN_FAN_IN,
          }).map((p) => p.slug),
          ...ontologySignals.promotion.map((node) => node.slug),
        ],
      ),
    };
  }, [overlays?.auditHighlight, projects, showOntologyNodes, ontologyInsight]);
  const auditSetsRef = useRef(auditSets);
  useEffect(() => {
    auditSetsRef.current = auditSets;
    sigmaRef.current?.refresh();
  }, [auditSets]);

  // 카메라 상태 ↔ URL sync (?cam=x,y,r). minimal 모드 (상세 페이지의 로컬
  // 토폴로지 등) 에서는 URL 오염을 피하려고 비활성.
  useCameraUrlSync(minimal ? null : sigmaInstance);

  // recentlyUpdated pulse — 480ms 주기 sine 위상. nodeReducer 는 pulsePhaseRef
  // 를 읽어 size 를 1 + 0.12*sin(phase) 배수로 변조. 심플하게 render 반복을
  // 일으키려고 interval 에서 sigma refresh. edgeReducer 의 focus edge 도
  // 이 phase 를 읽어 alpha 를 변조 (전기 흐름 → 기존 선 반짝임).
  const pulsePhaseRef = useRef(0);
  // pulsePhase 의 sin 값 — 프레임당 1회 tick 에서 계산해 둔다. node/edge
  // reducer 가 각자 Math.sin(phase) 를 노드·엣지마다 재계산하던 비용을 제거
  // (한 프레임 안에서는 phase 가 고정이라 sin 값도 동일). sin(0)=0 로 초기화.
  const pulseSinRef = useRef(0);
  const reduceMotionRef = useRef(false);
  // 그래프에 recentlyUpdated 노드가 1개라도 있는지 — pulse interval 의
  // skip 조건에 사용. 매 interval 마다 graph 순회하면 O(N) × 매 120ms 라
  // 비쌈 → graph 빌드 시 한 번 계산.
  const hasAnyRecentRef = useRef(false);
  // Selection bounce — selectedSlug 변경 순간 performance.now() 저장,
  // BOUNCE_DURATION_MS 경과 후 null. nodeReducer 가 이 값으로 phase 계산해
  // focus 노드 size 를 1 → 1.2 → 1 sine 으로 변조.
  const bounceStartRef = useRef<number | null>(null);
  // pulseSinRef 와 같은 이유 — bounce phase 도 한 프레임 안에서는 모든 노드에
  // 동일하다. 매 노드마다 performance.now() + computeBounceFactor 를 부르지
  // 않도록 프레임당 1회 (bounce RAF 루프) 계산해 ref 로 공유. focus(선택/hover)
  // 상태가 살아있는 동안 nodeReducer 가 노드마다 읽던 비용 제거. bounce 비활성
  // 기본값 1.0 = size 변화 없음.
  const bounceFactorRef = useRef(1);
  const bounceRafRef = useRef<number | null>(null);
  // 좌표 보존(charter north-star) — 직전 build 의 노드 좌표 캐시. graph useMemo 가
  // rebuild 시 기존 노드를 제자리로 복원해 전체 reflow 를 회피한다.
  const layoutCacheRef = useRef<Map<string, NodeCoord>>(new Map());
  // 새 노드 "자라남" entrance — slug → 처음 그래프에 등장한 performance.now().
  // 라이브로 추가된 노드만 size 0→full grow (charter 심장: 실시간 시각 성장).
  const firstSeenRef = useRef<Map<string, number>>(new Map());
  const entranceInitializedRef = useRef(false);
  // 등장 애니메이션이 활성인 마감 시각 — now < 이 값이면 tick/reducer 가 entrance
  // 처리. 한 번의 비교로 hot-path 분기를 가드(평상시엔 per-node 비용 0).
  const enteringUntilRef = useRef(0);
  // 프레임당 1회 갱신되는 now (tick 에서) — reducer 가 노드마다 performance.now()
  // 부르지 않도록 공유. pulseSinRef 와 동일 패턴.
  const nowRef = useRef(0);
  // 테마 (light/dark) 별 토폴로지 색 팔레트. 토글 시 mutation observer 가
  // 새 팔레트로 교체 + graph attr 재페인트 + sigma.refresh().
  const paletteRefLocal = useRef(resolveTopologyPalette());
  // Sigma 의 animation tick 이 reduceMotionRef.current 를 매 frame 읽어 refresh
  // 생략 분기 — useMediaQuery 의 reactive boolean 을 ref 와 sync 시켜 inline
  // matchMedia + addEventListener boilerplate 제거. initializeWithValue:false
  // 로 SSR/정적 export hydration mismatch 회피.
  const prefersReducedMotion = useMediaQuery(
    '(prefers-reduced-motion: reduce)',
    { initializeWithValue: false },
  );
  useEffect(() => {
    reduceMotionRef.current = prefersReducedMotion;
  }, [prefersReducedMotion]);
  useEffect(() => {
    let t = 0;
    const tick = () => {
      // document.hidden / prefers-reduced-motion 시 refresh 생략 — 보이지
      // 않는 탭에서 사이클 돌려 배터리/CPU 쓰는 비용 제거. 탭 복귀 시
      // visibilitychange 가 setInterval 재진입을 기다리는데, 브라우저가
      // 자동 throttle 하므로 별도 처리 불필요.
      if (typeof document !== 'undefined' && document.hidden) return;
      if (reduceMotionRef.current) return;
      // reducer 가 노드마다 performance.now() 부르지 않도록 프레임당 1회 공유.
      const now = performance.now();
      nowRef.current = now;
      // Pulse / entrance 가 실제로 렌더에 영향 주는 상황에서만 refresh — 그래프가
      // 1979 노드일 때 refresh() 한 번이 비싼데, selection 도 hover 도 없고 최근
      // 업데이트·등장 노드도 없으면 바뀌는 게 없다. 완전 skip.
      const hasFocus = selectedSlugRef.current !== null;
      const hasRecentPulse =
        overlaysRef.current.recentPulse && hasAnyRecentRef.current;
      const hasEntering = now < enteringUntilRef.current;
      if (!hasFocus && !hasRecentPulse && !hasEntering) return;
      t += 1;
      pulsePhaseRef.current = (t * Math.PI) / 8; // 16 프레임 = 한 사이클
      // 프레임당 1회만 sin 계산 → node/edge reducer 는 이 값을 읽어 쓴다.
      pulseSinRef.current = Math.sin(pulsePhaseRef.current);
      sigmaRef.current?.refresh();
    };
    const handle = window.setInterval(tick, 120);
    return () => window.clearInterval(handle);
  }, []);
  const depthMapRef = useRef<Map<string, number>>(new Map());
  const rendererRefreshNeighbors = useRef<(() => void) | null>(null);
  const pathClearRef = useRef<(() => void) | null>(null);
  const pathSelectionApplyRef = useRef<
    ((selection: { sourceSlug: string | null; targetSlug: string | null } | null) => void) | null
  >(null);
  const [pathAnchorSlug, setPathAnchorSlug] = useState<string | null>(null);
  // 경로 찾기 결과 노드 체인. 완성 시 set, 일반 클릭/Esc 로 clear.
  // 상단 배너에서 "A → B → C (N hop)" 표기 + 해제 버튼용.
  const [pathResultSlugs, setPathResultSlugs] = useState<string[]>([]);
  const [pathCopied, setPathCopied] = useState(false);
  const [pathMcpCopied, setPathMcpCopied] = useState(false);
  const [pathRelationPreflightCopied, setPathRelationPreflightCopied] = useState(false);
  const [pathExplainRelationCopied, setPathExplainRelationCopied] = useState(false);
  const [pathAllPathsPlanCopied, setPathAllPathsPlanCopied] = useState(false);
  const [pathAllPathsCopied, setPathAllPathsCopied] = useState(false);
  // 콜백 refs — HomePage가 매 렌더마다 새 함수를 넘기면 effect가 재실행돼서
  // renderer가 kill/recreate되면서 클릭이 먹지 않는 문제를 막는다.
  const onSelectProjectRef = useSyncedCallbackRef(onSelectProject);
  const onProjectOpenRef = useSyncedCallbackRef(onProjectOpen);
  const onPaneClickRef = useSyncedCallbackRef(onPaneClick);
  const onFirstInteractionRef = useSyncedCallbackRef(onFirstInteraction);
  const interactedRef = useRef(false);
  // 줌 아웃 상태에서 비허브 노드·엣지를 숨겨 대규모 그래프(5k+) 렌더 비용
  // 을 낮춘다. ratio 가 크면 더 멀리서 본 것 (Sigma 규약). minimal 모드는
  // 작은 임베드라 임계값 약간 타이트하게.
  const cameraRatioRef = useRef<number>(1);
  const overviewEdgesReadyRef = useRef(false);
  const lastRelationVisibilityRef = useRef<TopologyRelationVisibilityStats | null>(null);
  const LOD_HIDE_RATIO = minimal ? 2.4 : 1.8;
  const [hoverLabel, setHoverLabel] = useState<SigmaNodeTooltipData | null>(null);
  const [hoveredSlug, setHoveredSlug] = useState<string | null>(null);
  const [contextMenu, setContextMenu] = useState<SigmaContextMenuData | null>(null);
  const [edgeHover, setEdgeHover] = useState<SigmaEdgeTooltipData | null>(null);

  // ontology kind 별 borderColor — vault frontmatter (또는 빌드타임 dogfood)
  // 의 노드를 buildProjectOntologyCounts 로 slug 별 집계. project 는 topology
  // visible kind 로 별도 색을 받고, 집계에서는 domain/capability/element/unknown
  // 만 센다. document 메타 kind 제외.
  // ontology 노드 0 인 경우 module-scope EMPTY 로 짧게 short-circuit — 매 render
  // 새 Map 생성 회피.
  const ontologyCountsBySlug = useMemo(() => {
    if (!ontologyInsight || ontologyInsight.nodes.length === 0) {
      return EMPTY_ONTOLOGY_COUNTS;
    }
    return buildProjectOntologyCounts(ontologyInsight.nodes);
  }, [ontologyInsight]);

  // R13 #70 — runtime diff highlight. polling 으로 새로 들어오거나 갱신된
  // project slug 들을 5s 간 'recently changed' 로 마크 → buildGraph 가 그
  // slug 의 노드를 recentlyUpdated:true 로 빌드 → 기존 recent pulse 가
  // amber sine 진동. AI agent / IDE 가 vault 만지면 그래프에서 직접 느껴짐.
  const RUNTIME_RECENT_TTL_MS = 5000;
  const [runtimeRecentSlugs, setRuntimeRecentSlugs] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
  const draggingNodeRef = useRef(false);
  const pendingRuntimeRecentPruneRef = useRef<Set<string>>(new Set());
  const flushPendingRuntimeRecentPrune = useCallback(() => {
    const pending = pendingRuntimeRecentPruneRef.current;
    if (pending.size === 0) return;
    const expired = [...pending];
    pending.clear();
    setRuntimeRecentSlugs((prev) => pruneRuntimeRecentSlugs(prev, expired));
  }, []);
  const prevSlugsRef = useRef<Set<string>>(new Set());
  const initializedRef = useRef(false);
  useEffect(() => {
    const currentSlugs = new Set(projects.map((p) => p.slug));
    // 첫 mount — projects 가 처음 로드될 때 모든 slug 가 added 처럼 보이지
    // 않게 baseline 만 저장하고 끝.
    if (!initializedRef.current) {
      prevSlugsRef.current = currentSlugs;
      initializedRef.current = true;
      return;
    }
    const added = [...currentSlugs].filter((s) => !prevSlugsRef.current.has(s));
    prevSlugsRef.current = currentSlugs;
    if (added.length === 0) return;
    setRuntimeRecentSlugs((prev) => {
      const next = new Set(prev);
      for (const s of added) next.add(s);
      return next;
    });
    const timer = setTimeout(() => {
      setRuntimeRecentSlugs((prev) => {
        if (draggingNodeRef.current) {
          for (const s of added) pendingRuntimeRecentPruneRef.current.add(s);
          return prev;
        }
        return pruneRuntimeRecentSlugs(prev, added);
      });
    }, RUNTIME_RECENT_TTL_MS);
    return () => clearTimeout(timer);
  }, [projects]);

  const graph = useMemo(() => {
    // 골격 진입 — project 노드도 골격에 속한 것만(보통 대장 1개). 안 그러면
    // 비골격 project 가 stamp 안 된 채 그래프에 남는다.
    const projectsForGraph =
      skeletonMode && skeletonLayout
        ? projects.filter((p) => skeletonLayout.has(p.slug))
        : projects;
    // 연결 수의 단일 진실원 — 골격 진입은 그래프를 가시 노드만으로 필터링해
    // graph.degree() 가 "화면 부분그래프" 기준이 된다. 전체 ontology 그래프
    // 기준 degree 를 attrs.fullDegree 로 박아 툴팁·팝오버가 같은 수를 쓴다.
    const fullDegreeBySlug = new Map<string, number>();
    if (showOntologyNodes && ontologyInsight) {
      for (const edge of ontologyInsight.edges) {
        if (edge.from === edge.to) continue;
        fullDegreeBySlug.set(edge.from, (fullDegreeBySlug.get(edge.from) ?? 0) + 1);
        fullDegreeBySlug.set(edge.to, (fullDegreeBySlug.get(edge.to) ?? 0) + 1);
      }
    }
    const g = buildGraph(projectsForGraph, categories, {
      stripNamePrefix,
      ontologyCountsBySlug,
      runtimeRecentSlugs,
      changedSlugs,
      fullDegreeBySlug: fullDegreeBySlug.size > 0 ? fullDegreeBySlug : undefined,
      // R14: showOntologyNodes 켜진 surface (HomePage / /topology) 에서만
      // ontology 노드를 그래프에 추가. project mini map 등은 켜지 않음.
      ontologyExtension:
        showOntologyNodes && ontologyInsight
          ? skeletonMode && skeletonLayout
            ? {
                // 골격 진입 — 그래프를 골격 노드(project+domain+landmark)만으로
                // 빌드. 전체 289 노드에 좌표를 덧칠하다 일부가 settle 좌표에 남아
                // bbox 를 폭파시키던 문제를 *원천 제거*(Sigma autoRescale 은 모든
                // 노드 bbox 로 fit 하므로 outlier 1개로 전체가 작아진다). 숨은
                // 노드는 클릭 확장 때 추가(lazy). contains 백본만 엣지로.
                nodes: ontologyInsight.nodes.filter((n) => skeletonLayout.has(n.id)),
                edges: ontologyInsight.edges.filter(
                  (e) =>
                    isContainmentRelation(e.type) &&
                    skeletonLayout.has(e.from) &&
                    skeletonLayout.has(e.to),
                ),
              }
            : {
                nodes: ontologyInsight.nodes,
                edges: ontologyInsight.edges,
              }
          : undefined,
    });
    if (skeletonMode && skeletonLayout) {
      // ForceAtlas2 대신 결정론적 radial 좌표를 stamp. 이제 그래프의 모든 노드가
      // 골격이라 stamp 가 완전(누락/outlier 0). 물리 미실행 = "이미 배치된" 골격.
      g.forEachNode((id) => {
        const pt = skeletonLayout.get(id);
        if (pt) {
          g.setNodeAttribute(id, 'x', pt.x);
          g.setNodeAttribute(id, 'y', pt.y);
          g.setNodeAttribute(id, 'size', pt.size);
        }
      });
    } else {
      const iterations = getInitialSettleIterations(g.order, minimal);
      settleLayout(g, iterations);
    }
    // 좌표 보존(이전 build 복원) + 드래그 위치 적용은 아래 useLayoutEffect 가
    // paint 전에 imperative 하게 수행한다 — memo 는 순수(ref/localStorage 미접근)
    // 로 유지해 React Compiler 가 memoization 을 보존하게 한다.
    return g;
  }, [
    projects,
    categories,
    stripNamePrefix,
    ontologyCountsBySlug,
    runtimeRecentSlugs,
    changedSlugs,
    showOntologyNodes,
    ontologyInsight,
    minimal,
    skeletonMode,
    skeletonLayout,
  ]);

  useLayoutEffect(() => {
    onGraphStatsChange?.({ nodes: graph.order, relations: graph.size });
  }, [graph, onGraphStatsChange]);

  const overviewEdgesReady =
    graph.size < 240 || overviewEdgesReadyGraph === graph;

  const emitRelationVisibility = useCallback(() => {
    if (!onRelationVisibilityChange) return;
    const next = countVisibleOverviewRelations(
      graph,
      cameraRatioRef.current,
      LOD_HIDE_RATIO,
      overviewEdgesReady,
    );
    const prev = lastRelationVisibilityRef.current;
    if (prev?.visible === next.visible && prev.total === next.total) return;
    lastRelationVisibilityRef.current = next;
    onRelationVisibilityChange(next);
  }, [LOD_HIDE_RATIO, graph, onRelationVisibilityChange, overviewEdgesReady]);

  useLayoutEffect(() => {
    emitRelationVisibility();
  }, [emitRelationVisibility, overviewEdgesReady]);

  useEffect(() => {
    if (graph.size < 240) {
      overviewEdgesReadyRef.current = true;
      return;
    }
    overviewEdgesReadyRef.current = false;
    if (!sigmaInstance) return;
    const timer = window.setTimeout(() => {
      overviewEdgesReadyRef.current = true;
      setOverviewEdgesReadyGraph(graph);
      sigmaRef.current?.refresh();
    }, 520);
    return () => window.clearTimeout(timer);
  }, [graph, sigmaInstance]);

  // camera 움직일 때마다 ratio 를 ref 에 동기화 — reducer 와 대표 관계 수가
  // 같은 LOD 판정을 보게 한다. 값이 바뀌지 않으면 부모 리렌더는 건너뛴다.
  useEffect(() => {
    if (!sigmaInstance) return;
    const camera = sigmaInstance.getCamera();
    cameraRatioRef.current = camera.getState().ratio;
    emitRelationVisibility();
    const handler = () => {
      cameraRatioRef.current = camera.getState().ratio;
      emitRelationVisibility();
    };
    camera.on('updated', handler);
    return () => {
      camera.off('updated', handler);
    };
  }, [emitRelationVisibility, sigmaInstance]);

  // 좌표 보존(charter perf north-star) — graph rebuild 시 paint 전에 기존 노드를
  // 직전 build 좌표로 되돌려 전체 reflow 를 회피한다(새 노드만 settle 위치 유지).
  // useLayoutEffect 라 renderer/worker useEffect 보다 먼저 + paint 전 → 깜빡임
  // 0, 그 효과들이 복원된 graph 로 seed 된다. ref 접근은 effect 안에서만(memo 순수).
  // 순서: cache 복원 → 드래그 위치 적용(명시적 사용자 배치가 우선) → 다음 기준 snapshot.
  useLayoutEffect(() => {
    if (skeletonMode && skeletonLayout) {
      // 골격 진입 — 결정론적 radial 좌표가 진실원. cache/localStorage/settle 무시하고
      // 렌더된 graph 의 *모든* 노드를 골격 좌표(또는 centroid park)로 동기 reconcile.
      // 동기(useLayoutEffect)라 rAF 처럼 re-render 로 취소되지 않고, graph 변경마다
      // 실행되어 어떤 빌드(전이적 settle 빌드 포함)가 렌더돼도 골격으로 맞춘다.
      let sx = 0;
      let sy = 0;
      skeletonLayout.forEach((p) => {
        sx += p.x;
        sy += p.y;
      });
      const parkX = skeletonLayout.size > 0 ? sx / skeletonLayout.size : 0;
      const parkY = skeletonLayout.size > 0 ? sy / skeletonLayout.size : 0;
      graph.forEachNode((id) => {
        const pt = skeletonLayout.get(id);
        if (pt) {
          graph.setNodeAttribute(id, 'x', pt.x);
          graph.setNodeAttribute(id, 'y', pt.y);
          graph.setNodeAttribute(id, 'size', pt.size);
        } else {
          graph.setNodeAttribute(id, 'x', parkX);
          graph.setNodeAttribute(id, 'y', parkY);
        }
      });
    } else {
      // 일반 토폴로지 — cache/localStorage 복원으로 전체 reflow 회피.
      restoreNodeCoords(graph, layoutCacheRef.current);
      if (typeof window !== 'undefined') {
        try {
          const raw = window.localStorage.getItem(POSITION_STORAGE_KEY);
          if (raw) {
            const map = JSON.parse(raw) as Record<string, { x: number; y: number }>;
            for (const [id, pos] of Object.entries(map)) {
              if (graph.hasNode(id) && Number.isFinite(pos.x) && Number.isFinite(pos.y)) {
                graph.setNodeAttribute(id, 'x', pos.x);
                graph.setNodeAttribute(id, 'y', pos.y);
              }
            }
          }
        } catch {
          /* corrupt storage — ignore */
        }
      }
    }
    layoutCacheRef.current = snapshotNodeCoords(graph);
  }, [graph, skeletonMode, skeletonLayout]);

  useEffect(() => {
    let anyRecent = false;
    graph.forEachNode((_, attrs) => {
      if (attrs.recentlyUpdated) anyRecent = true;
    });
    hasAnyRecentRef.current = anyRecent;
  }, [graph]);

  // 새 노드 등장 추적 — 그래프 rebuild 시 처음 보는 slug 의 first-seen 을 기록.
  // 첫 build 는 모든 노드를 "이미 자란" 상태로 seed(now - duration) → 로드 시
  // 일괄 애니메이션 안 함. 이후 rebuild 에서 새로 나타난 slug 만 grow-in.
  useEffect(() => {
    const now = performance.now();
    const ids: string[] = [];
    graph.forEachNode((id) => ids.push(id));
    // first-seen 동기화(첫 build seed / 새 노드 표시 / 사라진 노드 prune)는
    // reducer-entrance 의 순수 함수로 추출 — 단위 테스트로 contract 고정.
    const { anyNew } = reconcileFirstSeen(
      firstSeenRef.current,
      ids,
      now,
      entranceInitializedRef.current,
    );
    entranceInitializedRef.current = true;
    if (anyNew) {
      enteringUntilRef.current = now + NODE_ENTRANCE_MS;
      sigmaRef.current?.refresh();
    }
  }, [graph]);

  const pathRelationSteps = useMemo(
    () =>
      buildPathRelationSteps({
        slugs: pathResultSlugs,
        getRelation: (from, to) => {
          const edgeId = graph.edge(from, to) ?? graph.edge(to, from);
          if (!edgeId) return null;
          const attrs = graph.getEdgeAttributes(edgeId);
          return attrs.relationType ?? attrs.kind ?? null;
        },
      }),
    [graph, pathResultSlugs],
  );

  const pathRelationPreflight = useMemo(() => {
    const sourceSlug = pathResultSlugs[0];
    const targetSlug = pathResultSlugs[pathResultSlugs.length - 1];
    if (!sourceSlug || !targetSlug || pathResultSlugs.length < 2) return null;
    return {
      type: inferPathRelationPreflightType(sourceSlug, targetSlug),
      reason: formatPathRelationPreflightReason(sourceSlug, targetSlug),
    };
  }, [pathResultSlugs]);

  const copyPathEvidence = useCallback(async () => {
    const postWriteSyncPacket = formatAgentPostChangeSyncPacket();
    const text = formatPathEvidenceBrief({
      slugs: pathResultSlugs,
      steps: pathRelationSteps,
      getLabel: (slug) =>
        graph.hasNode(slug)
          ? (graph.getNodeAttribute(slug, 'label') as string)
          : slug,
        labels: {
          title: t('pathEvidenceTitle'),
          hops: t('pathEvidenceHops'),
          source: t('pathEvidenceSource'),
          target: t('pathEvidenceTarget'),
          route: t('pathEvidenceRoute'),
          slugs: t('pathEvidenceSlugs'),
          url: t('pathEvidenceUrl'),
          sourceOntologyUrl: t('pathEvidenceSourceOntologyUrl'),
          targetOntologyUrl: t('pathEvidenceTargetOntologyUrl'),
          sourceBuilderUrl: t('pathEvidenceSourceBuilderUrl'),
          targetBuilderUrl: t('pathEvidenceTargetBuilderUrl'),
          cliCheck: t('pathEvidenceCliCheck'),
          mcpCheck: t('pathEvidenceMcpCheck'),
          relationPreflightReason: t('pathEvidenceRelationPreflightReason'),
          relationPreflightCliCheck: t('pathEvidenceRelationPreflightCliCheck'),
          relationPreflightMcpCheck: t('pathEvidenceRelationPreflightMcpCheck'),
          explainRelationCliCheck: t('pathEvidenceExplainRelationCliCheck'),
          explainRelationMcpCheck: t('pathEvidenceExplainRelationMcpCheck'),
          traversalCompleteness: t('pathEvidenceTraversalCompleteness'),
          traversalCompletenessPolicy: t('pathEvidenceTraversalCompletenessPolicy'),
          allPathsCliCheck: t('pathEvidenceAllPathsCliCheck'),
          allPathsPlanMcpCheck: t('pathEvidenceAllPathsPlanMcpCheck'),
          allPathsMcpCheck: t('pathEvidenceAllPathsMcpCheck'),
          allPathsCopyInstruction: t('pathEvidenceAllPathsCopyInstruction'),
          postWriteSyncGate: t('pathEvidencePostWriteSyncGate'),
        },
        url: typeof window === 'undefined' ? null : window.location.href,
        syncGatePacket: postWriteSyncPacket,
      });
    const ok = await copyText(text);
    if (!ok) return;
    setPathCopied(true);
    window.setTimeout(() => setPathCopied(false), 1600);
  }, [graph, pathRelationSteps, pathResultSlugs, t]);

  const copyPathMcpCheck = useCallback(async () => {
    const sourceSlug = pathResultSlugs[0];
    const targetSlug = pathResultSlugs[pathResultSlugs.length - 1];
    if (!sourceSlug || !targetSlug) return;
    const ok = await copyText(formatPathMcpCheck(sourceSlug, targetSlug));
    if (!ok) return;
    setPathMcpCopied(true);
    window.setTimeout(() => setPathMcpCopied(false), 1600);
  }, [pathResultSlugs]);

  const copyPathRelationPreflightCheck = useCallback(async () => {
    const sourceSlug = pathResultSlugs[0];
    const targetSlug = pathResultSlugs[pathResultSlugs.length - 1];
    if (!sourceSlug || !targetSlug) return;
    const ok = await copyText(
      formatPathRelationPreflightMcpCheck(sourceSlug, targetSlug),
    );
    if (!ok) return;
    setPathRelationPreflightCopied(true);
    window.setTimeout(() => setPathRelationPreflightCopied(false), 1600);
  }, [pathResultSlugs]);

  const copyPathExplainRelationCheck = useCallback(async () => {
    const sourceSlug = pathResultSlugs[0];
    const targetSlug = pathResultSlugs[pathResultSlugs.length - 1];
    if (!sourceSlug || !targetSlug) return;
    const ok = await copyText(
      formatPathExplainRelationMcpCheck(sourceSlug, targetSlug),
    );
    if (!ok) return;
    setPathExplainRelationCopied(true);
    window.setTimeout(() => setPathExplainRelationCopied(false), 1600);
  }, [pathResultSlugs]);

  const copyPathAllPathsPlanCheck = useCallback(async () => {
    const sourceSlug = pathResultSlugs[0];
    const targetSlug = pathResultSlugs[pathResultSlugs.length - 1];
    if (!sourceSlug || !targetSlug) return;
    const ok = await copyText(
      formatPathAllPathsPlanMcpCheck(sourceSlug, targetSlug),
    );
    if (!ok) return;
    setPathAllPathsPlanCopied(true);
    window.setTimeout(() => setPathAllPathsPlanCopied(false), 1600);
  }, [pathResultSlugs]);

  const copyPathAllPathsCheck = useCallback(async () => {
    const sourceSlug = pathResultSlugs[0];
    const targetSlug = pathResultSlugs[pathResultSlugs.length - 1];
    if (!sourceSlug || !targetSlug) return;
    const ok = await copyText(formatPathAllPathsMcpCheck(sourceSlug, targetSlug));
    if (!ok) return;
    setPathAllPathsCopied(true);
    window.setTimeout(() => setPathAllPathsCopied(false), 1600);
  }, [pathResultSlugs]);

  useEffect(() => {
    if (!containerRef.current) return;
    const renderer = createSigma(graph, containerRef.current, minimal);
    // 카메라 URL 복원을 첫 paint 이전에 시행 — Sigma 가 default cam (0.5/0.5/1)
    // 으로 frame 1 그린 뒤 useCameraUrlSync effect 가 늦게 setState 하면
    // "default → 저장된 cam" 점프 깜빡임이 보인다. 여기서 동기적으로 미리
    // 적용하면 첫 RAF 가 곧장 saved cam 으로 그린다.
    if (!minimal && typeof window !== 'undefined') {
      try {
        const params = new URLSearchParams(window.location.search);
        const cam = params.get('cam');
        if (cam) {
          const [xs, ys, rs] = cam.split(',');
          const x = Number(xs);
          const y = Number(ys);
          const r = Number(rs);
          if (Number.isFinite(x) && Number.isFinite(y) && Number.isFinite(r)) {
            renderer.getCamera().setState({ x, y, ratio: r, angle: 0 });
          }
        }
      } catch {
        /* URL 파싱 실패 무시 */
      }
    }
    // d3-force 기반 스프링-질량 물리. 옵시디언과 동일한 엔진이라 충돌 반사 +
    // velocity damping이 자연스럽게 나온다. 평소엔 alphaTarget=0이라 멈춰 있고
    // 드래그 시 pin으로 시뮬레이션을 깨워 주변이 물리적으로 반응한다.
    // onTick에서 명시적 refresh를 호출하지 않는다 — updateEachNodeAttributes가
    // 발행하는 단일 'eachNodeAttributesUpdated' 이벤트에 Sigma가 자동으로
    // 반응하므로 중복 렌더를 피한다.
    // 골격 진입에선 물리 미가동 — stamp 한 결정론적 좌표를 FA2 가 흐트러뜨리지
    // 않게(작은 vault 는 order<=120 이라 평소 autoStart 였다).
    const autoStartPhysics = !skeletonMode && (minimal || graph.order <= 120);
    // Live force layout runs in a Web Worker so the main thread / WKWebView
    // compositor stays free (drag / auto-arrange smoothness at scale). Falls
    // back to the main-thread d3-force sim if the worker can't be created
    // (no Worker support, or a CSP block in an unexpected host).
    let physics: PhysicsController;
    try {
      if (typeof Worker === 'undefined') throw new Error('no Worker');
      const layoutWorker = new Worker(new URL('../lib/layout.worker.ts', import.meta.url), {
        type: 'module',
      });
      physics = createWorkerLayoutController(graph, layoutWorker, {
        autoStart: autoStartPhysics,
        initialAlpha: autoStartPhysics ? 0.65 : 0.25,
      });
    } catch {
      physics = startPhysics(graph, undefined, {
        autoStart: autoStartPhysics,
        initialAlpha: autoStartPhysics ? 0.65 : 0.25,
      });
    }
    physicsRef.current = physics;

    // hover/선택 시 이웃만 강조하고 나머지는 dim. 옵시디언 그래프 뷰 동작과 동일.
    // 1-hop 은 강조, 2-hop 은 subtle, 나머지는 깊게 dim — 발견성↑.
    let hoveredNode: string | null = null;
    const neighbors = new Set<string>();
    const secondHop = new Set<string>();
    // backref overlay 전용: 현재 focus 를 dependency 로 가진 프로젝트 slug 집합.
    // directed graph 의 inNeighbors = "나를 참조하는 쪽".
    const backrefNodes = new Set<string>();

    let hoveredEdgePair: { source: string; target: string } | null = null;
    const activeNode = () => selectedSlugRef.current ?? hoveredNode;
    const refreshNeighbors = () => {
      const focus = activeNode();
      neighbors.clear();
      secondHop.clear();
      backrefNodes.clear();
      if (focus && graph.hasNode(focus)) {
        graph.forEachNeighbor(focus, (n) => neighbors.add(n));
        graph.forEachInNeighbor(focus, (n) => backrefNodes.add(n));
        // 2-hop: 1-hop 의 이웃 중 직접 이웃이 아닌 노드
        for (const direct of neighbors) {
          graph.forEachNeighbor(direct, (n) => {
            if (n !== focus && !neighbors.has(n)) secondHop.add(n);
          });
        }
      }
    };

    // DIM_COLOR 는 reducer-context-dim 의 CONTEXT_DIM_COLOR 로 이주 (A3-3
    // 1차). 컴포넌트 안에서는 edge dim 만 잔여 — 라이트 / 다크 분기 위해
    // ref 로 두고 theme 토글 observer 가 갱신.
    const paletteRef = paletteRefLocal;
    const DIM_EDGE = () => paletteRef.current.edgeDim;

    // 경로 찾기 상태: pathAnchor 는 shift+클릭 대기 중인 시작 노드. pathNodes
    // 는 하이라이트할 경로 노드 set. 둘 다 비어 있으면 일반 상호작용.
    let pathAnchor: string | null = null;
    const pathNodes = new Set<string>();
    const pathEdgeSet = new Set<string>();
    const clearPathState = () => {
      pathAnchor = null;
      setPathAnchorSlug(null);
      setPathCopied(false);
      setPathMcpCopied(false);
      setPathRelationPreflightCopied(false);
      setPathAllPathsPlanCopied(false);
      setPathAllPathsCopied(false);
      setPathResultSlugs([]);
      pathNodes.clear();
      pathEdgeSet.clear();
    };
    const applyPathSelection = (
      selection: {
        sourceSlug: string | null;
        targetSlug: string | null;
      } | null,
    ) => {
      clearPathState();
      const source = resolvePathGraphNodeId(selection?.sourceSlug, (nodeId) =>
        graph.hasNode(nodeId),
      );
      if (!source) return;
      pathAnchor = source;
      pathNodes.add(source);
      const target = resolvePathGraphNodeId(selection?.targetSlug, (nodeId) =>
        graph.hasNode(nodeId),
      );
      if (!target || target === source) {
        setPathAnchorSlug(source);
        return;
      }
      const path = shortestPath(graph, source, target);
      if (!path) {
        setPathAnchorSlug(source);
        return;
      }
      pathNodes.clear();
      for (const n of path) pathNodes.add(n);
      for (let i = 0; i < path.length - 1; i += 1) {
        const eId =
          graph.edge(path[i], path[i + 1]) ??
          graph.edge(path[i + 1], path[i]);
        if (eId) pathEdgeSet.add(eId);
      }
      pathAnchor = null;
      setPathAnchorSlug(null);
      setPathResultSlugs(path);
    };

    // 검색 / 카테고리 / depth 필터는 ../lib/reducer-filter 의 pure 함수
    // (A3-2 추출). caller 가 ref 값 추출해 넘김.
    const matchesSearch = (attrs: SigmaNodeAttrs): boolean =>
      matchesSearchFn(attrs, searchQueryRef.current);

    const matchesCategory = (attrs: SigmaNodeAttrs): boolean =>
      matchesCategoryFn(attrs, activeCategoryRef.current);

    const passesDepth = (node: string): boolean =>
      passesDepthFn(
        node,
        selectedSlugRef.current,
        depthLimitRef.current,
        depthMapRef.current,
      );

    // minimal 모드 (상세 페이지 임베드) 는 노드가 50개 내외로 작아 density
    // 솎아내기 없이 모든 이름을 항상 보여주는 편이 사용자 기대에 맞는다.
    // 아래 reducer 가 돌려주는 결과를 공통으로 감싸 label 복원 + forceLabel.
    const baseNodeReducer = (node: string, attrs: SigmaNodeAttrs) => {
      // 골격 진입 — 골격(anchor+landmark) 밖 노드는 상주하되 deep-dim(미제거)해
      // overview 가 "읽히는 구조 골격" 이 되게 한다. focus tier-4 톤과 동일.
      // (outerBorderColor 는 유효 rgba 로 — 'transparent' 는 node-border 프로그램
      //  이 파싱 못 해 흰 halo 로 폴백한다.)
      if (skeletonModeRef.current && !skeletonSlugsRef.current.has(node)) {
        return {
          ...attrs,
          color: 'rgba(70, 75, 90, 0.06)',
          borderColor: 'rgba(70, 75, 90, 0.04)',
          outerBorderColor: 'rgba(0, 0, 0, 0)',
          label: undefined,
          forceLabel: false,
          zIndex: 0,
        };
      }
      // 카드 모드 — 골격 노드의 시각은 DOM 카드가 전담. 캔버스 노드는 엣지
      // anchor 로만 남도록 완전 투명 렌더 (focus/label 분기 전부 생략).
      if (skeletonModeRef.current && skeletonCardsActiveRef.current) {
        return {
          ...attrs,
          color: 'rgba(0, 0, 0, 0)',
          borderColor: 'rgba(0, 0, 0, 0)',
          outerBorderColor: 'rgba(0, 0, 0, 0)',
          label: undefined,
          forceLabel: false,
        };
      }
      // Hubs only / zoom LOD 분기는 ../lib/reducer-overlay-flags
      // shouldHideNode 가 결정 (A4-1 추출).
      if (
        shouldHideNode(attrs, {
          hubsOnly: hubsOnlyRef.current,
          cameraRatio: cameraRatioRef.current,
          lodHideRatio: LOD_HIDE_RATIO,
        })
      ) {
        return { ...attrs, hidden: true };
      }
      const overlayState = overlaysRef.current;
      // recent pulse + hub size boost 도 같은 helper (applyOverlaySize)
      // 가 size 만 변조해 다음 분기로 넘김. focus / context dim 등은
      // 이후 분기에서 결정.
      attrs = applyOverlaySize(attrs, {
        cameraRatio: cameraRatioRef.current,
        recentPulseEnabled: overlayState.recentPulse,
        pulseSin: pulseSinRef.current,
      });
      // 새 노드 "자라남" — 라이브 등장 노드만 size 0→full ease-out. 전역 가드
      // (now < enteringUntilRef) 로 평상시엔 per-node 비용 0; 등장 직후
      // NODE_ENTRANCE_MS 동안만 동작. position 은 worker 가, size 만 여기서.
      if (nowRef.current < enteringUntilRef.current) {
        const seenAt = firstSeenRef.current.get(node);
        if (seenAt !== undefined) {
          const factor = entranceSizeFactor(
            nowRef.current - seenAt,
            NODE_ENTRANCE_MS,
            reduceMotionRef.current,
          );
          if (factor < 1) attrs = { ...attrs, size: attrs.size * factor };
        }
      }
      // Owner tint overlay — 허브와 ontology 노드는 자기 정체성 색을 유지한다.
      // Ontology kind hue(project/domain/capability/element)는 의미 분류 자체라
      // owner overlay보다 우선한다. focus/neighbor dim 보다 먼저 적용해야
      // "dim 된 색" 이 아닌 "owner 색 기반 dim" 이 된다.
      if (overlayState.ownerTint && !attrs.isHub) {
        attrs = applyOwnerTintOverlay(attrs, toneForOwnerKey);
      }
      // Audit overlay — 켜지면 "문제 노드" 3종만 warm tone 으로 떠오르고 나머지
      // 는 deep dim. 선택/hover 분기보다 앞에서 배타적으로 처리해 시각 집중도
      // 를 최대화. 우선순위 stale > orphan > promotion 은 applyAuditOverlay
      // 가 결정 (../lib/reducer-audit, A2-4 추출).
      if (overlayState.auditHighlight) {
        return applyAuditOverlay(node, attrs, auditSetsRef.current);
      }
      // 검색 / 카테고리 / depth / hoveredEdge / path 5 분기는
      // ../lib/reducer-context-dim 의 applyContextDimOverlay 가 결정
      // (A3-3 1차 슬라이스). null 반환 시 다음 단계 (focus/일반) 진행.
      const contextResult = applyContextDimOverlay(node, attrs, {
        searchPassed: matchesSearch(attrs),
        categoryPassed: matchesCategory(attrs),
        depthPassed: passesDepth(node),
        hoveredEdgePair,
        pathNodes,
        impactNodes: impactNodesRef.current,
      });
      if (contextResult) return contextResult;

      const focus = activeNode();
      if (!focus) return attrs;
      // focus / neighbor / 2-hop tint 분기는 ../lib/reducer-focus 의
      // applyFocusOverlay 에서 (A3-1 추출). bounceFactor 는 프레임당 1회
      // bounce RAF 루프가 계산해둔 ref 값 (한 프레임 안 모든 노드 동일).
      return applyFocusOverlay(node, attrs, {
        focusNode: focus,
        neighbors,
        secondHop,
        backrefNodes,
        backrefHighlight: overlayState.backrefHighlight,
        bounceFactor: bounceFactorRef.current,
      });
    };
    renderer.setSetting('nodeReducer', (node, attrs) => {
      const base = baseNodeReducer(node, attrs);
      // minimal 모드: 솎아내기 없이 모든 노드에 이름 고정 노출.
      // hidden 된 노드는 건드리지 않음 (허브 전용 모드 등).
      const hidden = (base as { hidden?: boolean }).hidden;
      if (minimal && !hidden) {
        return { ...base, label: attrs.label, forceLabel: true };
      }
      // 카드 모드 — 라벨은 카드가 전담. 캔버스 라벨 로직 전부 생략.
      if (skeletonModeRef.current && skeletonCardsActiveRef.current) {
        return base;
      }
      // 골격 진입 — 좌표계 anchor(project + 모든 domain)는 줌 무관 항상 라벨.
      // 익명 teal 점이 되면 "읽히는 구조 골격" 이 깨진다 (never anonymous).
      if (skeletonModeRef.current && !hidden && isSkeletonAlwaysLabeled(attrs)) {
        return { ...base, label: attrs.label, forceLabel: true };
      }
      // Label strategy — 라벨 밀집 방지:
      // - Hub/Node 는 줌아웃 상태에서 label 자체를 제거한다. forceLabel 만
      //   끄면 Sigma size threshold 때문에 큰 hub 라벨이 계속 남아 화면을
      //   덮는다.
      // - Hover/선택/이웃은 예외로 즉시 라벨을 복원한다.
      const focus = selectedSlugRef.current ?? hoveredNode;
      const isFocusNode = focus === node;
      const isNeighbor = focus !== null && neighbors.has(node);
      const isFocusOrNeighbor = isFocusNode || isNeighbor;
      // 골격 진입의 클릭-확장에선 이웃 수 제한 없이 라벨 — 펼쳐진 부채꼴이
      // "익명 점 N개" 가 되면 클릭→펼침의 보상(정체)이 사라진다. 결정론적
      // 등간격 호 배치라 라벨 충돌도 드물다 (디자이너 패널 재검증 지적).
      const shouldShowNeighborLabel =
        isNeighbor &&
        (skeletonModeRef.current ||
          (neighbors.size < 8 && cameraRatioRef.current <= 0.55));
      const ratio = cameraRatioRef.current;

      if (!hidden && isNeighbor && !shouldShowNeighborLabel) {
        return { ...base, label: undefined, forceLabel: false };
      }

      // overview 랜드마크(degree 최상위 N) — 줌 무관 항상 라벨. 전체 축소에서
      // 앵커마저 솎여 라벨 0(익명 점)이 되는 걸 막아 최소 방향감 보장.
      if (!hidden && !isFocusOrNeighbor && isOverviewLandmark(attrs)) {
        return { ...base, forceLabel: true };
      }
      // 라벨 앵커 = 프로젝트 허브 OR graph-build 가 forceLabel 로 승격한 ontology
      // 랜드마크(도메인/고차수). 앵커는 줌아웃 시 더 오래 라벨 유지(0.55), 일반
      // 노드는 0.28 — 랜드마크가 fingerprint 로 남게(graph-build 의도 일치).
      const isAnchor = isTopologyLabelAnchor(attrs);
      if (!hidden && !isFocusOrNeighbor && shouldCullLabelAtZoom(isAnchor, ratio)) {
        return { ...base, label: undefined, forceLabel: false };
      }

      if (!hidden && isAnchor && !isFocusOrNeighbor) {
        return { ...base, forceLabel: ratio <= HUB_LABEL_RATIO };
      }

      if (!hidden && !base.forceLabel && (isFocusNode || shouldShowNeighborLabel)) {
        return { ...base, forceLabel: true };
      }
      return base;
    });
    renderer.setSetting('edgeReducer', (edge, attrs) => {
      const [src, tgt] = graph.extremities(edge);
      const srcAttrs = graph.getNodeAttributes(src);
      const tgtAttrs = graph.getNodeAttributes(tgt);
      // 골격 진입 — contains 백본만(양 끝이 골격) 중립 hairline 으로 상시 표시.
      // 나머지(typed·골격 밖)는 hidden. depends_on 불꽃놀이 제거.
      if (skeletonModeRef.current) {
        const bothVisible =
          skeletonSlugsRef.current.has(src) && skeletonSlugsRef.current.has(tgt);
        if (!bothVisible || attrs.kind !== 'contains') {
          return { ...attrs, hidden: true };
        }
        // 잉크 위계: 정보는 노드(카드)에 있고 엣지는 구조 암시만 — 엣지가
        // 카드 보더보다 밝으면 data-ink 역전 (카드 검증 패널 major).
        const focus = selectedSlugRef.current ?? null;
        if (focus) {
          // 카드 모드의 펼친 가지 커넥터는 SVG 오버레이(SigmaSkeletonCards)
          // 가 카드-경계 트림 S-커브로 그린다 — 캔버스 엣지는 전부 숨김.
          if (skeletonCardsActiveRef.current) {
            return { ...attrs, hidden: true };
          }
          // 카드 없는 폴백 — ego 만 옅은 인디고.
          if (src === focus || tgt === focus) {
            return {
              ...attrs,
              color: 'rgba(139, 151, 255, 0.30)',
              size: 0.7,
              curvature: 0.05,
              hidden: false,
            };
          }
          return { ...attrs, hidden: true };
        }
        // overview — 잉크 2단 위계: project spine(직선·spoke 톤)이 domain→
        // capability 가지(hairline)보다 한 단계 진해 방사 골격이 잉크만으로
        // 읽힌다. 두 톤 모두 카드 보더 틴트(18%)보다 어둡고, 라이트/다크는
        // CSS 토큰 캐시(skeletonInkRef)가 해석.
        const touchesProject =
          srcAttrs.ontologyTopKind === 'project' || tgtAttrs.ontologyTopKind === 'project';
        const ink = skeletonInkRef.current;
        return {
          ...attrs,
          color: touchesProject ? ink.spoke : ink.hairline,
          size: touchesProject ? 0.7 : 0.5,
          curvature: touchesProject ? 0 : 0.08,
          hidden: false,
        };
      }
      // Hubs only 모드: 허브-허브 엣지만 노출.
      if (hubsOnlyRef.current && !(srcAttrs.isHub && tgtAttrs.isHub)) {
        return { ...attrs, hidden: true };
      }
      // 직접 엣지 hover: 양 끝 노드는 이미 nodeReducer 가 indigo 로 밝히는데
      // 엣지 자체가 dim 색 그대로면 "두 밝은 점 사이가 끊긴" 시각 gap 이
      // 생긴다. 해당 엣지만 두께·alpha 부스트해 연결이 자연스럽게 읽히게.
      if (
        hoveredEdgePair &&
        hoveredEdgePair.source === src &&
        hoveredEdgePair.target === tgt
      ) {
        return {
          ...attrs,
          color: indigoRgba('highlight', 0.9),
          size: Math.max(attrs.size ?? 1, 1.8),
          zIndex: 10,
        };
      }
      // Zoom-based LOD: 한쪽이라도 숨겨진 비허브면 엣지도 숨김. 허브-허브
      // 만 남아 멀리서 "정거장 지도" 느낌.
      if (cameraRatioRef.current > LOD_HIDE_RATIO && !(srcAttrs.isHub && tgtAttrs.isHub)) {
        return { ...attrs, hidden: true };
      }
      // Audit overlay 가 켜져 있으면 엣지는 전부 흐리게 — 시선이 노드 색에
      // 쏠리도록. 단, 양 끝이 모두 audit 대상이면 살짝만 살려서 문제 노드끼리
      // 의 관계가 보이도록.
      if (overlaysRef.current.auditHighlight) {
        const auditState = auditSetsRef.current;
        const srcHit =
          auditState.stale.has(src) ||
          auditState.orphan.has(src) ||
          auditState.promotion.has(src);
        const tgtHit =
          auditState.stale.has(tgt) ||
          auditState.orphan.has(tgt) ||
          auditState.promotion.has(tgt);
        if (srcHit && tgtHit) {
          return { ...attrs, color: 'rgba(232, 196, 162, 0.35)', size: 1.2 };
        }
        return { ...attrs, color: 'rgba(255, 255, 255, 0.005)' };
      }
      // 검색/depth 필터로 한쪽이라도 가려지면 엣지도 숨김.
      if (!matchesSearch(srcAttrs) || !matchesSearch(tgtAttrs)) {
        return { ...attrs, color: DIM_EDGE() };
      }
      if (!matchesCategory(srcAttrs) || !matchesCategory(tgtAttrs)) {
        return { ...attrs, color: DIM_EDGE() };
      }
      if (!passesDepth(src) || !passesDepth(tgt)) {
        return { ...attrs, color: DIM_EDGE() };
      }

      // impact (blast radius) 활성: set 안 두 노드를 잇는 엣지만 인디고로 살리고
      // 나머지는 dim — 영향 부분그래프의 *형태* 가 읽히게 (노드만 dim 하면 흰
      // 엣지가 남아 시야가 탁해진다). path/focus 보다 우선.
      if (impactNodesRef.current.size > 0) {
        const set = impactNodesRef.current;
        if (set.has(src) && set.has(tgt)) {
          return { ...attrs, color: indigoRgba('highlight', 0.55), size: Math.max(attrs.size ?? 1, 1) };
        }
        return { ...attrs, color: DIM_EDGE() };
      }

      // 경로 찾기: 경로 엣지만 강조.
      if (pathEdgeSet.size > 0) {
        if (pathEdgeSet.has(edge)) {
          return { ...attrs, color: indigoRgba('highlight', 0.9), size: 2 };
        }
        return { ...attrs, color: DIM_EDGE() };
      }

      const focus = activeNode();
      if (!focus) {
        if (
          shouldSuppressDenseOverviewEdges({
            edgeCount: graph.size,
            overviewEdgesReady: overviewEdgesReadyRef.current,
          })
        ) {
          return { ...attrs, hidden: true };
        }
        if (
          shouldHideDenseOverviewEdge({
            edgeCount: graph.size,
            cameraRatio: cameraRatioRef.current,
            edge: attrs,
            source: srcAttrs,
            target: tgtAttrs,
          })
        ) {
          return { ...attrs, hidden: true };
        }
        // R+ 사용자 피드백: zoom out 시 hub-hub edge 가 *대벌레 다리* 처럼
        // 가늘게 stick 으로 박힌 시각. sigma 가 edge 두께를 camera ratio
        // 와 별개로 그대로 그려 멀어질수록 노드 대비 line 비중이 커짐.
        // ratio > 1.0 (zoom out) 부터 size 점진 감쇠 — node 가 시각 우위
        // 회복. zoom in (ratio ≤ 1.0) 은 그대로 유지해 가까이서의 두꺼운
        // 선 (1-hop pulse 등) 영향 X.
        const ratio = cameraRatioRef.current;
        if (ratio > 1.0) {
          const fade = Math.max(0.35, 1.0 - (ratio - 1.0) * 0.55);
          return {
            ...attrs,
            size: (attrs.size ?? 0.5) * fade,
          };
        }
        return attrs;
      }
      if (src === focus || tgt === focus) {
        const wave = reduceMotionRef.current
          ? 0.5
          : 0.5 + 0.5 * pulseSinRef.current;
        return applyFocusEdgeOverlay(attrs, {
          focusNode: focus,
          source: src,
          target: tgt,
          neighbors,
          wave,
        });
      }
      // 1-hop 간 엣지 (이웃끼리 연결) 는 아주 옅게 — 포커스와 직접 관련
      // 없는 구조지만 완전히 지우진 않는다. 그 외 모든 엣지는 거의 숨김.
      if (neighbors.has(src) && neighbors.has(tgt)) {
        return applyFocusEdgeOverlay(attrs, {
          focusNode: focus,
          source: src,
          target: tgt,
          neighbors,
          wave: 0.5,
        });
      }
      return applyFocusEdgeOverlay(attrs, {
        focusNode: focus,
        source: src,
        target: tgt,
        neighbors,
        wave: 0.5,
      });
    });
    // 엣지 타입별 기본 스타일 — focus 미진입 상태의 base 외관. "contains"
    // (소속 = 계층) 는 더 흐린 neutral, "depends-on" (cross-project 관계) 은
    // 살짝 더 진한 인디고 톤. focus 상태에선 위 edgeReducer 가 override.
    graph.forEachEdge((edge, attrs) => {
      if (attrs.kind === 'contains') {
        graph.setEdgeAttribute(
          edge,
          'color',
          paletteRef.current.edgeContains,
        );
      } else if (attrs.kind === 'depends-on') {
        graph.setEdgeAttribute(
          edge,
          'color',
          paletteRef.current.edgeDependsOn,
        );
      }
    });

    // --- 노드 드래그 이동 (옵시디언 스타일). 드래그 중에는 카메라 pan 방지.
    let draggedNode: string | null = null;
    let dragMoved = false;
    const captor = renderer.getMouseCaptor();

    renderer.on('downNode', ({ node, event }) => {
      draggedNode = node;
      draggingNodeRef.current = true;
      dragMoved = false;
      graph.setNodeAttribute(node, 'highlighted', true);
      // 드래그 시작 시 grabbing cursor — M-27 (hover=pointer) 와 쌍으로
      // 클릭/드래그 affordance 분리. mouseup 에서 hover 여부 따라 복원.
      if (containerRef.current) {
        containerRef.current.style.cursor = 'grabbing';
      }
      const pos = renderer.viewportToGraph({ x: event.x, y: event.y });
      physics.pin(node, pos.x, pos.y);
      event.preventSigmaDefault();
      event.original.preventDefault();
      if (!interactedRef.current) {
        interactedRef.current = true;
        onFirstInteractionRef.current?.();
      }
    });

    captor.on('mousemovebody', (event) => {
      if (!draggedNode) return;
      const pos = renderer.viewportToGraph(event);
      physics.drag(draggedNode, pos.x, pos.y);
      dragMoved = true;
      event.preventSigmaDefault();
      event.original.preventDefault();
      event.original.stopPropagation();
    });

    const endDrag = () => {
      if (!draggedNode) return;
      graph.removeNodeAttribute(draggedNode, 'highlighted');
      // 드래그로 움직였던 좌표를 localStorage에 persist해 새로고침 후에도 유지.
      if (dragMoved && typeof window !== 'undefined') {
        try {
          const raw = window.localStorage.getItem(POSITION_STORAGE_KEY);
          const map: Record<string, { x: number; y: number }> = raw
            ? JSON.parse(raw)
            : {};
          const attrs = graph.getNodeAttributes(draggedNode);
          map[draggedNode] = { x: attrs.x, y: attrs.y };
          window.localStorage.setItem(
            POSITION_STORAGE_KEY,
            JSON.stringify(map),
          );
        } catch {
          /* private mode — skip */
        }
      }
      physics.release(draggedNode);
      draggedNode = null;
      draggingNodeRef.current = false;
      flushPendingRuntimeRecentPrune();
      // 드래그 종료 시 hover 여부 따라 cursor 복원 — 여전히 노드 위라면
      // pointer, 바깥이면 기본으로.
      if (containerRef.current) {
        containerRef.current.style.cursor = hoveredNode ? 'pointer' : '';
      }
      // dragMoved reset 은 *다음 downNode* 에서. queueMicrotask 로 즉시
      // reset 하면 mouseup → microtask flush → clickNode 순서에서 click
      // 가드 (if dragMoved return) 가 무력화 → 드래그 후 손 떼면 노드
      // detail 로 들어가는 회귀. downNode 에서 dragMoved=false 로 다시
      // 시작하므로 상태 leak 없음.
    };
    captor.on('mouseup', endDrag);
    const endDragFromWindow = () => endDrag();
    window.addEventListener('mouseup', endDragFromWindow);
    window.addEventListener('pointerup', endDragFromWindow);
    window.addEventListener('blur', endDragFromWindow);

    renderer.on('clickNode', ({ node, event }) => {
      if (dragMoved) {
        event.original.stopPropagation();
        return;
      }
      // Path mode 또는 Shift+클릭: 경로 찾기. 첫 클릭은 시작 노드 고정,
      // 둘째 클릭은 최단 경로 하이라이트. Esc 로 해제. Path mode 에서는
      // 일반 클릭만으로 source/target 을 고를 수 있어 hidden shortcut 이
      // 아니라 명시적 analysis workflow 로 동작한다.
      const shiftKey =
        event.original instanceof MouseEvent ? event.original.shiftKey : false;
      const pathGesture = shouldUsePathSelectionGesture({
        pathWorkflowActive: pathWorkflowActiveRef.current,
        shiftKey,
      });
      if (pathGesture) {
        if (pathWorkflowActiveRef.current) {
          onSelectProjectRef.current?.(node);
        }
        if (!pathAnchor || pathAnchor === node) {
          pathAnchor = node;
          setPathAnchorSlug(node);
          setPathCopied(false);
          setPathMcpCopied(false);
          setPathRelationPreflightCopied(false);
          setPathAllPathsPlanCopied(false);
          setPathAllPathsCopied(false);
          setPathResultSlugs([]);
          pathNodes.clear();
          pathEdgeSet.clear();
          pathNodes.add(node);
          onPathSelectionChangeRef.current?.({
            sourceSlug: node,
            targetSlug: null,
          });
          renderer.refresh();
          return;
        }
        const path = shortestPath(graph, pathAnchor, node);
        pathNodes.clear();
        pathEdgeSet.clear();
        if (path) {
          for (const n of path) pathNodes.add(n);
          for (let i = 0; i < path.length - 1; i += 1) {
            const eId =
              graph.edge(path[i], path[i + 1]) ??
              graph.edge(path[i + 1], path[i]);
            if (eId) pathEdgeSet.add(eId);
          }
          setPathCopied(false);
          setPathMcpCopied(false);
          setPathRelationPreflightCopied(false);
          setPathAllPathsPlanCopied(false);
          setPathAllPathsCopied(false);
          setPathResultSlugs(path);
          onPathSelectionChangeRef.current?.({
            sourceSlug: pathAnchor,
            targetSlug: node,
          });
        } else {
          setPathCopied(false);
          setPathMcpCopied(false);
          setPathRelationPreflightCopied(false);
          setPathAllPathsPlanCopied(false);
          setPathAllPathsCopied(false);
          setPathResultSlugs([]);
          onPathSelectionChangeRef.current?.({
            sourceSlug: null,
            targetSlug: null,
          });
        }
        pathAnchor = null;
        setPathAnchorSlug(null);
        renderer.refresh();
        return;
      }
      // 일반 클릭: 경로 결과가 떠 있으면 먼저 해제.
      if (pathNodes.size > 0 || pathAnchor) {
        clearPathState();
        onPathSelectionChangeRef.current?.({
          sourceSlug: null,
          targetSlug: null,
        });
        renderer.refresh();
      }
      onSelectProjectRef.current?.(node);
    });
    pathClearRef.current = () => {
      clearPathState();
      onPathSelectionChangeRef.current?.({
        sourceSlug: null,
        targetSlug: null,
      });
      renderer.refresh();
    };
    pathSelectionApplyRef.current = applyPathSelection;
    renderer.on('rightClickNode', ({ node, event }) => {
      event.preventSigmaDefault();
      event.original.preventDefault();
      const attrs = graph.getNodeAttributes(node);
      setContextMenu({ slug: node, name: attrs.label, x: event.x, y: event.y });
    });
    renderer.on('rightClickStage', () => setContextMenu(null));
    renderer.on('doubleClickNode', ({ node, event }) => {
      // 옵시디언의 "이 노드로 포커스" 동작 — Local graph 모드 트리거.
      event.preventSigmaDefault();
      onProjectOpenRef.current?.(node);
      if (!interactedRef.current) {
        interactedRef.current = true;
        onFirstInteractionRef.current?.();
      }
    });
    // clickStage 한 군데에서 두 가지 사이드 이펙트 처리 — 이전엔
    // `setContextMenu(null)` 과 `onPaneClickRef` 가 별도 .on() 두 호출로
    // 등록되어 같은 이벤트 multiple handler. 같은 effect 묶음으로 통합.
    //
    // 캔버스 pan(드래그)이 끝나면 브라우저가 같은 자리에서 click 을 마저
    // 발화해 clickStage 가 따라온다 — 이게 "도메인 펼친 뒤 드래그하면 선택이
    // 풀려 다시 접히는" 버그의 원인. down 지점 대비 이동 거리가 임계(6px)를
    // 넘으면 의도된 배경 클릭이 아니라 pan 으로 보고 선택 해제를 건너뛴다.
    // 노드 드래그도 같은 함정 — mousemovebody 의 preventSigmaDefault 가
    // Sigma 의 draggedEvents 증가를 막아 release 후 click 이 그대로 발화하고,
    // (골격 모드처럼 물리가 꺼져 노드가 포인터를 안 따라오면) release 지점이
    // 배경이라 clickStage 가 된다. dragMoved(노드 드래그 발생) 도 함께 가드.
    let stageDownAt: { x: number; y: number } | null = null;
    renderer.on('downStage', ({ event }) => {
      stageDownAt = { x: event.x, y: event.y };
    });
    renderer.on('clickStage', ({ event }) => {
      const wasPan =
        stageDownAt !== null &&
        Math.hypot(event.x - stageDownAt.x, event.y - stageDownAt.y) > 6;
      stageDownAt = null;
      if (wasPan || dragMoved) return;
      setContextMenu(null);
      onPaneClickRef.current?.();
    });
    renderer.on('enterNode', ({ node, event }) => {
      const attrs = graph.getNodeAttributes(node);
      hoveredNode = node;
      // 클릭 가능한 affordance — Sigma canvas 는 기본 cursor 가 default 라
      // 노드 위에 있어도 pointer 로 안 바뀐다. 최고 수준의 micro-UX 확보.
      if (containerRef.current) {
        containerRef.current.style.cursor = 'pointer';
      }
      refreshNeighbors();
      renderer.refresh();
      setHoveredSlug(node);
      setHoverLabel({
        name: attrs.label,
        // ontology 노드는 slug 가 'capabilities/foo' 라 extractDomainLabel(project
        // slug 용)이 'capabilities/foo' 조각을 만든다 — 대신 소유 domain 라벨(있으면)
        // 을 보여줘 hover 에서 kind + 비즈니스 영역을 한눈에(project 노드와 일관).
        // ontology 노드는 소유 domain 라벨(있으면)을 보여줘 hover 에서 kind +
        // 비즈니스 영역을 한눈에. resolver 가 domain 노드 자신엔 null 반환.
        domain: attrs.isOntology
          ? resolveOwnerDomainLabel(graph, node) ?? ''
          : extractDomainLabel(attrs.projectSlug),
        kind: attrs.isOntology ? attrs.ontologyTopKind : undefined,
        description: attrs.description,
        statusId: attrs.statusId,
        tags: attrs.tags,
        isHub: attrs.isHub,
        // 연결 수 단일 진실원 — 팝오버와 같은 전체-그래프 기준 (없으면 폴백).
        degree: attrs.fullDegree ?? graph.degree(node),
        x: event.x,
        y: event.y,
      });
    });
    renderer.on('leaveNode', () => {
      hoveredNode = null;
      if (containerRef.current) {
        containerRef.current.style.cursor = '';
      }
      refreshNeighbors();
      renderer.refresh();
      setHoveredSlug(null);
      setHoverLabel(null);
    });
    renderer.on('moveBody', () => {
      setHoverLabel(null);
      setEdgeHover(null);
    });
    renderer.on('enterEdge', ({ edge, event }) => {
      const [src, tgt] = graph.extremities(edge);
      const srcAttrs = graph.getNodeAttributes(src);
      const tgtAttrs = graph.getNodeAttributes(tgt);
      const edgeAttrs = graph.getEdgeAttributes(edge);
      hoveredEdgePair = { source: src, target: tgt };
      if (containerRef.current) {
        containerRef.current.style.cursor = 'pointer';
      }
      renderer.refresh();
      setEdgeHover({
        source: src,
        target: tgt,
        sourceName: srcAttrs.label,
        targetName: tgtAttrs.label,
        kind: edgeAttrs.kind,
        x: event.x,
        y: event.y,
      });
    });
    renderer.on('leaveEdge', () => {
      hoveredEdgePair = null;
      if (containerRef.current && hoveredNode === null) {
        containerRef.current.style.cursor = '';
      }
      renderer.refresh();
      setEdgeHover(null);
    });

    sigmaRef.current = renderer;
    setSigmaInstance(renderer);
    if (pathWorkflowActiveRef.current) {
      queueMicrotask(() => {
        applyPathSelection(pathSelectionRef.current);
        try {
          renderer.refresh();
        } catch {
          // Sigma can still be finalizing its WebGL node programs during the
          // first restored-path tick. The DOM evidence banner is already
          // restored; the next normal Sigma render will pick up the reducer
          // state without surfacing a runtime error to the user.
        }
      });
    }
    rendererRefreshNeighbors.current = () => {
      refreshNeighbors();
      renderer.refresh();
    };
    return () => {
      rendererRefreshNeighbors.current = null;
      pathSelectionApplyRef.current = null;
      window.removeEventListener('mouseup', endDragFromWindow);
      window.removeEventListener('pointerup', endDragFromWindow);
      window.removeEventListener('blur', endDragFromWindow);
      draggingNodeRef.current = false;
      physics.stop();
      renderer.kill();
      sigmaRef.current = null;
      setSigmaInstance(null);
    };
    // refs(useSyncedCallbackRef 반환값)는 identity 가 고정이므로 deps 에서 제외.
    // graph 만 바뀌어도 renderer 재생성 필요.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [graph]);

  useEffect(() => {
    if (!pathWorkflowActive) return;
    pathSelectionApplyRef.current?.(pathSelection);
    sigmaRef.current?.refresh();
  }, [pathWorkflowActive, pathSelection]);

  // 라이트/다크 모드 토글 시 sigma label 색 + 노드 border + 엣지 색을 갱신.
  // html data-theme attribute 만 watch — 다른 변화에 끌려가지 않게
  // attributeFilter 한정. 노드/엣지 attr 을 새 팔레트로 다시 바른 뒤
  // setting 변경 + sigma.refresh 한 번 호출.
  //
  // 첫 paint 가 build 시점 팔레트와 일치하면 (정상 케이스) repaint 안 함 —
  // 무조건 RAF repaint 가 깜빡임 1 회 추가하던 문제 해결.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    let appliedPalette = paletteRefLocal.current;
    // 골격 잉크 토큰(라이트/다크) — Sigma reducer 는 CSS 변수를 직접 해석
    // 못 하므로 마운트/테마 전환 시 resolve 해 ref 캐시.
    const resolveSkeletonInk = () => {
      const rootStyle = getComputedStyle(document.documentElement);
      skeletonInkRef.current = {
        hairline:
          rootStyle.getPropertyValue('--topology-edge-hairline').trim() ||
          'rgba(255, 255, 255, 0.05)',
        spoke:
          rootStyle.getPropertyValue('--topology-edge-spoke').trim() ||
          'rgba(255, 255, 255, 0.10)',
      };
    };
    resolveSkeletonInk();
    const repaint = (force = false) => {
      const sigma = sigmaRef.current;
      if (!sigma) return;
      resolveSkeletonInk();
      const palette = resolveTopologyPalette();
      // 팔레트가 정확히 동일하면 attr 재페인트 + sigma.refresh 모두 skip.
      // build 시점 baked 팔레트와 같다면 깜빡임 추가 없음.
      if (!force && palette === appliedPalette) return;
      appliedPalette = palette;
      paletteRefLocal.current = palette;
      graph.forEachNode((id, attrs) => {
        if (attrs.isHub) {
          graph.setNodeAttribute(id, 'borderColor', palette.hubBorder);
          graph.setNodeAttribute(id, 'outerBorderColor', palette.hubOuterHalo);
        } else {
          graph.setNodeAttribute(id, 'borderColor', palette.nodeBorder);
          // 비허브 노드의 outer halo (별빛 bloom) — light/dark 분기. 누락
          // 시 dark→light 토글 후 노드가 흰 배경에 묻혀 invisible 회귀.
          graph.setNodeAttribute(id, 'outerBorderColor', palette.nodeOuterHalo);
          // ontology 노드 fill 도 theme 의존 — light 는 dark graphite,
          // dark 는 회색-블루. theme switch 시 fill 갱신 안 하면 light
          // 모드에서 ontology 노드가 흐릿한 푸른 점으로 invisible.
          if (attrs.isOntology) {
            graph.setNodeAttribute(id, 'color', palette.ontologyFill);
          }
        }
      });
      graph.forEachEdge((edge, attrs) => {
        if (attrs.kind === 'contains') {
          graph.setEdgeAttribute(edge, 'color', palette.edgeContains);
        } else if (attrs.kind === 'depends-on') {
          graph.setEdgeAttribute(edge, 'color', palette.edgeDependsOn);
        } else {
          graph.setEdgeAttribute(edge, 'color', palette.edge);
        }
      });
      sigma.setSetting('labelColor', { color: resolveSigmaLabelColor() });
      sigma.refresh();
    };
    const target = document.documentElement;
    const observer = new MutationObserver(() => repaint());
    observer.observe(target, { attributes: true, attributeFilter: ['data-theme'] });
    return () => {
      observer.disconnect();
    };
  }, [graph]);

  // Sigma 검색 input focus 시 Enter/↓/↑ 로 매치 순회. matches 목록은 매번
  // 계산 (500노드 × 문자열 includes 는 밀리초).
  // 키보드 네비게이션 — Tab/Shift+Tab 이웃 순회, Esc 경로 해제, 검색창에서
  // Enter/↑/↓ 매치 cycle. 훅으로 분리.
  useGraphKeyboardNav({
    graph,
    selectedSlugRef,
    searchQueryRef,
    onSelectProjectRef,
    onEscape: () => pathClearRef.current?.(),
    enabled: !minimal,
  });

  // selectedSlug·depthLimit·searchQuery가 바뀌면 dim 상태 재계산 + 선택 노드로
  // 카메라 부드럽게 이동. 옵시디언에 없는 "focus-on-select" UX.
  // sigmaInstance 를 deps 에 포함해 "selectedSlug 가 먼저 세팅된 상태로 sigma
  // 가 뒤늦게 mount" 되는 경우도 (상세 페이지 minimal 임베드 등) 카메라 fly-to
  // 를 재시도한다. 이 경우가 없으면 IAM Core 같은 중앙 노드가 화면 밖으로
  // 치우쳐 보이는 이슈가 생긴다.
  useEffect(() => {
    selectedSlugRef.current = selectedSlug;
    depthMapRef.current = computeDepthMap(graph, selectedSlug);
    rendererRefreshNeighbors.current?.();

    // Selection bounce — 토스 버튼 / 애플 아이콘 탭 감성. 선택 순간
    // focus 노드가 1.0 → 1.2 → 1.0 으로 280ms 동안 탄성 변조. 클릭이
    // 확실히 먹혔다는 tactile 피드백. reduceMotion 사용자에겐 생략.
    if (selectedSlug && !reduceMotionRef.current) {
      bounceStartRef.current = performance.now();
      // 애니메이션 중 지속적으로 refresh — pulsePhase interval 이 120ms
      // 라 너무 간격이 커서 별도 RAF 루프로 60fps 부드럽게. 280ms 경과
      // 후 자동 종료. 프레임당 1회 bounce phase 를 계산해 ref 에 저장 →
      // nodeReducer 는 노드마다 ref 만 읽는다.
      const animate = () => {
        const start = bounceStartRef.current;
        if (start === null) {
          bounceFactorRef.current = 1;
          return;
        }
        const now = performance.now();
        if (now - start >= BOUNCE_DURATION_MS) {
          bounceStartRef.current = null;
          bounceFactorRef.current = 1;
          sigmaRef.current?.refresh();
          return;
        }
        bounceFactorRef.current = computeBounceFactor(start, now);
        sigmaRef.current?.refresh();
        bounceRafRef.current = requestAnimationFrame(animate);
      };
      if (bounceRafRef.current !== null) {
        cancelAnimationFrame(bounceRafRef.current);
      }
      bounceRafRef.current = requestAnimationFrame(animate);
    }

    const renderer = sigmaRef.current;
    if (!renderer || !selectedSlug || !graph.hasNode(selectedSlug)) return;
    // 첫 settle 가 덜 끝난 타이밍엔 display 좌표가 불안정. requestAnimationFrame
    // 으로 다음 paint 까지 기다린 뒤 재평가.
    const frame = requestAnimationFrame(() => {
      const display = renderer.getNodeDisplayData(selectedSlug);
      if (!display) return;
      const { width, height } = renderer.getDimensions();
      const viewport = renderer.graphToViewport({ x: display.x, y: display.y });
      // 사용자가 이미 보고 있는 노드를 클릭했을 때는 카메라를 움직이지
      // 않는다 — 직접 선택한 곳으로 자동 줌/팬 하면 컨트롤을 뺏기는 느낌.
      // 노드가 아예 뷰포트 밖일 때만 (search palette 에서 점프 등) 팬.
      const VIEW_MARGIN = 40; // 끝 40px 까지는 "보이는" 범위로 취급
      const outOfView =
        viewport.x < -VIEW_MARGIN ||
        viewport.x > width + VIEW_MARGIN ||
        viewport.y < -VIEW_MARGIN ||
        viewport.y > height + VIEW_MARGIN;
      if (!outOfView) return;
      const camera = renderer.getCamera();
      // 이미 줌인된 상태면 현재 ratio 유지. 줌아웃 상태라면 minimal 0.35
      // 수준까지만 약하게 끌어온다 — 돌발적인 큰 줌 이동 금지.
      const currentRatio = camera.getState().ratio;
      const targetRatio = minimal
        ? Math.max(currentRatio, 1.1)
        : Math.min(currentRatio, 0.6);
      camera.animate(
        {
          x: display.x,
          y: display.y,
          ratio: targetRatio,
        },
        { duration: 520, easing: CAMERA_EASING },
      );
    });
    return () => cancelAnimationFrame(frame);
  }, [selectedSlug, graph, sigmaInstance, minimal]);

  useEffect(() => {
    depthLimitRef.current = depthLimit;
    sigmaRef.current?.refresh();
  }, [depthLimit]);

  useEffect(() => {
    activeCategoryRef.current = activeCategory;
    const renderer = sigmaRef.current;
    renderer?.refresh();

    if (!renderer || !activeCategory) return;
    let count = 0;
    let sumX = 0;
    let sumY = 0;
    graph.forEachNode((id, attrs) => {
      if (attrs.categoryId !== activeCategory) return;
      const display = renderer.getNodeDisplayData(id);
      if (!display) return;
      count += 1;
      sumX += display.x;
      sumY += display.y;
    });
    if (count === 0) return;
    renderer.getCamera().animate(
      {
        x: sumX / count,
        y: sumY / count,
        ratio: minimal ? 1.1 : 0.75,
      },
      { duration: 460, easing: CAMERA_EASING },
    );
  }, [activeCategory, graph, minimal]);

  useEffect(() => {
    searchQueryRef.current = searchQuery;
    // dim/highlight 피드백은 키 입력마다 즉시.
    sigmaRef.current?.refresh();

    const q = searchQuery?.trim().toLowerCase();
    if (!q || !sigmaRef.current) return;
    // 검색어 매칭 노드로 카메라 이동(매칭이 뷰포트 밖이면 dim만 보고 위치를
    // 못 찾는 문제 방지). 단 이 작업은 그래프 전체를 훑고(O(N)) 카메라를
    // animate 하므로, 키 입력마다 돌면 카메라가 튀고 비싸다 → 타이핑이 멈춘
    // 뒤 1회만 실행하도록 디바운스. 매칭 판정은 build 시 계산해 둔 searchText
    // (slug\nlabel lowercased) 재사용 — per-keystroke toLowerCase 재계산 제거.
    const handle = window.setTimeout(() => {
      const renderer = sigmaRef.current;
      if (!renderer) return;
      let count = 0;
      let targetX = 0;
      let targetY = 0;
      let found = false;
      graph.forEachNode((id, attrs) => {
        const hay =
          attrs.searchText ??
          `${attrs.projectSlug}\n${attrs.label}`.toLowerCase();
        if (!hay.includes(q)) return;
        count += 1;
        const disp = renderer.getNodeDisplayData(id);
        if (disp) {
          targetX = disp.x;
          targetY = disp.y;
          found = true;
        }
      });
      if (count === 0 || !found) return;
      renderer.getCamera().animate(
        { x: targetX, y: targetY, ratio: count === 1 ? 0.45 : 0.8 },
        { duration: 460, easing: CAMERA_EASING },
      );
    }, 220);
    return () => window.clearTimeout(handle);
  }, [searchQuery, graph]);

  // d3-force 파라미터 실시간 튜닝
  useEffect(() => {
    if (!forces || !physicsRef.current) return;
    physicsRef.current.tune(forces);
  }, [forces]);

  // Fit-to-view — 토큰이 *증가할 때만* 기본 카메라 상태로 부드럽게 복귀.
  // 초기 토큰(0)으로 마운트마다 default 리셋이 돌면 골격 safe-fit 을 520ms
  // 애니메이션이 덮어쓴다 — 첫 값은 기록만 하고 건너뛴다.
  const lastFitViewTokenRef = useRef(fitViewToken);
  useEffect(() => {
    if (fitViewToken == null || fitViewToken === lastFitViewTokenRef.current) {
      lastFitViewTokenRef.current = fitViewToken;
      return;
    }
    lastFitViewTokenRef.current = fitViewToken;
    const renderer = sigmaRef.current;
    if (!renderer) return;
    // 골격 모드의 "지도 맞추기" 도 chrome safe rect 기준으로.
    if (skeletonModeRef.current && runSkeletonSafeFit()) return;
    const camera = renderer.getCamera();
    camera.animate(
      { x: 0.5, y: 0.5, ratio: 1 },
      { duration: 520, easing: CAMERA_EASING },
    );
  }, [fitViewToken, runSkeletonSafeFit]);

  // 내부 fit — minimal 모드에서 쓸 "선택 노드 중앙으로" + "기본 시점 복귀"
  // 동작. 외부 fitViewToken prop 이 없는 상세 페이지 임베드용.
  const recenter = useCallback(() => {
    const renderer = sigmaRef.current;
    if (!renderer) return;
    // 골격 진입 — 마운트 260ms 후 강제 recenter(아래 effect)가 default 로
    // animate 해 safe-area fit 을 덮어쓰던 회귀의 원인. 골격에선 항상
    // chrome safe rect 기준 fit 으로.
    if (skeletonModeRef.current && runSkeletonSafeFit()) return;
    const camera = renderer.getCamera();
    if (selectedSlug && graph.hasNode(selectedSlug)) {
      const display = renderer.getNodeDisplayData(selectedSlug);
      if (display) {
        camera.animate(
          {
            x: display.x,
            y: display.y,
            ratio: minimal ? 1.1 : 0.5,
          },
          { duration: 420, easing: CAMERA_EASING },
        );
        return;
      }
    }
    // 선택 노드 없으면 허브들의 viewport centroid 로 이동. 완전 텅 빈
    // 허브 집합이면 canvas 중앙(0.5, 0.5) 으로. settle 결과가 origin 에서
    // 멀리 치우치는 일반 케이스를 잡는다.
    let hubCount = 0;
    let hubSumX = 0;
    let hubSumY = 0;
    graph.forEachNode((id, attrs) => {
      if (!attrs.isHub) return;
      const display = renderer.getNodeDisplayData(id);
      if (!display) return;
      hubCount += 1;
      hubSumX += display.x;
      hubSumY += display.y;
    });
    if (hubCount > 0) {
      camera.animate(
        {
          x: hubSumX / hubCount,
          y: hubSumY / hubCount,
          ratio: minimal ? 1.1 : 1,
        },
        { duration: 420, easing: CAMERA_EASING },
      );
      return;
    }
    // hub 가 0 인 vault (예: dogfood 처럼 single-project 인 경우 isHub
    // 노드 0) 에선 hubCount-centroid 분기 fall-through 후 canvas (0.5, 0.5)
    // 로 가버려 settle 결과 graph 가 한쪽으로 쏠려 보임. 그 케이스에
    // *모든 노드의 bounding-box center* 로 fallback — 평균은 isolated
    // outlier 에 끌리지만 bbox center 는 outlier 양쪽 분포만 잡으면 안정.
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    graph.forEachNode((id) => {
      const display = renderer.getNodeDisplayData(id);
      if (!display) return;
      if (display.x < minX) minX = display.x;
      if (display.x > maxX) maxX = display.x;
      if (display.y < minY) minY = display.y;
      if (display.y > maxY) maxY = display.y;
    });
    if (Number.isFinite(minX)) {
      camera.animate(
        {
          x: (minX + maxX) / 2,
          y: (minY + maxY) / 2,
          ratio: minimal ? 1.1 : 1,
        },
        { duration: 420, easing: CAMERA_EASING },
      );
      return;
    }
    camera.animate(
      { x: 0.5, y: 0.5, ratio: 1 },
      { duration: 420, easing: CAMERA_EASING },
    );
  }, [graph, minimal, selectedSlug, runSkeletonSafeFit]);

  // recenter 의 최신 closure 를 ref 에 저장해 mount-once effect 가 참조만
  // 할 수 있게. deps 에 recenter 자체를 넣으면 selectedSlug 변경마다
  // identity 가 바뀌어 자동 카메라 리셋 (zoom-out) 버그가 발생 (사용자
  // 피드백).
  const recenterRef = useRef(recenter);
  useEffect(() => {
    recenterRef.current = recenter;
  }, [recenter]);

  // 초기 마운트 시 settle 결과가 가장자리로 치우치는 경우가 있다. sigma
  // 가 준비된 뒤 short delay 후 한 번 recenter 를 강제해 첫 인상을 중앙
  // 정렬된 상태로. minimal 과 main 모두 적용. sigmaInstance 가 새로 mount
  // 될 때만 1회 실행.
  useEffect(() => {
    if (!sigmaInstance) return;
    const handle = window.setTimeout(
      () => recenterRef.current(),
      minimal ? 220 : 260,
    );
    return () => window.clearTimeout(handle);
  }, [minimal, sigmaInstance]);

  // 자동 정렬 — 토큰이 증가할 때마다 physics를 reheat. 자유 노드가 다시 settle.
  useEffect(() => {
    if (relayoutToken == null) return;
    physicsRef.current?.reheat();
  }, [relayoutToken]);

  // 필터 후 보이는 노드 수를 부모에게 알림 (stats 컨텍스트 표시용).
  // \`hubsOnly\` 도 deps 에 포함해야 토글 시 empty state / filter pill 의
  // N/total 카운트가 즉시 갱신된다 (예전 회귀: deps 누락 시 stale).
  useEffect(() => {
    if (!onVisibleCountChange) return;
    const query = searchQuery?.trim().toLowerCase() ?? '';
    const category = activeCategory ?? null;
    const focus = selectedSlug;
    const depth = depthLimit ?? null;
    const hubsOnlyActive = hubsOnly ?? false;
    let count = 0;
    graph.forEachNode((id, attrs) => {
      if (category && attrs.categoryId !== category) return;
      if (hubsOnlyActive && !attrs.isHub) return;
      if (query) {
        const slug = attrs.projectSlug.toLowerCase();
        const name = attrs.label.toLowerCase();
        if (!slug.includes(query) && !name.includes(query)) return;
      }
      if (focus != null && depth != null && graph.hasNode(focus)) {
        const d = depthMapRef.current.get(id);
        if (d === undefined || d > depth) return;
      }
      count += 1;
    });
    onVisibleCountChange(count);
  }, [activeCategory, hubsOnly, searchQuery, selectedSlug, depthLimit, graph, onVisibleCountChange]);

  return (
    <div className={`relative h-full w-full overflow-hidden ${className ?? ''}`}>
      {/* 깔끔한 solid canvas — 이전 radial dot grid 는 1979 노드의 원형
          군집과 시각적으로 섞여 환공포증 패턴을 가중. 노드 자체의 움직임
          이 pan 감각을 충분히 제공하므로 grid 제거해 "정갈한 무" 로 전환. */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{ backgroundColor: 'var(--color-canvas)' }}
      />
      <div
        ref={containerRef}
        data-testid="sigma-topology-viewport"
        // WebGL canvas 는 스크린리더가 콘텐츠를 읽을 수 없어 application
        // role + aria-label 로 온톨로지 지형도 맥락만 제공.
        // 실제 네비게이션은 canvas 주변 검색/패널과 각 노드 aria-label 로
        // 접근 가능.
        role="application"
        aria-label={t('ariaLabel')}
        className="relative h-full w-full"
        style={{
          background: 'transparent',
          // 첫 진입 cinematic — sigma 준비 전에는 투명 + 살짝 축소 상태.
          // 준비되면 700ms 동안 스프링-like cubic-bezier 로 scale 1 + 불투명도
          // 1 로 부드럽게 드러남. 애플·토스 의 "팝이 아닌 emergence" 감성.
          // transform: scale 변화는 GPU 합성 경로라 성능 영향 미미.
          opacity: sigmaInstance ? 1 : 0,
          transform: sigmaInstance ? 'scale(1)' : 'scale(0.97)',
          transition:
            'opacity 700ms cubic-bezier(0.22, 1, 0.36, 1), transform 700ms cubic-bezier(0.22, 1, 0.36, 1)',
          transformOrigin: 'center center',
        }}
      />
      {/* 뷰포트 모서리 subtle vignette — 중심부로 시선 유도. mode-aware
          토큰 사용 — 다크에선 dark fade, 라이트에선 거의 invisible (까만
          vignette 가 흰 캔버스 위에선 grey smudge 로 보이던 fix). */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            'radial-gradient(ellipse at center, transparent 60%, var(--color-vignette) 100%)',
        }}
      />

      {/* minimal 모드 (상세 페이지 임베드 등) 전용 "정렬" 버튼 — 우상단.
          클릭 시 선택 노드가 있으면 그 노드를 중앙으로, 없으면 기본 시점
          으로 부드럽게 복귀. 메인 토폴로지엔 SigmaControls 안에 같은
          동작이 이미 있어 중복을 피한다. */}
      {minimal && sigmaInstance ? (
        <Tooltip content={t('recenterTooltip')} side="bottom" withProvider={false}>
          <button
            type="button"
            onClick={recenter}
            aria-label={t('recenterAriaLabel')}
            className="pointer-events-auto absolute right-3 top-3 z-20 flex h-8 w-8 items-center justify-center rounded-md border border-[color:var(--color-divider)] bg-[color:var(--color-panel)] text-[color:var(--color-text-tertiary)] transition-colors hover:border-[color:rgba(139,151,255,0.32)] hover:text-[color:var(--color-text-primary)]"
          >
            <Maximize2 size={13} />
          </button>
        </Tooltip>
      ) : null}

      {/* 포커스 라벨 — Sigma native 라벨은 bold 600 + near-white 로 렌더돼
          "흰 박스" 처럼 보이는 역효과가 있어, focus 노드 이름만 DOM pill 로
          분리. camera/drag 에 따라 afterRender 이벤트로 좌표 추적. */}
      {!minimal && !skeletonCardsActive ? (
        <SigmaFocusLabel
          sigma={sigmaInstance}
          graph={graph}
          slug={selectedSlug}
          focused
        />
      ) : null}

      {/* 골격 DOM 카드 — 노드의 "상". 라벨/선택 ring/kind data-mark 전담. */}
      {skeletonCardsActive && skeletonCards ? (
        <SigmaSkeletonCards
          sigma={sigmaInstance}
          graph={graph}
          cards={skeletonCards}
          selectedSlug={selectedSlug}
          onSelect={(slug) => onSelectProjectRef.current?.(slug)}
          describeKind={(kind) =>
            kind === 'unknown'
              ? `${t('kindLegendUnknown')} · ${t('kindLegendTierUnclassified')}`
              : `${kindLabel(kind)} · ${t('kindLegendTier', {
                  tier: { project: 1, domain: 2, capability: 3, element: 4 }[kind],
                })}`
          }
        />
      ) : null}

      {/* 호버 라벨 — hover 중인 노드 이름 pill. 선택된 노드와 겹치면 중복
          표시 방지. 호버 노드는 reducer 에서 확대되지 않으므로 focused=false
          로 base size 기준 위치 계산. minimal 모드 (상세 페이지 임베드) 에서도
          동일 스타일이 나와야 "하얀색 tooltip" 대신 인디고 pill 로 표시됨. */}
      {hoveredSlug && hoveredSlug !== selectedSlug && !skeletonCardsActive ? (
        <SigmaFocusLabel
          sigma={sigmaInstance}
          graph={graph}
          slug={hoveredSlug}
          focused={false}
        />
      ) : null}

      {/* 경로 찾기 결과 배너 — 두 노드 체인 + hop 수 노출. 노드 이름 click
          으로 focus 이동. path anchor 진행 배너가 아직 있으면 결과가 우선. */}
      {pathResultSlugs.length >= 2 && !pathAnchorSlug ? (
        <div className="pointer-events-auto absolute left-1/2 top-[17rem] z-30 flex max-w-[min(760px,calc(100vw-32px))] -translate-x-1/2 flex-col gap-2 rounded-lg border border-[color:rgba(139,151,255,0.4)] bg-[color:var(--color-panel)] px-4 py-2 text-[12px] text-[color:var(--color-text-primary)] shadow-[0_12px_28px_rgba(0,0,0,0.45)] md:top-[96px]">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-[color:rgba(139,151,255,0.95)]">
              Path · {pathResultSlugs.length - 1} hop
            </span>
            <div className="flex min-w-[220px] flex-1 items-center gap-1 overflow-hidden">
              {pathResultSlugs.map((slug, idx) => {
                const label = graph.hasNode(slug)
                  ? (graph.getNodeAttribute(slug, 'label') as string)
                  : slug;
                const relation = idx > 0 ? pathRelationSteps[idx - 1]?.relation : null;
                return (
                  <span key={`${slug}-${idx}`} className="flex min-w-0 items-center gap-1">
                    {idx > 0 ? (
                      <>
                        <span className="max-w-[96px] truncate rounded-full border border-[color:rgba(139,151,255,0.24)] bg-[color:rgba(139,151,255,0.08)] px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-[0.10em] text-[color:var(--color-text-tertiary)]">
                          {relation}
                        </span>
                        <span className="text-[color:var(--color-text-quaternary)]">→</span>
                      </>
                    ) : null}
                    <button
                      type="button"
                      onClick={() => onSelectProjectRef.current?.(slug)}
                      className="truncate rounded-sm px-1 py-0.5 text-[12px] text-[color:var(--color-text-secondary)] transition-colors hover:bg-[color:rgba(139,151,255,0.12)] hover:text-[color:var(--color-text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:rgba(94,106,210,0.5)]"
                      title={label}
                    >
                      {label}
                    </button>
                  </span>
                );
              })}
            </div>
            <button
              type="button"
              onClick={copyPathEvidence}
              className="inline-flex shrink-0 items-center gap-1 rounded-full border border-[color:rgba(139,151,255,0.24)] bg-[color:rgba(139,151,255,0.08)] px-2 py-0.5 font-mono text-[9px] uppercase tracking-[0.12em] text-[color:var(--color-text-tertiary)] transition-colors hover:bg-[color:rgba(139,151,255,0.14)] hover:text-[color:var(--color-text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:rgba(94,106,210,0.5)]"
              aria-label={pathCopied ? t('pathCopiedAriaLabel') : t('pathCopyAriaLabel')}
            >
              {pathCopied ? <Check size={11} /> : <Clipboard size={11} />}
              <span>{pathCopied ? t('pathCopied') : t('pathCopy')}</span>
            </button>
            <button
              type="button"
              onClick={copyPathMcpCheck}
              className="inline-flex shrink-0 items-center gap-1 rounded-full border border-[color:rgba(139,151,255,0.30)] bg-[color:rgba(139,151,255,0.10)] px-2 py-0.5 font-mono text-[9px] uppercase tracking-[0.12em] text-[color:var(--color-text-secondary)] transition-colors hover:bg-[color:rgba(139,151,255,0.16)] hover:text-[color:var(--color-text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:rgba(94,106,210,0.5)]"
              aria-label={pathMcpCopied ? t('pathMcpCopiedAriaLabel') : t('pathMcpCopyAriaLabel')}
            >
              {pathMcpCopied ? <Check size={11} /> : <Clipboard size={11} />}
              <span>{pathMcpCopied ? t('pathMcpCopied') : t('pathMcpCopy')}</span>
            </button>
            <button
              type="button"
              onClick={copyPathRelationPreflightCheck}
              className="inline-flex shrink-0 items-center gap-1 rounded-full border border-[color:rgba(139,151,255,0.30)] bg-[color:rgba(139,151,255,0.10)] px-2 py-0.5 font-mono text-[9px] uppercase tracking-[0.12em] text-[color:var(--color-text-secondary)] transition-colors hover:bg-[color:rgba(139,151,255,0.16)] hover:text-[color:var(--color-text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:rgba(94,106,210,0.5)]"
              aria-label={
                pathRelationPreflightCopied
                  ? t('pathRelationPreflightCopiedAriaLabel')
                  : t('pathRelationPreflightCopyAriaLabel')
              }
            >
              {pathRelationPreflightCopied ? <Check size={11} /> : <Clipboard size={11} />}
              <span>
                {pathRelationPreflightCopied
                  ? t('pathRelationPreflightCopied')
                  : t('pathRelationPreflightCopy')}
              </span>
            </button>
            <button
              type="button"
              onClick={copyPathExplainRelationCheck}
              className="inline-flex shrink-0 items-center gap-1 rounded-full border border-[color:rgba(139,151,255,0.30)] bg-[color:rgba(139,151,255,0.10)] px-2 py-0.5 font-mono text-[9px] uppercase tracking-[0.12em] text-[color:var(--color-text-secondary)] transition-colors hover:bg-[color:rgba(139,151,255,0.16)] hover:text-[color:var(--color-text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:rgba(94,106,210,0.5)]"
              aria-label={
                pathExplainRelationCopied
                  ? t('pathExplainRelationCopiedAriaLabel')
                  : t('pathExplainRelationCopyAriaLabel')
              }
            >
              {pathExplainRelationCopied ? <Check size={11} /> : <Clipboard size={11} />}
              <span>
                {pathExplainRelationCopied
                  ? t('pathExplainRelationCopied')
                  : t('pathExplainRelationCopy')}
              </span>
            </button>
            <button
              type="button"
              onClick={copyPathAllPathsPlanCheck}
              className="inline-flex shrink-0 items-center gap-1 rounded-full border border-[color:rgba(139,151,255,0.30)] bg-[color:rgba(139,151,255,0.10)] px-2 py-0.5 font-mono text-[9px] uppercase tracking-[0.12em] text-[color:var(--color-text-secondary)] transition-colors hover:bg-[color:rgba(139,151,255,0.16)] hover:text-[color:var(--color-text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:rgba(94,106,210,0.5)]"
              aria-label={
                pathAllPathsPlanCopied
                  ? t('pathAllPathsPlanCopiedAriaLabel')
                  : t('pathAllPathsPlanCopyAriaLabel')
              }
            >
              {pathAllPathsPlanCopied ? <Check size={11} /> : <Clipboard size={11} />}
              <span>
                {pathAllPathsPlanCopied
                  ? t('pathAllPathsPlanCopied')
                  : t('pathAllPathsPlanCopy')}
              </span>
            </button>
            <button
              type="button"
              onClick={copyPathAllPathsCheck}
              className="inline-flex shrink-0 items-center gap-1 rounded-full border border-[color:rgba(139,151,255,0.30)] bg-[color:rgba(139,151,255,0.10)] px-2 py-0.5 font-mono text-[9px] uppercase tracking-[0.12em] text-[color:var(--color-text-secondary)] transition-colors hover:bg-[color:rgba(139,151,255,0.16)] hover:text-[color:var(--color-text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:rgba(94,106,210,0.5)]"
              aria-label={
                pathAllPathsCopied
                  ? t('pathAllPathsCopiedAriaLabel')
                  : t('pathAllPathsCopyAriaLabel')
              }
            >
              {pathAllPathsCopied ? <Check size={11} /> : <Clipboard size={11} />}
              <span>
                {pathAllPathsCopied
                  ? t('pathAllPathsCopied')
                  : t('pathAllPathsCopy')}
              </span>
            </button>
            <button
              type="button"
              onClick={() => pathClearRef.current?.()}
              className="shrink-0 rounded-full border border-[color:var(--color-divider)] px-2 py-0.5 font-mono text-[9px] uppercase tracking-[0.14em] text-[color:var(--color-text-tertiary)] transition-colors hover:bg-[color:var(--color-overlay-2)] hover:text-[color:var(--color-text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:rgba(94,106,210,0.5)]"
              aria-label={t('pathClearAriaLabel')}
            >
              Esc
            </button>
          </div>
          {pathRelationPreflight ? (
            <div className="flex min-w-0 flex-col gap-1.5 border-t border-[color:rgba(139,151,255,0.16)] pt-2 font-mono text-[10px] text-[color:var(--color-text-tertiary)]">
              <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                <span className="uppercase tracking-[0.14em] text-[color:var(--color-text-quaternary)]">
                  {t('pathRelationPreflightReasonLabel')}
                </span>
                <span className="rounded-sm border border-[color:rgba(139,151,255,0.24)] bg-[color:rgba(139,151,255,0.08)] px-1.5 py-0.5 uppercase tracking-[0.10em] text-[color:rgba(139,151,255,0.95)]">
                  {pathRelationPreflight.type}
                </span>
                <span className="min-w-[220px] flex-1 break-words leading-4">
                  {pathRelationPreflight.reason}
                </span>
              </div>
              <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                <span className="uppercase tracking-[0.14em] text-[color:var(--color-text-quaternary)]">
                  {t('pathTraversalCompletenessLabel')}
                </span>
                <span className="rounded-sm border border-[color:rgba(139,151,255,0.18)] bg-[color:rgba(139,151,255,0.06)] px-1.5 py-0.5 uppercase tracking-[0.10em] text-[color:rgba(139,151,255,0.88)]">
                  {t('pathTraversalCompletenessBadge')}
                </span>
                <span className="min-w-[220px] flex-1 break-words leading-4">
                  {t('pathTraversalCompletenessBody')}
                </span>
              </div>
            </div>
          ) : null}
        </div>
      ) : null}

      {/* 경로 찾기 진행 배너 — Shift+클릭 첫 노드 고정 시 노출. 두 번째 노드를
          Shift+클릭하거나 Esc 로 해제 안내. */}
      {pathAnchorSlug ? (
        <div className="pointer-events-auto absolute left-1/2 top-[17rem] z-30 flex max-w-[440px] -translate-x-1/2 items-center gap-3 rounded-full border border-[color:rgba(139,151,255,0.38)] bg-[color:var(--color-panel)] px-4 py-2 text-[12px] text-[color:var(--color-text-primary)] shadow-[0_12px_28px_rgba(0,0,0,0.45)] md:top-[96px]">
          <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-[color:rgba(139,151,255,0.95)]">
            {t('pathStartBadge')}
          </span>
          <span className="truncate">
            <span className="text-[color:var(--color-text-primary)]">
              {graph.hasNode(pathAnchorSlug)
                ? graph.getNodeAttribute(pathAnchorSlug, 'label')
                : pathAnchorSlug}
            </span>
            <span className="text-[color:var(--color-text-tertiary)]"> → </span>
            <span className="text-[color:var(--color-text-tertiary)]">
              {t('pathPickSecondNode')}
            </span>
          </span>
          <button
            type="button"
            onClick={() => pathClearRef.current?.()}
            className="ml-auto rounded-full border border-[color:var(--color-divider)] px-2 py-0.5 font-mono text-[9px] uppercase tracking-[0.14em] text-[color:var(--color-text-tertiary)] transition-colors hover:bg-[color:var(--color-overlay-2)]"
          >
            Esc
          </button>
        </div>
      ) : null}

      {!minimal && pathWorkflowActive && !pathAnchorSlug && pathResultSlugs.length < 2 ? (
        <div className="pointer-events-auto absolute left-1/2 top-[17rem] z-30 flex max-w-[520px] -translate-x-1/2 items-center gap-3 rounded-full border border-[color:rgba(139,151,255,0.34)] bg-[color:rgba(14,16,22,0.94)] px-4 py-2 text-[12px] text-[color:var(--color-text-primary)] shadow-[0_12px_28px_rgba(0,0,0,0.42)] md:top-[96px]">
          <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-[color:rgba(139,151,255,0.95)]">
            {t('pathStartTitle')}
          </span>
          <span className="min-w-0 truncate text-[color:var(--color-text-tertiary)]">
            {t('pathStartBody')}
          </span>
        </div>
      ) : null}

      {edgeHover ? <SigmaEdgeTooltip data={edgeHover} /> : null}
      {contextMenu ? (
        <SigmaContextMenu
          data={contextMenu}
          onFocus={(slug) => onSelectProjectRef.current?.(slug)}
          onLocalGraph={(slug) => onProjectOpenRef.current?.(slug)}
          onDismiss={() => setContextMenu(null)}
        />
      ) : null}

      {/* Audit overlay 범례 — overlay on + non-minimal 에서만. 좌하단 stats 위로
          살짝 겹쳐 놓아 "지금 켜져 있는 해석" 을 명확히 드러낸다. */}
      {!minimal && overlays?.auditHighlight ? (
        <div className="pointer-events-none absolute bottom-[60px] left-4 z-10 flex flex-col gap-1 rounded-md border border-[color:var(--color-border-soft)] bg-[color:var(--color-panel)] px-3 py-2 md:left-6 xl:left-8">
          <span className="font-mono text-[9px] uppercase tracking-[0.14em] text-[color:var(--color-text-quaternary)]">
            {t('auditLegendTitle')}
          </span>
          <SigmaLegendRow
            color={AUDIT_STALE_COLOR}
            label={t('auditLegendStale', { threshold: AUDIT_STALE_DAYS_THRESHOLD, count: auditSets.stale.size })}
          />
          <SigmaLegendRow
            color={AUDIT_ORPHAN_COLOR}
            label={t('auditLegendOrphan', { count: auditSets.orphan.size })}
          />
          <SigmaLegendRow
            color={AUDIT_PROMOTION_COLOR}
            label={t('auditLegendPromotion', { threshold: AUDIT_PROMOTION_MIN_FAN_IN, count: auditSets.promotion.size })}
          />
        </div>
      ) : null}

      {/* Ontology kind 범례 — 노드 fill 색이 *무슨 의미* 인지 읽히게 한다(comprehension).
          audit overlay 와 같은 자리, 상호배타(audit off · non-minimal 일 때만). 색은
          ontologyFillTone 단일 소스 재사용 → drift 0. */}
      {!minimal && !overlays?.auditHighlight ? (
        <div className="pointer-events-none absolute bottom-[60px] left-4 z-10 flex w-auto max-w-[15rem] flex-col gap-1.5 rounded-lg border border-[color:var(--color-border-soft)] bg-[color:var(--color-panel)] px-3 py-2.5 shadow-[0_10px_28px_rgba(0,0,0,0.30)] md:left-6 xl:left-8">
          <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-[color:var(--color-text-quaternary)]">
            {t('kindLegendTitle')}
          </span>
          {/* 세로 1열 + 계층 태그 — 색이 *위계의 몇 번째 층* 인지까지 읽히게 한다
              (프로젝트→도메인→역량→요소 순서 = 골격 중심→외곽 순서). */}
          <div className="flex flex-col gap-y-0.5">
            <SigmaLegendRow color={ontologyFillTone('project')} label={kindLabel('project')} tier={t('kindLegendTier', { tier: 1 })} />
            <SigmaLegendRow color={ontologyFillTone('domain')} label={kindLabel('domain')} tier={t('kindLegendTier', { tier: 2 })} />
            <SigmaLegendRow color={ontologyFillTone('capability')} label={kindLabel('capability')} tier={t('kindLegendTier', { tier: 3 })} />
            <SigmaLegendRow color={ontologyFillTone('element')} label={kindLabel('element')} tier={t('kindLegendTier', { tier: 4 })} />
            <SigmaLegendRow color={ontologyFillTone('unknown')} label={t('kindLegendUnknown')} tier={t('kindLegendTierUnclassified')} />
          </div>
        </div>
      ) : null}

      {/* rich tooltip (설명 · 태그 · 상태 등) — 메인 토폴로지 전용. 상세 페이지
          임베드 (minimal) 에선 우측 drawer 가 같은 정보를 이미 주고 있고,
          작은 영역에 260x180 카드가 뜨면 시야가 가려 오히려 역효과. 인디고
          hover pill 만 표시. 선택된 노드 위 hover 도 억제 — 그 노드의 정보
          표면은 팝오버 하나 (hover pill 의 selectedSlug 가드와 동일 정책). */}
      {!minimal && hoverLabel && hoveredSlug !== selectedSlug && !skeletonCardsActive ? (
        <SigmaNodeTooltip
          data={hoverLabel}
          hubLabel={t('tooltipHubBadge')}
          degreeTitle={t('tooltipDegreeTitle')}
          degreeLabel={t('tooltipDegreeLabel', { count: hoverLabel.degree ?? 0 })}
          kindLabel={hoverLabel.kind ? kindLabel(hoverLabel.kind) : undefined}
        />
      ) : null}
    </div>
  );
}

/**
 * R11 #9 — public entrypoint. Sigma render 가 throw 하면 fallback UI.
 * resetKey 로 props 변경 시 boundary 자동 reset (사용자가 selectedSlug 등을
 * 바꿨는데 이전 error 가 남아있는 회귀 회피).
 */
export function SigmaTopology(props: SigmaTopologyProps) {
  const resetKey = `${props.projects.length}|${props.selectedSlug ?? ''}|${props.depthLimit ?? ''}`;
  return (
    <ErrorBoundary
      resetKey={resetKey}
      fallback={({ error, reset }) => (
        <SigmaErrorFallback error={error} onReset={reset} />
      )}
    >
      <SigmaTopologyImpl {...props} />
    </ErrorBoundary>
  );
}
