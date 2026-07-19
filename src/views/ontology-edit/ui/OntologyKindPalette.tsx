"use client";

import { useTranslations } from "next-intl";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useOntologyKindLabel } from "@/entities/ontology-class";
import { ChromeTile, TopologyV2KindGlyph } from "@/shared/ui";
import type { ManualNodeKind } from "@/entities/knowledge-graph";

/**
 * 빌더 좌측 palette — kind 4종 클릭 시 캔버스 가운데에 임시 노드 추가.
 *
 * 시각 (빌더 v2 재스킨, `docs/prototypes/builder-v2-01-empty.html` 계약):
 * - kind 글리프는 `TopologyV2KindGlyph` — 지도(Topology) INDEX 패널과 같은
 *   실루엣/토큰(`--topology-v2-node-*`)을 그대로 재사용, 빌더가 새 시각
 *   언어를 발명하지 않는다.
 * - 카드는 kind 별 채색 칩/보더(`getOntologyKindTone`) 없이 중립
 *   `--color-border-soft` 하나로 통일 — kind 구분은 글리프 실루엣 자체가
 *   맡는다(색이 아닌 형태 문법, `docs/DESIGN-SYSTEM.md`).
 * - collapsed 시 `ChromeTile`(44px 정사각 · radius 10 · `--chrome-*` 문법)
 *   그대로 재사용 — 크롬 표면은 이 컴포넌트를 소비해야 한다는 규율 준수.
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
        className="flex h-full w-14 shrink-0 flex-col items-center gap-2 border-r border-[color:var(--color-border-soft)] bg-[color:var(--color-elevated)] py-3"
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
            const label = kindLabel(entry.kind);
            const hint = t(entry.hintKey);
            return (
              <li key={entry.kind} className="relative">
                <ChromeTile
                  icon={<TopologyV2KindGlyph kind={entry.kind} size={16} />}
                  title={`${label} (${entry.shortcut})`}
                  aria-label={t("addAriaLabel", { label, hint })}
                  onClick={() => onAddNode(entry.kind)}
                />
                {/* "+" 배지 — 접힌 팔레트에선 kind 글리프만 보여 클릭하면 새
                    개념 카드가 추가된다는 게 한눈에 안 드러났다(레이블 없이
                    아이콘만이라 필터 칩처럼 보일 위험). 새 색 없이 기존
                    인디고 배지 관례(`--color-indigo-brand` 채움 + 무채색
                    보더로 표면 분리)를 재사용해 "추가" 행동을 시각화. */}
                <span
                  aria-hidden="true"
                  data-palette-add-badge={entry.kind}
                  className="pointer-events-none absolute -bottom-1 -right-1 flex h-3.5 w-3.5 items-center justify-center rounded-full border border-[color:var(--color-panel)] bg-[color:var(--color-indigo-brand)] text-[9px] font-bold leading-none text-[color:var(--color-text-primary)]"
                >
                  +
                </span>
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
      className="flex h-full w-[240px] shrink-0 flex-col gap-2 overflow-y-auto border-r border-[color:var(--color-border-soft)] bg-[color:var(--color-panel)] p-2.5"
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
      <ul className="flex flex-col gap-1.5">
        {PALETTE_KINDS.map((entry) => {
          const label = kindLabel(entry.kind);
          const hint = t(entry.hintKey);
          return (
            <li key={entry.kind}>
              <button
                type="button"
                onClick={() => onAddNode(entry.kind)}
                className="group flex w-full items-center gap-2.5 rounded-[10px] border border-[color:var(--color-border-soft)] bg-[color:var(--color-elevated)] px-3 py-2.5 text-left transition-colors hover:border-[color:var(--color-border-strong)]"
                aria-label={t("addAriaLabel", { label, hint })}
              >
                <TopologyV2KindGlyph kind={entry.kind} size={18} />
                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="flex items-center justify-between gap-2">
                    <span className="text-[13px] font-medium text-[color:var(--color-text-primary)]">
                      {label}
                    </span>
                    <kbd
                      aria-hidden
                      className="shrink-0 rounded border border-[color:var(--color-divider)] bg-[color:var(--color-overlay-1)] px-1.5 py-px font-mono text-[9px] uppercase tracking-[0.06em] text-[color:var(--color-text-quaternary)] transition-colors group-hover:text-[color:var(--color-text-tertiary)]"
                    >
                      {entry.shortcut}
                    </kbd>
                  </span>
                  <span className="font-mono text-[10px] leading-4 tracking-[0.01em] text-[color:var(--color-text-quaternary)] transition-colors group-hover:text-[color:var(--color-text-tertiary)]">
                    {hint}
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      <footer className="mt-auto border-t border-[color:var(--color-divider)] px-1 pt-3">
        <p className="text-[11px] leading-[1.65] text-[color:var(--color-text-quaternary)]">
          {t("footerHint")}
        </p>
      </footer>
    </aside>
  );
}
