"use client";

import type { ReactNode } from "react";
import type { useTranslations } from "next-intl";
import { FilePlus2 } from "lucide-react";

import { cn } from "@/shared/lib/cn";
import { ActionFeedbackGlyph, type ActionFeedbackState } from "@/shared/motion/status-glyphs/ActionFeedbackGlyph";
import { controlClass } from "@/shared/ui/control-class";
import { Sheet } from "@/shared/ui/marks/sheet";
import { ICON_SIZE } from "@/shared/ui/tokens/icon-size";

type LibraryT = ReturnType<typeof useTranslations<"library">>;

/** The three formats a person most often has, fanned so each reads as its own file. */
const SAMPLE_SHEETS = [
  { name: "Requirements.pdf", format: "PDF", tilt: -7, x: -40 },
  { name: "Proposal.docx", format: "DOCX", tilt: 0, x: 0 },
  { name: "Budget.xlsx", format: "XLSX", tilt: 7, x: 40 },
] as const;

/**
 * The one place files go. While files are dragged over the window its border takes the accent and
 * the sheets lift, each a beat after the last; under reduced motion the swap is immediate.
 */
export function SourceDropArea({
  over,
  busy,
  onAddFiles,
  addFilesFeedback,
  line,
  t,
}: {
  over: boolean;
  busy: boolean;
  onAddFiles: () => void;
  addFilesFeedback: ActionFeedbackState;
  /** The running or finished copy's line, in place of the formats note. */
  line: ReactNode;
  t: LibraryT;
}) {
  return (
    <section
      data-testid="library-start-drop"
      data-over={over || undefined}
      aria-label={t("start.drop.title")}
      className={cn(
        "flex w-full flex-col items-center gap-3 rounded-panel border border-dashed px-6 pt-7 pb-5 text-center transition-[border-color,background-color] duration-[var(--motion-base)] ease-[var(--motion-ease)]",
        over
          ? "border-[color:var(--color-indigo-accent)] bg-[color:var(--color-indigo-a06)]"
          : "border-[color:var(--color-border-strong)] bg-[color:var(--color-overlay-1)]",
      )}
    >
      <span aria-hidden className="relative block h-[3.25rem] w-36">
        {SAMPLE_SHEETS.map((sheet, index) => (
          <span
            key={sheet.format}
            className="absolute left-1/2 top-0 transition-transform duration-[var(--motion-settle)] ease-[var(--motion-ease)] [transition-delay:calc(var(--motion-stagger)*var(--sheet-step,0))]"
            style={{
              transform: `translateX(calc(-50% + ${sheet.x}px)) translateY(${over ? -6 : 0}px) rotate(${sheet.tilt}deg)`,
              ["--sheet-step" as string]: over ? index : 0,
            }}
          >
            <Sheet variant="source" name={sheet.name} format={sheet.format} />
          </span>
        ))}
      </span>
      <p data-testid="library-start-drop-title" className="text-body-lg font-[var(--font-weight-emphasis)] text-[color:var(--color-text-primary)]">
        {over ? t("start.drop.over") : t("start.drop.title")}
      </p>
      <div className="flex items-center gap-2 text-body text-[color:var(--color-text-tertiary)]">
        <span>{t("start.drop.or")}</span>
        <button
          type="button"
          onClick={onAddFiles}
          disabled={busy}
          data-testid="library-start-add-files"
          aria-busy={addFilesFeedback === "working" || undefined}
          className={controlClass({
            shape: "chip",
            size: "lg",
            tone: "strong",
            hoverSurface: "lift",
            hoverBorder: "strong",
            className: "gap-1.5",
          })}
        >
          <ActionFeedbackGlyph state={addFilesFeedback} icon={<FilePlus2 size={ICON_SIZE.sm} aria-hidden />} size={ICON_SIZE.sm} />
          {t("sources.add")}
        </button>
      </div>
      {line ?? (
        <p className="max-w-[34rem] text-label text-[color:var(--color-text-tertiary)]">{t("start.drop.formats")}</p>
      )}
    </section>
  );
}
