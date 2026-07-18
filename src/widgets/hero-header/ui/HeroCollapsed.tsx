"use client";

import type { ReactNode } from "react";
import { Link } from "@/i18n/navigation";
import { motion } from "framer-motion";
import { useTranslations } from "next-intl";
import { ArrowLeft, ChevronsRight } from "lucide-react";
import { cn } from "@/shared/lib/cn";
import { MOTION } from "@/shared/motion";
import { BrandMark } from "@/shared/ui";

interface Props {
  className?: string;
  /** 없으면 pill 이 클릭 불가(확장 상태가 없는 surface) — chevron 도 숨김. */
  onExpand?: () => void;
  title?: string;
  /** 'eyebrow' 상태는 보통 순문자열, 'census' 상태는 개념/관계 숫자
   *  세그먼트가 <b> 각인(engraved-numeral 토큰)으로 볼드 처리된 ReactNode
   *  (next-intl `t.rich` 결과) — feat/chrome-finish 세그먼트 각인. */
  subtitle?: ReactNode;
  /** subtitle 뒤에 붙는 "성장 신호" 조각(예: " · 이번 주 +1") — census 상태에서만
   *  넘긴다. amber 는 허브 노드 전용(design.md)이라 여기선 인디고로 강조. */
  censusGrowthText?: string;
  /** 'eyebrow'(기본) = 대문자 변환 + 넓은 자간(breadcrumb 성격의 상태 문구).
   *  'census' = 소문자 그대로 + mono(개념/관계 실측 통계 한 줄, 시안의
   *  "타이틀+census 각인"). 상태에 따라 subtitle 의 의미가 달라서 분리했다 —
   *  대문자 변환을 없애면 영문 로케일의 eyebrow 문구(SELECTED CONCEPT 등)가
   *  같이 바뀌므로 census 상태에서만 켠다. */
  subtitleVariant?: "eyebrow" | "census";
  icon?: string | null;
  ariaLabel?: string;
  titleText?: string;
  /** Layer 1 drill-in 상태에서 한 번에 Workspace 지도로 복귀하는 링크.
   *  truthy 일 때 pill 왼쪽에 "← Workspace" 보조 버튼 노출. */
  workspaceMapHref?: string;
  onWorkspaceMapClick?: () => void;
  /** Active inspector 상태에서는 위치 breadcrumb 역할만 하도록 밀도를 낮춘다. */
  compact?: boolean;
  /**
   * vault 미선택 정적(static) 모드 — 지도가 이 프로젝트 자신의 dogfood
   * 샘플을 그리고 있음을 브랜드 pill 에서도 명시한다(root-first-open 판정
   * §3 — 필 + INDEX 캡션 두 곳에서 SAMPLE 명시). 앰버는 신호톤 재사용,
   * 새 채색 시스템 아님.
   */
  sampleBadge?: boolean;
}

export function HeroCollapsed({
  className,
  onExpand,
  title,
  subtitle,
  censusGrowthText,
  subtitleVariant = "eyebrow",
  icon,
  ariaLabel,
  titleText,
  workspaceMapHref,
  onWorkspaceMapClick,
  compact = false,
  sampleBadge = false,
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
          className="group inline-flex size-[var(--topology-chrome-control-height)] shrink-0 items-center justify-center rounded-full border border-[color:var(--color-divider)] bg-[color:var(--color-panel)] text-[color:var(--color-text-quaternary)] shadow-[var(--topology-chrome-shadow)] transition-colors hover:border-[color:rgba(224,196,140,0.35)] hover:text-[color:var(--color-text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:rgba(224,196,140,0.46)] focus-visible:ring-offset-2 focus-visible:ring-offset-[color:var(--color-canvas)]"
        >
          <ArrowLeft className="size-[var(--topology-chrome-icon-size)]" />
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
        // 브랜드 필 — feat/chrome-system §5, rounded-full(원형) → --chrome-radius
        // (10px, 정사각) 전환. 표면/보더/그림자도 --chrome-* 로 이관해 우측
        // 액션 lane(여전히 원형 pill, --topology-chrome-*)과 형태를 분리한다.
        // 소유자 라이브 피드백 — 2줄(타이틀+census) 리듬이 고정 height 에서
        // 갑갑해 보임. min-h + 소폭 py 로 전환해 내용이 눌리지 않게(내용이
        // 더 필요하면 자연히 커짐 — 매직 px 추측 대신 콘텐츠 기준 안전).
        "group inline-flex items-center rounded-[var(--chrome-radius)] border border-[color:var(--chrome-border)] bg-[color:var(--chrome-surface)] shadow-[var(--chrome-shadow)] transition-colors hover:border-[color:var(--color-border-strong)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:rgba(94,106,210,0.46)] focus-visible:ring-offset-2 focus-visible:ring-offset-[color:var(--color-canvas)]",
        compact
          ? "min-h-[var(--topology-chrome-control-height-compact)] gap-1.5 py-0.5 pl-1.5 pr-2.5 opacity-80"
          : "min-h-[var(--topology-chrome-control-height)] gap-[var(--topology-chrome-gap)] py-1 pl-1.5 pr-3",
        className,
      )}
    >
      {icon ? (
        <span
          aria-hidden="true"
          className={cn(
            "inline-flex shrink-0 items-center justify-center rounded-full border border-[color:var(--color-border-soft)] bg-[color:var(--color-overlay-1)]",
            compact
              ? "size-[var(--topology-chrome-badge-size-compact)] text-xs"
              : "size-[var(--topology-chrome-badge-size)] text-base",
          )}
        >
          {icon}
        </span>
      ) : (
        // pip — 브랜드 마크(`BrandMark`, 후보 A "헥사 별자리" 확정,
        // `docs/prototypes/app-icon-concepts.html` 소유자 최종 승인). 좌측
        // 내비 레일 로고(`AppNavRail`)와 같은 컴포넌트를 15px·compact 로 쓴다
        // — 두 표면이 같은 브랜드 마크를 보여준다.
        <span
          aria-hidden="true"
          className={cn(
            "inline-flex shrink-0 items-center justify-center rounded-[8px] border border-[color:rgba(94,106,210,0.3)] bg-[color:rgba(94,106,210,0.14)] text-[color:var(--color-indigo-accent)]",
            compact
              ? "size-[var(--topology-chrome-badge-size-compact)]"
              : "size-[var(--topology-chrome-badge-size)]",
          )}
        >
          <BrandMark size={15} detail="compact" />
        </span>
      )}
      <span className="flex min-w-0 flex-col items-start gap-0.5">
        <span
          translate="no"
          className={cn(
            "truncate font-[var(--font-weight-signature)] text-[color:var(--color-text-primary)]",
            compact
              ? "max-w-[92px] text-[12px]"
              : "max-w-[110px] text-[length:var(--topology-chrome-title-size)]",
          )}
        >
          {resolvedTitle}
        </span>
        <span
          className={cn(
            "font-mono text-[color:var(--color-text-quaternary)]",
            subtitleVariant === "eyebrow" && "uppercase tracking-[0.08em]",
            compact ? "sr-only" : "text-[length:var(--topology-chrome-eyebrow-size)]",
          )}
        >
          {resolvedSubtitle}
          {censusGrowthText ? (
            <span className="text-[color:var(--color-indigo-accent)]">{censusGrowthText}</span>
          ) : null}
        </span>
      </span>
      {sampleBadge && !compact ? (
        <span
          data-testid="hero-sample-badge"
          className="shrink-0 rounded-[4px] border border-[color:rgba(212,180,120,0.4)] px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-[0.14em] text-[color:var(--color-status-warning)]"
        >
          {t("sampleBadge")}
        </span>
      ) : null}
      {onExpand && !compact ? (
        <ChevronsRight
          className="size-[var(--topology-chrome-icon-size-sm)] text-[color:var(--color-text-quaternary)] transition-colors group-hover:text-[color:var(--color-text-secondary)]"
        />
      ) : null}
    </motion.button>
    {/* book/network 유틸 타일 제거(feat/chrome-system) — 좌측 내비 레일
        (`AppNavRail`)이 문서함/빌더 목적지를 전담한다. */}
    </div>
  );
}
