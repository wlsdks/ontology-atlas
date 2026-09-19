"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { splitProjectBrief } from "../model/project-brief";

/**
 * The document in four lines instead of eight hundred words.
 *
 * Owner, 2026-09-19: *"the overview is too long — does it all have to be shown?"* It does not.
 * What a project page owes a reader is the definition and the shape of what is written, not the
 * document itself: the document has its own destination one press away, and the Library reads it
 * better than a card does. So this draws the opening paragraph and then the `##` section titles
 * as a contents line — the structure `splitProjectBrief` finds is exactly what "what is written
 * here" means — and hands the rest to the Ontology document.
 *
 * A body with no sections has no contents line, and its opening paragraph stands alone.
 */
export function ProjectBriefSummary({
  body,
  proseClassName,
  coversLabel,
}: {
  body: string;
  proseClassName: string;
  coversLabel: string;
}) {
  const brief = splitProjectBrief(body);
  const opening = firstParagraph(brief.lead) || firstParagraph(brief.sections[0]?.markdown ?? "");

  return (
    <div data-testid="project-detail-brief-summary" data-section-count={brief.sections.length}>
      {opening ? (
        <div className={`${proseClassName} break-keep`} data-testid="project-detail-body-content">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{opening}</ReactMarkdown>
        </div>
      ) : null}
      {brief.sections.length > 0 ? (
        <div className="mt-4 flex flex-wrap items-baseline gap-x-2 gap-y-1.5">
          <span className="font-mono text-caption uppercase tracking-[var(--tracking-caps-12)] text-[color:var(--color-text-quaternary)]">
            {coversLabel}
          </span>
          <ol
            data-testid="project-detail-brief-sections"
            className="flex min-w-0 list-none flex-wrap items-baseline gap-x-2 gap-y-1.5 p-0"
          >
            {brief.sections.map((section, index) => (
              <li key={`${index}-${section.title}`} className="flex items-baseline gap-2">
                {index > 0 ? (
                  <span aria-hidden className="text-label text-[color:var(--color-text-quaternary)]">
                    ·
                  </span>
                ) : null}
                <span className="min-w-0 break-keep text-body text-[color:var(--color-text-secondary)]">
                  {section.title}
                </span>
              </li>
            ))}
          </ol>
        </div>
      ) : null}
    </div>
  );
}

/** The body's first prose paragraph — headings, lists and fences are not the definition. */
function firstParagraph(markdown: string): string {
  for (const block of markdown.split(/\n{2,}/)) {
    const trimmed = block.trim();
    if (!trimmed) continue;
    if (/^(#{1,6}\s|[-*+]\s|\d+\.\s|>|```|~~~|\|)/.test(trimmed)) continue;
    return trimmed;
  }
  return "";
}
