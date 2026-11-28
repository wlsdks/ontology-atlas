import { memo, useEffect, useMemo, useRef, useState } from "react";
import type { useTranslations } from "use-intl";

import { wikiProblemMachineLine, type WikiProblemContext } from "@/features/library";
import type { WikiReport } from "@/shared/lib/library/wiki-report.mjs";
import { Chip } from "@/shared/ui";

import { reportRuleTitle } from "../../model/check-report/check-report-outline";
import {
  collapseStructuralRows,
  pageSlug,
  placeSuffix,
  sharedRule,
  type StructuralRow,
} from "../../model/check-report/structural-rows";
import { WikiProblemSentence, type WikiProblemDoors } from "../wiki/WikiTemplateProblems";
import { CheckCodesButton } from "./CheckCodesDialog";
import { PageDoors } from "./PageDoors";

/** Rows a kind shows before Show more: a screen's worth to read, not the whole ledger at once. */
export const FIRST_STRUCTURAL_ROWS = 20;

/** Rows each Show more press adds. */
export const MORE_STRUCTURAL_ROWS = 100;

/**
 * One kind of finding the app computed: a heading that is a sentence, the codes in a dialog from its
 * right edge, the sentence the rows share printed once, then one row per page. The 1px rule makes
 * the boundary between kinds structural rather than a matter of ink. The heading keeps the full
 * count; Show more appends below the shown rows and hands focus to the first new one.
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
  const rows = useMemo(() => collapseStructuralRows(group.rows, t, context), [group.rows, t, context]);
  const rule = useMemo(() => sharedRule(rows), [rows]);
  const [shownCount, setShownCount] = useState(FIRST_STRUCTURAL_ROWS);
  const [revealedFrom, setRevealedFrom] = useState<number | null>(null);
  const list = useRef<HTMLUListElement | null>(null);
  useEffect(() => {
    if (revealedFrom === null) return;
    list.current?.children[revealedFrom]?.querySelector<HTMLElement>("button, a[href]")?.focus();
  }, [revealedFrom]);
  const hiddenCount = rows.length - shownCount;
  const showMore = () => {
    setRevealedFrom(shownCount);
    setShownCount(shownCount + MORE_STRUCTURAL_ROWS);
  };
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
      <ul ref={list} className="mt-1.5 flex flex-col divide-y divide-[color:var(--color-divider)]">
        {rows.slice(0, shownCount).map((entry) => (
          <StructuralFindingRow
            key={`${entry.row.page}-${entry.row.code}-${entry.places.map((place) => place.line ?? place.label).join(",")}`}
            entry={entry}
            ownSentence={rule.sentence === null}
            ownAction={rule.action === null}
            doors={doors}
            onOpenPage={onOpenPage}
            t={t}
          />
        ))}
      </ul>
      {hiddenCount > 0 ? (
        <div className="mt-2">
          <Chip
            data-testid="library-structural-show-more"
            tone="secondary"
            hoverInk="strong"
            hoverSurface="lift"
            onClick={showMore}
          >
            {t("questionDesk.showMore", { count: Math.min(hiddenCount, MORE_STRUCTURAL_ROWS) })}
          </Chip>
        </div>
      ) : null}
    </section>
  );
}

/** Memoised: Show more appends rows, and the rows already shown must not be drawn again for it. */
const StructuralFindingRow = memo(function StructuralFindingRow({
  entry: { row, words, places },
  ownSentence,
  ownAction,
  doors,
  onOpenPage,
  t,
}: {
  entry: StructuralRow;
  /** The kind's rows do not share one sentence, so each row says its own. */
  ownSentence: boolean;
  ownAction: boolean;
  doors: WikiProblemDoors;
  onOpenPage: (slug: string) => void;
  t: ReturnType<typeof useTranslations<"library">>;
}) {
  return (
    <li data-testid="library-structural-finding" className="flex min-w-0 items-start gap-4 py-2.5">
      <div className="min-w-0 flex-1">
        {ownSentence ? (
          <p className="text-body leading-body text-[color:var(--color-text-secondary)] [word-break:keep-all]">
            <WikiProblemSentence words={words} doors={doors} t={t} />
          </p>
        ) : null}
        {ownAction && words.action ? (
          <p className="text-body leading-body text-[color:var(--color-text-tertiary)] [word-break:keep-all]">
            {words.action}
          </p>
        ) : null}
        <PageDoors pages={[pageSlug(row.page)]} suffixes={places.map(placeSuffix)} onOpenPage={onOpenPage} />
      </div>
    </li>
  );
});
