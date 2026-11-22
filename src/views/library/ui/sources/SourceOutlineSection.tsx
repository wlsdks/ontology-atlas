"use client";

import type { useTranslations } from "next-intl";
import { Hash } from "lucide-react";

import { controlClass } from "@/shared/ui/control-class";
import { ICON_SIZE } from "@/shared/ui/tokens/icon-size";
import type { SourceOutlineState } from "../../lib/sources/use-source-outline";
import { outlineSummary } from "../../model/sources/source-outline-rows";
import { PANE_LIST_BLEED, PANE_ROW_INSET } from "./source-pane-layout";

/** Names the outline section (`source.outline.title`) to a screen reader, through its own `aria-labelledby`. */
const SOURCE_OUTLINE_HEADING_ID = "library-source-outline-heading";

/**
 * The file's own shape: counts and names only, never bodies (a pane rendering whole documents would
 * be a converted copy, `docs/DECISIONS.md`). Each heading is a press to its address.
 */
export function SourceOutlineSection({ outline, onOpenPassage, t }: {
  outline: SourceOutlineState;
  onOpenPassage?: (anchor: string) => void;
  t: ReturnType<typeof useTranslations<"library">>;
}) {
  const { rows: outlineList, count, unreadable: outlineUnreadable } = outlineSummary(outline, t);
  return (
    <section
      data-testid="library-source-outline"
      data-state={outline.phase === "ready" ? (outlineUnreadable ? "unreadable" : "ready") : outline.phase}
      aria-labelledby={SOURCE_OUTLINE_HEADING_ID}
      className="mt-5 border-t border-[color:var(--color-border-soft)] pt-4"
    >
      <h3
        id={SOURCE_OUTLINE_HEADING_ID}
        className="font-mono text-caption uppercase tracking-[var(--tracking-caps-14)] text-[color:var(--color-text-quaternary)]"
      >
        {t("source.outline.title")}
        {count ? (
          <span data-testid="library-source-outline-count"> · {count}</span>
        ) : null}
      </h3>
      {outline.phase === "reading" ? (
        <p className="mt-2 text-body leading-body text-[color:var(--color-text-primary)] [word-break:keep-all]">
          {t("source.outline.reading")}
        </p>
      ) : outline.phase === "failed" || !outline.outline ? (
        <p
          data-testid="library-source-outline-failed"
          className="mt-2 text-body leading-body text-[color:var(--color-text-primary)] [word-break:keep-all]"
        >
          {t("source.outline.failed")}
        </p>
      ) : outlineUnreadable ? (
        /*
         * A format whose shape this reader does not know says so and prints no number: a PDF yields no units,
         * and "0 parts" would be untrue. A heading-free text or HTML file reaches the same sentence; the Finder
         * door stays as the honest answer in both.
         */
        <p
          data-testid="library-source-outline-unreadable"
          className="mt-2 text-body leading-body text-[color:var(--color-text-primary)] [word-break:keep-all]"
        >
          {t("source.outline.unreadable")}
        </p>
      ) : (
        <ul data-testid="library-source-outline-list" className={`mt-2 flex flex-col gap-1 ${PANE_LIST_BLEED}`}>
          {outlineList.map((line, index) => (
            <li key={`${index}-${line.anchor ?? line.text}`}>
              {line.anchor && onOpenPassage ? (
                /* A heading is an address, so it is a press; neutral ink with a `#` glyph matches the write-up rows. */
                <button
                  type="button"
                  data-testid={`library-source-outline-row-${line.anchor}`}
                  data-anchor={line.anchor}
                  onClick={() => onOpenPassage(line.anchor!)}
                  className={controlClass({
                    shape: "row",
                    size: "xs",
                    tone: "muted",
                    hoverInk: "strong",
                    hoverSurface: "lift",
                    className: `atlas-touch-floor w-full gap-2 ${PANE_ROW_INSET}`,
                  })}
                >
                  <Hash size={ICON_SIZE.sm} className="flex-none opacity-60" aria-hidden />
                  <span className="min-w-0 flex-1 truncate text-left">{line.text}</span>
                </button>
              ) : (
                <span className={`block ${PANE_ROW_INSET} text-body leading-body text-[color:var(--color-text-secondary)] [overflow-wrap:break-word] [word-break:keep-all]`}>
                  {line.text}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
