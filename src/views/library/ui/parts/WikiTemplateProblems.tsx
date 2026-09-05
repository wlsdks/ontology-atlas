"use client";

import type { useTranslations } from "next-intl";

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
 */
export interface WikiTemplateProblem {
  code: string;
  message: string;
  line?: number;
}

export function WikiTemplateProblems({
  problems,
  t,
}: {
  problems: ReadonlyArray<WikiTemplateProblem>;
  t: ReturnType<typeof useTranslations<"library">>;
}) {
  if (problems.length === 0) return null;
  return (
    <section
      aria-label={t("wiki.offTemplateAriaLabel")}
      data-testid="library-wiki-problems"
      className="mx-auto mt-4 max-w-[760px] px-6 md:px-10"
    >
      <div className="rounded-chip border border-[color:var(--color-amber-source-a35)] bg-[color:var(--color-amber-source-a08)] px-4 py-3">
        <p className="text-body font-[var(--font-weight-signature)] text-[color:var(--color-text-primary)]">
          {t("wiki.offTemplateTitle")}
        </p>
        <p className="mt-1 text-label text-[color:var(--color-text-tertiary)]">
          {t("wiki.offTemplateBody")}
        </p>
        <ul className="mt-2 flex flex-col gap-1 font-sans">
          {problems.map((problem, index) => (
            <li
              key={`${problem.code}-${index}`}
              data-testid="library-wiki-problem"
              className="text-label text-[color:var(--color-text-secondary)] [word-break:keep-all]"
            >
              <span className="font-mono text-caption text-[color:var(--color-amber-source-a90)]">
                {problem.code}
                {problem.line ? `:${problem.line}` : ""}
              </span>{" "}
              {problem.message}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
