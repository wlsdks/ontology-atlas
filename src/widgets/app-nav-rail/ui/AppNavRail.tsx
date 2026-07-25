"use client";

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
  BookOpen,
  FolderKanban,
  Gem,
  // `History as HistoryIcon` — bare `History` 는 특정 HMR/번들 상태에서 전역
  // DOM History 생성자로 해석돼 "Illegal constructor" 로 화면을 추락시킨다
  // (AtlasGitPanel 이 같은 사고를 겪었다). 전역과 충돌 없는 별칭으로 고정.
  History as HistoryIcon,
  Map as MapIcon,
} from "lucide-react";
import { useLocalVault } from "@/features/docs-vault-local";
import { formatActivityAge } from "@/features/vault-ontology";
import { cn } from "@/shared/lib/cn";
import { BrandMark } from "@/shared/ui";
import {
  buildRouteFocusHref,
  rememberRouteFocusIntent,
} from "@/shared/ui/route-focus-manager";
import { resolveActiveNavRailItem, type AppNavRailItemId } from "../lib/resolve-active-item";
import type { NavRailContextHrefs } from "../model/shell-slot-context";

export interface AppNavRailProps {
  /** 설정 트리거(`AppSettingsMenu` rail-tile 등) — 레일 하단에 꽂는 슬롯. 완성된
   *  엘리먼트를 HomePage 가 넘긴다 — widget↔widget import 를 피하고, INDEX
   *  기본 상태 같은 HomePage 소유 state 를 그대로 재사용하기 위함. perf/
   *  persistent-shell 이후엔 레일이 layout 에 상주하므로 `AppShell`이
   *  `useNavRailShellValue()`로 읽은 값을 그대로 넘긴다. */
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
  rememberRouteFocusIntent(pathname);
}

/**
 * 좌측 64px 내비 레일 (feat/chrome-system, `docs/prototypes/chrome-rail-combined.html`
 * 소유자 최종 승인) — 전역 목적지(지도·문서함·공방·인사이트·프로젝트) +
 * 하단 에이전트 상태·설정을 전담하는 상시 chrome. #375 는 지형도(HomePage)만
 * 마운트했고, feat/rail-rollout (#377) 이 지형도 외 전 페이지(문서함·공방·
 * 인사이트·프로젝트 목록/상세/편집·다운로드)로 확장해 3-체계(OperationsNav
 * 상단 탭 + BottomTabBar + 이 레일) 내비를 1-체계로 통합했다 — 구 상단 탭
 * (`OperationsNav`)·서브탭(`OntologySubNav`)은 은퇴.
 *
 * book/network 유틸 타일과 우측 레일의 설정 기어가 여기로 흡수됐다
 * (HeroCollapsed 는 필만 남고, 우측 세로 레일은 지도 전용 3타일만). 폭이
 * 좁아(`--app-nav-rail-width`) `AppSettingsMenu`/`LiveActivityIndicator` 같은
 * 넓은 popover 위젯은 품지 못한다 — 그 둘은 레일이 상주하는 각 페이지
 * 헤더에 개별 마운트한다(기능 손실 0 원칙, `src/widgets/app-settings-menu`).
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
  const activeId = resolveActiveNavRailItem(pathname);
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

  const destinations: RailDestination[] = [
    { id: "map", href: "/topology/", label: t("map"), Icon: MapIcon },
    { id: "docs", href: contextHrefs?.docs ?? "/docs/", label: t("docs"), Icon: BookOpen },
    { id: "studio", href: "/ontology/studio/", label: t("studio"), Icon: Gem },
    { id: "insights", href: "/ontology/insights/", label: t("insights"), Icon: BarChart3 },
    { id: "projects", href: "/projects/", label: t("projects"), Icon: FolderKanban },
    // 발자취 — 2026-07-25 목적지 승격. 구 "레일 하단 유틸 타일 + 560px 모달"
    // 은 흡수됐다(입구가 둘이면 #65 계열 결함 재발). 아이콘은 History 유지 —
    // git 3-노드 그래프 글리프는 이 레일에서 "온톨로지 그래프" 로 읽혀 지도
    // 아이콘·브랜드 육각과 충돌한다(Design Guardian 반려).
    { id: "git", href: "/git/", label: t("git"), Icon: HistoryIcon, badgeCount: gitDirtyCount },
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
        {/* H6 — 상시 워드마크. 육각 마크 아래 초소형 "Atlas" 텍스트로 5표면
            공통 레일에 브랜드 서명을 심는다. caption 램프 + quaternary 톤 +
            tracking-caption 짝(법전 규율). aria-hidden — Link 의 aria-label
            "Ontology Atlas" 와 중복 낭독 방지. */}
        <span
          aria-hidden="true"
          translate="no"
          className="text-[length:var(--text-caption)] font-[var(--font-weight-signature)] tracking-[var(--tracking-caption)] text-[color:var(--color-text-quaternary)] transition-colors group-hover:text-[color:var(--color-text-tertiary)]"
        >
          Atlas
        </span>
      </Link>

      <nav aria-label={t("ariaLabel")} className="flex w-full flex-1 flex-col gap-0.5">
        <ul className="flex w-full flex-col gap-0.5">
          {destinations.map(({ id, href, label, Icon, badgeCount }) => {
            const isActive = activeId === id;
            const surfacePath = href.split(/[?#]/, 1)[0] || "/";
            return (
              <li key={id}>
                <Link
                  href={buildRouteFocusHref(href)}
                  onClick={(event) => rememberRailRouteFocus(event, surfacePath)}
                  title={label}
                  aria-current={isActive ? "page" : undefined}
                  data-testid={`app-nav-rail-item-${id}`}
                  data-active={isActive ? "true" : "false"}
                  className="group relative flex w-full flex-col items-center gap-1 px-0 py-1.5"
                >
                  <span
                    className={cn(
                      "relative flex h-[var(--app-nav-rail-tile-height)] w-[var(--app-nav-rail-tile-width)] items-center justify-center rounded-card transition-colors",
                      isActive
                        ? "bg-[color:var(--color-indigo-a14)] text-[color:var(--color-indigo-accent)] shadow-[inset_0_0_0_1px_var(--color-indigo-line-a22)]"
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
                        className="absolute -right-1 -top-0.5 grid h-[15px] min-w-[15px] place-items-center rounded-full border border-[color:var(--color-amber-source-a30)] bg-[color:var(--color-amber-source-a14)] px-[3px] text-[length:var(--text-caption)] font-bold leading-none tabular-nums text-[color:var(--color-status-warning)]"
                      >
                        {badgeCount > 9 ? "9+" : badgeCount}
                      </span>
                    ) : null}
                  </span>
                  <span
                    className={cn(
                      "text-[length:var(--app-nav-rail-label-size)]",
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
            "relative flex h-[var(--app-nav-rail-tile-height)] w-[var(--app-nav-rail-tile-width)] items-center justify-center rounded-card text-[color:var(--color-text-tertiary)] transition-[color,background-color,transform] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-indigo-a46)] focus-visible:ring-inset",
            onAgentTileActivate &&
              "enabled:cursor-pointer enabled:hover:bg-[color:var(--color-overlay-2)] enabled:hover:text-[color:var(--color-text-primary)] enabled:active:translate-y-px enabled:active:bg-[color:var(--color-overlay-3)]",
          )}
        >
          {/* 유틸리티 티어 아이콘 사다리(로고 26 / 목적지 24+라벨 / 유틸 18) —
              소유자 실보고 2026-07-23: 하단 유틸 아이콘이 목적지 크기(24)를
              그대로 써 설정 기어보다 커 보였다. 유틸 3타일(활동·발자취·설정)은
              `--app-nav-rail-utility-icon-size` 하나로 앉는다. */}
          <Activity
            size={18}
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
        {settingsSlot}
      </div>
    </aside>
  );
}
