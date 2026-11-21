"use client";

import type { useTranslations } from "next-intl";
import { useEffect, useRef } from "react";

import { passageLabelText } from "@/features/library";
import { cn } from "@/shared/lib/cn";
import type { SourceUnit } from "@/shared/lib/library/source-passage";
import type { CitedPassageState } from "../../lib/sources/use-cited-passage";
import { citationKey } from "../../model/sources/source-summary-facts";

const SOURCE_PASSAGE_HEADING_ID = "library-source-passage-heading";

/**
 * One unit of the file's own text, verbatim. Context is quieter than the cited unit but not
 * `text-caption`: a hard-wrapped line ends mid-sentence, so context finishes what is being checked.
 */
function PassageLine({ unit, cited }: { unit: SourceUnit; cited: boolean }) {
  return (
    <p
      data-testid={cited ? "library-source-passage-cited" : "library-source-passage-context"}
      className={cn(
        "whitespace-pre-wrap [overflow-wrap:break-word] [word-break:keep-all]",
        cited
          ? "text-reading leading-prose text-[color:var(--color-text-primary)]"
          : "text-body leading-body text-[color:var(--color-text-tertiary)]",
      )}
    >
      {unit.text}
    </p>
  );
}

/**
 * The passage a citation named, under the facts it was filed with: the one part of the file itself,
 * and only the part a person asked for by pressing its address. The parent keys it by
 * `citationKey`, so each citation is a new node and re-pressing fires `focusin`; landing waits for
 * the read, scrolls at once and focuses the section without a ring.
 */
export function SourcePassageSection({ passage, t }: {
  passage: CitedPassageState;
  t: ReturnType<typeof useTranslations<"library">>;
}) {
  const passageSectionRef = useRef<HTMLElement | null>(null);
  const landingKey = passage.phase !== "reading" ? citationKey(passage) : null;
  useEffect(() => {
    if (!landingKey) return;
    const section = passageSectionRef.current;
    if (!section) return;
    // Optional call: jsdom has no scroller, and a landing is not worth throwing over.
    section.scrollIntoView?.({ behavior: "auto", block: "start" });
    section.focus({ preventScroll: true });
  }, [landingKey]);
  return (
    <section
      ref={passageSectionRef}
      data-testid="library-source-passage"
      data-state={passage.phase === "ready" ? (passage.passage?.state ?? "failed") : passage.phase}
      tabIndex={-1}
      aria-labelledby={SOURCE_PASSAGE_HEADING_ID}
      className="mt-5 border-t border-[color:var(--color-border-soft)] pt-4 focus:outline-none"
    >
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h3
          id={SOURCE_PASSAGE_HEADING_ID}
          className="font-mono text-caption uppercase tracking-[var(--tracking-caps-14)] text-[color:var(--color-text-quaternary)]"
        >
          {t("source.passage.title")}
        </h3>
        <p
          data-testid="library-source-citation"
          className="min-w-0 font-mono text-caption text-[color:var(--color-text-tertiary)]"
        >
          #{passage.anchor}
          {passage.phase === "ready" && passage.passage?.state === "resolved"
            ? ` · ${passageLabelText(passage.passage.label, passage.anchor, t)}`
            : null}
        </p>
      </div>

      {passage.phase === "reading" ? (
        <p className="mt-2 text-label leading-body text-[color:var(--color-text-quaternary)] [word-break:keep-all]">
          {t("source.passage.reading")}
        </p>
      ) : null}

      {passage.phase === "failed" ? (
        <p
          data-testid="library-source-passage-unreadable"
          className="mt-2 text-label leading-body text-[color:var(--color-text-tertiary)] [overflow-wrap:break-word] [word-break:keep-all]"
        >
          {passage.error
            ? t("source.passage.unreadable", { reason: passage.error })
            : t("source.passage.unreadableUnknown")}
        </p>
      ) : null}

      {passage.phase === "ready" && passage.passage?.state === "resolved" ? (
        <div className="mt-2 flex flex-col gap-1.5 rounded-card border border-[color:var(--color-border-soft)] bg-[color:var(--color-overlay-1)] p-[var(--card-pad)]">
          {passage.passage.before.map((unit, index) => (
            <PassageLine key={`before-${index}-${unit.anchor}`} unit={unit} cited={false} />
          ))}
          {/* Every unit carrying the anchor. A `h:<slug>` address names a heading
              *and* the paragraphs under it, so the section is the unit there —
              showing only the first would offer the word "Records" as the evidence
              for what the Records section says. */}
          {passage.passage.cited.map((unit, index) => (
            <PassageLine key={`cited-${index}-${unit.anchor}`} unit={unit} cited />
          ))}
          {passage.passage.after.map((unit, index) => (
            <PassageLine key={`after-${index}-${unit.anchor}`} unit={unit} cited={false} />
          ))}
        </div>
      ) : null}

      {passage.phase === "ready" && passage.passage?.state === "unresolved" ? (
        <div className="mt-2 flex flex-col gap-1.5">
          {/* No passage, and no nearest one. The paragraph beside a renamed heading
              is not the cited paragraph, and a reader shown it would believe a page
              that lost its address (brief decision 3). */}
          {/* Atlas's own answer wears neither the quote's voice (`text-reading`) nor the facts' (`text-label`).
             `[overflow-wrap:break-word]` is needed: the interpolated address may have no break opportunity. */}
          <p
            data-testid="library-source-passage-missing"
            className="text-body leading-body text-[color:var(--color-text-primary)] [overflow-wrap:break-word] [word-break:keep-all]"
          >
            {t("source.passage.missing", { anchor: passage.anchor })}
          </p>
          {/* The one alternative Atlas is allowed to name: the extractor itself
              reported this heading occurring more than once, so the addresses its
              occurrences carry today are a measurement, not a guess. */}
          {passage.passage.candidates.length > 0 ? (
            <p
              data-testid="library-source-passage-ambiguous"
              className="text-caption leading-body text-[color:var(--color-text-quaternary)] [overflow-wrap:break-word] [word-break:keep-all]"
            >
              {t("source.passage.ambiguous", {
                candidates: passage.passage.candidates.map((one) => `#${one}`).join(", "),
              })}
            </p>
          ) : null}
        </div>
      ) : null}

      {passage.phase === "ready" && passage.passage?.state === "no-text" ? (
        <p
          data-testid="library-source-passage-no-text"
          className="mt-2 text-label leading-body text-[color:var(--color-text-tertiary)] [overflow-wrap:break-word] [word-break:keep-all]"
        >
          {t("source.passage.noText", {
            label: passageLabelText(passage.passage.label, passage.anchor, t),
          })}
        </p>
      ) : null}
    </section>
  );
}
