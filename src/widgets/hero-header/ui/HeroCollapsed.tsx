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
}: Props) {
  const t = useTranslations("searchWidgets.hero");
  const resolvedTitle = title ?? t("defaultTitleTopology");
  const resolvedSubtitle = subtitle ?? t("collapsedSubtitle");
  const resolvedAriaLabel = ariaLabel ?? t("collapsedAriaLabel");
  const resolvedTitleText = titleText ?? t("collapsedTitleText");
  return (
    <div className="pointer-events-auto flex items-center gap-2">
      {workspaceMapHref ? (
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
        "group inline-flex h-12 items-center gap-2 rounded-full border border-[color:var(--color-divider)] bg-[color:var(--color-panel)] pl-1.5 pr-3 shadow-[0_8px_24px_rgba(0,0,0,0.22)] transition-colors hover:border-[color:var(--color-border-strong)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:rgba(94,106,210,0.46)] focus-visible:ring-offset-2 focus-visible:ring-offset-[color:var(--color-canvas)]",
        className,
      )}
    >
      {icon ? (
        <span
          aria-hidden="true"
          className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-[color:var(--color-border-soft)] bg-[color:var(--color-overlay-1)] text-base"
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
          className="h-8 w-8 shrink-0 rounded-full border border-[color:var(--color-border-soft)] object-cover"
        />
      )}
      <span className="flex min-w-0 flex-col items-start">
        <span
          translate="no"
          className="max-w-[110px] truncate font-[var(--font-weight-signature)] text-[13px] text-[color:var(--color-text-primary)]"
        >
          {resolvedTitle}
        </span>
        <span className="font-mono text-[9px] uppercase tracking-[0.08em] text-[color:var(--color-text-quaternary)]">
          {resolvedSubtitle}
        </span>
      </span>
      {onExpand ? (
        <ChevronsRight
          size={14}
          className="text-[color:var(--color-text-quaternary)] transition-colors group-hover:text-[color:var(--color-text-secondary)]"
        />
      ) : null}
    </motion.button>
    {docsVaultHref ? (
      <Link
        href={docsVaultHref}
        aria-label={t("openDocsVault")}
        title={t("docsVault")}
        className="group inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-[color:var(--color-divider)] bg-[color:var(--color-panel)] text-[color:var(--color-indigo-accent)] shadow-[0_8px_24px_rgba(0,0,0,0.22)] transition-colors hover:border-[color:rgba(94,106,210,0.38)] hover:text-[color:var(--color-text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:rgba(94,106,210,0.46)] focus-visible:ring-offset-2 focus-visible:ring-offset-[color:var(--color-canvas)]"
      >
        <BookOpen size={15} />
      </Link>
    ) : null}
    {ontologyHref ? (
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
