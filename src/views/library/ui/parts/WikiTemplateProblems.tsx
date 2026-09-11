"use client";

import type { useTranslations } from "next-intl";

import { isWikiFolderCode } from "../../lib/merge-wiki-verdict";

/**
 * **Why a page does not fit the wiki template, said where the page is.**
 *
 * The list beside this reader carries one fixed word — *off-template* — because a badge
 * that changes shape row by row asks a reader to learn a vocabulary just to scan. The
 * sentence that says what to change belongs here, next to the text a person would
 * change.
 *
 * ⚠️ **This block was drafted inside `DocFrontmatterBlock` and moved out on 2026-09-06.**
 * That component's whole subject is *"this document tried to be a node and failed"*, and
 * a wiki page carries no `kind:` **by contract** — that absence is what keeps it out of
 * the graph. Teaching the Docs diagnosis to make an exception for a file Docs no longer
 * lists would have been two verdicts in one component with a flag between them. The
 * question actually open for a wiki page is a different question, so it is a different
 * block, and it lives in the destination that owns the file.
 *
 * The code stays beside each sentence: it is what `ontology-atlas wiki-validate` prints
 * and what an agent branches on, so one word means one thing on every surface.
 *
 * ## Two findings, two headings (2026-09-09)
 *
 * ⚠️ **One heading used to cover both, and it named the wrong one.** Every finding was
 * printed under *This page does not fit the wiki template* — including the folder half,
 * which says nothing about the page's shape. Measured on a folder whose four pages all
 * fit the template: the status strip correctly showed **no** off-template clause, and
 * this panel simultaneously told the reader the page was off-template. Same screen, same
 * page, two answers, and the one in larger type was the wrong one.
 *
 * The split is the same one `merge-wiki-verdict` already draws for the row's marks and
 * the header's clauses, read from the same predicate. A page's own shape is fixed by
 * editing that page; a folder finding is fixed by editing the folder around it, and a
 * person who has just been told their page is malformed will go looking inside it.
 *
 * ## The sentence is rebuilt here, not shipped from the validator
 *
 * `problem.message` is written once, in English, for the machines that read it. A person
 * gets `problem.detail` — the sentence's pieces — reassembled in their own language.
 * Before this, a Korean reader was handed `dangling-wikilink:15` followed by an English
 * paragraph. `detail` is optional on purpose: a finding that has not been given a
 * localised retelling yet still says something true rather than nothing at all.
 */
export interface WikiTemplateProblem {
  code: string;
  message: string;
  line?: number;
  /** `{ key, values }` for a localised retelling; absent falls back to `message`. */
  detail?: { key: string; values?: Record<string, string> };
}

/** One heading, one explanation, one list — used twice with different subjects. */
function ProblemGroup({
  problems,
  ariaLabel,
  title,
  body,
  testId,
  collapsed,
  t,
}: {
  problems: ReadonlyArray<WikiTemplateProblem>;
  ariaLabel: string;
  title: string;
  body: string;
  testId: string;
  /**
   * **Whether this card is one line a reader opens, or the open card itself.**
   *
   * On a wiki page the findings are the reason a person is looking at the page, so the card
   * is open above the body. On a **saved answer** the answer is what they opened: measured
   * in the installed app at 1512, this card ran nine lines between the byline and the
   * answer's own Summary and pushed it to 84% of the viewport
   * (`.claude/shots-2026-09-12/library-inspection/06-answer-page.png`). There it becomes one
   * summary line with its count, after the content — nothing deleted, one press away.
   */
  collapsed?: boolean;
  t: ReturnType<typeof useTranslations<"library">>;
}) {
  if (problems.length === 0) return null;
  const heading = collapsed ? `${title} · ${t("wiki.findingCount", { count: problems.length })}` : title;
  const Body = (
    <>
        {/* The explanation and each finding are sentences: they take `--measure-prose`, while
            the card itself keeps the document column. At `text-label` (11px) inside this card
            the uncapped line ran past 120 characters (2026-09-11 calibration —
            `app/globals.css`, `--measure-prose`). `[word-break:keep-all]` arrives with the cap,
            not as decoration: this line fitted in one row before, and the first narrower render
            in the installed app broke a Korean word across the wrap, leaving its final syllable
            and its particle stranded on the next line. The findings below already carried it. */}
      <p className="mt-1 max-w-[var(--measure-prose)] text-label text-[color:var(--color-text-tertiary)] [word-break:keep-all]">{body}</p>
      <ul className="mt-2 flex flex-col gap-1 font-sans">
        {problems.map((problem, index) => (
          <li
            key={`${problem.code}-${index}`}
            data-testid="library-wiki-problem"
            className="max-w-[var(--measure-prose)] text-label text-[color:var(--color-text-secondary)] [word-break:keep-all]"
          >
            <span className="font-mono text-caption text-[color:var(--color-text-tertiary)]">
              {problem.code}
              {problem.line ? `:${problem.line}` : ""}
            </span>{" "}
            {describeWikiProblem(problem, t)}
          </li>
        ))}
      </ul>
    </>
  );
  return (
    <section
      aria-label={ariaLabel}
      data-testid={testId}
      className="mx-auto mt-4 max-w-[var(--measure-doc-column)] px-6 md:px-10"
    >
      <div className="rounded-chip border border-[color:var(--color-border-strong)] bg-[color:var(--color-overlay-1)] px-4 py-3">
        {collapsed ? (
          <details>
            <summary
              data-testid={`${testId}-summary`}
              className="text-body font-[var(--font-weight-signature)] text-[color:var(--color-text-primary)] marker:text-[color:var(--color-text-quaternary)]"
            >
              {heading}
            </summary>
            {Body}
          </details>
        ) : (
          <>
            <p className="text-body font-[var(--font-weight-signature)] text-[color:var(--color-text-primary)]">
              {heading}
            </p>
            {Body}
          </>
        )}
      </div>
    </section>
  );
}

/**
 * The finding in the reader's language, or the validator's English when there is no
 * translation for it yet.
 *
 * `t.has` rather than a table of known keys: the validator owns which sentence it just
 * found, and a key it grows before this file learns about it should degrade to the
 * English message rather than render a raw `library.wiki.problem.…` path.
 */
function describeWikiProblem(
  problem: WikiTemplateProblem,
  t: ReturnType<typeof useTranslations<"library">>,
): string {
  const key = problem.detail?.key;
  if (!key) return problem.message;
  const path = `wiki.problem.${key}` as "wiki.problem.orphan-page";
  if (!t.has(path)) return problem.message;
  return t(path, problem.detail?.values ?? {});
}

export function WikiTemplateProblems({
  problems,
  collapsed,
  t,
}: {
  problems: ReadonlyArray<WikiTemplateProblem>;
  /** One summary line per group instead of the open card — see `ProblemGroup`. */
  collapsed?: boolean;
  t: ReturnType<typeof useTranslations<"library">>;
}) {
  if (problems.length === 0) return null;
  const ownShape = problems.filter((problem) => !isWikiFolderCode(problem.code));
  const folder = problems.filter((problem) => isWikiFolderCode(problem.code));
  return (
    <>
      <ProblemGroup
        problems={ownShape}
        ariaLabel={t("wiki.offTemplateAriaLabel")}
        title={t("wiki.offTemplateTitle")}
        body={t("wiki.offTemplateBody")}
        testId="library-wiki-problems"
        collapsed={collapsed}
        t={t}
      />
      <ProblemGroup
        problems={folder}
        ariaLabel={t("wiki.linkFindingsAriaLabel")}
        title={t("wiki.linkFindingsTitle")}
        body={t("wiki.linkFindingsBody")}
        testId="library-wiki-link-findings"
        collapsed={collapsed}
        t={t}
      />
    </>
  );
}
