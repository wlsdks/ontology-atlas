"use client";

import {
  AlignStartHorizontal,
  AlignCenterHorizontal,
  AlignEndHorizontal,
  AlignStartVertical,
  AlignCenterVertical,
  AlignEndVertical,
  AlignHorizontalDistributeCenter,
  AlignVerticalDistributeCenter,
} from "lucide-react";
import { useTranslations } from "next-intl";
import type { AlignAction, AlignableNode } from "../lib/align-nodes";

type IconComponent = typeof AlignStartHorizontal;

function AlignBtn({
  action,
  label,
  Icon,
  disabled,
  onApply,
}: {
  action: AlignAction;
  label: string;
  Icon: IconComponent;
  disabled?: boolean;
  onApply: (action: AlignAction) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onApply(action)}
      disabled={disabled}
      aria-label={label}
      title={label}
      className="flex h-8 w-8 items-center justify-center rounded-md border border-[var(--color-overlay-3)] bg-[var(--color-panel)] text-[var(--color-text-secondary)] transition-colors hover:border-[var(--color-indigo-line-a54)] hover:text-[var(--color-text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-indigo-line-a54)] disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-[var(--color-overlay-3)] disabled:hover:text-[var(--color-text-secondary)]"
    >
      <Icon className="h-4 w-4" strokeWidth={1.8} />
    </button>
  );
}

/**
 * 다중 선택 시 캔버스 상단에 떠오르는 정렬 툴바.
 *  - 2 개 이상 선택 시 표시
 *  - L/R/T/B/center-x/center-y 6 정렬 + 가로/세로 분포 2 = 8 버튼
 *  - 분포는 3 개 이상 선택일 때만 활성 (그 외 disabled)
 *
 * 디자인 헌장 §11: 단일 인디고, glow / 보라 / scale hover 없음. panel
 * background + subtle border + 인디고 accent.
 */
export function AlignToolbar({
  selected,
  onApply,
}: {
  selected: AlignableNode[];
  onApply: (action: AlignAction) => void;
}) {
  const t = useTranslations("ontologyPages.edit.canvas.alignToolbar");
  if (selected.length < 2) return null;
  const canDistribute = selected.length >= 3;

  return (
    <div
      role="toolbar"
      aria-label={t("ariaLabel")}
      className="pointer-events-auto absolute top-3 left-1/2 z-20 flex -translate-x-1/2 items-center gap-1.5 rounded-lg border border-[var(--color-overlay-3)] bg-[var(--color-elevated)] px-2.5 py-1.5 shadow-[var(--shadow-elevation-1)]"
    >
      <span className="px-1 font-mono text-caption uppercase tracking-[0.10em] text-[var(--color-text-quaternary)]">
        {t("selectedCount", { count: selected.length })}
      </span>
      <span aria-hidden className="mx-1 h-4 w-px bg-[var(--color-overlay-3)]" />
      <AlignBtn action="left" label={t("left")} Icon={AlignStartVertical} onApply={onApply} />
      <AlignBtn action="center-x" label={t("centerX")} Icon={AlignCenterVertical} onApply={onApply} />
      <AlignBtn action="right" label={t("right")} Icon={AlignEndVertical} onApply={onApply} />
      <span aria-hidden className="mx-1 h-4 w-px bg-[var(--color-overlay-3)]" />
      <AlignBtn action="top" label={t("top")} Icon={AlignStartHorizontal} onApply={onApply} />
      <AlignBtn action="center-y" label={t("centerY")} Icon={AlignCenterHorizontal} onApply={onApply} />
      <AlignBtn action="bottom" label={t("bottom")} Icon={AlignEndHorizontal} onApply={onApply} />
      <span aria-hidden className="mx-1 h-4 w-px bg-[var(--color-overlay-3)]" />
      <AlignBtn
        action="distribute-h"
        label={canDistribute ? t("distributeH") : t("distributeHint")}
        Icon={AlignHorizontalDistributeCenter}
        disabled={!canDistribute}
        onApply={onApply}
      />
      <AlignBtn
        action="distribute-v"
        label={canDistribute ? t("distributeV") : t("distributeHint")}
        Icon={AlignVerticalDistributeCenter}
        disabled={!canDistribute}
        onApply={onApply}
      />
    </div>
  );
}
