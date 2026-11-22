"use client";

import type { useTranslations } from "next-intl";

import { wikiProblemMachineLine, type WikiProblemContext } from "@/features/library";
import type { WikiReport } from "@/shared/lib/library/wiki-report.mjs";

import { reportRuleTitle } from "../../model/check-report/check-report-outline";
import { collapseStructuralRows, pageSlug, placeSuffix, sharedRule } from "../../model/check-report/structural-rows";
import { WikiProblemSentence, type WikiProblemDoors } from "../wiki/WikiTemplateProblems";
import { CheckCodesButton } from "./CheckCodesDialog";
import { PageDoors } from "./PageDoors";

/**
 * One kind of finding the app computed: a heading that is a sentence, the codes in a dialog from its
 * right edge, the sentence the rows share printed once, then one row per page. The 1px rule makes
 * the boundary between kinds structural rather than a matter of ink.
 */
export function StructuralGroup({
  group,
  onOpenPage,
  doors,
  context,
  t,
}: {
  group: WikiReport["groups"][number];
  onOpenPage: (slug: string) => void;
  doors: WikiProblemDoors;
  context: WikiProblemContext;
  t: ReturnType<typeof useTranslations<"library">>;
}) {
  const rows = collapseStructuralRows(group.rows, t, context);
  const rule = sharedRule(rows);
  return (
    <section
      data-testid="library-structural-group"
      data-code={group.code}
      data-advisory={group.advisory ? "true" : undefined}
      className="mt-5 border-t border-[color:var(--color-divider)] pt-4"
    >
      <div className="flex items-start justify-between gap-3">
        <h4
          id={`report-code-${group.code}`}
          className="min-w-0 scroll-mt-4 text-body font-[var(--font-weight-strong)] leading-body text-[color:var(--color-text-secondary)] [word-break:keep-all]"
        >
          {reportRuleTitle(group.code, t)}
          <span className="ml-2 text-label font-normal text-[color:var(--color-text-quaternary)]">
            {group.count}
          </span>
        </h4>
        {/* Every finding the validator fired, not the rows this page collapsed them into. */}
        <CheckCodesButton
          lines={group.rows.map((row) => `${row.page} — ${wikiProblemMachineLine(row)}`)}
          testId={`library-structural-technical-${group.code}`}
          codeTestId="library-structural-code"
          t={t}
        />
      </div>
      {rule.sentence ? (
        <p
          data-testid="library-structural-rule"
          className="mt-1 text-body leading-body text-[color:var(--color-text-secondary)] [word-break:keep-all]"
        >
          {/* The place is a word here and not a press: this page is not the page, so each row's own door opens it. */}
          <WikiProblemSentence words={rule.sentence.words} doors={doors} t={t} />
        </p>
      ) : null}
      {rule.action ? (
        <p
          data-testid="library-structural-rule-action"
          className="text-body leading-body text-[color:var(--color-text-tertiary)] [word-break:keep-all]"
        >
          {rule.action}
        </p>
      ) : null}
      <ul className="mt-1.5 flex flex-col divide-y divide-[color:var(--color-divider)]">
        {rows.map(({ row, words, places }) => (
          <li
            key={`${row.page}-${row.code}-${places.map((place) => place.line ?? place.label).join(",")}`}
            data-testid="library-structural-finding"
            className="flex min-w-0 items-start gap-4 py-2.5"
          >
            <div className="min-w-0 flex-1">
              {rule.sentence ? null : (
                <p className="text-body leading-body text-[color:var(--color-text-secondary)] [word-break:keep-all]">
                  <WikiProblemSentence words={words} doors={doors} t={t} />
                </p>
              )}
              {!rule.action && words.action ? (
                <p className="text-body leading-body text-[color:var(--color-text-tertiary)] [word-break:keep-all]">
                  {words.action}
                </p>
              ) : null}
              <PageDoors
                pages={[pageSlug(row.page)]}
                suffixes={places.map(placeSuffix)}
                onOpenPage={onOpenPage}
              />
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
