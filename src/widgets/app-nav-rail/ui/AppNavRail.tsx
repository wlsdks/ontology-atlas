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
import { cn } from "@/shared/lib/cn";
import { BrandMark } from "@/shared/ui";
import { resolveActiveNavRailItem, type AppNavRailItemId } from "../lib/resolve-active-item";

export interface AppNavRailProps {
  /** 설정 트리거(`TopologyV2SettingsGear` 등) — 레일 하단에 꽂는 슬롯. 완성된
   *  엘리먼트를 HomePage 가 넘긴다 — widget↔widget import 를 피하고, INDEX
   *  기본 상태 같은 HomePage 소유 state 를 그대로 재사용하기 위함. */
  settingsSlot?: ReactNode;
  className?: string;
}

interface RailDestination {
  id: AppNavRailItemId;
  href: string;
  label: string;
  Icon: ComponentType<{ size?: number; "aria-hidden"?: boolean }>;
}

/**
 * 좌측 64px 내비 레일 (feat/chrome-system, `docs/prototypes/chrome-rail-combined.html`
 * 소유자 최종 승인) — 전역 목적지(지도·문서함·빌더·인사이트·프로젝트) +
 * 하단 에이전트 상태·설정을 전담하는 상시 chrome. 이 슬라이스의 마운트
 * 범위는 지형도(HomePage)만 — 다른 페이지 롤아웃은 별도 슬라이스.
 *
 * book/network 유틸 타일과 우측 레일의 설정 기어가 여기로 흡수됐다
 * (HeroCollapsed 는 필만 남고, 우측 세로 레일은 지도 전용 3타일만).
 */
export function AppNavRail({ settingsSlot, className }: AppNavRailProps) {
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
  const agentTitle = !agentStatus?.exists
    ? tLive("agentMissing")
    : !agentStatus.valid
      ? tLive("agentInvalid")
      : agentStatus.stale
        ? tLive("agentStale")
        : heartbeat
          ? `${tLive("agentTitle")} — ${heartbeat.agent} · ${stateLabel}`
          : tLive("agentMissing");

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
      className={cn(
        "hidden w-16 shrink-0 flex-col items-center border-r border-[color:var(--color-border-soft)] bg-[color:var(--color-canvas)] py-3 md:flex",
        className,
      )}
    >
      <Link
        href="/topology/"
        title="Ontology Atlas"
        aria-label="Ontology Atlas"
        translate="no"
        className="mb-3.5 flex h-[34px] w-[34px] shrink-0 items-center justify-center text-[color:var(--color-indigo-accent)] transition-colors hover:text-[color:var(--color-indigo-hover)]"
      >
        <BrandMark size={20} detail="compact" />
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
                      "flex h-8 w-[38px] items-center justify-center rounded-[8px] transition-colors",
                      isActive
                        ? "bg-[color:rgba(94,106,210,0.14)] text-[color:var(--color-indigo-accent)] shadow-[inset_0_0_0_1px_rgba(139,151,255,0.22)]"
                        : "text-[color:var(--color-text-tertiary)] group-hover:bg-[color:var(--color-overlay-2)] group-hover:text-[color:var(--color-text-primary)]",
                    )}
                  >
                    <Icon size={18} aria-hidden />
                  </span>
                  <span
                    className={cn(
                      "text-[9.5px]",
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
          className="relative flex h-8 w-[38px] items-center justify-center rounded-[8px] text-[color:var(--color-text-tertiary)]"
        >
          <Activity size={18} aria-hidden />
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
