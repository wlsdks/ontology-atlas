"use client";

import Image from "next/image";
import { Link } from "@/i18n/navigation";
import { motion } from "framer-motion";
import { useTranslations } from "next-intl";
import { ArrowLeft, BookOpen, ChevronsRight, Network } from "lucide-react";
import { cn } from "@/shared/lib/cn";
import { MOTION } from "@/shared/motion";

interface Props {
  className?: string;
  /** 없으면 pill 이 클릭 불가(확장 상태가 없는 surface) — chevron 도 숨김. */
  onExpand?: () => void;
  title?: string;
  subtitle?: string;
  icon?: string | null;
  ariaLabel?: string;
  titleText?: string;
  /** Layer 1 drill-in 상태에서 한 번에 Workspace 지도로 복귀하는 링크.
   *  truthy 일 때 pill 왼쪽에 "← Workspace" 보조 버튼 노출. */
  workspaceMapHref?: string;
  onWorkspaceMapClick?: () => void;
  /** Source Vault (/docs) 바로 가기. 접힌 상태에서도 주 기능 접근 유지. */
  docsVaultHref?: string;
  /** 온톨로지 (/ontology) 바로 가기. 접힌 상태에서도 트리 surface 접근 유지. */
  ontologyHref?: string;
  /** Active inspector 상태에서는 위치 breadcrumb 역할만 하도록 밀도를 낮춘다. */
  compact?: boolean;
}

export function HeroCollapsed({
  className,
  onExpand,
  title,
  subtitle,
  icon,
  ariaLabel,
  titleText,
  workspaceMapHref,
  onWorkspaceMapClick,
  docsVaultHref,
  ontologyHref,
  compact = false,
}: Props) {
  const t = useTranslations("searchWidgets.hero");
  const resolvedTitle = title ?? t("defaultTitleTopology");
  const resolvedSubtitle = subtitle ?? t("collapsedSubtitle");
  const resolvedAriaLabel = ariaLabel ?? t("collapsedAriaLabel");
  const resolvedTitleText = titleText ?? t("collapsedTitleText");
  return (
    <div
      className={cn("pointer-events-auto flex items-center", compact ? "gap-1.5" : "gap-2")}
      data-workspace-context-density={compact ? "compact-active-relation" : "default"}
    >
      {workspaceMapHref && !compact ? (
        <Link
          href={workspaceMapHref}
          onClick={onWorkspaceMapClick}
          aria-label={t("backToWorkspace")}
          title={t("backToWorkspace")}
          className="group inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-[color:var(--color-divider)] bg-[color:var(--color-panel)] text-[color:var(--color-text-quaternary)] shadow-[0_8px_24px_rgba(0,0,0,0.22)] transition-colors hover:border-[color:rgba(224,196,140,0.35)] hover:text-[color:var(--color-text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:rgba(224,196,140,0.46)] focus-visible:ring-offset-2 focus-visible:ring-offset-[color:var(--color-canvas)]"
        >
          <ArrowLeft size={15} />
        </Link>
      ) : null}
    <motion.button
      type="button"
      onClick={onExpand}
      disabled={!onExpand}
      aria-label={resolvedAriaLabel}
      title={resolvedTitleText}
      initial={{ opacity: 0, x: -8 }}
      animate={{ opacity: 1, x: 0 }}
      transition={MOTION.fast}
      className={cn(
        "group inline-flex items-center rounded-full border border-[color:var(--color-divider)] bg-[color:var(--color-panel)] shadow-[0_8px_24px_rgba(0,0,0,0.22)] transition-colors hover:border-[color:var(--color-border-strong)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:rgba(94,106,210,0.46)] focus-visible:ring-offset-2 focus-visible:ring-offset-[color:var(--color-canvas)]",
        compact ? "h-9 gap-1.5 pl-1.5 pr-2.5 opacity-80" : "h-12 gap-2 pl-1.5 pr-3",
        className,
      )}
    >
      {icon ? (
        <span
          aria-hidden="true"
          className={cn(
            "inline-flex shrink-0 items-center justify-center rounded-full border border-[color:var(--color-border-soft)] bg-[color:var(--color-overlay-1)]",
            compact ? "h-6 w-6 text-xs" : "h-8 w-8 text-base",
          )}
        >
          {icon}
        </span>
      ) : (
        <Image
          src="/logo.png"
          alt=""
          aria-hidden="true"
          width={32}
          height={32}
          priority
          className={cn(
            "shrink-0 rounded-full border border-[color:var(--color-border-soft)] object-cover",
            compact ? "h-6 w-6" : "h-8 w-8",
          )}
        />
      )}
      <span className="flex min-w-0 flex-col items-start">
        <span
          translate="no"
          className={cn(
            "truncate font-[var(--font-weight-signature)] text-[color:var(--color-text-primary)]",
            compact ? "max-w-[92px] text-[12px]" : "max-w-[110px] text-[13px]",
          )}
        >
          {resolvedTitle}
        </span>
        <span
          className={cn(
            "font-mono uppercase tracking-[0.08em] text-[color:var(--color-text-quaternary)]",
            compact ? "sr-only" : "text-[9px]",
          )}
        >
          {resolvedSubtitle}
        </span>
      </span>
      {onExpand && !compact ? (
        <ChevronsRight
          size={14}
          className="text-[color:var(--color-text-quaternary)] transition-colors group-hover:text-[color:var(--color-text-secondary)]"
        />
      ) : null}
    </motion.button>
    {docsVaultHref && !compact ? (
      <Link
        href={docsVaultHref}
        aria-label={t("openDocsVault")}
        title={t("docsVault")}
        className="group inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-[color:var(--color-divider)] bg-[color:var(--color-panel)] text-[color:var(--color-indigo-accent)] shadow-[0_8px_24px_rgba(0,0,0,0.22)] transition-colors hover:border-[color:rgba(94,106,210,0.38)] hover:text-[color:var(--color-text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:rgba(94,106,210,0.46)] focus-visible:ring-offset-2 focus-visible:ring-offset-[color:var(--color-canvas)]"
      >
        <BookOpen size={15} />
      </Link>
    ) : null}
    {ontologyHref && !compact ? (
      <Link
        href={ontologyHref}
        aria-label={t("openOntologyTree")}
        title={t("ontology")}
        className="group inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-[color:var(--color-divider)] bg-[color:var(--color-panel)] text-[color:var(--color-indigo-accent)] shadow-[0_8px_24px_rgba(0,0,0,0.22)] transition-colors hover:border-[color:rgba(94,106,210,0.38)] hover:text-[color:var(--color-text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:rgba(94,106,210,0.46)] focus-visible:ring-offset-2 focus-visible:ring-offset-[color:var(--color-canvas)]"
      >
        <Network size={15} />
      </Link>
    ) : null}
    </div>
  );
}
