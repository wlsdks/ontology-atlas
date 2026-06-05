"use client";

import { useTranslations } from "next-intl";
import { ChevronLeft, ChevronRight } from "lucide-react";
import {
  getOntologyKindIcon,
  getOntologyKindTone,
  useOntologyKindLabel,
} from "@/entities/ontology-class";
import type { ManualNodeKind } from "@/entities/knowledge-graph";

/**
 * 빌더 좌측 palette — kind 4종 클릭 시 캔버스 가운데에 임시 노드 추가.
 *
 * 시각:
 * - kind 별 미니 아이콘 + 공용 tone swatch (`getOntologyKindTone`)
 * - hover 시 공용 kind hue 의 border/background 만 강화
 * - label + hint 2-line hierarchy
 *
 * collapsed 시 248→44px 로 축소, 아이콘만 노출. 인스펙터와 같은 폭으로
 * 좌우 대칭 + 사용자가 캔버스 공간 더 필요할 때 접을 수 있다.
 */
const PALETTE_KINDS: Array<{
  kind: ManualNodeKind;
  hintKey: "kindProjectHint" | "kindDomainHint" | "kindCapabilityHint" | "kindElementHint";
  /** 키보드 단축키 — palette 클릭과 1:1 (P/D/C/E). */
  shortcut: "P" | "D" | "C" | "E";
}> = [
  { kind: "project", hintKey: "kindProjectHint", shortcut: "P" },
  { kind: "domain", hintKey: "kindDomainHint", shortcut: "D" },
  { kind: "capability", hintKey: "kindCapabilityHint", shortcut: "C" },
  { kind: "element", hintKey: "kindElementHint", shortcut: "E" },
];

export interface OntologyKindPaletteProps {
  onAddNode: (kind: ManualNodeKind) => void;
  collapsed?: boolean;
  onToggleCollapsed?: () => void;
}

export function OntologyKindPalette({
  onAddNode,
  collapsed = false,
  onToggleCollapsed,
}: OntologyKindPaletteProps) {
  const t = useTranslations("ontologyPages.edit.palette");
  const kindLabel = useOntologyKindLabel();

  if (collapsed) {
    return (
      <aside
        aria-label={t("ariaLabel")}
        className="flex h-full w-11 shrink-0 flex-col items-center gap-2 border-r border-[color:var(--color-border-soft)] bg-[color:var(--color-elevated)] py-3"
      >
        {onToggleCollapsed ? (
          <button
            type="button"
            onClick={onToggleCollapsed}
            aria-label={t("expandAriaLabel")}
            title={t("expandAriaLabel")}
            className="flex h-8 w-8 items-center justify-center rounded-md text-[color:var(--color-text-tertiary)] transition-colors hover:bg-[color:var(--color-overlay-2)] hover:text-[color:var(--color-text-primary)]"
          >
            <ChevronRight size={15} />
          </button>
        ) : null}
        <ul className="flex flex-col gap-1.5">
          {PALETTE_KINDS.map((entry) => {
            const Icon = getOntologyKindIcon(entry.kind);
            const label = kindLabel(entry.kind);
            const hint = t(entry.hintKey);
            const tone = getOntologyKindTone(entry.kind);
            return (
              <li key={entry.kind}>
                <button
                  type="button"
                  onClick={() => onAddNode(entry.kind)}
                  aria-label={t("addAriaLabel", { label, hint })}
                  title={`${label} (${entry.shortcut})`}
                  className="group flex h-9 w-9 items-center justify-center rounded-md border bg-[color:var(--color-elevated)] transition-colors hover:bg-[color:var(--color-overlay-1)]"
                  style={{ borderColor: tone.chipBorder, color: tone.border }}
                >
                  <Icon size={14} />
                </button>
              </li>
            );
          })}
        </ul>
      </aside>
    );
  }

  return (
    <aside
      aria-label={t("ariaLabel")}
      className="flex h-full w-[248px] shrink-0 flex-col gap-2 overflow-y-auto border-r border-[color:var(--color-border-soft)] bg-[color:var(--color-panel)] p-2.5"
    >
      <header className="flex items-center justify-between gap-2 px-1">
        <div className="flex-1">
          <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-[color:var(--color-text-quaternary)]">
            {t("eyebrow")}
          </p>
          <p className="mt-0.5 text-[11px] leading-4 text-[color:var(--color-text-quaternary)]">
            {t("subtitle")}
          </p>
        </div>
        {onToggleCollapsed ? (
          <button
            type="button"
            onClick={onToggleCollapsed}
            aria-label={t("collapseAriaLabel")}
            title={t("collapseAriaLabel")}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-[color:var(--color-text-quaternary)] transition-colors hover:bg-[color:var(--color-overlay-2)] hover:text-[color:var(--color-text-primary)]"
          >
            <ChevronLeft size={15} />
          </button>
        ) : null}
      </header>
      <ul className="flex flex-col gap-1">
        {PALETTE_KINDS.map((entry) => {
          const Icon = getOntologyKindIcon(entry.kind);
          const label = kindLabel(entry.kind);
          const hint = t(entry.hintKey);
          const tone = getOntologyKindTone(entry.kind);
          return (
            <li key={entry.kind}>
              <button
                type="button"
                onClick={() => onAddNode(entry.kind)}
                className="group flex w-full items-start gap-2 rounded-md border bg-[color:var(--color-elevated)] px-2.5 py-2 text-left transition-colors hover:bg-[color:var(--color-overlay-1)]"
                style={{ borderColor: tone.chipBorder }}
                aria-label={t("addAriaLabel", { label, hint })}
              >
                <span
                  aria-hidden
                  className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md border transition-colors"
                  style={{
                    backgroundColor: tone.chipBg,
                    borderColor: tone.chipBorder,
                    color: tone.border,
                  }}
                >
                  <Icon size={14} />
                </span>
                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="flex items-center justify-between gap-2">
                    <span className="text-[13px] font-medium text-[color:var(--color-text-primary)]">
                      {label}
                    </span>
                    <kbd
                      aria-hidden
                      className="shrink-0 rounded border border-[color:var(--color-overlay-3)] bg-[color:var(--color-overlay-1)] px-1.5 py-px font-mono text-[9px] uppercase tracking-[0.06em] text-[color:var(--color-text-quaternary)] transition-colors group-hover:text-[color:var(--color-text-tertiary)]"
                    >
                      {entry.shortcut}
                    </kbd>
                  </span>
                  <span className="text-[11px] leading-4 text-[color:var(--color-text-quaternary)] transition-colors group-hover:text-[color:var(--color-text-tertiary)]">
                    {hint}
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      <footer className="mt-auto px-1 pt-3">
        <p className="text-[10px] leading-4 text-[color:var(--color-text-quaternary)]">
          {t("footerHint")}
        </p>
      </footer>
    </aside>
  );
}
