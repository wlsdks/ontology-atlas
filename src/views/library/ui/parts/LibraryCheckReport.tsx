"use client";

import { useState } from "react";
import { Stethoscope } from "lucide-react";
import type { useTranslations } from "next-intl";

import { isMapKind, type LintFinding, type LintNodeCandidate } from "@/features/library";
import type { WikiReport, WikiReportRow } from "@/shared/lib/library/wiki-report.mjs";
import { Chip, Disclosure, Tooltip } from "@/shared/ui";
import { BrandMark } from "@/shared/ui/marks/brand-mark";
import { controlClass } from "@/shared/ui/control-class";
import { ICON_SIZE } from "@/shared/ui/tokens/icon-size";

import {
  describeWikiProblem,
  wikiProblemMachineLine,
  type WikiProblemContext,
  type WikiProblemWhere,
  type WikiProblemWords,
} from "@/features/library";
import { localizeWikiLogSummary } from "../../lib/wiki-log-summary";
import { AgentMissingNotice } from "./AgentMissingNotice";
import { WikiProblemSentence, type WikiProblemDoors } from "./WikiTemplateProblems";

/**
 * Two ledgers, the computed one first: what the app checked (from `model.structural`, needing no
 * press, agent or memory), then what the agent read. A finding's page names are its one door; Fix
 * and Propose stay on the agent half.
 */

/** Names past this many fold behind a count; the map kinds come first. */
const CANDIDATE_FOLD = 5;

const FINDING_ORDER: ReadonlyArray<LintFinding["code"]> = ["disagreement", "superseded", "missing-link"];

function findingKindKey(code: LintFinding["code"]): "disagreement" | "superseded" | "missingLink" {
  return code === "missing-link" ? "missingLink" : code;
}

/** `t` is typed against the catalogue, and a finding kind is data the validator chooses. */
type RulePath = "report.rule.orphan-page";

/**
 * A finding kind said as a sentence; the code, line anchor and validator English stay under the
 * disclosure. An unknown kind falls back to the code, not a raw path. Not exported: no importer.
 */
function reportRuleTitle(
  code: string,
  t: ReturnType<typeof useTranslations<"library">>,
): string {
  const path = `report.rule.${code}` as RulePath;
  return t.has(path) ? t(path) : code;
}

/** The anchors the outline rail holds for kinds that live behind the advisory fold. */
export function advisoryReportSlugs(structural: WikiReport | null): ReadonlySet<string> {
  return new Set(
    (structural?.groups ?? []).filter((group) => group.advisory).map((group) => `report-code-${group.code}`),
  );
}

function logWhen(at: string): string {
  const date = new Date(at);
  if (Number.isNaN(date.getTime())) return at;
  return date.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

/*
 * `describeWikiProblem` is the one describer, so a finding here and beside its page read as the same
 * sentence.
 */

/**
 * The report's sections, in reading order, as the outline rail lists them.
 *
 * Two depth-1 heads — the two ledgers — with each ledger's kinds at depth 2. The page
 * builds the rail from this, so the rail and the page cannot disagree about what is on
 * it, and the rail is what makes the agent's half reachable in one press on a young wiki
 * where the computed half is long (the measured cost of direction B).
 */
export function reportOutline(
  structural: WikiReport | null,
  findings: readonly LintFinding[],
  candidateCount: number,
  t: ReturnType<typeof useTranslations<"library">>,
): Array<{ slug: string; text: string; depth: number; occurrence: number; duplicate: boolean }> {
  const out: Array<{ slug: string; text: string; depth: number; occurrence: number; duplicate: boolean }> = [];
  if (structural) {
    out.push({ slug: "report-structural", text: t("report.structuralTitle"), depth: 1, occurrence: 1, duplicate: false });
    for (const group of structural.groups) {
      out.push({
        slug: `report-code-${group.code}`,
        text: `${reportRuleTitle(group.code, t)} ${group.count}`,
        depth: 2,
        occurrence: 1,
        duplicate: false,
      });
    }
  }
  out.push({ slug: "report-semantic", text: t("report.semanticTitle"), depth: 1, occurrence: 1, duplicate: false });
  for (const code of FINDING_ORDER) {
    const count = findings.filter((finding) => finding.code === code).length;
    if (count === 0) continue;
    out.push({ slug: `report-${code}`, text: `${t(`wiki.findingKind.${findingKindKey(code)}`)} ${count}`, depth: 2, occurrence: 1, duplicate: false });
  }
  if (candidateCount > 0) {
    out.push({ slug: "report-names", text: `${t("report.namesTitle")} ${candidateCount}`, depth: 2, occurrence: 1, duplicate: false });
  }
  return out;
}

/** One finding's identity across a turn: its kind, its pages, its sentence. */
export function findingKey(finding: LintFinding): string {
  return `${finding.code}\u241f${finding.pages.join(",")}\u241f${finding.summary}`;
}

function pageName(slug: string): string {
  return slug.replace(/^wiki\//, "");
}

/** `wiki/<slug>.md` as the aggregator carries it, to the slug the reader opens. */
function pageSlug(path: string): string {
  return path.replace(/\.md$/, "");
}

/**
 * The door is the row's whole ability, so it takes the brightest interactive ink. `px-1.5` keeps the
 * 2px inset focus ring off the glyphs; the paragraph's `-ml-1.5` gives it back to the column.
 */
function PageDoors({
  pages,
  suffixes,
  onOpenPage,
}: {
  pages: readonly string[];
  /**
   * Appended after the last page — a line number per collapsed row, or a provenance word.
   * A list rather than one string because one door can now stand for several lines.
   */
  suffixes?: readonly string[];
  onOpenPage: (slug: string) => void;
}) {
  return (
    <p className="-ml-1.5 mt-1 flex flex-wrap items-center gap-x-1 gap-y-1 text-label leading-label text-[color:var(--color-text-quaternary)]">
      {pages.map((slug, pageIndex) => (
        <span key={slug} className="inline-flex items-center gap-x-1">
          {pageIndex > 0 ? <span aria-hidden>·</span> : null}
          <button
            type="button"
            data-testid="library-finding-page"
            onClick={() => onOpenPage(slug)}
            className={controlClass({
              shape: "link",
              size: "lg",
              tone: "strong",
              className:
                "atlas-touch-floor px-1.5 underline decoration-[color:var(--color-indigo-line-a40)] underline-offset-2 hover:decoration-[color:var(--color-indigo-accent)]",
            })}
          >
            {pageName(slug)}
          </button>
        </span>
      ))}
      {(suffixes ?? []).map((suffix, suffixIndex) => (
        <span key={`${suffixIndex}-${suffix}`} className="inline-flex items-center gap-x-1">
          <span aria-hidden>·</span>
          <span>{suffix}</span>
        </span>
      ))}
    </p>
  );
}

/**
 * Rows in one code group naming the same page and sentence merge into one row whose door carries
 * every place; places come from the describer in the reader's words.
 */
interface StructuralRow {
  row: WikiReportRow;
  words: WikiProblemWords;
  /** Every place this row stands for, in the validator's order. */
  places: WikiProblemWhere[];
}

function collapseStructuralRows(
  rows: readonly WikiReportRow[],
  t: ReturnType<typeof useTranslations<"library">>,
  context: WikiProblemContext,
): StructuralRow[] {
  const out: StructuralRow[] = [];
  const at = new Map<string, number>();
  for (const row of rows) {
    // Field by field with a unit separator, the same key discipline the recovery proof
    // records: a page path can hold any character a folder allows. The sentence half is
    // the describer's plain string \u2014 the one piece of its output that is a comparable
    // value rather than something to press.
    const words = describeWikiProblem(row, t, context);
    const key = `${row.page}\u241f${words.sentence}`;
    const seen = at.get(key);
    if (seen === undefined) {
      at.set(key, out.length);
      out.push({ row, words, places: words.where ? [words.where] : [] });
    } else if (words.where) {
      out[seen]!.places.push(words.where);
    }
  }
  return out;
}

/**
 * The sentence with every name and every place taken out — what makes two rows *the same
 * finding said twice* rather than two findings.
 */
function sentenceShape(words: WikiProblemWords): string {
  return words.segments
    .map((segment) =>
      segment.kind === "text"
        ? `t${segment.text}`
        : segment.kind === "where"
          ? "w"
          : `g${segment.target.kind}:${segment.target.id}`,
    )
    .join("\u241f");
}

/**
 * **What every row in a group says identically is the rule, and a rule is said once.**
 *
 * ⚠️ Measured on the 300-source fixture (60 pages, 42 off-template, **222 findings**,
 * `inspection-122/52-en-report.png`): every one of the 42 `uncited-fact` rows restated the
 * same two sentences, as did all 60 `orphan-page` and 120 `shared-source-unlinked` rows —
 * ~670 lines of prose to say four things. The page said a fact once per time the validator
 * fired instead of once per screen.
 *
 * Sharing is **measured, never assumed**. A sentence is the group's rule only when every
 * row's shape *and* its place read alike; where the sentence names a different page or a
 * different line on each row, that difference is the finding and the row keeps its own
 * sentence. The action is judged separately, because one code can carry two of them
 * (`citation-target-missing` is a different repair inside the folder and inside the page's
 * own source list) and a wrong repair printed once is worse than a right one printed twice.
 */
function sharedRule(rows: readonly StructuralRow[]): { sentence: StructuralRow | null; action: string | null } {
  const first = rows[0];
  if (!first) return { sentence: null, action: null };
  const shape = sentenceShape(first.words);
  const place = first.words.where?.label ?? null;
  const sameSentence = rows.every(
    (entry) => sentenceShape(entry.words) === shape && (entry.words.where?.label ?? null) === place,
  );
  const action = first.words.action;
  const sameAction = action !== null && rows.every((entry) => entry.words.action === action);
  return { sentence: sameSentence ? first : null, action: sameAction ? action : null };
}

/** The place on a door, in the reader's words — the section is already in the sentence. */
function placeSuffix(where: WikiProblemWhere): string {
  return where.lineLabel ?? where.label;
}

/**
 * The heading is a sentence and the code is one press away under `wiki.technical`. The 1px rule
 * makes the boundary between kinds structural rather than a matter of ink.
 */
function StructuralGroup({
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
      <h4
        id={`report-code-${group.code}`}
        className="scroll-mt-4 text-body font-[var(--font-weight-strong)] leading-body text-[color:var(--color-text-secondary)] [word-break:keep-all]"
      >
        {reportRuleTitle(group.code, t)}
        <span className="ml-2 text-label font-normal text-[color:var(--color-text-quaternary)]">
          {group.count}
        </span>
      </h4>
      {rule.sentence ? (
        <p
          data-testid="library-structural-rule"
          className="mt-1 text-body leading-body text-[color:var(--color-text-secondary)] [word-break:keep-all]"
        >
          {/* The place is a word here and not a press: this page is not the page, so there
              is nothing on screen to travel to. Each row's own door opens it. */}
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
      {/* The machine's own vocabulary, whole, one press away — every finding the validator
          fired, not the rows this page collapsed them into. Deliberately not localised: a
          person opening this is holding the screen beside a terminal or an agent
          transcript, and a translated synonym is a word they would have to map back. */}
      <Disclosure
        className="mt-2.5"
        summary={t("wiki.technical")}
        summaryTestId={`library-structural-technical-${group.code}`}
      >
        <ul className="mt-1.5 flex flex-col gap-1">
          {group.rows.map((row, index) => (
            <li
              key={`${row.page}-${row.code}-${row.line ?? index}`}
              data-testid="library-structural-code"
              className="font-mono text-label leading-label text-[color:var(--color-text-quaternary)]"
            >
              {`${row.page} — ${wikiProblemMachineLine(row)}`}
            </li>
          ))}
        </ul>
      </Disclosure>
    </section>
  );
}

export function LibraryCheckReport({
  structural,
  findings,
  candidates,
  lastLint,
  busy,
  running,
  onLint,
  lintBlockedReason,
  agentMissing = false,
  onFix,
  onPropose,
  onOpenPage,
  onOpenSource,
  pageTitle,
  onJumpToSection,
  advisoryOpen: advisoryOpenProp,
  onAdvisoryOpenChange,
  fixedKeys,
  t,
}: {
  /**
   * The app's own half, already grouped. Null only where no folder is open — never
   * because nobody pressed anything.
   */
  structural: WikiReport | null;
  findings: readonly LintFinding[];
  candidates: readonly LintNodeCandidate[];
  /** The app's record of the last agent reading, or null when it never ran. */
  lastLint: { at: string; summary: string } | null;
  busy: boolean;
  /**
   * A check is in flight now, unlike `busy`. Only this chip wears the wait, since at 1024 and below
   * the index column holding the other running mark is off screen.
   */
  running?: boolean;
  /** Starts a check; null when no agent can run one here — the chip is still drawn. */
  onLint: (() => void) | null;
  /** Why it cannot run here, for the disabled chip. Null when it can. */
  lintBlockedReason?: string | null;
  /**
   * The installed app found no coding agent: the chip gives way to the index's `AgentMissingNotice` so
   * one missing agent reads one way on both sides.
   */
  agentMissing?: boolean;
  onFix: ((finding: LintFinding) => void) | null;
  onPropose: ((candidate: LintNodeCandidate) => void) | null;
  onOpenPage: (slug: string) => void;
  /**
   * Opens an original a finding names. Absent leaves that file name as plain words — the
   * honest degradation, rather than a press that goes nowhere.
   */
  onOpenSource?: (path: string) => void;
  /** A wiki page's own title, by slug, so a finding names pages the way the list does. */
  pageTitle?: (slug: string) => string | undefined;
  /**
   * Moves the pane to one of this page's own section heads. Given by the caller because
   * the scroll container and the reduced-motion decision belong to the reading pane, and
   * the outline rail's clicks already travel through the same function — two answers to
   * "go to that head" is how one of them drifts.
   */
  onJumpToSection?: (slug: string) => void;
  /**
   * Whether the advisory kinds are open, when the caller has an answer. The rail lives above this
   * component, so the state it changes lives with the rail's handler; uncontrolled stays local.
   */
  advisoryOpen?: boolean;
  onAdvisoryOpenChange?: (open: boolean) => void;
  /** Keys (`findingKey`) of the findings a Fix turn completed since the last check. */
  fixedKeys?: ReadonlySet<string>;
  t: ReturnType<typeof useTranslations<"library">>;
}) {
  const [candidatesOpen, setCandidatesOpen] = useState(false);
  /**
   * Advisory kinds start closed in every state: they are true of any wiki nobody has cross-linked, so
   * never the page to fix first, and open they push the agent half below the fold.
   */
  const [advisoryOpenLocal, setAdvisoryOpenLocal] = useState(false);
  const advisoryOpen = advisoryOpenProp ?? advisoryOpenLocal;
  const setAdvisoryOpen = (next: boolean) => {
    if (onAdvisoryOpenChange) onAdvisoryOpenChange(next);
    else setAdvisoryOpenLocal(next);
  };
  /*
   * What a structural row's sentence may press, and how precisely it names a place.
   *
   * No `onOpenPlace`: this page is not the page a finding is about, so there is no
   * paragraph here to travel to — the row's own door opens the page instead. And `place:
   * "section"` keeps the line out of the sentence, where the collapsed row already
   * carries every line on its door.
   */
  const structuralDoors: WikiProblemDoors = { onOpenPage, ...(onOpenSource ? { onOpenSource } : {}) };
  const structuralContext: WikiProblemContext = {
    place: "section",
    ...(pageTitle ? { pageTitle } : {}),
  };
  const orderedCandidates = [...candidates].sort(
    (a, b) => Number(isMapKind(b.kind)) - Number(isMapKind(a.kind)),
  );
  const shownCandidates = candidatesOpen ? orderedCandidates : orderedCandidates.slice(0, CANDIDATE_FOLD);
  const foldedCandidates = orderedCandidates.length - shownCandidates.length;
  const groups = FINDING_ORDER.map((code) => ({
    code,
    rows: findings.filter((finding) => finding.code === code),
  })).filter((group) => group.rows.length > 0);
  /*
   * Only the agent's half can be empty. `lastCheckFoundSomething` reads the log line for a non-zero
   * digit because counts persist in `wiki/_log.md` and findings do not.
   */
  const semanticEmpty = findings.length === 0 && candidates.length === 0;
  const lastCheckFoundSomething = !!lastLint && /(?:^|\D)[1-9]\d*/.test(lastLint.summary);
  const blockingGroups = (structural?.groups ?? []).filter((group) => !group.advisory);
  const advisoryGroups = (structural?.groups ?? []).filter((group) => group.advisory);
  const advisoryCount = advisoryGroups.reduce((total, group) => total + group.count, 0);
  /* The agent half's own total, so the jump says how much is down there rather than only
     that something is. Zero prints no number: a bare 0 beside a head reads as "nothing
     here" for a half that still holds the one ability this screen can be blocked on. */
  const semanticCount = findings.length + candidates.length;

  return (
    <article data-testid="library-check-report" className="mx-auto w-full max-w-[var(--measure-doc-column)] px-6 pb-[var(--page-bottom-breath)] pt-8 md:px-10">
      <header>
        <h2 className="text-display font-[var(--font-weight-signature)] leading-title tracking-[var(--tracking-card)] text-[color:var(--color-text-primary)]">
          {t("report.title")}
        </h2>
      </header>

      {structural ? (
        <section data-testid="library-check-structural" className="mt-8">
          <h3
            id="report-structural"
            className="scroll-mt-4 text-title font-[var(--font-weight-strong)] leading-body text-[color:var(--color-text-primary)]"
          >
            {t("report.structuralTitle")}
          </h3>
          {/* Derived counts, not a remembered line. The head names what each number
              counts, because `wiki-validate` calls every page with any finding
              off-template while a page whose only findings are advisory fits — one folder,
              two true totals, and a frame that showed both without saying so is what the
              licensing record's falsifier describes. */}
          <p
            data-testid="library-check-structural-head"
            className="mt-1.5 text-label leading-label text-[color:var(--color-text-tertiary)] [word-break:keep-all]"
          >
            {t("report.structuralHead", {
              pages: structural.pageCount,
              offTemplate: structural.blockingPageCount,
              findings: structural.findingCount,
            })}
          </p>
          {structural.unmeasured.length > 0 ? (
            /* Page bytes are read lazily, so "nothing listed" and "nothing read yet" are
               different states and the second one must never wear the first one's words. */
            <p
              data-testid="library-check-unmeasured"
              className="mt-2 text-caption leading-body text-[color:var(--color-text-tertiary)] [word-break:keep-all]"
            >
              {t("report.unmeasured", { count: structural.unmeasured.length })}
            </p>
          ) : null}
          {/*
            **The two ledgers, one press apart, where the rail cannot exist.**

            The outline rail is what made the agent's half reachable in one press — and it
            needs a *pane* of 1045px, not a window: at the installed app's 1040px window
            floor the pane is ≈696px, and every iPad width lands between 680 and 1032. So
            below the rail's fit this page carries its own two-item jump, gated on the
            attribute the pane already emits for exactly this question (`DocReadingPane`,
            `data-outline-fit`). It is not a second outline: two items, the two ledgers,
            and it disappears the moment the rail can stand.

            No `atlas-touch-floor` on these chips: `shape: "chip"` emits the marker from the
            value layer, so a second copy would claim the floor came from here (measured
            44px under `hasTouch` at 390). The page doors carry their own because `link` is
            excluded there by the inline exemption.
          */}
          {onJumpToSection ? (
            <nav
              data-testid="library-report-jump"
              aria-label={t("report.jumpAria")}
              className='mt-2.5 hidden flex-wrap items-center gap-1.5 [[data-outline-fit="hidden"]_&]:flex'
            >
              <Chip
                data-testid="library-report-jump-structural"
                tone="muted"
                hoverInk="strong"
                onClick={() => onJumpToSection("report-structural")}
              >
                {t("report.structuralTitle")}
              </Chip>
              <Chip
                data-testid="library-report-jump-semantic"
                tone="muted"
                hoverInk="strong"
                onClick={() => onJumpToSection("report-semantic")}
              >
                {t("report.semanticTitle")}
                {semanticCount > 0 ? (
                  <span className="text-label text-[color:var(--color-text-quaternary)]">{semanticCount}</span>
                ) : null}
              </Chip>
            </nav>
          ) : null}
          {structural.groups.length === 0 && structural.unmeasured.length === 0 ? (
            <p className="mt-3 text-body leading-body text-[color:var(--color-text-secondary)] [word-break:keep-all]">
              {t("report.structuralClean")}
            </p>
          ) : null}
          {blockingGroups.map((group) => (
            <StructuralGroup
              key={group.code}
              group={group}
              onOpenPage={onOpenPage}
              doors={structuralDoors}
              context={structuralContext}
              t={t}
            />
          ))}
          {advisoryGroups.length > 0 ? (
            <>
              {/*
                One closed control for the kinds the app itself calls expected of a young
                wiki, reusing the `library-candidates-fold` pattern so the page has one
                grammar for "there is more here". The mark labels the control instead of
                decorating a heading: it is the reason this fold is closed, not a note on
                a row.

                While it is closed the rail's advisory entries land here — the anchors move
                with the rows they stand for, so `#report-code-orphan-page` still resolves
                to something on screen rather than to a collapsed section.
              */}
              <div className="mt-5 border-t border-[color:var(--color-divider)] pt-4">
                <Chip
                  data-testid="library-advisory-fold"
                  tone="muted"
                  hoverInk="strong"
                  onClick={() => setAdvisoryOpen(!advisoryOpen)}
                  aria-expanded={advisoryOpen}
                >
                  {advisoryOpen ? (
                    t("report.advisoryLess")
                  ) : (
                    <>
                      <span>{t("report.advisoryFold", { count: advisoryCount })}</span>
                      <span aria-hidden>·</span>
                      <span className="text-[color:var(--color-text-tertiary)] [word-break:keep-all]">
                        {t("report.advisoryMark")}
                      </span>
                    </>
                  )}
                </Chip>
                {!advisoryOpen
                  ? advisoryGroups.map((group) => (
                      <span key={group.code} aria-hidden className="block scroll-mt-4" id={`report-code-${group.code}`} />
                    ))
                  : null}
              </div>
              {advisoryOpen
                ? advisoryGroups.map((group) => (
                    <StructuralGroup
              key={group.code}
              group={group}
              onOpenPage={onOpenPage}
              doors={structuralDoors}
              context={structuralContext}
              t={t}
            />
                  ))
                : null}
            </>
          ) : null}
        </section>
      ) : null}

      <section data-testid="library-check-semantic" className="mt-10">
        <h3
          id="report-semantic"
          className="scroll-mt-4 text-title font-[var(--font-weight-strong)] leading-body text-[color:var(--color-text-primary)]"
        >
          {t("report.semanticTitle")}
        </h3>
        <p
          data-testid="library-check-report-when"
          className="mt-1.5 text-caption leading-body text-[color:var(--color-text-tertiary)] [word-break:keep-all]"
        >
          {lastLint
            ? t("wiki.logLint", { when: logWhen(lastLint.at), summary: localizeWikiLogSummary(lastLint.summary, t) })
            : t("report.never")}
        </p>

        {semanticEmpty ? (
          <div className="mt-4 flex flex-col items-start gap-3">
            {/* Lines here live in the report's column, so `--measure-doc-column` is the measure, not a `ch` cap,
               which resolves shorter and gives a second right edge. */}
            <p className="text-body leading-body text-[color:var(--color-text-secondary)] [word-break:keep-all]">
              {lastLint ? (lastCheckFoundSomething ? t("report.gone") : t("report.clean")) : t("report.emptyLede")}
            </p>
          </div>
        ) : null}

        {/* Availability is a state with its reason. With no coding agent at all, the index's notice with its
           door replaces a dead chip; while one is still being looked for, or a local model can only compile,
           the chip stays beside its reason. */}
        {onLint === null && agentMissing ? (
          <AgentMissingNotice
            testId="library-check-report-agent-missing"
            doorTestId="library-check-report-agent-missing-door"
            className="mt-4 w-fit max-w-full"
            t={t}
          />
        ) : onLint || lintBlockedReason ? (
          <div className="mt-4 flex flex-col items-start gap-1.5">
            <Chip
              data-testid="library-check-report-lint"
              onClick={onLint ?? undefined}
              disabled={busy || onLint === null}
              tone="secondary"
              hoverInk="strong"
              data-report-state={running ? "running" : undefined}
              aria-describedby={onLint === null && lintBlockedReason ? "library-check-report-lint-blocked" : undefined}
            >
              {running ? (
                /*
                 * The wait replaces the icon in its own slot, so the label does not move —
                 * the inline form `AgentClientButtons` already proves, a 14px slot holding
                 * the 16px micro mark. The word is said once, live, for a screen reader;
                 * the mark says it for everybody else.
                 */
                <span
                  data-testid="library-check-report-running"
                  className="relative inline-flex size-3.5 shrink-0"
                >
                  <BrandMark
                    detail="micro"
                    alt=""
                    aria-hidden
                    className="atlas-inline-waiting-mark absolute left-1/2 top-1/2 size-4 max-w-none -translate-x-1/2 -translate-y-1/2"
                  />
                  <span aria-live="polite" className="sr-only">
                    {t("report.running")}
                  </span>
                </span>
              ) : (
                <Stethoscope size={ICON_SIZE.sm} aria-hidden />
              )}
              <span>{t("wiki.lint")}</span>
            </Chip>
            {onLint === null && lintBlockedReason ? (
              <p
                id="library-check-report-lint-blocked"
                data-testid="library-check-report-lint-blocked"
                className="text-caption leading-body text-[color:var(--color-text-tertiary)] [word-break:keep-all]"
              >
                {lintBlockedReason}
              </p>
            ) : null}
          </div>
        ) : null}

        {groups.map((group) => (
          <section key={group.code} data-testid={`library-check-report-${group.code}`} className="mt-8">
            <h4
              id={`report-${group.code}`}
              className="scroll-mt-4 text-body font-[var(--font-weight-strong)] leading-body text-[color:var(--color-text-primary)]"
            >
              {t(`wiki.findingKind.${findingKindKey(group.code)}`)}
              <span className="ml-2 text-label font-normal text-[color:var(--color-text-quaternary)]">
                {group.rows.length}
              </span>
            </h4>
            <ul className="mt-2 flex flex-col divide-y divide-[color:var(--color-divider)]">
              {group.rows.map((finding, index) => (
                <li
                  key={`${findingKey(finding)}${index}`}
                  data-testid="library-finding"
                  data-state={fixedKeys?.has(findingKey(finding)) ? "fixed" : undefined}
                  className="flex min-w-0 items-start gap-4 py-3"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-body leading-body text-[color:var(--color-text-primary)] [word-break:keep-all]">
                      {finding.summary}
                    </p>
                    <PageDoors pages={finding.pages} onOpenPage={onOpenPage} />
                  </div>
                  {fixedKeys?.has(findingKey(finding)) ? (
                    /* A Fix turn ended on this finding; the row says so until the next check re-judges the pages. */
                    <span
                      data-testid="library-finding-fixed"
                      className="flex-none pt-1 text-caption text-[color:var(--color-text-quaternary)] [word-break:keep-all]"
                    >
                      {t("report.fixed")}
                    </span>
                  ) : onFix ? (
                    <Tooltip content={t("wiki.fixTooltip")}>
                      <Chip
                        data-testid="library-finding-fix"
                        onClick={() => onFix(finding)}
                        disabled={busy}
                        tone="secondary"
                        hoverInk="strong"
                        className="atlas-touch-floor-wide flex-none"
                        aria-label={`${t("wiki.fix")}: ${finding.summary}`}
                      >
                        {t("wiki.fix")}
                      </Chip>
                    </Tooltip>
                  ) : null}
                </li>
              ))}
            </ul>
          </section>
        ))}

        {candidates.length > 0 ? (
          <section data-testid="library-candidates" className="mt-8">
            <h4
              id="report-names"
              className="scroll-mt-4 text-body font-[var(--font-weight-strong)] leading-body text-[color:var(--color-text-primary)]"
            >
              {t("report.namesTitle")}
              <span className="ml-2 text-label font-normal text-[color:var(--color-text-quaternary)]">
                {candidates.length}
              </span>
            </h4>
            <p className="mt-1 text-caption leading-body text-[color:var(--color-text-quaternary)] [word-break:keep-all]">
              {t("wiki.candidatesTooltip")}
            </p>
            <ul className="mt-3 flex flex-col divide-y divide-[color:var(--color-divider)]">
              {shownCandidates.map((candidate) => (
                <li
                  key={`${candidate.name}${candidate.pages.join(",")}`}
                  data-testid="library-candidate"
                  className="flex min-w-0 items-center gap-4 py-2.5"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-body leading-body text-[color:var(--color-text-primary)] [word-break:keep-all]" title={candidate.why || undefined}>
                      {candidate.name}
                    </p>
                    <p className="mt-0.5 text-caption text-[color:var(--color-text-quaternary)]">
                      {t(`wiki.candidateKind.${candidate.kind}`)} · {t("wiki.candidatePages", { count: candidate.pages.length })}
                    </p>
                  </div>
                  {onPropose && isMapKind(candidate.kind) ? (
                    <Tooltip content={t("wiki.proposeTooltip")}>
                      <Chip
                        data-testid="library-candidate-propose"
                        onClick={() => onPropose(candidate)}
                        disabled={busy}
                        tone="secondary"
                        hoverInk="strong"
                        className="atlas-touch-floor-wide flex-none"
                        aria-label={`${t("wiki.propose")}: ${candidate.name}`}
                      >
                        {t("wiki.propose")}
                      </Chip>
                    </Tooltip>
                  ) : null}
                </li>
              ))}
            </ul>
            {foldedCandidates > 0 || candidatesOpen ? (
              <Chip
                data-testid="library-candidates-fold"
                tone="muted"
                hoverInk="strong"
                className="mt-2"
                onClick={() => setCandidatesOpen((open) => !open)}
                aria-expanded={candidatesOpen}
              >
                {candidatesOpen ? t("wiki.candidatesLess") : t("wiki.candidatesMore", { count: foldedCandidates })}
              </Chip>
            ) : null}
          </section>
        ) : null}
      </section>
    </article>
  );
}
