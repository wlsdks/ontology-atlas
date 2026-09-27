"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { splitProjectBrief } from "../model/project-brief";

/** Display words for the construction card's section names. */
export interface BriefSectionNames {
  includes: string;
  excludes: string;
  uncertainty: string;
  competencyAnswers: string;
}

const BOUNDARY_KEYS = ["includes", "excludes"] as const;

/** Case-insensitive. */
function knownSection(title: string): keyof BriefSectionNames | null {
  const key = title.trim().toLowerCase();
  if (key === "includes") return "includes";
  if (key === "excludes") return "excludes";
  if (key === "uncertainty") return "uncertainty";
  if (key === "competency answers") return "competencyAnswers";
  return null;
}

function bullets(markdown: string): string[] {
  return markdown
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => /^[-*+]\s+/.test(line))
    .map((line) => line.replace(/^[-*+]\s+/, ""));
}

/** The hero already says the first sentence; the card starts after it. */
function withoutLeadSentence(paragraph: string, leadSentence: string | null | undefined): string {
  if (!leadSentence) return paragraph;
  const normalized = paragraph.replace(/\s+/g, " ").trim();
  const lead = leadSentence.replace(/\s+/g, " ").trim();
  if (!lead || !normalized.startsWith(lead)) return paragraph;
  return normalized.slice(lead.length).trim();
}

/**
 * The opening paragraph, the Includes/Excludes boundary bullets when present, and the `##` titles
 * as a contents line; the document itself is one press away.
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
  leadSentence?: string | null;
  /** Unknown titles stay as written. */
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
  /* From `@5xl` the rest of the summary stands beside the prose instead of under it. */
  const twoTracks = Boolean(opening) && (hasBoundary || hasContents);
  /* A list as the second track, or one ruled line closing the card under the boundary grid. */
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
      // Capped at the reading column's measure, like the prose.
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
        {hasContents && !hasBoundary ? contentsLine("list") : null}
      </div>
      {hasContents && hasBoundary ? <div className="mt-5">{contentsLine("line")}</div> : null}
    </div>
  );
}


/** The first prose paragraph, else the first non-heading block, so the card is never empty. */
function firstParagraph(markdown: string): string {
  const blocks = markdown
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean);
  const prose = blocks.find(
    (block) => !/^(#{1,6}\s|[-*+]\s|\d+\.\s|>|```|~~~|\|)/.test(block),
  );
  if (prose) return prose;
  // Headings are skipped: the contents line already carries them.
  return blocks.find((block) => !/^#{1,6}\s/.test(block)) ?? "";
}
