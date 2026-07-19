"use client";

import { useTranslations } from "next-intl";
import { Database, Network, PencilLine } from "lucide-react";
import type { BuilderEntryAnchor } from "../lib/builder-entry-anchors";
import { isOntologyKind } from "../lib/is-ontology-kind";
import { formatBuilderActiveFocusLabel } from "../lib/format-builder-anchor-labels";

/**
 * 캔버스 좌상단 저장된 개념 앵커 레일 — 접힘(칩 하나) / 펼침(기준 앵커+통계)
 * 두 상태. (OntologyEditPage.tsx A4 분해 — 기능/props 무변, 물리 이동만.)
 */
export function BuilderCanvasEntryRail({
  anchors,
  nodeCount,
  relationCount,
  selectedAnchorId,
  expanded,
  onToggleExpanded,
  onFocusAnchor,
  onOpenAnchors,
}: {
  anchors: BuilderEntryAnchor[];
  nodeCount: number;
  relationCount: number;
  selectedAnchorId?: string | null;
  expanded: boolean;
  onToggleExpanded: () => void;
  onFocusAnchor: (id: string) => void;
  onOpenAnchors?: () => void;
}) {
  const t = useTranslations("ontologyPages.edit.page.canvasEntryRail");
  const tKinds = useTranslations("kinds");
  if (anchors.length === 0) return null;
  const selectedAnchor = anchors.find((anchor) => anchor.id === selectedAnchorId);
  const primaryAnchor = selectedAnchor ?? anchors[0];
  const primaryAnchorKindLabel =
    isOntologyKind(primaryAnchor.kind)
      ? tKinds(primaryAnchor.kind)
      : primaryAnchor.kind;
  const hiddenAnchorCount = Math.max(0, anchors.length - 1);
  const selectedAnchorSlug = selectedAnchor?.id ?? selectedAnchorId ?? null;
  const selectedAnchorLabel = selectedAnchor?.label ?? selectedAnchorSlug ?? null;
  const collapsedRailLabel = selectedAnchorSlug
    ? `${t("collapsedAriaLabel", {
        nodes: nodeCount,
        relations: relationCount,
      })} · ${t("activeFocusAriaLabel", { slug: selectedAnchorSlug })}`
    : t("collapsedAriaLabel", {
        nodes: nodeCount,
        relations: relationCount,
      });
  const flow = [
    {
      step: "01",
      label: t("flowFocus"),
      icon: Network,
    },
    {
      step: "02",
      label: t("flowWrite"),
      icon: PencilLine,
    },
    {
      step: "03",
      label: t("flowProof"),
      icon: Database,
    },
  ] as const;

  if (!expanded) {
    return (
      <div
        id="builder-canvas-entry-rail"
        role="region"
        aria-label={t("collapsedAriaLabel", {
          nodes: nodeCount,
          relations: relationCount,
        })}
        className="pointer-events-none absolute left-3 top-3 z-10 max-w-[min(420px,calc(100%-1.5rem))]"
      >
        <button
          type="button"
          aria-expanded={false}
          aria-controls="builder-canvas-entry-rail"
          aria-label={collapsedRailLabel}
          title={t("hint")}
          onClick={onToggleExpanded}
          className="pointer-events-auto flex h-8 max-w-full items-center gap-1.5 rounded-lg border border-[color:var(--color-indigo-a24)] bg-[color:var(--color-panel-overlay-a88)] px-2.5 text-left text-[11px] text-[color:var(--color-text-secondary)] shadow-[0_10px_32px_var(--color-shadow-a22)] transition-colors hover:border-[color:var(--color-indigo-a42)] hover:text-[color:var(--color-text-primary)]"
        >
          <Network size={12} className="shrink-0 text-[color:var(--color-indigo-accent)]" />
          <span className="shrink-0 font-[var(--font-weight-signature)]">
            {t("collapsedLabel")}
          </span>
          {selectedAnchorSlug ? (
            <span
              aria-label={t("activeFocusAriaLabel", { slug: selectedAnchorSlug })}
              className="min-w-0 truncate text-[10px] text-[color:var(--color-text-quaternary)]"
              title={selectedAnchorLabel ?? undefined}
            >
              {formatBuilderActiveFocusLabel(t("activeFocusVisibleLabel"), selectedAnchorSlug)}
            </span>
          ) : (
            <span className="min-w-0 truncate font-mono text-[9px] uppercase tracking-[0.08em] text-[color:var(--color-text-quaternary)]">
              {t("collapsedStats", { nodes: nodeCount, relations: relationCount })}
            </span>
          )}
        </button>
      </div>
    );
  }

  return (
    <div
      id="builder-canvas-entry-rail"
      role="region"
      aria-label={t("ariaLabel", { nodes: nodeCount, relations: relationCount })}
      className="pointer-events-none absolute left-3 right-3 top-3 z-10 rounded-lg border border-[color:var(--color-border-soft)] bg-[color:var(--color-panel-overlay-a94)] px-2 py-1.5"
    >
      <p className="sr-only">
        {t("hint")} {flow.map((item) => `${item.step} ${item.label}`).join(" · ")}
      </p>
      <div className="flex items-center gap-1.5">
        <div className="flex min-w-0 items-center gap-1.5">
          <Network size={12} className="text-[color:var(--color-indigo-accent)]" />
          <p className="font-mono text-[9px] uppercase tracking-[0.14em] text-[color:var(--color-text-quaternary)]">
            {t("label")}
          </p>
        </div>
        <p className="hidden font-mono text-[10px] uppercase tracking-[0.08em] text-[color:var(--color-text-tertiary)] lg:block">
          {t("stats", { nodes: nodeCount, relations: relationCount })}
        </p>
        <button
          type="button"
          aria-expanded={true}
          aria-controls="builder-canvas-entry-rail"
          onClick={onToggleExpanded}
          className="pointer-events-auto hidden h-6 shrink-0 items-center rounded-md border border-[color:var(--color-border-soft)] px-1.5 font-mono text-[9px] uppercase tracking-[0.08em] text-[color:var(--color-text-quaternary)] transition-colors hover:border-[color:var(--color-indigo-a38)] hover:text-[color:var(--color-text-primary)] sm:inline-flex"
        >
          {t("collapseAction")}
        </button>
        <span
          className="hidden rounded-md border border-[color:var(--color-indigo-a22)] bg-[color:var(--color-indigo-a08)] px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-[0.08em] text-[color:var(--color-indigo-accent)] sm:inline-flex"
          title={t("hint")}
        >
          {t("focusChip")}
        </span>
        {selectedAnchorSlug ? (
          <span
            aria-label={t("activeFocusAriaLabel", { slug: selectedAnchorSlug })}
            className="max-w-[230px] truncate rounded-md border border-[color:var(--color-indigo-line-a22)] bg-[color:var(--color-indigo-line-a06)] px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-[0.08em] text-[color:var(--color-text-secondary)]"
            title={selectedAnchorLabel ?? undefined}
          >
            {t("activeFocus", { slug: selectedAnchorSlug })}
          </span>
        ) : null}
        <div className="ml-auto flex min-w-0 items-center gap-1.5">
          <button
            type="button"
            aria-pressed={selectedAnchorId === primaryAnchor.id}
            aria-label={t("anchorAriaLabel", {
              kind: primaryAnchorKindLabel,
              label: primaryAnchor.label,
              slug: primaryAnchor.id,
              degree: primaryAnchor.degree,
            })}
            onClick={() => onFocusAnchor(primaryAnchor.id)}
            data-anchor-slug={primaryAnchor.id}
            className={
              selectedAnchorId === primaryAnchor.id
                ? "pointer-events-auto flex h-7 min-w-0 max-w-[250px] shrink items-center gap-1.5 rounded-md border border-[color:var(--color-indigo-line-a42)] bg-[color:var(--color-indigo-line-a15)] px-2 text-left text-[10px] text-[color:var(--color-text-primary)] transition-colors hover:border-[color:var(--color-indigo-line-a54)]"
                : "pointer-events-auto flex h-7 min-w-0 max-w-[250px] shrink items-center gap-1.5 rounded-md border border-[color:var(--color-indigo-a22)] bg-[color:var(--color-indigo-a08)] px-2 text-left text-[10px] text-[color:var(--color-text-secondary)] transition-colors hover:border-[color:var(--color-indigo-a38)] hover:bg-[color:var(--color-indigo-a13)] hover:text-[color:var(--color-text-primary)]"
            }
            title={t("anchorTitle", {
              kind: primaryAnchorKindLabel,
              label: primaryAnchor.label,
              slug: primaryAnchor.id,
              degree: primaryAnchor.degree,
            })}
          >
            <span className="shrink-0 font-mono uppercase tracking-[0.10em] text-[color:var(--color-text-quaternary)]">
              {primaryAnchor.kind.slice(0, 1)}
            </span>
            <span className="min-w-0 flex-1 truncate">
              {primaryAnchor.label}
            </span>
            <span className="sr-only">
              {t("anchorSlugLabel", { slug: primaryAnchor.id })}
            </span>
            <span
              aria-label={t("degreeAriaLabel", { degree: primaryAnchor.degree })}
              className={
                selectedAnchorId === primaryAnchor.id
                  ? "ml-auto shrink-0 rounded border border-[color:var(--color-indigo-line-a22)] bg-[color:var(--color-overlay-recessed-a20)] px-1 font-mono text-[9px] tabular-nums text-[color:var(--color-text-secondary)]"
                  : "ml-auto shrink-0 rounded border border-[color:var(--color-divider)] bg-[color:var(--color-overlay-recessed)] px-1 font-mono text-[9px] tabular-nums text-[color:var(--color-text-quaternary)]"
              }
            >
              {primaryAnchor.degree}
            </span>
          </button>
          {hiddenAnchorCount > 0 && onOpenAnchors ? (
            <button
              type="button"
              onClick={onOpenAnchors}
              aria-label={t("openAnchorDialogAriaLabel", { count: hiddenAnchorCount })}
              className="pointer-events-auto flex h-7 shrink-0 items-center rounded-md border border-[color:var(--color-border-soft)] bg-[color:var(--color-overlay-a03)] px-2 font-mono text-[9px] uppercase tracking-[0.08em] text-[color:var(--color-text-tertiary)] transition-colors hover:border-[color:var(--color-indigo-a38)] hover:text-[color:var(--color-text-primary)]"
            >
              {t("openAnchorDialog", { count: hiddenAnchorCount })}
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
