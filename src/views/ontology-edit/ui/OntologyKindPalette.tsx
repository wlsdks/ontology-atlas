"use client";

import { useTranslations } from "next-intl";
import { getOntologyKindIcon, useOntologyKindLabel } from "@/entities/ontology-class";
import type { ManualNodeKind } from "@/entities/knowledge-graph";

/**
 * 빌더 좌측 palette — kind 4종 클릭 시 캔버스 가운데에 임시 노드 추가.
 *
 * 시각:
 * - kind 별 미니 아이콘 (`getOntologyKindIcon` 공용 — Tree / Stub / Search 와 같음)
 * - hover 시 인디고 alpha 톤만 변화 (헌장 §11 — scale 없이 색만)
 * - label + hint 2-line hierarchy
 */
const PALETTE_KINDS: Array<{
  kind: Exclude<ManualNodeKind, "document">;
  hintKey: "kindProjectHint" | "kindDomainHint" | "kindCapabilityHint" | "kindElementHint";
}> = [
  { kind: "project", hintKey: "kindProjectHint" },
  { kind: "domain", hintKey: "kindDomainHint" },
  { kind: "capability", hintKey: "kindCapabilityHint" },
  { kind: "element", hintKey: "kindElementHint" },
];

export interface OntologyKindPaletteProps {
  onAddNode: (kind: Exclude<ManualNodeKind, "document">) => void;
}

export function OntologyKindPalette({ onAddNode }: OntologyKindPaletteProps) {
  const t = useTranslations("ontologyPages.edit.palette");
  const kindLabel = useOntologyKindLabel();
  return (
    <aside
      aria-label={t("ariaLabel")}
      className="flex h-full w-[200px] shrink-0 flex-col gap-2 overflow-y-auto border-r border-[color:var(--color-border-soft)] bg-[color:var(--color-elevated)] p-3"
    >
      <header>
        <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-[color:var(--color-text-quaternary)]">
          {t("eyebrow")}
        </p>
        <p className="mt-1 text-[12px] leading-5 text-[color:var(--color-text-tertiary)]">
          {t("subtitle")}
        </p>
      </header>
      <ul className="flex flex-col gap-1.5">
        {PALETTE_KINDS.map((entry) => {
          const Icon = getOntologyKindIcon(entry.kind);
          const label = kindLabel(entry.kind);
          const hint = t(entry.hintKey);
          return (
            <li key={entry.kind}>
              <button
                type="button"
                onClick={() => onAddNode(entry.kind)}
                className="group flex w-full items-start gap-2.5 rounded-md border border-[color:var(--color-divider)] bg-[color:var(--color-elevated)] px-3 py-2.5 text-left transition-colors hover:border-[color:rgba(94,106,210,0.46)] hover:bg-[color:rgba(94,106,210,0.08)]"
                aria-label={t("addAriaLabel", { label, hint })}
              >
                <span
                  aria-hidden
                  className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-[color:var(--color-divider)] bg-[color:var(--color-elevated)] text-[color:var(--color-text-tertiary)] transition-colors group-hover:border-[color:rgba(94,106,210,0.46)] group-hover:bg-[color:rgba(94,106,210,0.16)] group-hover:text-[color:var(--color-indigo-accent)]"
                >
                  <Icon size={14} />
                </span>
                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="text-[13px] font-medium text-[color:var(--color-text-primary)]">
                    {label}
                  </span>
                  <span className="text-[11px] leading-4 text-[color:var(--color-text-quaternary)] group-hover:text-[color:var(--color-text-tertiary)]">
                    {hint}
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      <footer className="mt-auto pt-3">
        <p className="text-[10px] leading-4 text-[color:var(--color-text-quaternary)]">
          {t("footerHint")}
        </p>
      </footer>
    </aside>
  );
}
