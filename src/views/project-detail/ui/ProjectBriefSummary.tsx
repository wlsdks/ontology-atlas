"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { splitProjectBrief } from "../model/project-brief";

/** The words this card draws for the section names the construction card asks every node for. */
export interface BriefSectionNames {
  includes: string;
  excludes: string;
  uncertainty: string;
  competencyAnswers: string;
}

const BOUNDARY_KEYS = ["includes", "excludes"] as const;

/** A section title as the construction card writes it, matched without regard to case. */
function knownSection(title: string): keyof BriefSectionNames | null {
  const key = title.trim().toLowerCase();
  if (key === "includes") return "includes";
  if (key === "excludes") return "excludes";
  if (key === "uncertainty") return "uncertainty";
  if (key === "competency answers") return "competencyAnswers";
  return null;
}

/** The first bullets of a section, as plain Markdown lines. */
function bullets(markdown: string): string[] {
  return markdown
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => /^[-*+]\s+/.test(line))
    .map((line) => line.replace(/^[-*+]\s+/, ""));
}

/**
 * The opening paragraph without the sentence the hero already says.
 *
 * The hero carries the project's first definition sentence, and this card used to open on the same
 * sentence two blocks lower and one type step larger (16 against the hero's 14, measured 2026-09-25)
 * — the hierarchy inverted and the sentence said twice. What the card adds is what follows it.
 */
function withoutLeadSentence(paragraph: string, leadSentence: string | null | undefined): string {
  if (!leadSentence) return paragraph;
  const normalized = paragraph.replace(/\s+/g, " ").trim();
  const lead = leadSentence.replace(/\s+/g, " ").trim();
  if (!lead || !normalized.startsWith(lead)) return paragraph;
  return normalized.slice(lead.length).trim();
}

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
 * **The boundary is the summary** (2026-09-25). A node written by the construction card states its
 * product boundary as `## Includes` / `## Excludes` bullets. Those are the densest answer to "what
 * is this, and what is it not", so they stand side by side under the prose instead of the card's
 * right half standing empty beside a 629px column (measured at 1512: a 906px card, 40% bare).
 *
 * A body with no sections has no contents line, and its opening paragraph stands alone.
 */
export function ProjectBriefSummary({
  body,
  proseClassName,
  coversLabel,
  leadSentence,
  sectionNames,
}: {
  body: string;
  proseClassName: string;
  coversLabel: string;
  /** The sentence the hero already draws; the card starts after it. */
  leadSentence?: string | null;
  /** Localized names for the construction card's section titles. Unknown titles stay as written. */
  sectionNames?: BriefSectionNames;
}) {
  const brief = splitProjectBrief(body);
  const firstBlock = firstParagraph(brief.lead) || firstParagraph(brief.sections[0]?.markdown ?? "");
  const opening = withoutLeadSentence(firstBlock, leadSentence);
  const boundary = BOUNDARY_KEYS.map((key) => {
    const section = brief.sections.find((candidate) => knownSection(candidate.title) === key);
    return section ? { key, items: bullets(section.markdown) } : null;
  }).filter((entry): entry is { key: (typeof BOUNDARY_KEYS)[number]; items: string[] } => entry !== null && entry.items.length > 0);
  const sectionTitle = (title: string) => {
    const known = knownSection(title);
    return known && sectionNames ? sectionNames[known] : title;
  };

  const hasBoundary = boundary.length > 0 && Boolean(sectionNames);
  const hasContents = brief.sections.length > 0;
  /*
   * **Two tracks when the card has the page's width** (2026-09-25, round three). The overview card
   * spans the page column since the agent card moved beside the domain rows, so the opening
   * paragraph keeps the reading column on the left and the rest of the summary stands beside it
   * rather than under it: the boundary bullets when the document states them, otherwise the
   * contents line. Below `@5xl` of the page column the two tracks stack in the same order.
   */
  const twoTracks = Boolean(opening) && (hasBoundary || hasContents);
  /*
   * The contents line has two shapes. Beside the prose (no boundary bullets) it is the second
   * track, so it reads as a short list under its label: set on one line it sat alone at the top
   * of a ~600px track with the rest of that track bare (round four, storefront at 1920). Under
   * the boundary grid it closes the card as one line under a rule.
   */
  const contentsLine = (shape: "list" | "line") => (
    <div
      className={
        shape === "list"
          ? "flex min-w-0 flex-col gap-2"
          : "flex flex-wrap items-baseline gap-x-2 gap-y-1.5 border-t border-[color:var(--color-divider)] pt-4"
      }
    >
      <span className="text-label text-[color:var(--color-text-quaternary)]">
        {coversLabel}
      </span>
      <ol
        data-testid="project-detail-brief-sections"
        className={
          shape === "list"
            ? "min-w-0 list-decimal space-y-1.5 pl-4 marker:font-mono marker:text-label marker:text-[color:var(--color-text-quaternary)]"
            : "flex min-w-0 list-none flex-wrap items-baseline gap-x-2 gap-y-1.5 p-0"
        }
      >
        {brief.sections.map((section, index) => (
          <li
            key={`${index}-${section.title}`}
            className={shape === "list" ? "pl-1" : "flex items-baseline gap-2"}
          >
            {shape === "line" && index > 0 ? (
              <span aria-hidden className="text-label text-[color:var(--color-text-quaternary)]">
                ·
              </span>
            ) : null}
            <span className="min-w-0 text-body text-[color:var(--color-text-secondary)]">
              {sectionTitle(section.title)}
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
  const boundaryGrid = (
    <div
      data-testid="project-detail-brief-boundary"
      // Each column is capped at the reading column's line, so a card spanning the page at 1920
      // does not run a bullet to ~800px (the bounded measure the prose above it keeps).
      className={`grid gap-x-8 gap-y-5 ${
        boundary.length === 2
          ? "@3xl/project-page:grid-cols-[repeat(2,minmax(0,calc(var(--measure-doc-column)-2*var(--measure-doc-gutter))))]"
          : "max-w-[calc(var(--measure-doc-column)-2*var(--measure-doc-gutter))]"
      }`}
    >
      {boundary.map((entry) => (
        <section key={entry.key} className="min-w-0">
          <h3 className="text-label font-[var(--font-weight-emphasis)] tracking-[var(--tracking-caps-08)] text-[color:var(--color-text-tertiary)]">
            {sectionNames?.[entry.key]}
          </h3>
          <ul className="mt-2 flex list-none flex-col gap-2 p-0">
            {entry.items.map((item, index) => (
              <li
                key={`${entry.key}-${index}`}
                className="relative break-keep pl-3.5 text-body leading-body text-[color:var(--color-text-secondary)] before:absolute before:top-[0.55em] before:left-0 before:h-1 before:w-1 before:rounded-full before:bg-[color:var(--color-text-quaternary)] before:content-[''] [&_a]:text-[color:var(--color-indigo-accent)] [&_code]:font-mono [&_code]:text-label [&_p]:inline"
              >
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{item}</ReactMarkdown>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );

  return (
    <div data-testid="project-detail-brief-summary" data-section-count={brief.sections.length}>
      <div
        className={
          twoTracks
            ? "grid gap-x-10 gap-y-5 @5xl/project-page:grid-cols-[minmax(0,calc(var(--measure-doc-column)-2*var(--measure-doc-gutter)))_minmax(0,1fr)]"
            : "flex flex-col gap-5"
        }
      >
        {opening ? (
          <div className={`${proseClassName} min-w-0 break-keep`} data-testid="project-detail-body-content">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{opening}</ReactMarkdown>
          </div>
        ) : null}
        {hasBoundary ? boundaryGrid : null}
        {/* Without boundary bullets the contents line is the second track; with them it closes
            the card under both tracks. */}
        {hasContents && !hasBoundary ? contentsLine("list") : null}
      </div>
      {hasContents && hasBoundary ? <div className="mt-5">{contentsLine("line")}</div> : null}
    </div>
  );
}


/**
 * The body's first prose paragraph — a heading, a list or a fence is not the definition.
 *
 * A document that opens with a list has no such paragraph, and a card that then says nothing
 * about the document is worse than one that shows the list: the second pass takes the first block
 * of any kind, so the summary always carries the document's own opening.
 */
function firstParagraph(markdown: string): string {
  const blocks = markdown
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean);
  const prose = blocks.find(
    (block) => !/^(#{1,6}\s|[-*+]\s|\d+\.\s|>|```|~~~|\|)/.test(block),
  );
  if (prose) return prose;
  // Nothing here is a paragraph. Show the opening block itself rather than nothing — a heading
  // is the one exception, because the contents line beside this already carries the headings.
  return blocks.find((block) => !/^#{1,6}\s/.test(block)) ?? "";
}
