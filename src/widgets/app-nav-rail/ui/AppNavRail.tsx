"use client";

import type { ComponentType, ReactNode } from "react";
import { Link, usePathname } from "@/i18n/navigation";
import { useTranslations } from "next-intl";
import {
  Activity,
  BarChart3,
  BookOpen,
  FolderKanban,
  GitBranch,
  Map as MapIcon,
} from "lucide-react";
import { useLocalVault } from "@/features/docs-vault-local";
import { formatActivityAge } from "@/features/vault-ontology";
import { cn } from "@/shared/lib/cn";
import { BrandMark } from "@/shared/ui";
import { resolveActiveNavRailItem, type AppNavRailItemId } from "../lib/resolve-active-item";

export interface AppNavRailProps {
  /** 설정 트리거(`TopologyV2SettingsGear` 등) — 레일 하단에 꽂는 슬롯. 완성된
   *  엘리먼트를 HomePage 가 넘긴다 — widget↔widget import 를 피하고, INDEX
   *  기본 상태 같은 HomePage 소유 state 를 그대로 재사용하기 위함. perf/
   *  persistent-shell 이후엔 레일이 layout 에 상주하므로 `AppShell`이
   *  `useNavRailShellValue()`로 읽은 값을 그대로 넘긴다. */
  settingsSlot?: ReactNode;
  /** true 면 레일을 언마운트하지 않고 CSS 로만 숨긴다(빌더 fullscreen).
   *  레일이 layout 에 상주해 DOM identity 를 유지하는 게 perf/persistent-shell
   *  승격의 핵심이라 조건부 렌더링 대신 이 prop 을 쓴다. */
  hidden?: boolean;
  className?: string;
}

interface RailDestination {
  id: AppNavRailItemId;
  href: string;
  label: string;
  Icon: ComponentType<{ size?: number; className?: string; "aria-hidden"?: boolean }>;
}

/**
 * 좌측 64px 내비 레일 (feat/chrome-system, `docs/prototypes/chrome-rail-combined.html`
 * 소유자 최종 승인) — 전역 목적지(지도·문서함·빌더·인사이트·프로젝트) +
 * 하단 에이전트 상태·설정을 전담하는 상시 chrome. #375 는 지형도(HomePage)만
 * 마운트했고, feat/rail-rollout (#377) 이 지형도 외 전 페이지(문서함·빌더·
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
export function AppNavRail({ settingsSlot, hidden, className }: AppNavRailProps) {
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
    { id: "docs", href: "/docs/", label: t("docs"), Icon: BookOpen },
    { id: "builder", href: "/ontology/edit/", label: t("builder"), Icon: GitBranch },
    { id: "insights", href: "/ontology/insights/", label: t("insights"), Icon: BarChart3 },
    { id: "projects", href: "/projects/", label: t("projects"), Icon: FolderKanban },
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
        href="/topology/"
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
          {destinations.map(({ id, href, label, Icon }) => {
            const isActive = activeId === id;
            return (
              <li key={id}>
                <Link
                  href={href}
                  title={label}
                  aria-current={isActive ? "page" : undefined}
                  data-testid={`app-nav-rail-item-${id}`}
                  data-active={isActive ? "true" : "false"}
                  className="group relative flex w-full flex-col items-center gap-1 px-0 py-1.5"
                >
                  {isActive ? (
                    <span
                      aria-hidden="true"
                      className="absolute left-0 top-[9%] h-[82%] w-[2px] rounded-r-full bg-[color:var(--color-indigo-brand)]"
                    />
                  ) : null}
                  <span
                    className={cn(
                      "flex h-[var(--app-nav-rail-tile-height)] w-[var(--app-nav-rail-tile-width)] items-center justify-center rounded-card transition-colors",
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

      <div className="mt-auto flex w-full flex-col items-center gap-1 pt-2">
        <div
          title={agentTitle}
          aria-label={agentTitle}
          data-testid="app-nav-rail-agent-status"
          className="relative flex h-[var(--app-nav-rail-tile-height)] w-[var(--app-nav-rail-tile-width)] items-center justify-center rounded-card text-[color:var(--color-text-tertiary)]"
        >
          <Activity
            size={18}
            aria-hidden
            className="h-[var(--app-nav-rail-icon-size)] w-[var(--app-nav-rail-icon-size)]"
          />
          {hasFreshHeartbeat ? (
            <span
              aria-hidden="true"
              data-testid="app-nav-rail-agent-dot"
              className="absolute right-1.5 top-1 h-1.5 w-1.5 rounded-full bg-[color:var(--topology-v2-amber-hub)]"
            />
          ) : null}
        </div>
        {settingsSlot}
      </div>
    </aside>
  );
}
