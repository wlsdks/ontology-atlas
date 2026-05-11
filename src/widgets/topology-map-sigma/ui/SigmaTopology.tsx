'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useMediaQuery } from 'usehooks-ts';
import { useTranslations } from 'next-intl';
import { Maximize2 } from 'lucide-react';
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
import {
  buildGraph,
  settleLayout,
  toneForOwnerKey,
  type SigmaEdgeAttrs,
  type SigmaNodeAttrs,
} from '../lib/graph-build';
import {
  buildProjectOntologyCounts,
  type OntologyCountsForProject,
} from '@/shared/lib/ontology-tree';
import { useOntologyInsight } from '@/features/vault-ontology';
import { useSyncedCallbackRef } from '@/shared/lib/use-synced-callback-ref';
import { computeDepthMap, shortestPath } from '../lib/depth';
import { useCameraUrlSync } from '../lib/use-camera-url-sync';
import { resolveTopologyPalette } from '../lib/topology-palette';
import { useGraphKeyboardNav } from '../lib/use-graph-keyboard-nav';
import type { SigmaForces, SigmaOverlays } from '../model/controls-state';
import { startPhysics, type PhysicsController } from '../lib/physics';
import { extractDomainLabel } from '../lib/labels';
import {
  BOUNCE_AMPLITUDE,
  BOUNCE_DURATION_MS,
  computeBounceFactor,
} from '../lib/reducer-anim';
import {
  AUDIT_ORPHAN_COLOR,
  AUDIT_PROMOTION_COLOR,
  AUDIT_STALE_COLOR,
  applyAuditOverlay,
} from '../lib/reducer-audit';
import { applyFocusOverlay } from '../lib/reducer-focus';
import {
  matchesCategory as matchesCategoryFn,
  matchesSearch as matchesSearchFn,
  passesDepth as passesDepthFn,
} from '../lib/reducer-filter';
import { applyContextDimOverlay } from '../lib/reducer-context-dim';
import {
  applyOverlaySize,
  shouldHideNode,
} from '../lib/reducer-overlay-flags';
import { SigmaContextMenu, type SigmaContextMenuData } from './SigmaContextMenu';
import { SigmaFocusLabel } from './SigmaFocusLabel';
import { SigmaEdgeTooltip, type SigmaEdgeTooltipData } from './SigmaEdgeTooltip';
import { SigmaMinimap } from './SigmaMinimap';
import { SigmaNodeTooltip, type SigmaNodeTooltipData } from './SigmaNodeTooltip';

const POSITION_STORAGE_KEY = 'demo:sigma-node-positions:v1';

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
   * R14: true 면 vault 의 ontology 도메인/역량/요소 노드와 그 관계를 같은
   * 그래프에 그린다. project↔project dependencies 는 그대로 살아있고
   * 그 위에 ontology 골격이 얹힌다. `/topology` 라우트 (HomePage) 에서 켠다.
   * project mini map 같은 작은 임베드는 끈 채로 두어 시야가 복잡해지지
   * 않게 한다.
   */
  showOntologyNodes?: boolean;
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
  onFirstInteraction,
  minimal = false,
  stripNamePrefix,
  showOntologyNodes = false,
  className,
}: SigmaTopologyProps) {
  const t = useTranslations('topologyWidgets.sigma');
  const containerRef = useRef<HTMLDivElement | null>(null);
  const sigmaRef = useRef<ReturnType<typeof createSigma> | null>(null);
  // 미니맵 · aurora 처럼 sigma 인스턴스를 render 에 쓰는 자식들은 ref 를 직접
  // 읽으면 react-hooks/refs 룰 위반. state 로 들고 있어서 인스턴스 생성 시점에
  // setSigmaInstance → 자식 재렌더링 트리거.
  const [sigmaInstance, setSigmaInstance] = useState<ReturnType<typeof createSigma> | null>(null);
  const physicsRef = useRef<PhysicsController | null>(null);
  const selectedSlugRef = useRef<string | null | undefined>(selectedSlug);
  const activeCategoryRef = useRef<string | null | undefined>(activeCategory);
  const depthLimitRef = useRef<number | null | undefined>(depthLimit);
  const searchQueryRef = useRef<string | undefined>(searchQuery);
  const hubsOnlyRef = useRef<boolean>(hubsOnly ?? false);
  useEffect(() => {
    hubsOnlyRef.current = hubsOnly ?? false;
    // toggle 즉시 반영
    sigmaRef.current?.refresh();
  }, [hubsOnly]);
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
    return {
      stale: new Set(
        detectStaleProjects(projects, {
          now,
          daysThreshold: AUDIT_STALE_DAYS_THRESHOLD,
        }).map((p) => p.slug),
      ),
      orphan: new Set(detectOrphanProjects(projects).map((p) => p.slug)),
      promotion: new Set(
        detectPromotionCandidates(projects, {
          minFanIn: AUDIT_PROMOTION_MIN_FAN_IN,
        }).map((p) => p.slug),
      ),
    };
  }, [overlays?.auditHighlight, projects]);
  const auditSetsRef = useRef(auditSets);
  useEffect(() => {
    auditSetsRef.current = auditSets;
    sigmaRef.current?.refresh();
  }, [auditSets]);

  // 카메라 상태 ↔ URL sync (?cam=x,y,r). minimal 모드 (상세 페이지의 로컬
  // 토폴로지 등) 에서는 URL 오염을 피하려고 비활성.
  useCameraUrlSync(minimal ? null : sigmaInstance);

  // camera 움직일 때마다 ratio 를 ref 에 동기화 — reducer 가 LOD 판정에 사용.
  // 매 프레임 callback 이 아니라 Sigma 의 updated 이벤트라 비용 낮음.
  useEffect(() => {
    if (!sigmaInstance) return;
    const camera = sigmaInstance.getCamera();
    cameraRatioRef.current = camera.getState().ratio;
    const handler = () => {
      cameraRatioRef.current = camera.getState().ratio;
    };
    camera.on('updated', handler);
    return () => {
      camera.off('updated', handler);
    };
  }, [sigmaInstance]);

  // recentlyUpdated pulse — 480ms 주기 sine 위상. nodeReducer 는 pulsePhaseRef
  // 를 읽어 size 를 1 + 0.12*sin(phase) 배수로 변조. 심플하게 render 반복을
  // 일으키려고 interval 에서 sigma refresh. edgeReducer 의 focus edge 도
  // 이 phase 를 읽어 alpha 를 변조 (전기 흐름 → 기존 선 반짝임).
  const pulsePhaseRef = useRef(0);
  const reduceMotionRef = useRef(false);
  // 그래프에 recentlyUpdated 노드가 1개라도 있는지 — pulse interval 의
  // skip 조건에 사용. 매 interval 마다 graph 순회하면 O(N) × 매 120ms 라
  // 비쌈 → graph 빌드 시 한 번 계산.
  const hasAnyRecentRef = useRef(false);
  // Selection bounce — selectedSlug 변경 순간 performance.now() 저장,
  // BOUNCE_DURATION_MS 경과 후 null. nodeReducer 가 이 값으로 phase 계산해
  // focus 노드 size 를 1 → 1.2 → 1 sine 으로 변조.
  const bounceStartRef = useRef<number | null>(null);
  const bounceRafRef = useRef<number | null>(null);
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
      // Pulse 가 실제로 렌더에 영향 주는 상황에서만 refresh — 그래프가
      // 1979 노드일 때 refresh() 한 번이 비싼데, selection 도 hover 도 없고
      // 최근 업데이트 노드도 없으면 pulse 로 바뀌는 게 없다. 완전 skip.
      const hasFocus = selectedSlugRef.current !== null;
      const hasRecentPulse =
        overlaysRef.current.recentPulse && hasAnyRecentRef.current;
      if (!hasFocus && !hasRecentPulse) return;
      t += 1;
      pulsePhaseRef.current = (t * Math.PI) / 8; // 16 프레임 = 한 사이클
      sigmaRef.current?.refresh();
    };
    const handle = window.setInterval(tick, 120);
    return () => window.clearInterval(handle);
  }, []);
  const depthMapRef = useRef<Map<string, number>>(new Map());
  const rendererRefreshNeighbors = useRef<(() => void) | null>(null);
  const pathClearRef = useRef<(() => void) | null>(null);
  const [pathAnchorSlug, setPathAnchorSlug] = useState<string | null>(null);
  // 경로 찾기 결과 노드 체인. 완성 시 set, 일반 클릭/Esc 로 clear.
  // 상단 배너에서 "A → B → C (N hop)" 표기 + 해제 버튼용.
  const [pathResultSlugs, setPathResultSlugs] = useState<string[]>([]);
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
  const LOD_HIDE_RATIO = minimal ? 2.4 : 1.8;
  const [hoverLabel, setHoverLabel] = useState<SigmaNodeTooltipData | null>(null);
  const [hoveredSlug, setHoveredSlug] = useState<string | null>(null);
  const [contextMenu, setContextMenu] = useState<SigmaContextMenuData | null>(null);
  const [edgeHover, setEdgeHover] = useState<SigmaEdgeTooltipData | null>(null);

  // ontology kind 별 borderColor — vault frontmatter (또는 빌드타임 dogfood)
  // 의 노드를 buildProjectOntologyCounts 로 slug 별 집계. project / document
  // 메타 kind 제외 (4 kind: domain / capability / element / unknown).
  // ontology 노드 0 인 경우 module-scope EMPTY 로 짧게 short-circuit — 매 render
  // 새 Map 생성 회피.
  const { insight: ontologyInsight } = useOntologyInsight();
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
        const next = new Set(prev);
        for (const s of added) next.delete(s);
        return next;
      });
    }, RUNTIME_RECENT_TTL_MS);
    return () => clearTimeout(timer);
  }, [projects]);

  const graph = useMemo(() => {
    const g = buildGraph(projects, categories, {
      stripNamePrefix,
      ontologyCountsBySlug,
      runtimeRecentSlugs,
      // R14: showOntologyNodes 켜진 surface (HomePage / /topology) 에서만
      // ontology 노드를 그래프에 추가. project mini map 등은 켜지 않음.
      ontologyExtension:
        showOntologyNodes && ontologyInsight
          ? {
              nodes: ontologyInsight.nodes,
              edges: ontologyInsight.edges,
            }
          : undefined,
    });
    const iterations = g.order > 600 ? 120 : g.order > 200 ? 240 : 360;
    settleLayout(g, iterations);
    // 사용자가 드래그로 옮긴 좌표가 있으면 settle 이후 해당 노드만 덮어쓰기.
    // 이렇게 하면 새 노드는 force 시뮬레이션 결과를 쓰고 기존에 "내가 저기
    // 뒀지"는 그대로 유지된다.
    if (typeof window !== 'undefined') {
      try {
        const raw = window.localStorage.getItem(POSITION_STORAGE_KEY);
        if (raw) {
          const map = JSON.parse(raw) as Record<string, { x: number; y: number }>;
          for (const [id, pos] of Object.entries(map)) {
            if (g.hasNode(id) && Number.isFinite(pos.x) && Number.isFinite(pos.y)) {
              g.setNodeAttribute(id, 'x', pos.x);
              g.setNodeAttribute(id, 'y', pos.y);
            }
          }
        }
      } catch {
        /* corrupt storage — ignore */
      }
    }
    return g;
  }, [
    projects,
    categories,
    stripNamePrefix,
    ontologyCountsBySlug,
    runtimeRecentSlugs,
    showOntologyNodes,
    ontologyInsight,
  ]);

  useEffect(() => {
    let anyRecent = false;
    graph.forEachNode((_, attrs) => {
      if (attrs.recentlyUpdated) anyRecent = true;
    });
    hasAnyRecentRef.current = anyRecent;
  }, [graph]);

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
    const physics = startPhysics(graph);
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
        pulsePhase: pulsePhaseRef.current,
      });
      // Owner tint overlay — 허브(인디고)는 허브 정체성을 유지하기 위해 건너뛰고
      // 비허브 노드만 owner 해시 색으로 덮어씌운다. focus/neighbor dim 보다 먼저
      // 적용해야 "dim 된 색" 이 아닌 "owner 색 기반 dim" 이 된다.
      if (overlayState.ownerTint && !attrs.isHub) {
        attrs = { ...attrs, color: toneForOwnerKey(attrs.ownerKey) };
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
      });
      if (contextResult) return contextResult;

      const focus = activeNode();
      if (!focus) return attrs;
      // focus / neighbor / 2-hop tint 분기는 ../lib/reducer-focus 의
      // applyFocusOverlay 에서 (A3-1 추출). bounceFactor 만 컴포넌트
      // 안에서 계산해 ctx 로 전달.
      const bounceFactor = computeBounceFactor(
        bounceStartRef.current,
        performance.now(),
        BOUNCE_DURATION_MS,
        BOUNCE_AMPLITUDE,
      );
      return applyFocusOverlay(node, attrs, {
        focusNode: focus,
        neighbors,
        secondHop,
        backrefNodes,
        backrefHighlight: overlayState.backrefHighlight,
        bounceFactor,
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
      // Label strategy — 라벨 밀집 방지:
      // - Hub/Node 는 줌아웃 상태에서 label 자체를 제거한다. forceLabel 만
      //   끄면 Sigma size threshold 때문에 큰 hub 라벨이 계속 남아 화면을
      //   덮는다.
      // - Hover/선택/이웃은 예외로 즉시 라벨을 복원한다.
      const focus = selectedSlugRef.current ?? hoveredNode;
      const isFocusOrNeighbor =
        focus === node || (focus !== null && neighbors.has(node));
      const ratio = cameraRatioRef.current;

      if (!hidden && !isFocusOrNeighbor) {
        if (attrs.isHub) {
          const HUB_LABEL_RATIO = 0.55;
          if (ratio > HUB_LABEL_RATIO) {
            return { ...base, label: undefined, forceLabel: false };
          }
        } else {
          const NODE_LABEL_RATIO = 0.28;
          if (ratio > NODE_LABEL_RATIO) {
            return { ...base, label: undefined, forceLabel: false };
          }
        }
      }

      if (!hidden && attrs.isHub && !isFocusOrNeighbor) {
        return { ...base, forceLabel: ratio <= 0.55 };
      }

      if (!hidden && !base.forceLabel && isFocusOrNeighbor) {
        return { ...base, forceLabel: true };
      }
      return base;
    });
    renderer.setSetting('edgeReducer', (edge, attrs) => {
      const [src, tgt] = graph.extremities(edge);
      const srcAttrs = graph.getNodeAttributes(src);
      const tgtAttrs = graph.getNodeAttributes(tgt);
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
          color: 'rgba(139, 151, 255, 0.9)',
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

      // 경로 찾기: 경로 엣지만 강조.
      if (pathEdgeSet.size > 0) {
        if (pathEdgeSet.has(edge)) {
          return { ...attrs, color: 'rgba(139, 151, 255, 0.9)', size: 2 };
        }
        return { ...attrs, color: DIM_EDGE() };
      }

      const focus = activeNode();
      if (!focus) {
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
        // 1-hop 엣지: "전기 흐르듯" 기존 선이 반짝이는 느낌. pulsePhaseRef
        // 가 120ms 마다 (t*π)/8 로 증가 → sin 값이 0 ↔ 1 주기적으로 움직임.
        // alpha 를 sin 으로 변조해 선이 밝아졌다 흐려졌다 breathing.
        // prefers-reduced-motion 사용자에겐 중간값 고정해 정적 렌더.
        const denseFocus = neighbors.size >= 8;
        const wave = reduceMotionRef.current
          ? 0.5
          : 0.5 + 0.5 * Math.sin(pulsePhaseRef.current);
        const alpha = denseFocus
          ? 0.3 + 0.2 * wave   // 0.3 ~ 0.5
          : 0.55 + 0.4 * wave; // 0.55 ~ 0.95
        return {
          ...attrs,
          color: `rgba(139, 151, 255, ${alpha.toFixed(3)})`,
          size: denseFocus ? 1.1 : 1.8,
        };
      }
      // 1-hop 간 엣지 (이웃끼리 연결) 는 아주 옅게 — 포커스와 직접 관련
      // 없는 구조지만 완전히 지우진 않는다. 그 외 모든 엣지는 거의 숨김.
      if (neighbors.has(src) && neighbors.has(tgt)) {
        return { ...attrs, color: 'rgba(139, 151, 255, 0.1)', size: attrs.size };
      }
      return { ...attrs, color: DIM_EDGE() };
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
      dragMoved = false;
      graph.setNodeAttribute(node, 'highlighted', true);
      // 드래그 시작 시 grabbing cursor — M-27 (hover=pointer) 와 쌍으로
      // 클릭/드래그 affordance 분리. mouseup 에서 hover 여부 따라 복원.
      if (containerRef.current) {
        containerRef.current.style.cursor = 'grabbing';
      }
      const pos = renderer.viewportToGraph({ x: event.x, y: event.y });
      physics.pin(node, pos.x, pos.y);
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
      // 드래그 종료 시 hover 여부 따라 cursor 복원 — 여전히 노드 위라면
      // pointer, 바깥이면 기본으로.
      if (containerRef.current) {
        containerRef.current.style.cursor = hoveredNode ? 'pointer' : '';
      }
      queueMicrotask(() => {
        dragMoved = false;
      });
    };
    captor.on('mouseup', endDrag);

    renderer.on('clickNode', ({ node, event }) => {
      if (dragMoved) {
        event.original.stopPropagation();
        return;
      }
      // Shift+클릭: 경로 찾기. 첫 클릭은 시작 노드 고정, 둘째 클릭은 최단 경로
      // 하이라이트. Esc 로 해제.
      const shiftKey =
        event.original instanceof MouseEvent ? event.original.shiftKey : false;
      if (shiftKey) {
        if (!pathAnchor || pathAnchor === node) {
          pathAnchor = node;
          setPathAnchorSlug(node);
          pathNodes.clear();
          pathEdgeSet.clear();
          pathNodes.add(node);
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
          setPathResultSlugs(path);
        } else {
          setPathResultSlugs([]);
        }
        pathAnchor = null;
        setPathAnchorSlug(null);
        renderer.refresh();
        return;
      }
      // 일반 클릭: 경로 결과가 떠 있으면 먼저 해제.
      if (pathNodes.size > 0 || pathAnchor) {
        pathAnchor = null;
        setPathAnchorSlug(null);
        setPathResultSlugs([]);
        pathNodes.clear();
        pathEdgeSet.clear();
        renderer.refresh();
      }
      onSelectProjectRef.current?.(node);
    });
    pathClearRef.current = () => {
      pathAnchor = null;
      setPathAnchorSlug(null);
      setPathResultSlugs([]);
      pathNodes.clear();
      pathEdgeSet.clear();
      renderer.refresh();
    };
    renderer.on('rightClickNode', ({ node, event }) => {
      event.preventSigmaDefault();
      event.original.preventDefault();
      const attrs = graph.getNodeAttributes(node);
      setContextMenu({ slug: node, name: attrs.label, x: event.x, y: event.y });
    });
    renderer.on('rightClickStage', () => setContextMenu(null));
    renderer.on('clickStage', () => setContextMenu(null));
    renderer.on('doubleClickNode', ({ node, event }) => {
      // 옵시디언의 "이 노드로 포커스" 동작 — Local graph 모드 트리거.
      event.preventSigmaDefault();
      onProjectOpenRef.current?.(node);
      if (!interactedRef.current) {
        interactedRef.current = true;
        onFirstInteractionRef.current?.();
      }
    });
    renderer.on('clickStage', () => {
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
        domain: extractDomainLabel(attrs.projectSlug),
        description: attrs.description,
        statusId: attrs.statusId,
        tags: attrs.tags,
        isHub: attrs.isHub,
        degree: graph.degree(node),
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
    rendererRefreshNeighbors.current = () => {
      refreshNeighbors();
      renderer.refresh();
    };
    return () => {
      rendererRefreshNeighbors.current = null;
      physics.stop();
      renderer.kill();
      sigmaRef.current = null;
      setSigmaInstance(null);
    };
    // refs(useSyncedCallbackRef 반환값)는 identity 가 고정이므로 deps 에서 제외.
    // graph 만 바뀌어도 renderer 재생성 필요.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [graph]);

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
    const repaint = (force = false) => {
      const sigma = sigmaRef.current;
      if (!sigma) return;
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
      // 후 자동 종료.
      const animate = () => {
        const start = bounceStartRef.current;
        if (start === null) return;
        const elapsed = performance.now() - start;
        if (elapsed >= BOUNCE_DURATION_MS) {
          bounceStartRef.current = null;
          sigmaRef.current?.refresh();
          return;
        }
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
    sigmaRef.current?.refresh();

    // 검색어 매칭 노드들의 중심·평균 좌표를 계산해 카메라 이동. 매칭이 뷰포트
    // 밖에 있으면 dim만 보고 어디 있는지 못 찾는 문제를 방지.
    const q = searchQuery?.trim().toLowerCase();
    if (!q || !sigmaRef.current) return;
    let count = 0;
    let sumX = 0;
    let sumY = 0;
    graph.forEachNode((_, attrs) => {
      if (
        attrs.projectSlug.toLowerCase().includes(q) ||
        attrs.label.toLowerCase().includes(q)
      ) {
        sumX += attrs.x;
        sumY += attrs.y;
        count += 1;
      }
    });
    if (count === 0) return;
    const cx = sumX / count;
    const cy = sumY / count;
    // 간이 방법: 매칭 노드의 display data 중 평균 근처 대표점을 기준으로 이동.
    void cx;
    void cy;
    let target = { x: 0.5, y: 0.5 };
    graph.forEachNode((id, attrs) => {
      if (
        attrs.projectSlug.toLowerCase().includes(q) ||
        attrs.label.toLowerCase().includes(q)
      ) {
        const disp = sigmaRef.current?.getNodeDisplayData(id);
        if (disp) target = { x: disp.x, y: disp.y };
        return;
      }
    });
    const camera = sigmaRef.current.getCamera();
    camera.animate(
      { x: target.x, y: target.y, ratio: count === 1 ? 0.45 : 0.8 },
      { duration: 460, easing: CAMERA_EASING },
    );
  }, [searchQuery, graph]);

  // d3-force 파라미터 실시간 튜닝
  useEffect(() => {
    if (!forces || !physicsRef.current) return;
    physicsRef.current.tune(forces);
  }, [forces]);

  // Fit-to-view — 토큰이 증가할 때마다 기본 카메라 상태로 부드럽게 복귀.
  useEffect(() => {
    if (fitViewToken == null) return;
    const renderer = sigmaRef.current;
    if (!renderer) return;
    const camera = renderer.getCamera();
    camera.animate(
      { x: 0.5, y: 0.5, ratio: 1 },
      { duration: 520, easing: CAMERA_EASING },
    );
  }, [fitViewToken]);

  // 내부 fit — minimal 모드에서 쓸 "선택 노드 중앙으로" + "기본 시점 복귀"
  // 동작. 외부 fitViewToken prop 이 없는 상세 페이지 임베드용.
  const recenter = useCallback(() => {
    const renderer = sigmaRef.current;
    if (!renderer) return;
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
  }, [graph, minimal, selectedSlug]);

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

  const stats = useMemo(() => {
    let hubs = 0;
    graph.forEachNode((_, attrs) => {
      if (attrs.isHub) hubs += 1;
    });
    // ontology extension 이 켜진 surface 에선 edge 카운트를 vault 의 원본
    // 관계 (insight.edges.length) 와 정렬 — graphology 의 graph.size 는
    // 같은 (from,to) 쌍을 1개로 dedup 해서 /ontology 의 "총 관계" 와
    // 카운트가 어긋났다 (141 vs 135).
    const originalRelationCount =
      showOntologyNodes && ontologyInsight ? ontologyInsight.edges.length : graph.size;
    return {
      nodes: graph.order,
      hubs,
      edges: originalRelationCount,
    };
  }, [graph, showOntologyNodes, ontologyInsight]);

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
        // role + aria-label 로 "이건 프로젝트 토폴로지" 라는 맥락만 제공.
        // 실제 네비게이션은 좌측 Hub Rail 의 버튼 목록으로 SR 사용자에게
        // 접근 가능 (각 버튼에 aria-label 존재).
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

      {minimal ? null : <SigmaMinimap sigma={sigmaInstance} graph={graph} />}

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
      {!minimal ? (
        <SigmaFocusLabel
          sigma={sigmaInstance}
          graph={graph}
          slug={selectedSlug}
          focused
        />
      ) : null}

      {/* 호버 라벨 — hover 중인 노드 이름 pill. 선택된 노드와 겹치면 중복
          표시 방지. 호버 노드는 reducer 에서 확대되지 않으므로 focused=false
          로 base size 기준 위치 계산. minimal 모드 (상세 페이지 임베드) 에서도
          동일 스타일이 나와야 "하얀색 tooltip" 대신 인디고 pill 로 표시됨. */}
      {hoveredSlug && hoveredSlug !== selectedSlug ? (
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
        <div className="pointer-events-auto absolute left-1/2 top-[96px] z-30 flex max-w-[560px] -translate-x-1/2 items-center gap-3 rounded-full border border-[color:rgba(139,151,255,0.4)] bg-[color:var(--color-panel)] px-4 py-2 text-[12px] text-[color:var(--color-text-primary)] shadow-[0_12px_28px_rgba(0,0,0,0.45)]">
          <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-[color:rgba(139,151,255,0.95)]">
            Path · {pathResultSlugs.length - 1} hop
          </span>
          <div className="flex min-w-0 flex-1 items-center gap-1 overflow-hidden">
            {pathResultSlugs.map((slug, idx) => {
              const label = graph.hasNode(slug)
                ? (graph.getNodeAttribute(slug, 'label') as string)
                : slug;
              return (
                <span key={`${slug}-${idx}`} className="flex min-w-0 items-center gap-1">
                  {idx > 0 ? (
                    <span className="text-[color:var(--color-text-quaternary)]">→</span>
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
            onClick={() => pathClearRef.current?.()}
            className="shrink-0 rounded-full border border-[color:var(--color-divider)] px-2 py-0.5 font-mono text-[9px] uppercase tracking-[0.14em] text-[color:var(--color-text-tertiary)] transition-colors hover:bg-[color:var(--color-overlay-2)] hover:text-[color:var(--color-text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:rgba(94,106,210,0.5)]"
            aria-label={t('pathClearAriaLabel')}
          >
            Esc
          </button>
        </div>
      ) : null}

      {/* 경로 찾기 진행 배너 — Shift+클릭 첫 노드 고정 시 노출. 두 번째 노드를
          Shift+클릭하거나 Esc 로 해제 안내. */}
      {pathAnchorSlug ? (
        <div className="pointer-events-auto absolute left-1/2 top-[96px] z-30 flex max-w-[440px] -translate-x-1/2 items-center gap-3 rounded-full border border-[color:rgba(139,151,255,0.38)] bg-[color:var(--color-panel)] px-4 py-2 text-[12px] text-[color:var(--color-text-primary)] shadow-[0_12px_28px_rgba(0,0,0,0.45)]">
          <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-[color:rgba(139,151,255,0.95)]">
            Path
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

      {edgeHover ? <SigmaEdgeTooltip data={edgeHover} /> : null}
      {contextMenu ? (
        <SigmaContextMenu
          data={contextMenu}
          onFocus={(slug) => onSelectProjectRef.current?.(slug)}
          onLocalGraph={(slug) => onProjectOpenRef.current?.(slug)}
          onDismiss={() => setContextMenu(null)}
        />
      ) : null}

      {/* 통계 미니패널 — 좌하단 모노 캡션. 지도 밀도 요약 + 활성 모드 배지.
          minimal 모드에서는 임베드 영역이 작아서 노출 생략. */}
      <div
        className={`pointer-events-none absolute bottom-6 left-4 z-10 ${minimal ? 'hidden' : 'hidden md:flex'} items-center gap-3 rounded-md border border-[color:var(--color-border-soft)] bg-[color:var(--color-panel)] px-3 py-1.5 font-mono text-[10px] tracking-[0.14em] text-[color:var(--color-text-quaternary)] md:left-6 xl:left-8`}
      >
        <span>
          <span className="text-[color:var(--color-text-secondary)]">{stats.nodes}</span> {t('statsNodes')}
        </span>
        {stats.hubs > 0 ? (
          <>
            <span className="h-2 w-px bg-[color:var(--color-overlay-3)]" />
            <span>
              <span className="text-[color:var(--color-indigo-accent)]">{stats.hubs}</span> {t('statsHubs')}
            </span>
          </>
        ) : null}
        <span className="h-2 w-px bg-[color:var(--color-overlay-3)]" />
        <span>
          <span className="text-[color:var(--color-text-secondary)]">{stats.edges}</span> {t('statsEdges')}
        </span>
        {hubsOnly ? (
          <>
            <span className="h-2 w-px bg-[color:rgba(139,151,255,0.32)]" />
            <span className="rounded-sm border border-[color:rgba(139,151,255,0.32)] px-1.5 py-0.5 text-[9px] uppercase tracking-[0.14em] text-[color:rgba(139,151,255,0.95)]">
              hubs only
            </span>
          </>
        ) : null}
        {depthLimit != null ? (
          <>
            <span className="h-2 w-px bg-[color:rgba(139,151,255,0.32)]" />
            <span className="rounded-sm border border-[color:rgba(139,151,255,0.32)] px-1.5 py-0.5 text-[9px] uppercase tracking-[0.14em] text-[color:rgba(139,151,255,0.95)]">
              depth · {depthLimit}
            </span>
          </>
        ) : null}
        {pathAnchorSlug ? (
          <>
            <span className="h-2 w-px bg-[color:rgba(139,151,255,0.32)]" />
            <span className="rounded-sm border border-[color:rgba(139,151,255,0.32)] px-1.5 py-0.5 text-[9px] uppercase tracking-[0.14em] text-[color:rgba(139,151,255,0.95)]">
              path
            </span>
          </>
        ) : null}
      </div>

      {/* Audit overlay 범례 — overlay on + non-minimal 에서만. 좌하단 stats 위로
          살짝 겹쳐 놓아 "지금 켜져 있는 해석" 을 명확히 드러낸다. */}
      {!minimal && overlays?.auditHighlight ? (
        <div className="pointer-events-none absolute bottom-[60px] left-4 z-10 flex flex-col gap-1 rounded-md border border-[color:var(--color-border-soft)] bg-[color:var(--color-panel)] px-3 py-2 md:left-6 xl:left-8">
          <span className="font-mono text-[9px] uppercase tracking-[0.14em] text-[color:var(--color-text-quaternary)]">
            {t('auditLegendTitle')}
          </span>
          <LegendRow
            color={AUDIT_STALE_COLOR}
            label={t('auditLegendStale', { threshold: AUDIT_STALE_DAYS_THRESHOLD, count: auditSets.stale.size })}
          />
          <LegendRow
            color={AUDIT_ORPHAN_COLOR}
            label={t('auditLegendOrphan', { count: auditSets.orphan.size })}
          />
          <LegendRow
            color={AUDIT_PROMOTION_COLOR}
            label={t('auditLegendPromotion', { threshold: AUDIT_PROMOTION_MIN_FAN_IN, count: auditSets.promotion.size })}
          />
        </div>
      ) : null}

      {/* rich tooltip (설명 · 태그 · 상태 등) — 메인 토폴로지 전용. 상세 페이지
          임베드 (minimal) 에선 우측 drawer 가 같은 정보를 이미 주고 있고,
          작은 영역에 260x180 카드가 뜨면 시야가 가려 오히려 역효과. 인디고
          hover pill 만 표시. */}
      {!minimal && hoverLabel ? (
        <SigmaNodeTooltip
          data={hoverLabel}
          hubLabel={t('tooltipHubBadge')}
          degreeTitle={t('tooltipDegreeTitle')}
          degreeLabel={t('tooltipDegreeLabel', { count: hoverLabel.degree ?? 0 })}
        />
      ) : null}
    </div>
  );
}

function LegendRow({ color, label }: { color: string; label: string }) {
  return (
    <span className="flex items-center gap-2 text-[10px] text-[color:var(--color-text-secondary)]">
      <span
        aria-hidden="true"
        className="h-2.5 w-2.5 shrink-0 rounded-full"
        style={{ backgroundColor: color }}
      />
      {label}
    </span>
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
