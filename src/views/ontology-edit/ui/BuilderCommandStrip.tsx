"use client";

import { useTranslations } from "next-intl";
import { Info, PencilLine, ShieldCheck } from "lucide-react";
import { Link } from "@/i18n/navigation";
import type { BuilderCommandStripState } from "../lib/builder-command-strip-state";

/**
 * 헤더 아래 컨텍스트 액션 줄 — 선택/초안/관계 상태별 primary(추가/열기) ·
 * secondary(검증·저장 상태) 액션 한 쌍. 예전엔 헤더 1행 안에 있었으나 A3 에서
 * 헤더가 시안 문법(브레드크럼+census / dirty / 유틸+내보내기) 단일 행이 되며
 * 이 줄로 내려왔다 — 기능은 무변(OntologyEditPage.tsx A4 분해, 물리 이동만).
 */
export function BuilderCommandStrip({
  state,
  draftNodes,
  draftEdges,
  selectedTitle,
  onPrimaryAction,
  onSecondaryAction,
  secondaryHref,
}: {
  state: BuilderCommandStripState;
  draftNodes: number;
  draftEdges: number;
  selectedTitle?: string | null;
  onPrimaryAction: () => void;
  onSecondaryAction: () => void;
  secondaryHref?: "/ontology/insights/" | `/ontology/insights/?node=${string}`;
}) {
  const t = useTranslations("ontologyPages.edit.page.commandStrip");
  const primaryLabel = t(`${state}.primary`);
  const secondaryLabel = t(`${state}.secondary`);
  const contextualSecondaryLabel = selectedTitle
    ? `${selectedTitle} ${secondaryLabel}`
    : secondaryLabel;
  const primaryIcon =
    state === "empty" ||
    state === "selectedProject" ||
    state === "selectedDomain" ||
    state === "selectedCapability"
      ? PencilLine
      : state === "relationReview"
        ? ShieldCheck
        : Info;
  const PrimaryIcon = primaryIcon;
  return (
    <section
      aria-label={t("ariaLabel")}
      className="flex min-w-[min(100%,280px)] max-w-full flex-1 flex-col items-stretch gap-2 rounded-md border border-[color:var(--color-indigo-a18)] bg-[color:var(--color-indigo-a06)] px-2 py-1 sm:flex-row sm:items-center"
    >
      <div className="min-w-0 flex-1">
        <p className="truncate text-label font-[var(--font-weight-signature)] text-[color:var(--color-text-primary)]">
          {t(`${state}.title`, {
            nodes: draftNodes,
            edges: draftEdges,
            title: selectedTitle ?? t("selectedFallback"),
          })}
        </p>
        <p className="hidden truncate text-caption leading-4 text-[color:var(--color-text-quaternary)] xl:block">
          {t(`${state}.body`, {
            nodes: draftNodes,
            edges: draftEdges,
            title: selectedTitle ?? t("selectedFallback"),
          })}
        </p>
      </div>
      <div className="grid shrink-0 grid-cols-2 items-center gap-1 sm:flex">
        <button
          type="button"
          onClick={onPrimaryAction}
          aria-label={primaryLabel}
          title={primaryLabel}
          className="inline-flex h-8 items-center justify-center gap-1 rounded-md border border-[color:var(--color-indigo-a34)] bg-[color:var(--color-indigo-a14)] px-2.5 text-caption font-[var(--font-weight-signature)] text-[color:var(--color-text-primary)] transition-colors hover:border-[color:var(--color-indigo-a52)] hover:bg-[color:var(--color-indigo-a20)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-indigo-ring-a46)] focus-visible:ring-inset"
        >
          <PrimaryIcon size={12} />
          <span>{primaryLabel}</span>
        </button>
        {secondaryHref ? (
          <Link
            href={secondaryHref}
            aria-label={contextualSecondaryLabel}
            title={contextualSecondaryLabel}
            className="inline-flex h-8 items-center justify-center gap-1 rounded-md border border-[color:var(--color-indigo-a30)] bg-[color:var(--color-indigo-a10)] px-2.5 text-caption font-[var(--font-weight-signature)] text-[color:var(--color-text-primary)] shadow-[0_1px_0_var(--color-tap-highlight)_inset] transition-[border-color,background-color,transform] hover:border-[color:var(--color-indigo-a52)] hover:bg-[color:var(--color-indigo-a16)] active:translate-y-px focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-indigo-a42)] focus-visible:ring-inset motion-reduce:transition-colors motion-reduce:active:translate-y-0"
          >
            <ShieldCheck size={12} />
            <span>{secondaryLabel}</span>
          </Link>
        ) : (
          <button
            type="button"
            onClick={onSecondaryAction}
            aria-label={contextualSecondaryLabel}
            title={contextualSecondaryLabel}
            className="inline-flex h-8 items-center justify-center gap-1 rounded-md border border-[color:var(--color-overlay-3)] bg-[color:var(--color-overlay-a03)] px-2.5 text-caption text-[color:var(--color-text-tertiary)] transition-colors hover:border-[color:var(--color-indigo-line-a32)] hover:text-[color:var(--color-text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-indigo-a38)] focus-visible:ring-inset"
          >
            <ShieldCheck size={12} />
            <span>{secondaryLabel}</span>
          </button>
        )}
      </div>
    </section>
  );
}
