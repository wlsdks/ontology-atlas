"use client";

import type { ReactNode } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Link } from "@/i18n/navigation";
import { buildDocsVaultHref } from "@/entities/docs-vault";
import { controlClass } from "@/shared/ui/control-class";
import { WIKILINK_SENTINEL, decodeWikilinkSlug, rewriteWikilinks } from "@/shared/lib/source-citation";
import { briefOrdinal, splitProjectBrief } from "../model/project-brief";

/**
 * The overview tab's body, drawn as a **brief**.
 *
 * A project body is authored Markdown, and its shape is already in the file: a `##`
 * heading opens a section, an ordered list is a sequence, a bullet list is a set. Until
 * 2026-09-19 all of it was poured into one prose column, which the owner read as *"really
 * unpleasant to look at"*. This component draws the shape the file carries: each section
 * a block with its number and title on one start line; a sequence as a strip of steps that
 * reads left to right (the numeral says order, which is what an arrow would have claimed);
 * a set as rows. A body with no `##` headings has no sections and is drawn as the prose it
 * is, through the same class the card always used.
 *
 * Wikilinks (`[[domains/order|Orders]]`) become doors to that document in the Library, the
 * same rewrite the Library's own cards use. Nothing else in a body is turned into a link;
 * a name that merely matches a node is not a citation.
 */
export function ProjectBrief({ body, proseClassName }: { body: string; proseClassName: string }) {
  const brief = splitProjectBrief(body);
  if (brief.sections.length === 0) {
    return (
      <div className={`${proseClassName} break-keep`} data-testid="project-detail-body-content">
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{body}</ReactMarkdown>
      </div>
    );
  }

  return (
    <div data-testid="project-detail-brief" data-section-count={brief.sections.length}>
      {brief.lead ? (
        <div className={`${proseClassName} mb-5 break-keep`} data-testid="project-detail-brief-lead">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{brief.lead}</ReactMarkdown>
        </div>
      ) : null}
      <ol className="flex flex-col">
        {brief.sections.map((section, index) => (
          <li
            key={`${index}-${section.title}`}
            data-testid="project-detail-brief-section"
            className="grid gap-x-6 gap-y-1.5 border-t border-[color:var(--color-divider)] py-5 first:border-t-0 first:pt-0 last:pb-0 md:grid-cols-[3.5rem_minmax(0,1fr)]"
          >
            {/* The ordinal is an eyebrow, not a list marker: it stands in its own column so every
                title in the brief starts on one line, and it is engraved like the page's other
                captions. `aria-hidden` because the `ol` already announces position. */}
            <span
              aria-hidden
              className="font-mono text-caption uppercase tracking-[var(--tracking-caps-12)] text-[color:var(--color-text-quaternary)] md:pt-[3px]"
            >
              {briefOrdinal(index)}
            </span>
            <div className="min-w-0">
              <h3 className="text-title font-[var(--font-weight-strong)] tracking-[var(--tracking-card)] text-[color:var(--color-text-primary)]">
                {section.title}
              </h3>
              <div className="break-keep">
                <ReactMarkdown remarkPlugins={[remarkGfm]} components={briefComponents}>
                  {rewriteWikilinks(section.markdown)}
                </ReactMarkdown>
              </div>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}

const READING = "text-reading leading-prose text-[color:var(--color-text-secondary)]";
/** A door inside a sentence: the link shape at the prose size, dotted so it reads as a citation. */
const PROSE_LINK =
  "min-h-0 text-reading underline decoration-dotted underline-offset-2 hover:text-[color:var(--color-indigo-hover)]";

const briefComponents: React.ComponentProps<typeof ReactMarkdown>["components"] = {
  p: ({ children }) => <p className={`mt-2 ${READING}`}>{children}</p>,
  strong: ({ children }) => (
    <strong className="font-[var(--font-weight-strong)] text-[color:var(--color-text-primary)]">{children}</strong>
  ),
  // A sequence: one step per cell, read left to right, wrapping to as many rows as the width
  // allows. The numeral is a CSS counter so the markup stays a plain list for readers. The
  // items are styled from the list (`[&>li]`) because `react-markdown` hands an `li` no
  // knowledge of which list it is in.
  ol: ({ children }) => (
    <ol
      data-testid="project-detail-brief-steps"
      className={`mt-3 grid list-none grid-cols-[repeat(auto-fit,minmax(13rem,1fr))] gap-2 p-0 [counter-reset:step] ${READING} [&>li]:relative [&>li]:rounded-card [&>li]:border [&>li]:border-[color:var(--color-border-soft)] [&>li]:bg-[color:var(--color-overlay-1)] [&>li]:px-3.5 [&>li]:pb-3 [&>li]:pt-8 [&>li]:[counter-increment:step] [&>li]:before:absolute [&>li]:before:left-3.5 [&>li]:before:top-2.5 [&>li]:before:font-mono [&>li]:before:text-caption [&>li]:before:tracking-[var(--tracking-caps-12)] [&>li]:before:text-[color:var(--color-text-quaternary)] [&>li]:before:content-[counter(step,decimal-leading-zero)] [&>li>p]:mt-0`}
    >
      {children}
    </ol>
  ),
  ul: ({ children }) => (
    <ul
      data-testid="project-detail-brief-rows"
      className={`mt-3 flex list-none flex-col p-0 ${READING} [&>li]:border-t [&>li]:border-[color:var(--color-divider)] [&>li]:py-2 [&>li:first-child]:border-t-0 [&>li:first-child]:pt-0 [&>li>p]:mt-0`}
    >
      {children}
    </ul>
  ),
  a: ({ href, children }) => <BriefLink href={href}>{children}</BriefLink>,
};

function BriefLink({ href, children }: { href?: string; children?: ReactNode }) {
  if (href?.startsWith(WIKILINK_SENTINEL)) {
    const [rawSlug] = href.slice(WIKILINK_SENTINEL.length).split("#");
    const slug = decodeWikilinkSlug(rawSlug);
    return (
      <Link
        href={buildDocsVaultHref({ slug })}
        data-testid="project-detail-brief-doc-link"
        className={controlClass({ shape: "link", tone: "accent", className: PROSE_LINK })}
      >
        {children}
      </Link>
    );
  }
  if (href && /^https?:\/\//.test(href)) {
    return (
      <a
        href={href}
        target="_blank"
        rel="noreferrer"
        className={controlClass({ shape: "link", tone: "accent", className: PROSE_LINK })}
      >
        {children}
      </a>
    );
  }
  return <span className="underline decoration-dotted">{children}</span>;
}
