"use client";

import {
  useMemo,
  useRef,
  useState,
  type FocusEvent as ReactFocusEvent,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import { ChevronLeft, Search } from "lucide-react";
import { ICON_SIZE } from "@/shared/ui/icon-size";
import { useRovingRadioGroup } from "@/shared/lib/use-roving-radio-group";
import { Link } from "@/i18n/navigation";
import { controlClass } from "@/shared/ui";
import {
  filterTreeByNodeIds,
  filterTreeByQuery,
  type DomainCensusRow,
  type OntologyTreeBuildResult,
} from "@/shared/lib/ontology-tree";
import { FirstRunStarterModule } from "@/features/first-run-starter";
import { computeMaxDomainDescendantCount } from "../lib/domain-subcounts";
import {
  flattenVisibleRowIds,
  nextRovingId,
  resolveActiveRowId,
  type RovingNavKey,
} from "../lib/roving-tabindex";
import { TopologyIndexTreeRow } from "./TopologyIndexTreeRow";
import { fieldClass } from '@/shared/ui/control-class';

/** INDEX 의 렌즈 — 「전체」 · 「최근 변경」. */
export type IndexLens = "all" | "recent";

export interface TopologyIndexPanelLabels {
  label: string;
  fold: string;
  foldAria: string;
  searchPlaceholder: string;
  censusConcepts: string;
  censusRelations: string;
  censusDomains: string;
  capabilitiesShort: string;
  elementsShort: string;
  freshTitle: string;
  /** M-6 — 도메인 배지 hover 설명 (다중 소속 중복 계상). */
  domainCountTitle: string;
  /** H1 A — 도메인 행 큰 숫자의 스코프 단어("하위 전체"). */
  subtotalTitle?: string;
  emptyHint: string;
  /** P4a — 렌즈 세그먼트 "전체". */
  segmentAll: string;
  /** P4a — 렌즈 세그먼트 "최근 변경 N"(호출자가 count 를 이미 포맷). */
  segmentRecent: string;
  segmentRecentAria: string;
  /** P4a — "최근 변경" 렌즈가 활성인데 결과가 0일 때. */
  recentEmptyHint: string;
  /** 스포트라이트 창 프리셋 칩 (협의회 §②, 렌즈 활성 시) — 전부 제공될 때만 칩 행 렌더. */
  windowChipAuto?: string;
  windowChip1?: string;
  windowChip7?: string;
  windowChip30?: string;
  windowChipsAria?: string;
  /** P4b — heartbeat 귀속 배지. */
  agentBadge: string;
  /** P4c — "지도에 없는 문서 N개"(호출자가 count 를 이미 포맷). */
  uncatalogedDocsLabel: string;
  uncatalogedDocsAction: string;
  /** ④ 살아있는 지도 드리프트 — "먼지 앉은 노드 N"(호출자가 count 포맷) +
   *  신선도 탭 이동 액션. 중립 톤만 — warning 사다리 금지 (Guardian 1차). */
  dustyNodesLabel: string;
  dustyNodesAction: string;
  /**
   * 「이 프로젝트에 연결된 코드 폴더가 없다」 — 종전에는 **그 프로젝트 노드를
   * 정확히 클릭했을 때만** 보이던 사실이다(실측 2026-08-04: 첫 화면 0회).
   * 위 두 행과 같은 모양의 조용한 한 줄로, 누르면 그 프로젝트가 열려 처방이
   * 나온다. 여기서 폴더를 고르지는 않는다 — 같은 행동을 두 곳에 두지 않는다. */
  sourceUnboundLabel: string;
  sourceUnboundAction: string;
  /**
   * P1 결함①a (사용성 전수 검수 2026-07-23) — 일반(비개발) 모드에서 element
   * 행이 트리에서 빠졌다는 사실을 설명하는 조용한 한 줄 힌트. `plainMode`
   * 와 함께 있을 때만 렌더 — 생략하면 힌트 자체가 없다(하위호환).
   */
  plainHint?: string;
}

export interface TopologyIndexPanelProps {
  treeResult: OntologyTreeBuildResult;
  totalConcepts: number;
  totalRelations: number;
  domainCount: number;
  changedSlugs: ReadonlySet<string>;
  selectedId: string | null;
  onSelect: (nodeId: string) => void;
  onCollapse: () => void;
  /**
   * 2026-07-24 온보딩 라운드 — 첫 실행 카드의 "2분 구경하기" CTA. 투어
   * 상태기계는 HomePage(view)가 소유하므로(FSD) 콜백만 내려보낸다. 생략
   * 시 카드가 CTA 를 렌더하지 않는다.
   */
  onStartTour?: () => void;
  /** 2026-07-24 온보딩 라운드 — 첫 실행 카드의 '쉬운 말로 보기' 1클릭 토글.
   *  audiencePlain 상태는 HomePage 소유(`plainMode` prop 과 같은 출처). */
  onEnablePlainMode?: () => void;
  labels: TopologyIndexPanelLabels;
  className?: string;
  /**
   * P4a — "최근 변경" 렌즈(mtime 7일 창, `useRecentChanges`). 생략하면 세그먼트
   * 컨트롤 자체를 렌더하지 않는다(기존 검색-only 동작 그대로). 활성화하면
   * `filterTreeByNodeIds` 로 트리를 이 id 집합 + 조상 경로만으로 좁힌다 —
   * `filterTreeByQuery` 와 같은 "부모 chain 보존" 필터 메커니즘 재사용.
   */
  recentChanges?: {
    ids: ReadonlySet<string>;
    /** P4b — fresh heartbeat 의 focus 와 일치하는 노드(있다면) 하나. */
    agentAttributedNodeId: string | null;
  } | null;
  /** P4c — vault 에 있지만 아직 kind 없는(=지도에 없는) 문서 수. */
  uncatalogedDocCount?: number;
  /** ④ 살아있는 지도 드리프트 — 먼지 앉은(dusty) 노드 수. 0 이면 행 숨김. */
  dustyNodeCount?: number;
  /** 코드 폴더가 하나도 안 묶인 프로젝트의 노드 id. null 이면 행 자체가 없다. */
  unboundProjectNodeId?: string | null;
  /** P4c — 위 행 클릭 → "내 문서로 지도 만들기" 다이얼로그(`bootstrapOpen`). */
  onPromoteUncatalogedDocs?: (() => void) | null;
  /**
   * Guardian I-1 — 도메인 크기 단일 진실원(그래프 BFS, `computeDomainCensusRows`)
   * 조회 맵. 있으면 도메인 행 카운트/미터가 이 값을 쓴다 — /projects·인사이트와
   * 같은 숫자. 생략하면 종전 트리 워크 유지.
   */
  domainCensus?: ReadonlyMap<string, DomainCensusRow> | null;
  /**
   * 스포트라이트 단일 진실원 (협의회 §⑤, 2026-07-23) — 제공되면 렌즈가
   * **controlled** 가 된다: URL `?recent=` 하나가 지도 침강과 이 렌즈를 동시
   * 구동해 두 표면의 창 불일치가 구조적으로 불가능해진다. 생략 시 기존 로컬
   * state 그대로(하위호환 — 다른 호출부/테스트 무영향).
   */
  lens?: IndexLens;
  onLensChange?: (lens: IndexLens) => void;
  /** 스포트라이트 창 — "auto"(적응 사다리) 또는 1/7/30 프리셋. 칩 활성 표시용. */
  recentWindow?: "auto" | 1 | 7 | 30;
  /** 프리셋 칩 클릭 → 창 전환(즉시 적용 — 팝업/확인 금지 계약). */
  onWindowChange?: (window: "auto" | 1 | 7 | 30) => void;
  /**
   * P1 결함①a — 일반(비개발) 모드 표시 게이트. `treeResult` 자체에서 element
   * 행을 빼는 건 호출자(HomePage, `filterTreeExcludeKind`)의 일 — 이 플래그는
   * "왜 안 보이는지"를 설명하는 힌트 행 렌더 여부만 결정한다(데이터 무변경).
   */
  plainMode?: boolean;
  /**
   * 오버뷰 좌측 레일 attention winner 단일화 (2026-07-24) — vault 미연결
   * (정적 샘플) 상태에서 "먼지 앉은 노드 N" 행은 노출하지 않는다.
   * 이 표면은 *현재 로드된 그래프*를 서술한다 — 샘플 모드에선
   * 그 그래프가 사용자의 프로젝트가 아니라 이 제품 자신의 dogfood
   * vault라서 방치 카운트는 첫 방문자에게 남의 저장소 얘기라 잡음이다
   * (`BlockImportModule`의 "vault 없인 기능 자체가
   * 작동 안 함" 케이스와는 다른 문제 — 그쪽은 P1 결함②에 따라 여전히
   * disabled+힌트로 존치, 완전 은폐 금지). 생략 시 기존 하위호환 동작
   * (항상 노출)을 유지 — 실 vault 연결(`vaultLoaded=true`)이면 두 행이
   * 그대로 다시 나타난다(값 삭제가 아니라 강등).
   */
  vaultLoaded?: boolean;
}

/**
 * INDEX — the left machined instrument that replaces the tree/ego `/ontology`
 * page (B3 허브가 곧 지도). Floats over the topology map, `--topology-index-*`
 * width/inset tokens (`app/globals.css`). See
 * `docs/prototypes/index-panel-v2-full.html` (v2.1) for the approved visual
 * spec and `TopologyIndexTab` for the collapsed counterpart.
 *
 * header 는 "INDEX · N"(N=노드 총수) + 접기 정사각 버튼만 둔다.
 * 트리 행 자체의 grid/캐럿/미터 스타일은 `TopologyIndexTreeRow` 가 소유한다.
 *
 * Search reuses `filterTreeByQuery` (`@/shared/lib/ontology-tree`) — the
 * SAME pure filter the old `/ontology` tree used — instead of a bespoke
 * matcher, so "search narrows the tree, keeping ancestor chains" behavior
 * can't drift between surfaces.
 */
export function TopologyIndexPanel({
  treeResult,
  totalConcepts,
  totalRelations,
  domainCount,
  changedSlugs,
  selectedId,
  onSelect,
  onCollapse,
  labels,
  className,
  recentChanges = null,
  uncatalogedDocCount,
  dustyNodeCount,
  unboundProjectNodeId = null,
  onPromoteUncatalogedDocs = null,
  onStartTour,
  onEnablePlainMode,
  domainCensus = null,
  lens: lensProp,
  onLensChange,
  recentWindow = "auto",
  onWindowChange,
  plainMode = false,
  vaultLoaded = true,
}: TopologyIndexPanelProps) {
  /*
   * 최근 변경 창(window) 칩 — **행동만** 훅으로 받는다(2026-08-15 (8)).
   *
   * 그릇은 자리에 남는다: 이 칩들의 치수(24 · 11px · 7px · 48px 균일)는
   * 소유자가 두 번 고쳐 확정한 것이고(2026-08-02 *"버튼이 너무 작고"* → 고친 뒤
   * *"비율이나 그런게 맞아야하는데"*), 패널 스코프 잉크(`--topology-v2-panel-*`)와
   * 크롬 반경을 진다 — 값 층 조합에 없는 것들이라 프리미티브로 끌어당기면 그
   * 이력을 깬다. 반면 **화살표 이동이 없던 것은 그 이력과 무관한 결함**이었다.
   */
  const WINDOW_CHIP_VALUES = ["auto", 1, 7, 30] as const;
  const WINDOW_CHIP_LABELS = [
    labels.windowChipAuto,
    labels.windowChip1,
    labels.windowChip7,
    labels.windowChip30,
  ];
  const windowGroup = useRovingRadioGroup<(typeof WINDOW_CHIP_VALUES)[number]>({
    value: recentWindow as (typeof WINDOW_CHIP_VALUES)[number],
    values: WINDOW_CHIP_VALUES,
    onChange: (next) => onWindowChange?.(next),
  });

  const [query, setQuery] = useState("");
  const rootIds = useMemo(
    () => treeResult.roots.map((root) => root.node.id),
    [treeResult.roots],
  );
  const rootIdsKey = rootIds.join("\u0000");
  const [treeOpenState, setTreeOpenState] = useState(() => ({
    rootIdsKey,
    knownRootIds: new Set(rootIds),
    openIds: new Set(rootIds),
  }));
  if (treeOpenState.rootIdsKey !== rootIdsKey) {
    const nextOpenIds = new Set(treeOpenState.openIds);
    for (const id of rootIds) {
      if (!treeOpenState.knownRootIds.has(id)) nextOpenIds.add(id);
    }
    setTreeOpenState({
      rootIdsKey,
      knownRootIds: new Set(rootIds),
      openIds: nextOpenIds,
    });
  }
  const openIds = treeOpenState.openIds;
  // P4a — "최근 변경" 렌즈. 검색이 활성이면 검색이 우선한다(둘을 동시에 좁히면
  // "왜 안 보이지"가 두 원인으로 갈라져 헷갈린다) — 렌즈는 검색이 비어 있을
  // 때만 트리를 좁힌다.
  // 스포트라이트 (협의회 §⑤) — lensProp 제공 시 controlled(단일 진실원 =
  // URL `?recent=`), 아니면 종전 로컬 state.
  const [lensLocal, setLensLocal] = useState<IndexLens>("all");
  const lens = lensProp ?? lensLocal;
  const setLens = (next: IndexLens) => {
    if (onLensChange) onLensChange(next);
    else setLensLocal(next);
  };
  const trimmedQuery = query.trim();
  const isFiltering = trimmedQuery.length > 0;
  const lensActive = !isFiltering && lens === "recent" && recentChanges !== null;
  const visibleRoots = useMemo(() => {
    if (isFiltering) return filterTreeByQuery(treeResult.roots, trimmedQuery);
    if (lensActive && recentChanges) return filterTreeByNodeIds(treeResult.roots, recentChanges.ids);
    return treeResult.roots;
  }, [treeResult.roots, isFiltering, trimmedQuery, lensActive, recentChanges]);
  const maxDomainDescendantCount = useMemo(() => {
    // 미터 분모도 같은 진실원에서 — census 가 있으면 BFS total 의 최댓값.
    if (domainCensus && domainCensus.size > 0) {
      let max = 0;
      for (const row of domainCensus.values()) {
        if (row.total > max) max = row.total;
      }
      return max;
    }
    const domains = treeResult.roots.flatMap((root) =>
      root.children.filter((child) => child.node.kind === "domain"),
    );
    return computeMaxDomainDescendantCount(domains);
  }, [treeResult.roots, domainCensus]);

  const toggleOpen = (nodeId: string) => {
    setTreeOpenState((current) => {
      const next = new Set(current.openIds);
      if (next.has(nodeId)) next.delete(nodeId);
      else next.add(nodeId);
      return { ...current, openIds: next };
    });
  };
  // 검색과 마찬가지로 렌즈 활성 시에도 자동 펼침 — 좁혀진 조상 경로를 사용자가
  // 일일이 캐럿으로 열지 않게 한다(filterTreeByQuery 의 "auto-reveal matches"
  // 와 같은 UX 계약, filterTreeByNodeIds 결과에도 그대로 적용).
  const isOpen = (nodeId: string) => isFiltering || lensActive || openIds.has(nodeId);

  // H3 P0 — 로빙 tabindex. 화면에 실제로 보이는 행들을 위→아래 순서로 펴고
  // (검색/렌즈의 자동 펼침을 그대로 반영하는 `isOpen` 사용), 그 중 단 하나만
  // Tab 진입점(tabIndex=0)으로 둔다. 형제 이동은 아래 nav 의 Arrow 핸들러.
  const treeRef = useRef<HTMLElement>(null);
  const [activeRowId, setActiveRowId] = useState<string | null>(null);
  const orderedRowIds = useMemo(
    () => flattenVisibleRowIds(visibleRoots, isOpen),
    // isOpen 은 openIds/isFiltering/lensActive 의 클로저 — 그 원천을 deps 로 건다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [visibleRoots, openIds, isFiltering, lensActive],
  );
  const resolvedActiveRowId = resolveActiveRowId(orderedRowIds, activeRowId, selectedId);

  const focusRow = (nodeId: string) => {
    // tabIndex=-1 행도 프로그램적 focus() 는 먹는다. 다음 렌더에서 이 행이
    // tabIndex=0 으로 승격되며 로빙 진입점도 함께 이동한다.
    const rows = treeRef.current?.querySelectorAll<HTMLElement>("[data-index-row]");
    rows?.forEach((el) => {
      if (el.dataset.indexRow === nodeId) el.focus();
    });
  };

  const handleTreeKeyDown = (event: ReactKeyboardEvent<HTMLElement>) => {
    const key = event.key;
    if (key !== "ArrowDown" && key !== "ArrowUp" && key !== "Home" && key !== "End") return;
    event.preventDefault();
    const nextId = nextRovingId(orderedRowIds, resolvedActiveRowId, key as RovingNavKey);
    if (nextId === null) return;
    setActiveRowId(nextId);
    focusRow(nextId);
  };

  // 포커스가 어느 행에 실제로 들어오든(클릭·Tab·Arrow) 활성 행을 그에
  // 맞춘다 — 로빙 진입점이 "마지막으로 포커스한 행" 과 항상 일치하게.
  const handleTreeFocus = (event: ReactFocusEvent<HTMLElement>) => {
    const rowEl = (event.target as HTMLElement).closest?.("[data-index-row]") as HTMLElement | null;
    const id = rowEl?.dataset.indexRow;
    if (id && id !== activeRowId) setActiveRowId(id);
  };

  return (
    <aside
      aria-label={labels.label}
      data-testid="topology-index-panel"
      className={`flex h-full flex-col rounded-[var(--topology-v2-panel-radius)] border border-[color:var(--topology-v2-panel-border)] bg-[color:var(--topology-v2-panel-surface)] p-3 shadow-[var(--topology-v2-panel-shadow)] ${className ?? ""}`}
      style={{ width: "var(--topology-index-width)" }}
    >
      {/* "시작하기" 모듈 (root-first-open v3, `first-run-v3-flagship.html`).
          2026-07-24 구조 개편(소유자 지적 "상단 스크롤 따로 하단 스크롤
          따로") — 카드와 INDEX 를 **배타적 두 상태**로 분리한다. 가이드가
          펼쳐져 있으면 카드가 패널 전체를 차지하고(스크롤 1개), 사용자가
          선택하면 접히면서 INDEX(children)가 열린다. 모듈이 children 을
          받아 어느 쪽을 그릴지 결정 — 위젯은 INDEX 본문만 넘긴다. */}
      <FirstRunStarterModule
        concepts={totalConcepts}
        /*
         * 위쪽 `lensActive` 변수가 아니라 **렌즈 상태 자체**를 넘긴다. 그 변수는
         * `!isFiltering && recentChanges !== null` 까지 요구하는 «트리를 실제로
         * 좁힐 수 있나»의 판정인데, 여기서 필요한 것은 «사용자가 렌즈를 눌렀나»
         * 다 — 강조가 0개여도 카드는 접히고 INDEX 가 열려야, 누른 사람이
         * 「아무 일도 안 일어났다」로 읽지 않는다.
         */
        lensActive={lens === "recent"}
        /* 노드를 하나라도 고르면 안내 카드는 할 일을 마쳤다 —
           `FirstRunStarterModule` 의 `nodeSelected` 독블록. */
        nodeSelected={selectedId !== null}
        relations={totalRelations}
        domains={domainCount}
        onStartTour={onStartTour}
        onEnablePlainMode={onEnablePlainMode}
        audiencePlain={plainMode}
      >
      {/* 헤더 — 라벨 + 실측 총수 + 접기만.

          헤더 행 전체가 접기 토글이다 (소유자 피드백 — 셰브론만 히트 영역이라
          불편했다). INDEX 트리 행과 같은 hover 문법
          (`--topology-v2-panel-row-hover` 배경, `transition-colors`) 을 그대로
          재사용해 "이것도 클릭 가능한 행이다" 를 같은 언어로 말한다. 셰브론은
          더 이상 별도 버튼이 아니라 상태 표시자(`aria-hidden`)로만 남는다 —
          중첩 인터랙티브 엘리먼트를 피하기 위해 바깥 `<button>` 하나로 접는다. */}
      <button
        type="button"
        onClick={onCollapse}
        aria-expanded={true}
        aria-label={labels.foldAria}
        title={labels.fold}
        data-testid="topology-index-fold"
        className={controlClass({ shape: "row", className: "group mb-3 gap-1.5 rounded-[var(--chrome-radius-inner)] px-0.5 hover:bg-[color:var(--topology-v2-panel-row-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-indigo-focus-ring)] focus-visible:ring-inset" })}
      >
        <span className="font-mono text-caption uppercase tracking-[var(--tracking-caps-16)] text-[color:var(--topology-v2-panel-text-tertiary)]">
          {labels.label}
        </span>
        {/* 수렴 판정 ①: 시각 카운트 "· N" 삭제 — 지형도 HUD 가 이미 라벨과
            함께 총수를 상시 노출해 3중 중복이었다 (sr-only census 는 존치).
            판정 ②/③: 셰브론은 보더 박스가 아니라 quiet glyph — 히트영역은
            행 전체(소유자 피드백 보존), 방향은 접힘 결과와 일치하는 ‹. */}
        <span
          aria-hidden="true"
          className="ml-auto inline-flex size-[26px] shrink-0 items-center justify-center text-[color:var(--topology-v2-panel-text-quaternary)] transition-colors group-hover:text-[color:var(--topology-v2-panel-text-secondary)]"
        >
          <ChevronLeft size={ICON_SIZE.sm} aria-hidden="true" />
        </span>
      </button>
      <p data-testid="topology-index-census" className="sr-only">
        {totalConcepts} {labels.censusConcepts} · {totalRelations} {labels.censusRelations} ·{" "}
        {domainCount} {labels.censusDomains}
      </p>

      <div className="relative mb-3 shrink-0">
        <Search
          size={ICON_SIZE.sm}
          aria-hidden
          className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-[color:var(--topology-v2-panel-text-quaternary)]"
        />
        <input
          type="text"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            // M-10 — Escape in the INDEX search is a search-scoped clear (the
            // macOS workbench convention), NOT a canvas deselect. When there
            // IS a query, rung 1 clears it + blurs and stops the keypress so
            // the window-level topology Esc ladder doesn't ALSO deselect the
            // node underneath on the same press. An empty field lets Escape
            // bubble through to that ladder unchanged.
            if (event.key === "Escape" && query.length > 0) {
              event.preventDefault();
              event.stopPropagation();
              setQuery("");
              event.currentTarget.blur();
            }
          }}
          placeholder={labels.searchPlaceholder}
          autoComplete="off"
          data-testid="topology-index-search"
          className={fieldClass({ size: "md", className: "w-full pl-7" })}
        />
      </div>

      {/* P4a — "전체 | 최근 변경 N" 렌즈 세그먼트. `recentChanges` 를 안 받으면
          (mode 가 아직 못 계산했거나 호출자가 생략) 렌더 자체를 skip —
          기존 검색-only 동작 그대로 유지된다. */}
      {recentChanges ? (
        <div
          role="tablist"
          aria-label={labels.segmentRecentAria}
          className="mb-3 grid shrink-0 grid-cols-2 gap-1 rounded-[var(--chrome-radius-inner)] border border-[color:var(--topology-v2-panel-border)] bg-[color:var(--color-overlay-1)] p-1"
        >
          <button
            type="button"
            role="tab"
            aria-selected={!lensActive}
            data-testid="topology-index-segment-all"
            onClick={() => setLens("all")}
            className={controlClass({
              shape: "segment",
              scope: "panel",
              active: !lensActive,
              className: "min-w-0 hover:text-[color:var(--topology-v2-panel-text-primary)]",
            })}
          >
            {labels.segmentAll}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={lensActive}
            data-testid="topology-index-segment-recent"
            onClick={() => setLens("recent")}
            className={controlClass({
              shape: "segment",
              scope: "panel",
              truncate: true,
              active: lensActive,
              className: "min-w-0 hover:text-[color:var(--topology-v2-panel-text-primary)]",
            })}
          >
            {labels.segmentRecent}
          </button>
        </div>
      ) : null}

      {/* 스포트라이트 창 프리셋 (협의회 §② — 팝업/확인 금지, 클릭=즉시 적용).
          렌즈 활성 + controlled + 라벨 4종 제공 시에만. "auto"=적응 사다리. */}
      {lensActive && onWindowChange && labels.windowChipAuto && labels.windowChip1 && labels.windowChip7 && labels.windowChip30 ? (
        <div
          {...windowGroup.groupProps}
          aria-label={labels.windowChipsAria ?? labels.segmentRecentAria}
          data-testid="topology-index-window-chips"
          /*
           * 기간 칩이 **무엇을 고르는 줄인지 말한다** (2026-08-02, 소유자:
           * *"버튼이 너무 작고 존재하는지도 잘 모르겠는데.. 여기서도 가이드가
           * 있어야하려나?"*).
           *
           * 종전엔 라벨 없이 칩 넷만 떠 있어서, 「자동/1일/7일/30일」이 무엇에
           * 걸리는 값인지 화면 어디에도 없었다. 앞에 한 단어를 세운다 — 새 문구가
           * 아니라 이미 있는 「최근」 계열 라벨을 쓴다.
           */
          /*
           * 보이는 라벨은 **두지 않는다** (2026-08-02, 소유자 확정 — 두 번
           * 시도하고 뺐다).
           *
           * ① 칩과 같은 줄: 첫 칩이 27px 밀려 패널 왼쪽 정렬선(검색창·세그먼트
           *    = 101px)에서 혼자 벗어났다 — 소유자가 그 어긋남을 먼저 짚었다.
           * ② 칩 위 한 줄: 정렬은 되찾았지만 글자 하나가 한 줄을 통째로 쓰고,
           *    이 패널은 이미 행이 많다.
           *
           * 라벨을 넣으려던 이유는 「존재하는지도 모르겠다」였는데, 그 원인은
           * 이름이 없어서가 아니라 **치수**였다(높이 20px · 글자 9.5px). 그건
           * 아래에서 고쳤다. 스크린리더에는 `aria-label` 이 이미 「최근 변경 창
           * 선택」을 말한다 — 접근성은 잃지 않는다.
           */
          className="mb-3 flex shrink-0 flex-wrap items-center gap-1.5"
        >
          {WINDOW_CHIP_VALUES.map((value, index) => (
            <button
              key={String(value)}
              {...windowGroup.itemProps(index)}
              type="button"
              data-testid={`topology-index-window-chip-${value}`}
              /*
               * 치수는 **같은 패널의 세그먼트와 한 방언**으로 간다
               * (2026-08-02 실측 · 소유자: *"버튼이 너무 작고"* → 고친 뒤
               * *"근데 좀 안예쁜데? 비율이나 그런게 맞아야하는데"*).
               *
               * | | 종전 | 1차 수정 | 지금 |
               * |---|---|---|---|
               * | 높이 | 20px | 28px | **24px** |
               * | 글자 | 9.5px | 12.5px | **11px** |
               * | 모서리 | 완전 원형 | 완전 원형 | **7px** |
               * | 폭 | 글자 수 (편차 9.9px) | 글자 수 | **48px 균일** |
               *
               * 두 번 고친 이유: 1차는 **크기만** 봤다. 실측해 보니 진짜 결함이
               * 둘 더 있었다 — ① 폭이 글자 수로 정해져 편차 9.9px(이 저장소가
               * 「치수 규칙성」으로 금지한 그 패턴: *반복 세트에서 높이·폭이
               * 내용물의 부산물이 되면 격자의 리듬이 아무도 고르지 않은 채
               * 무너진다*) ② 모서리가 완전 원형인데 **바로 위 세그먼트 탭은
               * 7px** — 한 패널 안에 두 방언.
               *
               * 그래서 값을 새로 정하지 않고 **위 세그먼트에서 가져온다**
               * (24px · 11px · 7px). 9.5px 이 문제였던 것이지 11px 이 문제였던
               * 게 아니다 — 「누르는 글자는 12.5px」 규칙은 설정 시트 스코프이고,
               * 여기서는 같은 패널의 한 방언이 이긴다.
               *
               * 터치에서는 `--touch-target-min`(44px)까지 세운다.
               */
              className={`inline-flex h-6 min-w-12 items-center justify-center rounded-[var(--chrome-radius-inner)] border text-label transition-colors [@media(pointer:coarse)]:h-[var(--touch-target-min)] ${
                recentWindow === value
                  ? "border-[color:var(--color-indigo-a46)] bg-[color:var(--color-indigo-a16)] text-[color:var(--topology-v2-panel-text-primary)]"
                  : "border-[color:var(--topology-v2-panel-border)] text-[color:var(--topology-v2-panel-text-tertiary)] hover:text-[color:var(--topology-v2-panel-text-primary)]"
              }`}
            >
              {WINDOW_CHIP_LABELS[index]}
            </button>
          ))}
        </div>
      ) : null}

      {/* P1 결함①a — 일반(비개발) 모드에서 element 행이 빠져 있는 이유를
          설명하는 조용한 한 줄. 트리 위, 렌즈/프리셋 칩 아래. */}
      {plainMode && labels.plainHint ? (
        <p
          data-testid="topology-index-plain-hint"
          className="mb-2 shrink-0 text-label text-[color:var(--topology-v2-panel-text-quaternary)]"
        >
          {labels.plainHint}
        </p>
      ) : null}

      <nav
        ref={treeRef}
        role="tree"
        aria-label={labels.label}
        data-testid="topology-index-tree"
        onKeyDown={handleTreeKeyDown}
        onFocusCapture={handleTreeFocus}
        // min-h 24 (소유자 실보고 2026-07-24) — 낮은 창에서 첫 실행 카드가
        // 유연 축소로 전환된 뒤에도 트리가 0px 로 짜부라지지 않게 최소
        // 높이를 계약한다(카드가 대신 더 줄어들어 내부 스크롤).
        className="min-h-24 flex-1 space-y-px overflow-y-auto"
        // 패널1-3② — 스크롤 리스트 하단에서 마지막 행이 컨테이너 경계에
        // 중간 높이로 하드 클립돼 "잘린 행"이 결함처럼 읽혔다. 하단 12px
        // 마스크 페이드로 부드럽게 감춰 "더 있음"을 암시한다(상단은 crisp —
        // 첫 행은 자르지 않는다). transform/색 아닌 mask 라 헌장 무저촉.
        style={{
          maskImage: "linear-gradient(to bottom, #000 calc(100% - 12px), transparent)",
          WebkitMaskImage: "linear-gradient(to bottom, #000 calc(100% - 12px), transparent)",
        }}
      >
        {visibleRoots.length === 0 ? (
          <p className="px-1 py-2 text-label text-[color:var(--topology-v2-panel-text-quaternary)]">
            {lensActive ? labels.recentEmptyHint : labels.emptyHint}
          </p>
        ) : (
          visibleRoots.map((root) => (
            <TopologyIndexTreeRow
              key={root.node.id}
              entry={root}
              depth={0}
              isOpen={isOpen}
              onToggleOpen={toggleOpen}
              onSelect={onSelect}
              selectedId={selectedId}
              activeRowId={resolvedActiveRowId}
              changedSlugs={changedSlugs}
              agentAttributedNodeId={recentChanges?.agentAttributedNodeId ?? null}
              maxDomainDescendantCount={maxDomainDescendantCount}
              domainCensus={domainCensus}
              labels={labels}
            />
          ))
        )}
      </nav>

      {/* P4c — "지도에 없는 문서 N개" 조용한 행. `bootstrapPlan.elements.length`
          (HomePage, `deriveBootstrapPlan` — 이미 kind 있는 문서는 제외된
          카운트) 를 그대로 받는다 — 새 파생 없음. 0 이거나 승격 핸들러가
          없으면 행 자체를 숨긴다. */}
      {vaultLoaded && uncatalogedDocCount && uncatalogedDocCount > 0 && onPromoteUncatalogedDocs ? (
        <button
          type="button"
          onClick={onPromoteUncatalogedDocs}
          data-testid="topology-index-uncataloged-docs"
          className={controlClass({
            shape: "card",
            size: "sm",
            className:
              "mt-2 shrink-0 text-left border-[color:var(--topology-v2-panel-border)] hover:bg-[color:var(--topology-v2-panel-row-hover)]",
          })}
        >
          <span className="min-w-0 flex-1 truncate text-[color:var(--topology-v2-panel-text-tertiary)]">
            {labels.uncatalogedDocsLabel}
          </span>
          <span className="shrink-0 text-[color:var(--color-indigo-accent)]">
            {labels.uncatalogedDocsAction}
          </span>
        </button>
      ) : null}

      {/* ④ 살아있는 지도 드리프트 — "먼지 앉은 노드 N" 조용한 행. dusty
          판정(HomePage `deriveDustySlugs`, vault mtime 중앙값+30일 이중
          조건)의 카운트만 받는다. 0 이면 행 자체가 없다(성공 배지 금지).
          중립 톤만 — 방치는 경고가 아니라 지도의 상태다.
          목적지는 할 일 탭 (페르소나 재조사 2026-07-23 최대 마찰 항목) —
          신선도 탭은 도메인 단위 최신성 히트스트립이라 "51개가 오래 방치"
          라는 약속과 정반대 그림("오늘 다 갱신")으로 읽혔다. 실제 오래된
          노드 목록("오래 안 바뀐 허브" + 오늘의 손질)은 할 일 탭이 답한다. */}
      {vaultLoaded && dustyNodeCount && dustyNodeCount > 0 ? (
        <Link
          href="/ontology/insights?tab=do-next"
          data-testid="topology-index-dusty-nodes"
          className={controlClass({ shape: "chip", size: "md", className: "mt-2 shrink-0 gap-2 rounded-[var(--chrome-radius-inner)] border-[color:var(--topology-v2-panel-border)] text-left hover:bg-[color:var(--topology-v2-panel-row-hover)]" })}
        >
          <span className="min-w-0 flex-1 truncate text-[color:var(--topology-v2-panel-text-tertiary)]">
            {labels.dustyNodesLabel}
          </span>
          <span className="shrink-0 text-[color:var(--color-indigo-accent)]">
            {labels.dustyNodesAction}
          </span>
        </Link>
      ) : null}

      {/* ⑤ 코드 폴더 미연결 — 위 두 행과 **같은 모양·같은 무게**다. 새 시각
          형태를 만들지 않는다: 사실 한 줄 + 인디고 행동어 하나, 조건이 참일
          때만. 여기서 폴더 선택기를 열지 않는 이유는 처방이 한 곳에만 있어야
          하기 때문이다 — 이 행은 진단을 눈에 보이게 하고, 처방은 열린
          프로젝트 패널이 준다(웹에서도 그 자리가 왜·어디서·여기서 되는 것을
          말한다). 그래서 이 행은 어느 표면에서도 죽은 CTA 가 아니다. */}
      {vaultLoaded && unboundProjectNodeId ? (
        <button
          type="button"
          onClick={() => onSelect(unboundProjectNodeId)}
          data-testid="topology-index-source-unbound"
          className={controlClass({
            shape: "card",
            size: "sm",
            className:
              "mt-2 shrink-0 text-left border-[color:var(--topology-v2-panel-border)] hover:bg-[color:var(--topology-v2-panel-row-hover)]",
          })}
        >
          <span className="min-w-0 flex-1 truncate text-[color:var(--topology-v2-panel-text-tertiary)]">
            {labels.sourceUnboundLabel}
          </span>
          <span className="shrink-0 text-[color:var(--color-indigo-accent)]">
            {labels.sourceUnboundAction}
          </span>
        </button>
      ) : null}

      {/* 「다른 폴더에서 노드 가져오기」는 **설정 → 작업 공간**으로 옮겼다
          (2026-08-02, 소유자: *"이건 뭐임? 이 문구가 왜 있는거지..? 필요없는건가"*).

          기능 자체는 로컬-퍼스트 제품에 맞다 — 다른 볼트의 `.md` 를 골라 병합
          미리보기를 열고, 승인 전에는 폴더에 아무것도 안 쓴다. 자리가 틀렸다:
          **평생 한두 번 쓸 일**이 지도를 읽을 때마다 INDEX 바닥에 상시 버튼으로
          서 있었다. 「블록」이라는 말도 이 앱 어디에도 정의가 없어서, 처음 보는
          사람에게는 무엇을 여는 버튼인지 알 길이 없었다. */}

      </FirstRunStarterModule>
    </aside>
  );
}
