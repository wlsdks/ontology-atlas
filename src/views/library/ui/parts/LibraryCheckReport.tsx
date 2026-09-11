"use client";

import { useState } from "react";
import { Stethoscope } from "lucide-react";
import type { useTranslations } from "next-intl";

import { isMapKind, type LintFinding, type LintNodeCandidate } from "@/features/library";
import type { WikiReport, WikiReportRow } from "@/shared/lib/wiki-report.mjs";
import { Chip, Tooltip } from "@/shared/ui";
import { BrandMark } from "@/shared/ui/brand-mark";
import { controlClass } from "@/shared/ui/control-class";
import { ICON_SIZE } from "@/shared/ui/icon-size";

import { localizeWikiLogSummary } from "../../lib/wiki-log-summary";

/**
 * **What the check found, as a page in the reading pane — two ledgers, the computed one
 * first.**
 *
 * Owner direction 2026-09-07 (design round, direction B) put the findings in the pane
 * rather than the 280px index column: in the column they were three-line clips that
 * pushed the page list off the screen. Owner selection 2026-09-12 (`/design-directions`
 * direction B, licensed by `docs/DECISIONS.md` 2026-09-11 "The Library keeps its spine,
 * and computes the structural check itself") decides what the pane holds.
 *
 * ⚠️ **The page used to be one ledger, and it was the agent's.** Every row came from the
 * last agent turn, held in memory for the session, and after a restart the page printed
 * *"what the last check found does not survive reopening the app"* — under a head that was
 * still counting those findings, because `wiki/_log.md` keeps the counts. Measured on the
 * installed app (`.claude/shots-2026-09-11/library-after/30-check-result-panel.png`): the
 * head counted two missing links and one name without a page, the body listed neither,
 * and in the same frame the pane strip said two pages were off-template while two index
 * rows each said the page needed its sources checked and was off-template. The app had
 * already computed, per page, facts it was telling the person it could not show.
 *
 * So the page is now **two places, and the place is the provenance**:
 *
 * 1. **What the app checked** leads, because it is the half that is always true. It is
 *    derived from `model.structural` — `verdicts` regrouped by `mcp/src/wiki-report.mjs`,
 *    the same module `wiki-validate` and `validate_wiki` group with — so it needs no
 *    press, no agent and no memory, and it is identical after quitting the app because
 *    nothing about it was remembered. Blocking kinds first, advisory last.
 * 2. **What the agent read** follows with its own head: the log line, or the disabled
 *    "Check the wiki" chip and the reason it cannot run here. Only this half can be
 *    empty, and only its copy may say so.
 *
 * That split is why `report.never` / `clean` / `gone` / `emptyLede` were re-scoped rather
 * than reused. `empty` was computed from the *agent's* findings, so a person with no agent
 * would have read "Not checked yet…" directly above a live list of nine computed rows, and
 * a clean agent run would have printed "found nothing to fix" above findings that are
 * exactly things to fix (both PO seats, 2026-09-12).
 *
 * **Every row keeps one door, and only one.** A finding's page names are the door: they
 * are `library-finding-page` buttons and they open the page. Structural rows get that and
 * nothing else — the door *is* the "open" the owner's decision asks for, and a chip beside
 * a link to the same page would be two doors to one place. **Fix** and **Propose** start
 * agent turns that write, so they stay on the agent's half only.
 */

/** Names past this many fold behind a count; the map kinds come first. */
const CANDIDATE_FOLD = 5;

const FINDING_ORDER: ReadonlyArray<LintFinding["code"]> = ["disagreement", "superseded", "missing-link"];

function findingKindKey(code: LintFinding["code"]): "disagreement" | "superseded" | "missingLink" {
  return code === "missing-link" ? "missingLink" : code;
}

function logWhen(at: string): string {
  const date = new Date(at);
  if (Number.isNaN(date.getTime())) return at;
  return date.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

/**
 * The finding in the reader's language, or the validator's English when there is no
 * translation for that sentence yet.
 *
 * The same rule `WikiTemplateProblems` applies beside a page: `message` is written once,
 * in English, for the machines that read it — `wiki-validate`'s output, `validate_wiki`'s
 * payload, an agent's retry — and a person gets `detail`, the sentence's pieces,
 * reassembled in their own language. `t.has` rather than a table of known keys: the
 * validator owns which sentence it just found, and a key it grows before this file learns
 * about it should degrade to English rather than render a raw message path.
 */
function describeStructuralRow(
  row: WikiReportRow,
  t: ReturnType<typeof useTranslations<"library">>,
): string {
  const key = row.detail?.key;
  if (!key) return row.message;
  const path = `wiki.problem.${key}` as "wiki.problem.orphan-page";
  if (!t.has(path)) return row.message;
  return t(path, row.detail?.values ?? {});
}

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
        text: `${group.code} ${group.count}`,
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
 * A finding's pages, each one a door. One component for both ledgers so a structural row
 * and a semantic row cannot come to look like different kinds of thing.
 *
 * **The door is the row's entire ability, so it is the row's brightest interactive ink**
 * (`design-guardian`, council 2026-09-12). Measured at 1512 before this change: the rule
 * sentence was `text-body` primary (12.5px, the brightest text on the screen) over a
 * `text-caption` quaternary page name (9.5px) — the element doing the screen's job was the
 * weakest thing on it, while `Fix`/`Propose` are deliberately absent from a structural row.
 * So the door takes the body step in primary and the sentence steps back to secondary.
 * `px-1.5` is not spacing taste: the focus ring is 2px inset, and with no horizontal
 * padding it landed on the first and last glyph (`design-interaction`, same council). The
 * paragraph's `-ml-1.5` gives that padding back to the column, so the first door's glyphs
 * still stand on the sentence's own left edge.
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
      {(suffixes ?? []).map((suffix) => (
        <span key={suffix} className="inline-flex items-center gap-x-1">
          <span aria-hidden>·</span>
          <span>{suffix}</span>
        </span>
      ))}
    </p>
  );
}

/**
 * **One row per bullet a person fixes, not per time the validator fired.**
 *
 * Within one code group, rows that name the same page and retell the same sentence become
 * one row whose door carries every line: `merchant-onboarding · :19 · :20`. Measured at
 * 1512 (design-lead, council 2026-09-12): rows 4 and 5 were the same three-line sentence
 * twice, differing only in the line number — 32 lines of rule prose around six page names.
 *
 * It is a dedup of ink and **not** a substitute for the advisory fold: on the four-page
 * fixture it closes ≈65px of ≈330, and on a larger wiki it grows with the findings while
 * the fold's cost stays constant (the concession that closed round 2).
 */
function collapseStructuralRows(
  rows: readonly WikiReportRow[],
  t: ReturnType<typeof useTranslations<"library">>,
): Array<{ row: WikiReportRow; lines: number[] }> {
  const out: Array<{ row: WikiReportRow; lines: number[] }> = [];
  const at = new Map<string, number>();
  for (const row of rows) {
    // Field by field with a unit separator, the same key discipline the recovery proof
    // records: a page path can hold any character a folder allows.
    const key = `${row.page}\u241f${describeStructuralRow(row, t)}`;
    const seen = at.get(key);
    if (seen === undefined) {
      at.set(key, out.length);
      out.push({ row, lines: row.line ? [row.line] : [] });
    } else if (row.line) {
      out[seen]!.lines.push(row.line);
    }
  }
  return out;
}

/**
 * One code's findings: the code as the heading, the count, and a row per bullet.
 *
 * **The heading keeps the code and gains a grade.** Both design seats agreed one
 * vocabulary with `wiki-validate` beats a translated synonym a person would have to map
 * back to their terminal — it is how they can check the licensing record's falsifier
 * themselves — so the defect was never the word but the ladder: a 9.5px tertiary heading
 * over a 12.5px primary body, a heading smaller than the text it heads (ratio 1.3,
 * inverted). It now takes the body step in secondary.
 *
 * The 1px rule above it makes the boundary between two kinds **structural rather than a
 * matter of ink**, which is what lets the rows below it step back without the group
 * dissolving into one list.
 */
function StructuralGroup({
  group,
  onOpenPage,
  t,
}: {
  group: WikiReport["groups"][number];
  onOpenPage: (slug: string) => void;
  t: ReturnType<typeof useTranslations<"library">>;
}) {
  return (
    <section
      data-testid="library-structural-group"
      data-code={group.code}
      data-advisory={group.advisory ? "true" : undefined}
      className="mt-5 border-t border-[color:var(--color-divider)] pt-4"
    >
      <h4
        id={`report-code-${group.code}`}
        className="scroll-mt-4 font-mono text-body leading-body text-[color:var(--color-text-secondary)]"
      >
        {group.code}
        <span className="ml-2 font-sans text-label font-normal text-[color:var(--color-text-quaternary)]">
          {group.count}
        </span>
      </h4>
      <ul className="mt-1.5 flex flex-col divide-y divide-[color:var(--color-divider)]">
        {collapseStructuralRows(group.rows, t).map(({ row, lines }) => (
          <li
            key={`${row.page}-${row.code}-${lines.join(",")}`}
            data-testid="library-structural-finding"
            className="flex min-w-0 items-start gap-4 py-2.5"
          >
            <div className="min-w-0 flex-1">
              <p className="max-w-[var(--measure-prose)] text-body leading-body text-[color:var(--color-text-secondary)] [word-break:keep-all]">
                {describeStructuralRow(row, t)}
              </p>
              <PageDoors
                pages={[pageSlug(row.page)]}
                suffixes={lines.map((line) => `:${line}`)}
                onOpenPage={onOpenPage}
              />
            </div>
          </li>
        ))}
      </ul>
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
  onFix,
  onPropose,
  onOpenPage,
  onJumpToSection,
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
   * A check is in flight **right now**, as opposed to `busy`, which is true of every turn
   * this screen can start. Only this half of the page can run one, so only this chip may
   * wear the wait — and it must: at ≤1024 the index column holding the other running mark
   * is off screen, so a running check was invisible everywhere (`design-interaction`,
   * council 2026-09-12).
   */
  running?: boolean;
  /** Starts a check; null when no agent can run one here — the chip is still drawn. */
  onLint: (() => void) | null;
  /** Why it cannot run here, for the disabled chip. Null when it can. */
  lintBlockedReason?: string | null;
  onFix: ((finding: LintFinding) => void) | null;
  onPropose: ((candidate: LintNodeCandidate) => void) | null;
  onOpenPage: (slug: string) => void;
  /**
   * Moves the pane to one of this page's own section heads. Given by the caller because
   * the scroll container and the reduced-motion decision belong to the reading pane, and
   * the outline rail's clicks already travel through the same function — two answers to
   * "go to that head" is how one of them drifts.
   */
  onJumpToSection?: (slug: string) => void;
  /** Keys (`findingKey`) of the findings a Fix turn completed since the last check. */
  fixedKeys?: ReadonlySet<string>;
  t: ReturnType<typeof useTranslations<"library">>;
}) {
  const [candidatesOpen, setCandidatesOpen] = useState(false);
  /**
   * **The advisory kinds start closed, in every state.**
   *
   * `orphan-page` and `shared-source-unlinked` are true of every page in a wiki nobody has
   * cross-linked yet — the app says so itself in `report.advisoryMark` — so they are by
   * definition never the page to fix first. Measured from `measurements.json`: they held
   * 413px at ≥768 and 473px at 390, which put "What the agent read" at y1049 and y1149,
   * below the fold at every width the product is used at. Two closed summary rows cost
   * ≈88px. The rail that used to be the answer to that cost is *arithmetically impossible*
   * below a 1045px pane — the installed app's 1040px window floor and every iPad width
   * (`design-responsive`, council 2026-09-12), which is what closed the vote: unanimous
   * fold, blocking groups never collapsible.
   */
  const [advisoryOpen, setAdvisoryOpen] = useState(false);
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
   * Only the agent's half can be empty. `lastCheckFoundSomething` reads the app's own log
   * line for a non-zero digit, because the counts persist in `wiki/_log.md` and the
   * findings do not: an empty agent half under a log line that counts findings is not
   * "nothing to fix", it is a page reopened after the app was (measured on the installed
   * app, council 2026-09-07), and it says so.
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
            className="mt-1.5 max-w-[var(--measure-prose)] text-label leading-label text-[color:var(--color-text-tertiary)] [word-break:keep-all]"
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
              className="mt-2 max-w-[var(--measure-prose)] text-caption leading-body text-[color:var(--color-text-tertiary)] [word-break:keep-all]"
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
            <p className="mt-3 max-w-[var(--measure-prose)] text-body leading-body text-[color:var(--color-text-secondary)] [word-break:keep-all]">
              {t("report.structuralClean")}
            </p>
          ) : null}
          {blockingGroups.map((group) => (
            <StructuralGroup key={group.code} group={group} onOpenPage={onOpenPage} t={t} />
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
                  onClick={() => setAdvisoryOpen((open) => !open)}
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
                    <StructuralGroup key={group.code} group={group} onOpenPage={onOpenPage} t={t} />
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
            {/* The lede, a finding's sentence and the candidates note are read as lines, so
                they take `--measure-prose`; the report's own column stays
                `--measure-doc-column` (2026-09-11 calibration — `app/globals.css`,
                `--measure-prose`). */}
            <p className="max-w-[var(--measure-prose)] text-body leading-body text-[color:var(--color-text-secondary)] [word-break:keep-all]">
              {lastLint ? (lastCheckFoundSomething ? t("report.gone") : t("report.clean")) : t("report.emptyLede")}
            </p>
          </div>
        ) : null}

        {/* Present and disabled rather than absent: a feature the product has is always on
            screen and availability is a state with its reason (`docs/DECISIONS.md`
            2026-09-11). The computed half above needs no agent, so this is the only control
            on the page that can be blocked, and the reason belongs beside it. */}
        {onLint || lintBlockedReason ? (
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
                className="max-w-[var(--measure-prose)] text-caption leading-body text-[color:var(--color-text-tertiary)] [word-break:keep-all]"
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
                    <p className="max-w-[var(--measure-prose)] text-body leading-body text-[color:var(--color-text-primary)] [word-break:keep-all]">
                      {finding.summary}
                    </p>
                    <PageDoors pages={finding.pages} onOpenPage={onOpenPage} />
                  </div>
                  {fixedKeys?.has(findingKey(finding)) ? (
                    /* A Fix turn ended on this one: the row says so until the next check
                       re-judges the pages (design-interaction, council 2026-09-07). */
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
            <p className="mt-1 max-w-[var(--measure-prose)] text-caption leading-body text-[color:var(--color-text-quaternary)] [word-break:keep-all]">
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
