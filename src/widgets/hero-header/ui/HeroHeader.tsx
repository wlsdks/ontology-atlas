"use client";

import Image from "next/image";
import { Link } from "@/i18n/navigation";
import { motion } from "framer-motion";
import { useTranslations } from "next-intl";
import { ArrowLeft, BookOpen, ChevronsLeft, List, Network, Search } from "lucide-react";
import { Tooltip } from "@/shared/ui";
import { cn } from "@/shared/lib/cn";
import { MOTION } from "@/shared/motion";

interface Props {
  className?: string;
  hidden?: boolean;
  activePathLabel?: string | null;
  onOpenSearch: () => void;
  onCollapse?: () => void;
  title?: string;
  eyebrow?: string;
  description?: string;
  showSummary?: boolean;
  icon?: string | null;
  /** "프로젝트 목록" 버튼 대상 URL. 지정되면 검색 옆에 나란히 노출. */
  projectsListHref?: string;
  /** Source Vault (/docs) 진입용. 인증 사용자에게만 노출. */
  docsVaultHref?: string;
  /** "온톨로지" (/ontology) 진입용. 권한은 라우트 측에서 게이팅. */
  ontologyHref?: string;
  /** 컨테이너 zoom-in 상태에서 Layer 0 로 돌아가는 URL. 주어지면 상단 바로
   *  가기 버튼 노출. */
  workspaceMapHref?: string;
  onWorkspaceMapClick?: () => void;
}

export function HeroHeader({
  className,
  hidden = false,
  activePathLabel,
  onOpenSearch,
  onCollapse,
  title,
  eyebrow,
  description,
  showSummary = true,
  icon,
  projectsListHref,
  docsVaultHref,
  ontologyHref,
  workspaceMapHref,
  onWorkspaceMapClick,
}: Props) {
  const t = useTranslations("searchWidgets.hero");
  const resolvedTitle = title ?? t("defaultTitleTopology");
  const resolvedEyebrow = eyebrow ?? t("defaultEyebrow");
  const summary =
    description ??
    (activePathLabel
      ? t("summaryActive", { label: activePathLabel })
      : t("summaryDefault"));

  return (
    <motion.section
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: hidden ? 0.38 : 1, y: 0 }}
      transition={MOTION.medium}
      className={cn("pointer-events-none w-full", className)}
    >
      <div className="pointer-events-auto overflow-hidden rounded-[26px] border border-[color:var(--color-divider)] bg-[color:var(--color-panel)] shadow-[0_14px_38px_rgba(0,0,0,0.18)]">
        <div className="px-4 pb-4 pt-4 lg:px-5 lg:pb-4 lg:pt-4">
          <div className="flex items-start justify-between gap-3">
            {icon ? (
              <span
                aria-hidden="true"
                className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-[9px] border border-[color:var(--color-border-soft)] bg-[color:var(--color-overlay-1)] text-xl"
              >
                {icon}
              </span>
            ) : (
              <Image
                src="/logo.png"
                alt=""
                aria-hidden="true"
                width={40}
                height={40}
                priority
                className="h-10 w-10 shrink-0 rounded-[9px] border border-[color:var(--color-border-soft)] object-cover"
              />
            )}
            {onCollapse && (
              <Tooltip content={t("collapseLeft")} side="bottom" withProvider={false}>
                <button
                  type="button"
                  onClick={onCollapse}
                  aria-label={t("collapseLeft")}
                  className="-mt-1 -mr-1 flex h-8 w-8 items-center justify-center rounded-md text-[color:var(--color-text-tertiary)] transition-colors hover:bg-[color:var(--color-overlay-2)] hover:text-[color:var(--color-text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-border-strong)]"
                >
                  <ChevronsLeft size={15} />
                </button>
              </Tooltip>
            )}
          </div>
          <p className="mt-3 font-mono text-[10px] uppercase tracking-[0.14em] text-[color:var(--color-text-quaternary)] whitespace-nowrap">
            {resolvedEyebrow}
          </p>
          <h1
            translate="no"
            className="mt-1.5 text-[32px] leading-[0.96] tracking-[var(--tracking-hero)] font-[var(--font-weight-signature)] text-[color:var(--color-text-primary)] lg:text-[36px] xl:text-[44px]"
          >
            {resolvedTitle}
          </h1>

          {showSummary ? (
            <p className="mt-4 max-w-[260px] text-[13px] leading-5 text-[color:var(--color-text-secondary)] lg:max-w-[280px] xl:max-w-[312px]">
              {summary}
            </p>
          ) : null}

          <div className="mt-4 flex flex-wrap items-center gap-2">
            {workspaceMapHref ? (
              <Link
                href={workspaceMapHref}
                onClick={onWorkspaceMapClick}
                className="inline-flex h-9 items-center gap-2 rounded-full border border-[color:rgba(224,196,140,0.4)] bg-[color:rgba(224,196,140,0.08)] px-4 text-[13px] font-[var(--font-weight-signature)] text-[color:var(--color-text-primary)] transition-colors hover:border-[color:rgba(224,196,140,0.6)] hover:bg-[color:rgba(224,196,140,0.14)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:rgba(224,196,140,0.5)] focus-visible:ring-offset-2 focus-visible:ring-offset-[color:var(--color-panel)]"
              >
                <ArrowLeft size={14} />
                {t("workspaceMap")}
              </Link>
            ) : null}
            <button
              type="button"
              onClick={onOpenSearch}
              className="inline-flex h-9 items-center gap-2 rounded-full border border-[color:rgba(94,106,210,0.38)] bg-[color:rgba(94,106,210,0.14)] px-4 text-[13px] font-[var(--font-weight-signature)] text-[color:var(--color-text-primary)] transition-colors hover:border-[color:var(--color-indigo-brand)] hover:bg-[color:rgba(94,106,210,0.18)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:rgba(94,106,210,0.5)] focus-visible:ring-offset-2 focus-visible:ring-offset-[color:var(--color-panel)]"
            >
              <Search size={14} />
              {resolvedTitle === t("defaultTitleTopology") ? t("findProject") : t("findOtherProject")}
            </button>
            {projectsListHref ? (
              <Link
                href={projectsListHref}
                className="inline-flex h-9 items-center gap-2 rounded-full border border-[color:var(--color-overlay-3)] bg-[color:var(--color-overlay-1)] px-4 text-[13px] text-[color:var(--color-text-secondary)] transition-colors hover:border-[color:var(--color-border-strong)] hover:text-[color:var(--color-text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:rgba(94,106,210,0.5)] focus-visible:ring-offset-2 focus-visible:ring-offset-[color:var(--color-panel)]"
              >
                <List size={14} />
                {t("projectsList")}
              </Link>
            ) : null}
            {docsVaultHref ? (
              <Link
                href={docsVaultHref}
                className="inline-flex h-9 items-center gap-2 rounded-full border border-[color:var(--color-overlay-3)] bg-[color:var(--color-overlay-1)] px-4 text-[13px] text-[color:var(--color-text-secondary)] transition-colors hover:border-[color:var(--color-border-strong)] hover:text-[color:var(--color-text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:rgba(94,106,210,0.5)] focus-visible:ring-offset-2 focus-visible:ring-offset-[color:var(--color-panel)]"
                aria-label={t("docsVaultAriaLabel")}
              >
                <BookOpen size={14} />
                {t("docsVault")}
              </Link>
            ) : null}
            {ontologyHref ? (
              <Link
                href={ontologyHref}
                className="inline-flex h-9 items-center gap-2 rounded-full border border-[color:var(--color-overlay-3)] bg-[color:var(--color-overlay-1)] px-4 text-[13px] text-[color:var(--color-text-secondary)] transition-colors hover:border-[color:var(--color-border-strong)] hover:text-[color:var(--color-text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:rgba(94,106,210,0.5)] focus-visible:ring-offset-2 focus-visible:ring-offset-[color:var(--color-panel)]"
                aria-label={t("ontologyAriaLabel")}
              >
                <Network size={14} />
                {t("ontology")}
              </Link>
            ) : null}
          </div>
        </div>
      </div>
    </motion.section>
  );
}
