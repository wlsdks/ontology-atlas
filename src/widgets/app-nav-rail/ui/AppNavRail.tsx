"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import type {
  ComponentType,
  MouseEvent as ReactMouseEvent,
  ReactNode,
} from "react";
import { Link, usePathname } from "@/i18n/navigation";
import { useTranslations } from "next-intl";
import {
  Activity,
  BarChart3,
  Download,
  BookOpen,
  FolderKanban,
  Gem,
  // `History as HistoryIcon` — bare `History` 는 특정 HMR/번들 상태에서 전역
  // DOM History 생성자로 해석돼 "Illegal constructor" 로 화면을 추락시킨다
  // (AtlasGitPanel 이 같은 사고를 겪었다). 전역과 충돌 없는 별칭으로 고정.
  History as HistoryIcon,
  Map as MapIcon,
  Wand2,
} from "lucide-react";
import { DESTINATION_HREF } from "@/shared/config/destinations";
import { ICON_SIZE } from "@/shared/ui/icon-size";
import { useLocalVault } from "@/features/docs-vault-local";
import { formatActivityAge } from "@/features/vault-ontology";
import { cn } from "@/shared/lib/cn";
import { signalNavigationIntent } from "@/shared/lib/navigation-intent";
import { BrandMark } from "@/shared/ui";
import {
  buildRouteFocusHref,
  rememberRouteFocusIntent,
} from "@/shared/ui/route-focus-manager";
import { resolveActiveNavRailItem, type AppNavRailItemId } from "../lib/resolve-active-item";
import { shouldShowGetAppTile } from "@/shared/lib/show-get-app-tile";
import { isTauriVaultRuntime } from "@/shared/lib/tauri-vault-fs";

/** 런타임은 로드 뒤 바뀌지 않는다 — 구독은 형식상 필요할 뿐이라 no-op 이다. */
const subscribeToRuntime = () => () => {};
/** 서버(프리렌더)에서는 창이 없어 **모른다**. `false`(=웹)로 단정하지 않는다. */
const getServerRuntimeSnapshot = (): boolean | null => null;
import type { NavRailContextHrefs } from "../model/shell-slot-context";
import { controlClass } from '@/shared/ui/control-class';

export interface AppNavRailProps {
  /** 설정 트리거(`AppSettingsMenu` rail-tile 등) — 레일 하단에 꽂는 슬롯.
   *  persistent shell의 `AppShell`이 기본 트리거를 공급하고, 페이지가
   *  `useNavRailShellValue()`를 통해 특별한 슬롯을 등록한 경우에만
   *  덮어쓴다. */
  settingsSlot?: ReactNode;
  /** true 면 레일을 언마운트하지 않고 CSS 로만 숨긴다(몰입 표면 fullscreen).
   *  레일이 layout 에 상주해 DOM identity 를 유지하는 게 perf/persistent-shell
   *  승격의 핵심이라 조건부 렌더링 대신 이 prop 을 쓴다. */
  hidden?: boolean;
  /** 과제 ⑪ — 레일 항목 href 를 "지금 보던 것" 기준으로 바꿔 끼는 컨텍스트
   *  오버라이드(현재는 문서함만). 지정된 키만 기본 href 를 대체하고, 나머지
   *  항목/키 미지정 시 기존 정적 href 그대로 — `AppShell`이
   *  `useNavRailShellValue()`로 읽은 값을 그대로 넘긴다. */
  contextHrefs?: NavRailContextHrefs | null;
  /**
   * 발자취 목적지의 미커밋 변경 수 — 화면 밖 ambient 신호. `AppShell` 이
   * `useAtlasGitContext()` 로 읽어 넘긴다(위젯이 feature 를 직접 import 하지
   * 않게). `0` 이면 뱃지가 소멸한다.
   */
  gitDirtyCount?: number;
  /** 하단 에이전트 타일 클릭 핸들러 — `connected` 는 레일이 자신의 heartbeat
   *  상태로 판정해 넘긴다(P4-② 분기). `AppShell` 이 연결됨→인사이트 이동,
   *  미연결→연결 시트 열기(전역 launcher)로 라우팅한다. 미지정 시 타일은
   *  표시 전용으로 남는다(레일이 다른 컨텍스트에서 마운트되는 경우 대비). */
  onAgentTileActivate?: ((connected: boolean) => void) | null;
  /** 연결 시트가 현재 열려 있는지 — 타일의 `aria-expanded` 진실원(전역
   *  launcher `wantOpen`). */
  agentConnectOpen?: boolean;
  className?: string;
}

interface RailDestination {
  id: AppNavRailItemId;
  href: string;
  label: string;
  Icon: ComponentType<{ size?: number; className?: string; "aria-hidden"?: boolean }>;
  /**
   * 우상단 카운트 뱃지(미커밋 변경 수). `0`/`undefined` 면 **소멸** — 회색화가
   * 아니다. 화면 밖 ambient 신호라 attention 계층에 들어가지 않는다.
   */
  badgeCount?: number;
}

function rememberRailRouteFocus(
  event: ReactMouseEvent<HTMLAnchorElement>,
  pathname: string,
) {
  if (
    event.defaultPrevented ||
    event.button !== 0 ||
    event.metaKey ||
    event.ctrlKey ||
    event.shiftKey ||
    event.altKey
  ) {
    return;
  }
  // 이동이 «성사될» 클릭임이 확정된 자리다(위 가드가 새 탭·수식키·취소를
  // 전부 걸러 냈다). 지도처럼 상시 루프를 가진 표면이 프레임 예산을 비켜
  // 주도록 신호를 흘린다 — 실측 근거는 `shared/lib/navigation-intent.ts`.
  signalNavigationIntent();
  rememberRouteFocusIntent(pathname);
}

/**
 * 좌측 64px 내비 레일 (feat/chrome-system, `docs/prototypes/chrome-rail-combined.html`
 * 소유자 최종 승인) — 전역 목적지(지도·문서함·공방·인사이트·프로젝트·발자취) +
 * 하단 에이전트 상태·설정을 전담하는 상시 chrome. #375 는 지형도(HomePage)만
 * 마운트했고, feat/rail-rollout (#377) 이 지형도 외 전 페이지(문서함·공방·
 * 인사이트·프로젝트 목록/상세/편집·다운로드)로 확장해 3-체계(OperationsNav
 * 상단 탭 + BottomTabBar + 이 레일) 내비를 1-체계로 통합했다 — 구 상단 탭
 * (`OperationsNav`)·서브탭(`OntologySubNav`)은 은퇴.
 *
 * book/network 유틸 타일과 우측 레일의 설정 기어가 여기로 흡수됐다
 * (HeroCollapsed 는 필만 남고, 우측 세로 레일은 지도 전용 3타일만). 폭이
 * 좁아(`--app-nav-rail-width`) 설정 시트 본체는 portal로 열고,
 * `LiveActivityIndicator` 같은 상세 상태는 필요한 페이지의 contextual
 * header에 둔다.
 *
 * 표시 breakpoint 는 `lg` (≥1024px) — 그 아래는 `BottomTabBar` 가 담당한다.
 */
export function AppNavRail({
  settingsSlot,
  hidden,
  contextHrefs,
  gitDirtyCount = 0,
  onAgentTileActivate = null,
  agentConnectOpen = false,
  className,
}: AppNavRailProps) {
  const t = useTranslations("navRail");
  const tLive = useTranslations("liveActivity");
  const pathname = usePathname() ?? "/";
  /**
   * 「앱 받기」 — **웹에서만** 그리는 유일한 다운로드 유도. 판정 근거와 왜
   * 마운트 뒤인지는 `../lib/show-get-app-tile`.
   */
  // `useSyncExternalStore` 로 읽는 이유: 서버 스냅샷을 **`null`(아직 모름)** 로
  // 둘 수 있어서, 프리렌더 HTML 이 "웹" 이라고 단정하지 않는다. 그래야 앱이
  // 그 HTML 을 싣고 하이드레이션에서 타일을 걷는 깜빡임이 없다.
  const desktopRuntime = useSyncExternalStore(
    subscribeToRuntime,
    isTauriVaultRuntime,
    getServerRuntimeSnapshot,
  );
  const showGetApp = shouldShowGetAppTile({
    mounted: desktopRuntime !== null,
    isDesktopApp: desktopRuntime === true,
  });

  const activeId = resolveActiveNavRailItem(pathname);

  /**
   * 활성 지표의 자리 — 활성 타일을 **재서** 정한다.
   *
   * 인덱스 × 행 높이로 계산하지 않는다: 행 높이는 레일 스케일 토큰과 라벨
   * 줄 수에 딸려 있어서, 상수로 적어 두면 토큰이 바뀌는 날 조용히 어긋난다.
   * 그때 화면은 "지표가 타일에서 살짝 빗나간" 모양이 되는데, 그건 사람이
   * 눈으로는 잘 못 집는 종류다.
   *
   * 붙이기는 **콜백 ref** 로 한다 — 노드가 붙는 순간 불리므로 순서 문제가
   * 원리적으로 없다(2026-07-28 공방 클램프가 `[]` deps 로 이 함정에 빠졌다).
   */
  const [indicator, setIndicator] = useState<{ top: number; height: number } | null>(null);
  const [indicatorReady, setIndicatorReady] = useState(false);
  const listRef = useRef<HTMLUListElement | null>(null);
  const listObserverRef = useRef<ResizeObserver | null>(null);

  const measureIndicator = useCallback(() => {
    const list = listRef.current;
    if (!list) return;
    const activeTile = list.querySelector<HTMLElement>('[data-active="true"] > span');
    if (!activeTile) {
      setIndicator(null);
      return;
    }
    const listBox = list.getBoundingClientRect();
    const tileBox = activeTile.getBoundingClientRect();
    setIndicator({ top: tileBox.top - listBox.top, height: tileBox.height });
  }, []);

  const attachDestinationList = useCallback(
    (el: HTMLUListElement | null) => {
      listRef.current = el;
      listObserverRef.current?.disconnect();
      listObserverRef.current = null;
      if (!el) return;
      measureIndicator();
      const observer = new ResizeObserver(() => measureIndicator());
      observer.observe(el);
      listObserverRef.current = observer;
    },
    [measureIndicator],
  );

  useEffect(() => () => listObserverRef.current?.disconnect(), []);

  // 활성 목적지가 바뀌면 다시 잰다. 첫 배치 이후에만 전이를 켠다 —
  // 처음 그려질 때 미끄러져 들어오면 이동이 아니라 등장이 된다.
  useLayoutEffect(() => {
    measureIndicator();
  }, [activeId, measureIndicator]);

  useEffect(() => {
    if (!indicator || indicatorReady) return;
    const raf = requestAnimationFrame(() => setIndicatorReady(true));
    return () => cancelAnimationFrame(raf);
  }, [indicator, indicatorReady]);
  const vault = useLocalVault();
  const agentStatus = vault.agentActivityStatus;
  const heartbeat = agentStatus?.heartbeat ?? null;
  const hasFreshHeartbeat = Boolean(heartbeat && agentStatus?.valid && !agentStatus.stale);
  const stateLabel = heartbeat
    ? ({
        planning: tLive("statePlanning"),
        editing: tLive("stateEditing"),
        verifying: tLive("stateVerifying"),
        blocked: tLive("stateBlocked"),
        complete: tLive("stateComplete"),
      }[heartbeat.state] ?? null)
    : null;
  const baseAgentTitle = !agentStatus?.exists
    ? tLive("agentMissing")
    : !agentStatus.valid
      ? tLive("agentInvalid")
      : agentStatus.stale
        ? tLive("agentStale")
        : heartbeat
          ? `${tLive("agentTitle")} — ${heartbeat.agent} · ${stateLabel}`
          : tLive("agentMissing");
  // W6 agent visibility — rail tile title enhancement: append "last activity"
  // (which ontology node the agent last touched, and how long ago) whenever
  // the heartbeat actually carries a focus slug + a reported age. Shown
  // regardless of `stale`/`valid` state (it describes the heartbeat's OWN
  // last-known data, not "is this connection healthy right now") — real
  // heartbeat data only, never fabricated (no slug/age → no suffix).
  const lastActivitySuffix =
    heartbeat?.focus?.ontologySlug && agentStatus?.ageMs != null
      ? tLive("railLastActivity", {
          slug: heartbeat.focus.ontologySlug,
          age: formatActivityAge(agentStatus.ageMs),
        })
      : null;
  const agentTitle = [baseAgentTitle, lastActivitySuffix].filter(Boolean).join(" · ");

  // 주소는 `shared/config/destinations` 가 정본이다 — 키보드 이동과 단축키 시트가
  // 같은 표를 읽어야 해서 컴포넌트 밖으로 내렸다(사본이 둘이면 라우트가 어긋난다).
  // 라벨과 아이콘은 화면의 것이라 여기 남는다.
  const destinations: RailDestination[] = [
    { id: "map", href: DESTINATION_HREF.map, label: t("map"), Icon: MapIcon },
    { id: "docs", href: contextHrefs?.docs ?? DESTINATION_HREF.docs, label: t("docs"), Icon: BookOpen },
    { id: "studio", href: DESTINATION_HREF.studio, label: t("studio"), Icon: Gem },
    { id: "insights", href: DESTINATION_HREF.insights, label: t("insights"), Icon: BarChart3 },
    { id: "projects", href: DESTINATION_HREF.projects, label: t("projects"), Icon: FolderKanban },
    // 발자취 — 2026-07-25 목적지 승격. 구 "레일 하단 유틸 타일 + 560px 모달"
    // 은 흡수됐다(입구가 둘이면 #65 계열 결함 재발). 아이콘은 History 유지 —
    // git 3-노드 그래프 글리프는 이 레일에서 "온톨로지 그래프" 로 읽혀 지도
    // 아이콘·브랜드 육각과 충돌한다(Design Guardian 반려).
    // 스킬 — 2026-08-09 소유자 확정으로 목적지 신설. 문서함과 나란히 두지 않고
    // 따로 세운 이유는 답하는 질문이 다르기 때문이다: 문서함은 「이 문서가 지도
    // 어디에 붙나」, 여기는 「이게 언제 뜨고 뜨면 뭐가 열리나」.
    { id: "skills", href: DESTINATION_HREF.skills, label: t("skills"), Icon: Wand2 },
    { id: "git", href: DESTINATION_HREF.git, label: t("git"), Icon: HistoryIcon, badgeCount: gitDirtyCount },
  ];

  return (
    <aside
      aria-label={t("ariaLabel")}
      data-testid="app-nav-rail"
      data-hidden={hidden ? "true" : "false"}
      className={cn(
        "hidden w-[var(--app-nav-rail-width)] shrink-0 flex-col items-center border-r border-[color:var(--color-border-soft)] bg-[color:var(--color-canvas)] py-3 lg:flex",
        hidden && "lg:hidden",
        className,
      )}
    >
      <Link
        href={buildRouteFocusHref("/topology/")}
        onClick={(event) => rememberRailRouteFocus(event, "/topology/")}
        title="Ontology Atlas"
        aria-label="Ontology Atlas"
        translate="no"
        className="group mb-3.5 flex shrink-0 flex-col items-center gap-1"
      >
        <span className="flex h-[var(--app-nav-rail-logo-size)] w-[var(--app-nav-rail-logo-size)] items-center justify-center text-[color:var(--color-indigo-accent)] transition-colors group-hover:text-[color:var(--color-indigo-hover)]">
          <BrandMark
            size={20}
            detail="compact"
            className="h-[var(--app-nav-rail-logo-icon-size)] w-[var(--app-nav-rail-logo-icon-size)]"
          />
        </span>
        {/* H6 — 상시 워드마크. 육각 마크 아래 초소형 "Atlas" 텍스트로 전역
            공통 레일에 브랜드 서명을 심는다. caption 램프 + quaternary 톤 +
            tracking-caption 짝(법전 규율). aria-hidden — Link 의 aria-label
            "Ontology Atlas" 와 중복 낭독 방지. */}
        <span
          aria-hidden="true"
          translate="no"
          className="text-caption font-[var(--font-weight-signature)] tracking-[var(--tracking-caption)] text-[color:var(--color-text-quaternary)] transition-colors group-hover:text-[color:var(--color-text-tertiary)]"
        >
          Atlas
        </span>
      </Link>

      <nav aria-label={t("ariaLabel")} className="flex w-full flex-1 flex-col gap-0.5">
        <ul ref={attachDestinationList} className="relative flex w-full flex-col gap-0.5">
          {/*
            활성 표시는 **하나의 원소가 옮겨 다닌다** (2026-07-28 모션 감사).

            종전에는 두 타일이 각자 색을 죽이고 켰다 — 게슈탈트 공통 운명상
            사라졌다 나타나는 두 표시는 "두 개의 것" 으로, 이동하는 한 표시는
            "**같은 것이 옮겨갔다**" 로 지각된다. 레일의 세로 순서는 이 앱의
            유일한 공간 모델이고, 지표의 이동 방향·거리는 그 모델 위에서
            "어디서 와서 어디로 갔는지" 를 나르는 **정보**다 — 끄면 그 정보를
            잃으므로 장식이 아니다.

            콘텐츠는 한 톨도 움직이지 않는다(라우트 전환은 fast 크로스페이드
            뿐). 그래서 주목 예산은 사용자가 부른 목적물이 가져가고, 크롬은
            한 점만 따라간다.
          */}
          <span
            aria-hidden
            data-testid="app-nav-rail-active-indicator"
            data-placed={indicator ? "true" : "false"}
            className={cn(
              // 가로 중앙 정렬은 **인라인 transform 하나가** 한다. Tailwind v4 의
              // 이동 유틸리티는 `transform` 이 아니라 **`translate` 표준 속성**을
              // 쓰기 때문에, 클래스로 `-translate-x-1/2` 를 주고 인라인으로
              // `transform: translate(-50%, …)` 을 주면 **둘 다 적용돼 두 번**
              // 밀린다(실측: 타일보다 19px 왼쪽 → 레일 밖으로 잘림).
              "pointer-events-none absolute left-1/2 z-0 rounded-card bg-[color:var(--color-indigo-a14)] shadow-[inset_0_0_0_1px_var(--color-indigo-line-a22)]",
              // 첫 배치는 전이가 아니다 — 처음 그려질 때 0 에서 미끄러져
              // 들어오면 "이동" 이 아니라 "등장" 이 되고, 사용자가 부르지
              // 않은 모션이 된다(`use-row-disclosure` 가 배운 것과 같다).
              indicatorReady && "transition-[transform,height] duration-[var(--motion-base)] ease-[var(--motion-ease)] motion-reduce:transition-none",
            )}
            style={
              indicator
                ? {
                    width: "var(--app-nav-rail-tile-width)",
                    height: indicator.height,
                    top: 0,
                    transform: `translate(-50%, ${indicator.top}px)`,
                    opacity: 1,
                  }
                : { opacity: 0, height: 0, top: 0 }
            }
          />
          {destinations.map(({ id, href, label, Icon, badgeCount }) => {
            const isActive = activeId === id;
            const surfacePath = href.split(/[?#]/, 1)[0] || "/";
            return (
              <li key={id}>
                <Link
                  href={buildRouteFocusHref(href)}
                  onClick={(event) => rememberRailRouteFocus(event, surfacePath)}
                  /* `title` 없음 — 라벨이 아이콘 바로 아래 **이미 보인다**.
                     네이티브 툴팁은 그 라벨 위에 회색 상자로 덮이고, OS 가
                     그리는 것이라 토큰도 모션도 우리 것이 아니다. 아이콘만
                     있는 하단 유틸 타일은 여전히 `title` 을 갖는다 — 거기서는
                     그게 유일한 이름이다. (2026-08-01 소유자 지적: 시연 영상에
                     그 상자가 찍혔다.) */
                  aria-current={isActive ? "page" : undefined}
                  data-testid={`app-nav-rail-item-${id}`}
                  data-active={isActive ? "true" : "false"}
                  /* 2026-08-05: 초점 링이 없어 키보드로 오면 **OS 강조색**이
                     그려졌다 — 헌장의 「무채색 + 인디고 하나」 밖이다. 같은
                     파일의 하단 유틸 타일은 이미 이 링을 갖고 있었으니 형제가
                     어긋나 있던 것이다. `rounded-card` 는 링이 라벨까지 감싸는
                     상자를 아이콘 타일 모양과 맞추기 위한 것이고, 상자 치수는
                     `ring-inset` 이라 한 픽셀도 안 바뀐다. */
                  /* ⚠️ `border-0` — 이 자리가 `card` 를 빌린 이유는 위 주석 그대로
                     **초점 링의 기하**(radius·ring 상자)뿐이다. 그런데 #961 이관 때
                     card 모양이 싣고 다니는 1px 헤어라인까지 같이 얹혔고, 이관 전
                     손 클래스에는 테두리가 없었다 — 소유자가 실물에서 잡았다
                     (2026-08-08: "이거 영역에 왜 테두리가 생긴거지?"). 보이는 타일은
                     아래 안쪽 span 이 그린다. 게이트: desktop-shell-rail.spec.ts. */
                  className={controlClass({ shape: "card", className: "group relative w-full flex-col gap-1 border-0 px-0 py-1.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[color:var(--color-indigo-focus-ring)]" })}
                >
                  <span
                    className={cn(
                      "relative flex h-[var(--app-nav-rail-tile-height)] w-[var(--app-nav-rail-tile-width)] items-center justify-center rounded-card transition-colors",
                      // 활성 서피스는 이 타일이 그리지 않는다 — 위의 단일
                      // 지표가 옮겨 와서 깔린다. 여기 남는 것은 **색**뿐이고,
                      // 색은 이동이 아니라 확인이라 fast 램프(기본)를 탄다.
                      isActive
                        ? "z-[1] text-[color:var(--color-indigo-accent)]"
                        : "text-[color:var(--color-text-tertiary)] group-hover:bg-[color:var(--color-overlay-2)] group-hover:text-[color:var(--color-text-primary)]",
                    )}
                  >
                    <Icon
                      size={18}
                      aria-hidden
                      className="h-[var(--app-nav-rail-icon-size)] w-[var(--app-nav-rail-icon-size)]"
                    />
                    {badgeCount ? (
                      // 신호톤 warning — `--color-status-warning` 계열 알파 사다리만
                      // 쓴다. "기록되지 않은 변경이 있다" 는 error 도 done 도 아닌
                      // 미결/주의라 warning 정의 그대로다(GitStatusTile 이 이미
                      // 배포한 구분의 연장 — 새 예외 아님). 3자리는 타일 지오메트리를
                      // 깨뜨리므로 `9+` 로 막는다.
                      <span
                        data-testid={`app-nav-rail-badge-${id}`}
                        className="absolute -right-1 -top-0.5 grid h-[15px] min-w-[15px] place-items-center rounded-full border border-[color:var(--color-amber-source-a30)] bg-[color:var(--color-amber-source-a14)] px-[3px] text-caption font-[var(--font-weight-strong)] leading-display-tight tabular-nums text-[color:var(--color-status-warning)]"
                      >
                        {badgeCount > 9 ? "9+" : badgeCount}
                      </span>
                    ) : null}
                  </span>
                  <span
                    className={cn(
                      // 크기는 레일 스케일 토큰(줌 배율이 곱해진다), 행간은
                      // 램프의 짝을 **명시**한다 — arbitrary length 참조는
                      // 크기만 나르고 companion 행간을 못 싣는다. 명시가 없던
                      // 동안 상속 1.5(14.25px)로 렌더됐다 (2026-07-28 실측).
                      "text-[length:var(--app-nav-rail-label-size)] leading-caption",
                      isActive
                        ? "font-[var(--font-weight-signature)] text-[color:var(--color-text-primary)]"
                        : "text-[color:var(--color-text-quaternary)]",
                    )}
                  >
                    {label}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* #65 — 하단 유틸 티어. 이 안의 구성(활동 · 발자취 · 설정)은 모든 화면에서
          같아야 한다 — 셸(AppShell)이 소유하며 페이지가 등록하지 않는다. */}
      <div
        data-testid="app-nav-rail-utility-tier"
        className="mt-auto flex w-full flex-col items-center gap-1 pt-2"
      >
        {/* 에이전트 타일 — 클릭 가능. 연결됨: 활동 다이제스트(인사이트)로,
            미연결/stale: 연결 시트를 연다(P4-② 분기, AppShell 이 라우팅).
            aria: 미연결일 때만 dialog 를 여므로 그때만 haspopup/expanded. */}
        <button
          type="button"
          title={agentTitle}
          aria-label={agentTitle}
          aria-haspopup={onAgentTileActivate && !hasFreshHeartbeat ? "dialog" : undefined}
          aria-expanded={
            onAgentTileActivate && !hasFreshHeartbeat ? agentConnectOpen : undefined
          }
          onClick={onAgentTileActivate ? () => onAgentTileActivate(hasFreshHeartbeat) : undefined}
          disabled={!onAgentTileActivate}
          data-testid="app-nav-rail-agent-status"
          className={cn(
            // 상태 안무 = 클러스터 칩(ChromeChip) 계약과 동급: rest → hover(색-웨이크)
            // → active(1px 눌림 + overlay-3 서피스, 촉각감) → focus-visible 링.
            // transform 을 transition 대상에 포함해 눌림 해제가 급작스럽지 않게 이완.
            "relative flex h-[var(--app-nav-rail-tile-height)] w-[var(--app-nav-rail-tile-width)] items-center justify-center rounded-card text-[color:var(--color-text-tertiary)] transition-[color,background-color,transform] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-indigo-focus-ring)] focus-visible:ring-inset",
            onAgentTileActivate &&
              "enabled:hover:bg-[color:var(--color-overlay-2)] enabled:hover:text-[color:var(--color-text-primary)] enabled:active:translate-y-px enabled:active:bg-[color:var(--color-overlay-3)]",
          )}
        >
          {/* 유틸리티 티어 아이콘 사다리(로고 26 / 목적지 24+라벨 / 유틸 18) —
              소유자 실보고 2026-07-23: 하단 유틸 아이콘이 목적지 크기(24)를
              그대로 써 설정 기어보다 커 보였다. 유틸 3타일(활동·발자취·설정)은
              `--app-nav-rail-utility-icon-size` 하나로 앉는다. */}
          <Activity
            size={ICON_SIZE.lg}
            aria-hidden
            className="h-[var(--app-nav-rail-utility-icon-size)] w-[var(--app-nav-rail-utility-icon-size)]"
          />
          {hasFreshHeartbeat ? (
            <span
              aria-hidden="true"
              data-testid="app-nav-rail-agent-dot"
              className="rail-status-dot-in absolute right-1.5 top-1 h-1.5 w-1.5 rounded-full bg-[color:var(--topology-v2-amber-hub)]"
            />
          ) : null}
        </button>
        {/*
          웹에만 있는 한 자리. 표면마다 배너를 심는 대신 크롬에 하나를 두는
          이유는 `../lib/show-get-app-tile` 에 적었다 — 레일 유틸리티 티어는
          모든 목적지에서 같은 자리라, 한 원소가 이미 "다양한 곳" 이다.

          목적지는 `/download` 다. 방문자의 OS 를 여기서 추측하지 않는다 —
          그 화면이 macOS 파일과 "Windows 준비 중" 을 이미 정직하게 가른다.
          레일에서 OS 를 판정하면 틀렸을 때 **막다른 CTA** 가 되는데, 그건
          이 저장소가 이름으로 금지한 것이다.
        */}
        {showGetApp ? (
          <Link
            href="/download/"
            title={t("getAppTitle")}
            aria-label={t("getApp")}
            data-testid="app-nav-rail-get-app"
            className={controlClass({ shape: "card", tone: "muted", className: "group relative h-[var(--app-nav-rail-tile-height)] w-[var(--app-nav-rail-tile-width)] justify-center border-0 transition-[color,background-color,transform] hover:bg-[color:var(--color-overlay-2)] hover:text-[color:var(--color-text-primary)] active:translate-y-px active:bg-[color:var(--color-overlay-3)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-indigo-focus-ring)] focus-visible:ring-inset" })}
          >
            <Download
              aria-hidden
              className="h-[var(--app-nav-rail-utility-icon-size)] w-[var(--app-nav-rail-utility-icon-size)]"
            />
          </Link>
        ) : null}
        {settingsSlot}
      </div>
    </aside>
  );
}
