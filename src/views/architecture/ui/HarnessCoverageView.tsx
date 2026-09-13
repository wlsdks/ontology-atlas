'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';

import {
  AGENT_TOOL_LABELS,
  buildCoverageMatrix,
  type AgentTool,
  type CoverageAreaInput,
  type CoverageAreaRow,
  type CoverageColumn,
  type DocumentReach,
  type HarnessReport,
  type ScopeDeclaration,
} from '@/entities/agent-files';
import { ChevronRight } from 'lucide-react';

import { Disclosure, EmptyState, InfoHint } from '@/shared/ui';
import {
  CensusBigNumber,
  CensusSubStat,
  CensusTile,
} from '@/shared/ui/census-tile';
import { ICON_SIZE } from '@/shared/ui/icon-size';
import { controlClass } from '@/shared/ui/control-class';
import { cn } from '@/shared/lib/cn';

/**
 * **The coverage matrix: the repository's own areas on the rows, three questions on the columns.**
 *
 * Every competitor reads a repository's files and returns a score. The team that built one and
 * audited it against 21 real repositories found it rated an official reference implementation the
 * same as an abandoned toy, because files cannot say what a part of a repository is **for** — so
 * they cannot tell a missing guard from a correctly absent one. This screen never renders a score,
 * a grade, a maturity level or a percentage. It renders a census beside a purpose, and leaves the
 * judgement where it belongs.
 *
 * **The vault's purpose sentence is the row, not decoration.** A row whose Watched column is empty
 * has to be able to say *this area does X and nothing watches it*; without the sentence it can only
 * say *a file is absent*. So the sentence takes the second line and the count shrinks to a figure
 * beside it.
 *
 * ---
 *
 * ## Round two: what every mark on this screen encodes
 *
 * The owner read the first build and said the decisive thing: *"there should be some concept to
 * it? Shown just like this I cannot even tell what it is trying to say, or why it exists."* So
 * every mark below is written down as one sentence, and anything that could not earn one was
 * deleted rather than restyled.
 *
 * | Mark | What it encodes |
 * |---|---|
 * | the square in a cell | whether **anything** in this repository names this area for this question — filled when something is in it, drawn and empty when nothing is |
 * | the number beside it | how many declarations, as a number |
 * | the card's large numeral | how many areas have an **empty** square in that column — the count of amber outlines below it |
 * | amber | one state only: nothing is here |
 *
 * **The bar died on its own numbers.** It drew `count ÷ (largest count in its own column)`, floored
 * at 18%, on a 24px track. Measured against this checkout on 2026-09-13 (Told 7·1·5·4·4·3·4·3,
 * Gated 2·2·0·2·0·0·0·0, Watched 12·2·0·2·0·0·0·0): a Gated **2** drew 24.0px and the Watched **2**
 * beside it drew 4.3px — the same fact, the same row, a 5.6× difference in mark. A Gated 2 and a
 * Watched 12 both drew a full 24px. Told 4 and Told 5 stood 3.4px apart. The denominator was a
 * per-column maximum nobody could see, so the most scannable position in every cell carried a mark
 * that could not be decoded, and it was `aria-hidden` besides. This repository had already written
 * the rule one screen over — `InsightsCensusStrip.WeeklyBars`: *"giving zero the same minimum
 * height as one update would draw a quiet week and a busy week the same size, which is the one
 * thing a 12-bar strip must never do."* The 18% floor did exactly that to 1, 2 and 3.
 *
 * At 0–12 across eight rows, length buys nothing a number does not already give exactly, and the
 * distinction that carries this screen is binary: something, or nothing. So the mark is binary and
 * the number carries magnitude as a number.
 *
 * **The denominator became an object.** If a reader is to judge a column they need to see what it
 * is out of. The card above each column prints it — `5 / 8`, *domains no check names* — and that
 * large numeral is literally the count of empty squares in the column beneath it, so the claim can
 * be verified by counting rather than trusted. There is no separate headline sentence any more: it
 * could only ever speak for Watched, and one screen does not count the same thing two ways.
 *
 * **The grammar is the product's own.** The owner pointed at `/ontology/insights` — a label, one
 * large number, its parts beneath — and said it was at least legible *while saying he did not want
 * it copied*. The lesson, not the layout: that shape moved to `shared/ui/census-tile` and both
 * screens now use it, so this view did not grow a second, weaker way of saying "here is a count and
 * what it is made of". The 40px signature numeral stays the insights board's; these cards take the
 * ramp's display step.
 *
 * **Nine names were printed twice, and that was a lost distinction, not a duplicate bug.**
 * `block-generated-edit`, `block-manual-landing`, `block-npm-publish`, `block-unsafe-git`,
 * `fast-sensor`, `inject-ontology-summary`, `record-usage`, `remind-verify-on-stop` and
 * `stamp-verification` exist in **both** `.claude/hooks/` and `.codex/hooks/` as real mirrored
 * files. `ScopeDeclaration.label` is the bare script name for both, so a list keyed by it printed
 * each name twice and read as a rendering fault. Each name now appears once with the tools that
 * read it — the same fact the guides table's "Read by" column already carries — and the mirror
 * relationship becomes visible instead of looking broken.
 *
 * Two shapes keep the reading honest:
 *
 * 1. **An always-loaded rule is not eight findings.** `forbidden`, `git` and `local-first` declare
 *    no path and reach everything; so do `lint`, `test` and every unfiltered CI workflow. They are
 *    counted on the card of the column they belong to and open beneath it, rather than being
 *    printed in all eight rows. The reader needs both halves: nothing names this area, *and* these
 *    lanes run over everything.
 * 2. **Every entry carries the text that put it there**, so an attribution is checkable rather than
 *    trusted. A wired gate says its script exists, never that it ran.
 *
 * ⚠️ **An honesty rule is structure, not a paragraph.** A marker with a hint, a disclosure, a count
 * beside its denominator: each carries the same claim and costs a reader nothing until they ask for
 * it. Only the sentence a first-time reader must see to avoid being misled stays in the flow;
 * everything else lives behind `coverageProvenance`.
 */

type TranslateFn = ReturnType<typeof useTranslations<'harness'>>;

const COLUMNS: readonly CoverageColumn[] = ['told', 'gated', 'watched'];

const COLUMN_HEAD: Readonly<Record<CoverageColumn, string>> = {
  told: 'coverageColumnTold',
  gated: 'coverageColumnGated',
  watched: 'coverageColumnWatched',
};

const COLUMN_HINT: Readonly<Record<CoverageColumn, string>> = {
  told: 'coverageColumnToldHint',
  gated: 'coverageColumnGatedHint',
  watched: 'coverageColumnWatchedHint',
};

const COLUMN_EMPTY: Readonly<Record<CoverageColumn, string>> = {
  told: 'coverageEmptyTold',
  gated: 'coverageEmptyGated',
  watched: 'coverageEmptyWatched',
};

/**
 * Which edge each column card's hint panel hangs from. The cards are three-up at every width, so
 * at 390 the first card's button sits 90px from the left edge and a right-anchored 288px panel ran
 * 68.6% off screen (design-responsive, 2026-09-13). Written as a map in the idiom `DETAIL_ANCHOR`
 * already uses in this file: the card's position in a three-track grid is a layout fact, not
 * something to read back from the DOM.
 *
 * Sound because the button's x here does not depend on a translated string: the grid is 3-up at
 * every width, and at 390 the 103px card's eyebrow wraps the 24px button onto its own line, so it
 * sits at the card's content-left. The reach strip cannot use this map for exactly that reason —
 * see `DocumentReachBlock`.
 */
const HINT_ANCHOR: Readonly<Record<CoverageColumn, 'left' | 'center' | 'right'>> = {
  told: 'left',
  gated: 'center',
  watched: 'right',
};

/** The noun phrase the card's large numeral is counting — "domains no check names". */
const COLUMN_GAP_NOUN: Readonly<Record<CoverageColumn, string>> = {
  told: 'coverageGapTold',
  gated: 'coverageGapGated',
  watched: 'coverageGapWatched',
};

/** What kind of file a declaration is. The flat monospace run could not say this; the popover does. */
const ORIGIN_LABEL: Readonly<Record<ScopeDeclaration['origin'], string>> = {
  'nested-agents': 'coverageKindNested',
  rule: 'coverageKindRule',
  hook: 'coverageKindHook',
  'git-hook': 'coverageKindGitHook',
  script: 'coverageKindScript',
  workflow: 'coverageKindWorkflow',
};

const ORIGIN_ORDER: ReadonlyArray<ScopeDeclaration['origin']> = [
  'nested-agents',
  'rule',
  'hook',
  'git-hook',
  'script',
  'workflow',
];

/**
 * One name, and every file in this repository that carries it.
 *
 * The group is keyed by origin **and** label, never by label alone: `.githooks/fast-sensor` and
 * `.claude/hooks/fast-sensor.sh` would share a name and are not the same kind of thing, while
 * `.claude/hooks/fast-sensor.sh` and `.codex/hooks/fast-sensor.sh` are one guard mirrored for two
 * tools. The count of `entries` is what makes the group's arithmetic checkable against the cell's
 * own declaration count, which stays a count of files.
 */
interface MirrorGroup {
  key: string;
  label: string;
  origin: ScopeDeclaration['origin'];
  entries: ScopeDeclaration[];
  tools: readonly AgentTool[];
}

export function groupMirroredDeclarations(
  entries: readonly ScopeDeclaration[],
): MirrorGroup[] {
  const grouped = new Map<string, MirrorGroup>();
  for (const entry of entries) {
    const key = `${entry.origin}:${entry.label}`;
    const group = grouped.get(key);
    if (group) {
      group.entries.push(entry);
      group.tools = [...new Set([...group.tools, ...entry.tools])];
      continue;
    }
    grouped.set(key, {
      key,
      label: entry.label,
      origin: entry.origin,
      entries: [entry],
      tools: [...new Set(entry.tools)],
    });
  }
  return [...grouped.values()];
}

function groupByOrigin(entries: readonly ScopeDeclaration[]): Array<[ScopeDeclaration['origin'], MirrorGroup[]]> {
  const grouped = new Map<ScopeDeclaration['origin'], ScopeDeclaration[]>();
  for (const entry of entries) {
    const list = grouped.get(entry.origin) ?? [];
    list.push(entry);
    grouped.set(entry.origin, list);
  }
  return ORIGIN_ORDER.filter((origin) => grouped.has(origin)).map((origin) => [
    origin,
    groupMirroredDeclarations(grouped.get(origin)!),
  ]);
}

/**
 * **A square that is a container: filled when something is in it, drawn and empty when nothing is.**
 *
 * That is the whole encoding, and it is the only thing this mark claims. The state also reaches the
 * reader through the hue and through the word beside it, so no one channel carries it alone — and
 * the outline, not the fill, is what an empty cell looks like, which is the one shape a reader does
 * not have to be taught.
 *
 * It stays `aria-hidden` because the button that wraps it already carries the fact in words —
 * `coverageOpenNames` reads "{column} for {domain}: N declarations" or "nothing names this domain".
 */
function CellMark({ count, t }: { count: number; t: TranslateFn }) {
  /*
   * `shrink-0` and `whitespace-nowrap` are load-bearing, not tidiness. At 390 the cell's content box
   * is 39px: an empty span's automatic minimum size is 0, so the flex row ate the mark first —
   * measured 18.3px against its neighbour's 24 — and the gap mark came out *narrower* than the
   * non-gap mark, in the one column it exists to shout in. Korean broke its two-syllable word across
   * two lines at the same width; English overran the cell by 11.5px and stole the next column's hit
   * area, so a press on the left edge of Watched opened Gated (design-responsive, 2026-09-13).
   * Below `sm` the word steps aside and the mark carries the state alone; the cell's `aria-label`
   * already says it in words.
   */
  const empty = count === 0;
  return (
    <span className="flex items-center gap-2">
      <span
        aria-hidden
        data-harness-mark={empty ? 'empty' : 'filled'}
        className={cn(
          'h-5 w-5 shrink-0 rounded-micro border',
          empty
            ? 'border-[color:var(--color-amber-source-a90)]'
            : /* A definite edge in the mark's own hue: the `a60` border composited over an `a60`
                 fill left the filled square's only ≥3:1 surface a 1px ring at 3.26:1, against the
                 empty square's 9.08:1. `--color-indigo-brand` takes that ring to 4.24:1 and leaves
                 the state pair untouched at 4.11:1, because the dominant area of each mark does not
                 change (design-infoviz, 2026-09-13). */
              'border-[color:var(--color-indigo-brand)] bg-[color:var(--color-indigo-a60)]',
        )}
      />
      {empty ? (
        /*
         * ⚠️ **The slot is never blank.** Below `sm` the word steps aside — measured, it overran
         * the 39px cell by 11.5px in English and broke mid-word in Korean — but leaving the slot
         * *empty* beside sibling cells that all carry a digit is the table convention for "no
         * data", and the fact here is "data known, value zero". So the narrow width prints the
         * zero, which cannot wrap, and `sm` and above keep the direct label
         * (design-infoviz, 2026-09-13).
         */
        <>
          <span className="whitespace-nowrap text-body font-[var(--font-weight-emphasis)] tabular-nums text-[color:var(--color-amber-source-a90)] sm:hidden">
            {count}
          </span>
          <span className="hidden whitespace-nowrap text-body font-[var(--font-weight-emphasis)] text-[color:var(--color-amber-source-a90)] sm:inline">
            {t('coverageNone')}
          </span>
        </>
      ) : (
        <span className="text-body tabular-nums text-[color:var(--color-text-primary)]">{count}</span>
      )}
    </span>
  );
}

/** The tools that read a file, as words. Silent for a Git hook or a CI job, which belong to none. */
function ToolAttribution({ tools }: { tools: readonly AgentTool[] }) {
  if (tools.length === 0) return null;
  return (
    <span className="text-caption text-[color:var(--color-text-tertiary)]">
      {tools.map((tool) => AGENT_TOOL_LABELS[tool] ?? tool).join(' · ')}
    </span>
  );
}

function DeclarationList({ entries, t }: { entries: readonly ScopeDeclaration[]; t: TranslateFn }) {
  return (
    <div className="flex flex-col gap-3">
      {groupByOrigin(entries).map(([origin, groups]) => (
        <div key={origin} className="flex flex-col gap-1">
          <p className="text-caption uppercase tracking-[var(--tracking-caps-08)] text-[color:var(--color-text-quaternary)]">
            {t(ORIGIN_LABEL[origin])}
          </p>
          <ul className="flex flex-col gap-1.5">
            {groups.map((group) => (
              /*
                One row per name, however many files carry it. The first build emitted one row per
                file, so nine mirrored hook scripts printed nine names twice — and the repetition,
                not the mirroring, was what a reader saw.
              */
              <li key={group.key} className="flex flex-col gap-0.5">
                <span className="flex flex-wrap items-baseline gap-x-2">
                  <span className="break-all font-mono text-caption text-[color:var(--color-text-primary)]">
                    {group.label}
                  </span>
                  <ToolAttribution tools={group.tools} />
                </span>
                {group.entries.map((entry) => (
                  <span key={entry.id} className="flex flex-col">
                    {entry.declaration ? (
                      <span className="break-all font-mono text-caption text-[color:var(--color-text-tertiary)]">
                        {t('coverageDeclaredAs', { declaration: entry.declaration })}
                      </span>
                    ) : null}
                    {entry.namedBy ? (
                      <span className="break-all font-mono text-caption text-[color:var(--color-text-quaternary)]">
                        {t('coverageNamedBy', { config: entry.namedBy })}
                      </span>
                    ) : null}
                  </span>
                ))}
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

/**
 * The names behind one cell, beside the cell that was pressed.
 *
 * Below `lg` it is an ordinary block under the cell rather than a floating box: the table is inside
 * a horizontal scroller at that width, and a popover positioned inside a scroll container is
 * clipped by it. One element, two positions, no second implementation.
 *
 * Where the popover is anchored at `lg` and above, as a fraction of the table's own column widths
 * (46 / 18 / 18 / 18). Written as classes rather than measured at runtime: the columns are declared
 * in a `colgroup`, so the anchor is a layout fact and not something to read back from the DOM.
 */
const DETAIL_ANCHOR: Readonly<Record<CoverageColumn, string>> = {
  told: 'lg:left-[46%]',
  gated: 'lg:left-[64%]',
  watched: 'lg:right-0',
};

function CellDetail({
  area,
  column,
  revealKey,
  t,
  onClose,
}: {
  area: CoverageAreaRow;
  column: CoverageColumn;
  /** Changes whenever something above this detail could have moved it off screen. */
  revealKey: string;
  t: TranslateFn;
  onClose: () => void;
}) {
  const entries = area[column];
  /*
   * Pressing a cell in the last row opened a detail below the fold: the cell showed its selected
   * ring and its rotated chevron, and the thing it opened was off screen (installed app, 1512×901,
   * 2026-09-13). `block: 'nearest'` scrolls only when it has to, so pressing a row already in view
   * does not move the page under the reader's pointer.
   *
   * ⚠️ **An effect keyed on `revealKey`, not a ref callback.** As a ref callback this ran once, at
   * mount — and opening the always-loaded band inserts **142px** above the table (measured 1512×901,
   * the header row moving from y 371 to y 513), which pushed an already-open detail down by that
   * much with nothing scrolling it back (design-interaction, 2026-09-13).
   */
  const detailRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    detailRef.current?.scrollIntoView({ block: 'nearest' });
  }, [revealKey]);
  return (
    <div
      ref={detailRef}
      data-harness-detail-reveal={revealKey}
      data-testid="harness-coverage-detail"
      className={cn(
        'relative z-30 w-full rounded-card border border-[color:var(--color-border-soft)] bg-[color:var(--color-elevated)] p-[var(--card-pad)] shadow-[var(--shadow-elevation-2)]',
        /* Below `lg` the cells are narrow marks and this is an ordinary block in a full-width row
           under them, because a 63px-wide popover is not a popover. At `lg` it lifts out of the
           flow and anchors under the column that was pressed. One element, two positions. */
        'lg:absolute lg:top-0 lg:w-[22rem]',
        DETAIL_ANCHOR[column],
      )}
    >
      <div className="flex items-baseline justify-between gap-3">
        {/* The domain's own name, because once the header has scrolled away the open detail said
            only "Watched" and nothing said which row it belonged to — and at 390 the row's name is
            truncated, so this is also the only place the full name is recoverable. */}
        <p className="min-w-0 text-caption uppercase tracking-[var(--tracking-caps-08)] text-[color:var(--color-text-quaternary)]">
          {t(COLUMN_HEAD[column])} · <span className="normal-case">{area.title}</span>
        </p>
        <button
          type="button"
          onClick={onClose}
          className={controlClass({
            shape: 'link',
            size: 'sm',
            tone: 'muted',
            hoverInk: 'strong',
            /* `link` carries no touch floor, and this is the only dismissal a finger has. */
            className: 'shrink-0 touch-hit-expand',
          })}
        >
          {t('coverageCloseNames')}
        </button>
      </div>
      {/* Focusable, because a scroll container with no focusable child cannot be scrolled by a
          keyboard at all once a declaration list passes its height. */}
      <div
        className="mt-2 max-h-[22rem] overflow-y-auto"
        tabIndex={0}
        role="group"
        aria-label={t(COLUMN_HEAD[column])}
      >
        {entries.length === 0 ? (
          <div className="flex flex-col gap-2">
            <p className="text-body font-[var(--font-weight-emphasis)] text-[color:var(--color-amber-source-a90)]">
              {t(COLUMN_EMPTY[column])}
            </p>
            {/* The vault's own record of the area's purpose, which is what makes a gap judgeable
                rather than merely absent. */}
            <p className="text-body text-[color:var(--color-text-secondary)]">{area.purpose}</p>
            {/*
              The second operand, and the reason this cell is safe to read. "No check names this
              domain" is about how commands are written in `package.json`; it says nothing about
              whether a runner discovers tests there. On this repository the Topology domain's whole
              entrypoint holds 76 colocated test files under an empty Watched cell, and a reader who
              met the amber mark alone concluded the map was untested (Evidence seat, 2026-09-13).
            */}
            {column === 'watched' ? (
              <p
                data-testid="harness-coverage-discovered-tests"
                className="text-body tabular-nums text-[color:var(--color-text-secondary)]"
              >
                {t('coverageDiscoveredTests', { count: area.discoveredTests })}
              </p>
            ) : null}
            <ul className="flex flex-col gap-0.5">
              {area.capabilities.map((capability) => (
                <li
                  key={capability.slug}
                  className="break-all font-mono text-caption text-[color:var(--color-text-tertiary)]"
                >
                  {capability.path}
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <DeclarationList entries={entries} t={t} />
        )}
      </div>
      <p className="mt-3 text-caption text-[color:var(--color-text-quaternary)]">
        {t(COLUMN_HINT[column])}
      </p>
    </div>
  );
}

/**
 * The three states one authored document can be in, in the order the strip prints them.
 *
 * One list, because the heading's hint defines the three terms and the strip labels them: if those
 * two ever say different words the hint stops being a legend and becomes a second vocabulary.
 * `HarnessCoverageView.test.tsx` asserts the definition list's terms are the strip's labels.
 */
const REACH_BUCKETS = [
  { key: 'guides', label: 'reachGuides', body: 'reachGuidesBody' },
  { key: 'named', label: 'reachNamed', body: 'reachNamedBody' },
  { key: 'unnamed', label: 'reachUnnamed', body: 'reachUnnamedBody' },
] as const;

/**
 * **Three states one authored document can be in, and the one that is a silent failure.**
 *
 * A guide is read without being asked. A document a guide names by path is read when it is needed.
 * A document nothing names will not be opened, however carefully it was written — which is what a
 * team experiences as "the agent ignores our documentation" while every file on disk looks correct.
 *
 * ⚠️ **The three counts are the bones; the card around them was the overclaim.** They keep the
 * ramp's display step, because they are this block's answer and a reader has to take them in at a
 * glance — shrinking them to 11px would also print them smaller than the per-cell declaration
 * counts in the table above. What they give up is the card. Measured at 1512×901 on 2026-09-13
 * this strip filled 3 × 442.7 × 130 = 172,653px² of `--color-panel` against the column strip's
 * 207,183px²: 83% of the screen's subject, in the same surface, the same border and the same
 * numeral, for a different population — documents, not domains. Surface is the channel that says
 * which of two readings a screen is about. Dropping `--card-pad` with it puts these labels back on
 * the block's own left edge; the eyebrows sat at x 120 against their own `h2` at x 104.
 *
 * **One hint for three states, on the heading, because the three states are one definition.** Read
 * unasked, reached when needed, never opened: each only means anything against the other two, and
 * three per-tile hints made each button's x the sum of a translated label's advance widths. At 390
 * the third tile's panel landed at x **−89.97** and the second cleared the window by under a pixel
 * (`harness-tab.spec.ts`, 2026-09-13). The heading carries one control, its definition list names
 * the strip's own three labels, and the gate measures the panel's clearance rather than trusting
 * this comment.
 *
 * The folders behind the third count stay one press away, because some of those documents *should*
 * be unreferenced. A sample vault, an archive, a benchmark corpus and an agent brief addressed by
 * name rather than by path all land there for different and mostly fine reasons. Filtering them out
 * would make this block agree with itself; naming where they are lets the reader disagree with it.
 */
function DocumentReachBlock({
  reach,
  sourceRoot,
  t,
}: {
  reach: DocumentReach;
  sourceRoot: string | null;
  t: TranslateFn;
}) {
  const [openBreakdown, setOpenBreakdown] = useState(false);
  return (
    <section data-testid="harness-reach" className="flex flex-col gap-3">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        {/* The heading and its hint are one group, so `justify-between` cannot send the button to
            the far side of the row away from the words it belongs to. */}
        <div className="flex min-w-0 items-center gap-1.5">
          <h2 className="min-w-0 break-keep text-body-lg font-[var(--font-weight-emphasis)] text-[color:var(--color-text-primary)]">
            {t('reachTitle')}
          </h2>
          {/*
            `center` is an anchor a measurement chose, not a preference: this button follows a
            translated heading, so its distance from the window's left edge is a string width, and
            centre is the only one of the three anchors that clears both edges at 390 in both
            locales. `InfoHint`'s own doc-block states when a static anchor is sound at all.
          */}
          <InfoHint
            align="center"
            label={t('reachTitle')}
            panelClassName="text-body text-[color:var(--color-text-secondary)]"
          >
            <dl className="flex flex-col gap-2 break-keep">
              {REACH_BUCKETS.map((bucket) => (
                <div key={bucket.key}>
                  <dt className="font-[var(--font-weight-emphasis)] text-[color:var(--color-text-primary)]">
                    {t(bucket.label)}
                  </dt>
                  <dd>{t(bucket.body)}</dd>
                </div>
              ))}
            </dl>
          </InfoHint>
        </div>
        <p className="text-caption tabular-nums text-[color:var(--color-text-quaternary)]">
          {t('reachTotal', { total: reach.total, excluded: reach.excluded.length })}
        </p>
      </div>
      {/* `surface="bare"`: the census grammar with no card, because the screen's subject is the
          strip above the matrix and two identical strips cannot both be it. The internal rhythm
          stays `CensusTile`'s, so exactly one channel carries the demotion. */}
      <div className="grid gap-[var(--card-gap)] sm:grid-cols-3">
        <CensusTile
          surface="bare"
          testId="harness-reach-tile"
          rowKey="guides"
          label={t('reachGuides')}
        >
          <CensusBigNumber scale="section" value={reach.guides} testId="harness-reach-number" />
          {reach.mirroredGuides > 0 ? (
            <CensusSubStat label={t('reachMirroredLabel')} value={reach.mirroredGuides} />
          ) : null}
        </CensusTile>

        <CensusTile
          surface="bare"
          testId="harness-reach-tile"
          rowKey="named"
          label={t('reachNamed')}
        >
          <CensusBigNumber scale="section" value={reach.named} testId="harness-reach-number" />
          {reach.hops > 1 ? (
            <CensusSubStat label={t('reachNamedDirectLabel')} value={reach.namedDirect} />
          ) : null}
        </CensusTile>

        <CensusTile
          surface="bare"
          testId="harness-reach-tile"
          rowKey="unnamed"
          label={t('reachUnnamed')}
        >
          {/* Amber, because this number's subject is an absence — the same one state amber carries
              in every cell of the matrix above. On canvas rather than on panel it reads at 9.08:1
              instead of 8.64:1, and `--map-numeral-shadow` (#08080a) all but cancels against
              `--color-canvas` (#08090a), so the engraved relief stays a property of the strip that
              sits in a card. */}
          <CensusBigNumber
            scale="section"
            tone={reach.unnamed > 0 ? 'warning' : 'numeral'}
            value={reach.unnamed}
            testId="harness-reach-number"
          />
          {reach.unnamedByFolder.length > 0 ? (
            <button
              type="button"
              data-testid="harness-reach-breakdown-toggle"
              onClick={() => setOpenBreakdown((open) => !open)}
              aria-expanded={openBreakdown}
              className={controlClass({
                shape: 'link',
                size: 'sm',
                tone: 'muted',
                hoverInk: 'strong',
                className: 'self-start touch-hit-expand',
              })}
            >
              {t('reachBreakdownOpen')}
            </button>
          ) : null}
        </CensusTile>
      </div>
      {openBreakdown && reach.unnamedByFolder.length > 0 ? (
        <ul
          data-testid="harness-reach-breakdown"
          className="grid gap-x-6 gap-y-0.5 sm:grid-cols-2 lg:grid-cols-3"
        >
          {reach.unnamedByFolder.map((folder) => (
            <li
              key={folder.folder}
              className="flex items-baseline justify-between gap-2 font-mono text-caption tabular-nums text-[color:var(--color-text-tertiary)]"
            >
              <span className="truncate">{folder.folder}</span>
              <span className="shrink-0 text-[color:var(--color-text-quaternary)]">
                {folder.count}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
      {reach.truncated ? (
        /*
         * ⚠️ **Not amber.** Amber on this screen carries exactly one state — *nothing is here* —
         * and a truncated walk is measurement incompleteness, not absence. Painting it amber
         * committed, three hundred lines below, the error the column card's own comment forbids:
         * making the one state amber carries mean two things, in the same visual field as the
         * amber count beside it. `--color-text-secondary` reads at 13.64:1 over canvas, better
         * than the amber it replaces, and the sentence already says "a floor" in words
         * (design-infoviz, 2026-09-13).
         */
        <p className="text-caption text-[color:var(--color-text-secondary)]">
          {t('reachTruncated')}
        </p>
      ) : null}
      {sourceRoot ? (
        <p className="font-mono text-caption text-[color:var(--color-text-quaternary)]">
          {t('reachSourceRoot', { path: sourceRoot })}
        </p>
      ) : null}
    </section>
  );
}

export function HarnessCoverageView({
  report,
  areas,
  pathlessCapabilities,
  sourceRoot,
}: {
  report: HarnessReport;
  areas: readonly CoverageAreaInput[];
  pathlessCapabilities: number;
  sourceRoot: string | null;
}) {
  const t = useTranslations('harness');
  const matrix = useMemo(
    () => buildCoverageMatrix(report.coverage, areas, report.testFiles),
    [report.coverage, areas, report.testFiles],
  );
  const [openCell, setOpenCell] = useState<string | null>(null);
  const [openEverywhere, setOpenEverywhere] = useState<CoverageColumn | null>(null);
  /*
   * The detail lives in a different `<tr>` from the cell that opened it, so closing it unmounts the
   * focused element and focus falls to `<body>` — the next Tab restarts at the top of the document,
   * which costs a keyboard reader the whole rail and table to get back. Every close path goes
   * through `closeCell`, which puts focus back where the press came from (design-interaction,
   * 2026-09-13).
   */
  const cellRefs = useRef(new Map<string, HTMLButtonElement>());
  const closeCell = useCallback(() => {
    setOpenCell((current) => {
      if (current) cellRefs.current.get(current)?.focus();
      return null;
    });
  }, []);
  /*
   * The band's dismissal copies the cell's, for the same reason: its close button lives in a
   * different subtree from the toggle that opened it, so closing it dropped focus to `<body>` and
   * the next Tab restarted at the top of the document (design-interaction, 2026-09-13).
   */
  const everywhereRefs = useRef(new Map<CoverageColumn, HTMLButtonElement>());
  const closeEverywhere = useCallback(() => {
    setOpenEverywhere((current) => {
      if (current) everywhereRefs.current.get(current)?.focus();
      return null;
    });
  }, []);
  useEffect(() => {
    if (!openCell && !openEverywhere) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      /* Innermost first: the pointed surface, then the contextual band. Two opened things take two
         presses, which is the honest mapping — the band is not a modal over the detail. */
      if (openCell) closeCell();
      else closeEverywhere();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [openCell, openEverywhere, closeCell, closeEverywhere]);

  if (matrix.areas.length === 0) {
    /*
     * A repository with agent files and no ontology. Designed rather than left to happen: the grid
     * would otherwise render three column headers over nothing, which reads as a broken screen
     * rather than as the true statement — the files are readable, the areas are not defined yet,
     * and the half of this screen that needs no ontology still answers.
     */
    return (
      <section data-testid="harness-coverage" className="flex flex-col gap-6">
        <EmptyState
          title={t('coverageNoAreasTitle')}
          description={t('coverageNoAreasBody', { documents: report.guideDocumentCount })}
        />
        <DocumentReachBlock reach={report.documentReach} sourceRoot={sourceRoot} t={t} />
      </section>
    );
  }

  const outsideFolders = [
    ...new Set(
      matrix.outsideAreas.flatMap((entry) =>
        entry.scopes.map((scope) => scope.split('/')[0]!).filter(Boolean),
      ),
    ),
  ].sort();

  /*
   * The card's large numeral, per column: how many areas have an **empty** square below it. Not a
   * derived statistic — it is the count of the amber outlines in the column, so a reader who
   * doubts the card can settle it by counting rather than by trusting.
   */
  const gapCount: Record<CoverageColumn, number> = {
    told: matrix.areas.filter((area) => area.told.length === 0).length,
    gated: matrix.areas.filter((area) => area.gated.length === 0).length,
    watched: matrix.areas.filter((area) => area.watched.length === 0).length,
  };

  return (
    <section data-testid="harness-coverage" className="flex flex-col gap-5">
      {/*
        The three questions, each with the count of areas it has no answer for, over a denominator
        the reader can see. This replaced a single headline sentence that could only ever speak for
        the Watched column; three cards say it for three columns in the grammar the insights board
        already uses, and no number on this screen is now counted two ways.
      */}
      <div
        data-testid="harness-coverage-columns"
        /*
         * Three columns at **every** width, and in the table's order — but not on the table's
         * tracks, and this comment used to claim otherwise. Measured at 1512×901 on 2026-09-13,
         * each card's left edge stands 629.3 / 412.8 / 196.3px from the left edge of the column it
         * names (cards at x 104 / 566.7 / 1029.4, cells at 733.3 / 979.5 / 1225.7). So the cards
         * carry the *question and its total*, the `<th>` row 154px below carries the *position*,
         * and the two repeat three strings on purpose: a card says "no check names 5 of 8 domains",
         * a head says "this column is Gated".
         *
         * 3-up is decided by the matrix, not by the table's geometry. Stacked one-per-row at 390
         * they pushed the matrix's first row to y 692 inside a 700px-tall scroller (measured
         * 2026-09-13), so a phone reader met three cards and had no way to know a matrix existed
         * below them; 3-up puts it at 428.5 (ko) / 382.5 (en) in an 844-tall window. The insights
         * census strip already goes 2-up rather than 1-up for the same reason; this goes 3-up
         * because three is the number of questions.
         *
         * Rejected, with its arithmetic, so it is not re-proposed: putting the cards on
         * `lg:grid-cols-[46fr_18fr_18fr_18fr]` with `gap-[var(--card-gap)]`. The table has no
         * gaps and the grid has three, so track 2 starts at 0.46W − 0.38 × 20px — a constant
         * 7.6px miss at every width, 3.6px between eyebrow and `<th>` text. Near-alignment that
         * claims alignment is the defect it was meant to fix.
         */
        className="grid grid-cols-3 gap-[var(--card-gap)]"
      >
        {COLUMNS.map((column) => {
          const everywhere = groupMirroredDeclarations(matrix.everywhere[column]);
          const gaps = gapCount[column];
          return (
            <CensusTile
              key={column}
              testId="harness-coverage-column-card"
              rowKey={column}
              label={t(COLUMN_HEAD[column])}
              labelSuffix={
                <InfoHint align={HINT_ANCHOR[column]} label={t(COLUMN_HEAD[column])}>
                  {t(COLUMN_HINT[column])}
                </InfoHint>
              }
            >
              <div data-harness-column-gap={gaps}>
                <CensusBigNumber
                  scale="section"
                  /* Amber only while there is something to report. A column with no gap is not a
                     warning, and colouring a zero would make the one state amber carries mean two
                     things. */
                  tone={gaps > 0 ? 'warning' : 'numeral'}
                  value={gaps}
                  unit={t('coverageOfAreas', { areas: matrix.areas.length })}
                  testId="harness-coverage-column-number"
                />
              </div>
              <p className="break-keep text-label text-[color:var(--color-text-tertiary)]">
                {t(COLUMN_GAP_NOUN[column])}
              </p>
              {everywhere.length > 0 ? (
                /*
                  The always-loaded set, counted on the card of the column it belongs to. As a
                  separate section below the table it was three flat runs of monospace names — the
                  disease that had just been removed from the table itself — and it sat furthest
                  from the empty cells it exists to qualify.
                */
                <button
                  type="button"
                  data-testid="harness-everywhere-toggle"
                  data-harness-everywhere={column}
                  data-harness-everywhere-open={String(openEverywhere === column)}
                  aria-expanded={openEverywhere === column}
                  aria-controls="harness-coverage-everywhere"
                  ref={(node) => {
                    if (node) everywhereRefs.current.set(column, node);
                    else everywhereRefs.current.delete(column);
                  }}
                  onClick={() =>
                    setOpenEverywhere((current) => (current === column ? null : column))
                  }
                  className={controlClass({
                    shape: 'link',
                    size: 'sm',
                    tone: 'muted',
                    hoverInk: 'strong',
                    active: openEverywhere === column,
                    /* `max-w-full`, so the row inside it wraps rather than escaping the card at
                       200% text zoom (measured 2026-09-13). */
                    className: 'max-w-full self-start touch-hit-expand',
                  })}
                >
                  {/*
                    ⚠️ **The open state has to ride geometry here, not ink.** For `shape: 'link'`
                    `controlClass` offers exactly one state channel — text colour — and this
                    button's only child is a `CensusSubStat` whose root span sets
                    `--color-text-tertiary` explicitly. An explicit child colour beats an inherited
                    one, so both the hover ink and the active ink landed on a button with no text of
                    its own and painted nothing: all three toggles rendered identically whether the
                    band was open or shut (design-interaction, 2026-09-13). The chevron leads rather
                    than trails, so it reads as a fold marker and not as the decorative trailing
                    arrow `forbidden.md` rules out.
                  */}
                  <ChevronRight
                    size={ICON_SIZE.sm}
                    aria-hidden
                    className={cn(
                      'shrink-0 text-[color:var(--color-text-quaternary)] transition-transform',
                      openEverywhere === column && 'rotate-90',
                    )}
                  />
                  <CensusSubStat label={t('coverageEverywhereStat')} value={everywhere.length} />
                </button>
              ) : null}
            </CensusTile>
          );
        })}
      </div>

      {openEverywhere ? (
        <section
          id="harness-coverage-everywhere"
          data-testid="harness-coverage-everywhere"
          className="rounded-card border border-[color:var(--color-border-soft)] bg-[color:var(--color-elevated)] p-[var(--card-pad)]"
        >
          <div className="flex items-baseline justify-between gap-3">
            <h2 className="text-caption uppercase tracking-[var(--tracking-caps-08)] text-[color:var(--color-text-quaternary)]">
              {t('coverageEverywhereTitle')} ·{' '}
              <span className="normal-case">{t(COLUMN_HEAD[openEverywhere])}</span>
            </h2>
            <button
              type="button"
              onClick={closeEverywhere}
              className={controlClass({
                shape: 'link',
                size: 'sm',
                tone: 'muted',
                hoverInk: 'strong',
                className: 'shrink-0 touch-hit-expand',
              })}
            >
              {t('coverageCloseNames')}
            </button>
          </div>
          <p className="mt-1 text-caption text-[color:var(--color-text-quaternary)]">
            {t('coverageEverywhereBody', { areas: matrix.areas.length })}
          </p>
          <div className="mt-3">
            <DeclarationList entries={matrix.everywhere[openEverywhere]} t={t} />
          </div>
        </section>
      ) : null}

      {/* No horizontal scroller. The cells carry a mark and a count rather than a list of names,
          so the table fits at 390 — and a popover positioned inside a scroll container is clipped
          by it, which is how the first build put a 130px-wide detail off the right edge. */}
      <div>
        <table className="w-full table-fixed border-collapse text-left">
          <caption className="sr-only">{t('coverageTableCaption')}</caption>
          <colgroup>
            <col className="w-[46%]" />
            <col className="w-[18%]" />
            <col className="w-[18%]" />
            <col className="w-[18%]" />
          </colgroup>
          <thead>
            <tr>
              <th
                scope="col"
                className="px-3 pb-2 text-caption uppercase tracking-[var(--tracking-caps-08)] text-[color:var(--color-text-quaternary)]"
              >
                {t('coverageColumnArea')}
              </th>
              {COLUMNS.map((column) => (
                <th
                  key={column}
                  scope="col"
                  /*
                    No `InfoHint` here. Each head carried one and `scope="col"` handed the whole
                    paragraph to every cell under it as a header name, uppercased by the heading's
                    own `text-transform`. An `aria-label` repaired that, and then the measurement
                    said the button should not be here at all: three 44px coarse-pointer hit areas
                    inside three 63px columns overlapped their neighbours by 15px and 22px, and the
                    third icon left the 390 viewport entirely. The hint now lives on the column's
                    card above, where one 44px target sits in a 200px-wide tile (design-lead and
                    design-responsive, 2026-09-13).
                  */
                  className="px-3 pb-2 text-caption uppercase tracking-[var(--tracking-caps-08)] text-[color:var(--color-text-quaternary)]"
                >
                  {t(COLUMN_HEAD[column])}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {matrix.areas.flatMap((area) => {
              const openColumn = COLUMNS.find((column) => openCell === `${area.slug}:${column}`);
              return [
                <tr
                  key={area.slug}
                  data-harness-area={area.slug}
                  className="border-t border-[color:var(--color-border-soft)]"
                >
                  {/*
                    One rhythm, so every row is the same height: a name on one line, the vault's
                    purpose clamped to two, and the recorded-path count as a figure. `forbidden.md`
                    rules out repeated units whose heights differ only because their copy does, and
                    the first build ran 80px to 160px purely on how token lists wrapped.
                  */}
                  <th scope="row" className="px-3 py-3 align-top font-normal">
                    <span className="flex flex-wrap items-baseline gap-x-2">
                      <span className="min-w-0 truncate text-body font-[var(--font-weight-emphasis)] text-[color:var(--color-text-primary)]">
                        {area.title}
                      </span>
                      <span className="text-caption tabular-nums text-[color:var(--color-text-quaternary)]">
                        {t('coveragePathCount', { count: area.capabilities.length })}
                      </span>
                    </span>
                    {/*
                      ⚠️ **Two lines, both ends fixed, and `block` must not be here.** `line-clamp-2`
                      emits `display:-webkit-box`; the `block` utility sits later in the same layer
                      at the same specificity and won, so the clamp was dead and the reserve was a
                      floor with no ceiling. On the real vault every purpose is a 320-character
                      excerpt: rows ran 70px against 84px at 768 and 220px+ at 390 — the
                      content-decided height `forbidden.md` rules out, caused by a utility nobody
                      would look at twice (design-responsive, 2026-09-13).
                    */}
                    <span className="mt-1 line-clamp-2 min-h-[2.8em] text-body text-[color:var(--color-text-secondary)]">
                      {area.purpose}
                    </span>
                    {/* The node behind the row. Without it a reader can refute a cell — every
                        declaration is cited — and cannot refute the sentence the row rests on
                        (Steward seat, 2026-09-13). */}
                    <span className="mt-1 block font-mono text-caption text-[color:var(--color-text-quaternary)]">
                      {area.slug}
                    </span>
                  </th>
                  {COLUMNS.map((column) => {
                    const entries = area[column];
                    const key = `${area.slug}:${column}`;
                    return (
                      /* `h-px` on the cell gives `h-full` on the button something definite to
                         resolve against. Without it the button was 44px inside a 94px row and 54%
                         of every cell was not pressable (design-responsive, 2026-09-13). */
                      <td key={column} className="h-px p-0 align-top">
                        <button
                          type="button"
                          ref={(node) => {
                            if (node) cellRefs.current.set(key, node);
                            else cellRefs.current.delete(key);
                          }}
                          onClick={() => setOpenCell((current) => (current === key ? null : key))}
                          aria-expanded={openCell === key}
                          aria-label={t('coverageOpenNames', {
                            area: area.title,
                            column: t(COLUMN_HEAD[column]),
                            count: entries.length,
                          })}
                          data-harness-cell={column}
                          data-harness-cell-empty={String(entries.length === 0)}
                          /* The open state rides the `active` axis rather than a `className`
                             background. As a class it survived the hover compound, so hovering the
                             OPEN cell repainted it `--color-overlay-1` over its own
                             `--color-overlay-2` and the selected cell went dimmer under the pointer
                             (design-interaction, 2026-09-13). */
                          className={controlClass({
                            shape: 'row',
                            size: 'md',
                            hoverSurface: 'lift',
                            active: openCell === key,
                            className: 'h-full items-start px-3 py-3',
                          })}
                        >
                          <CellMark count={entries.length} t={t} />
                          <ChevronRight
                            size={ICON_SIZE.sm}
                            aria-hidden
                            className={cn(
                              'ml-auto mt-0.5 shrink-0 text-[color:var(--color-text-quaternary)] transition-transform',
                              openCell === key && 'rotate-90',
                            )}
                          />
                        </button>
                      </td>
                    );
                  })}
                </tr>,
                openColumn ? (
                  /* Its own row, so the anchored popover has a full-width containing block and the
                     narrow-width fallback has somewhere to stand. `p-0` collapses the row to
                     nothing at `lg`, where the only child has left the flow. */
                  <tr key={`${area.slug}-detail`}>
                    <td colSpan={4} className="relative p-0">
                      <CellDetail
                        area={area}
                        column={openColumn}
                        revealKey={`${area.slug}:${openColumn}:${openEverywhere ?? ''}`}
                        t={t}
                        onClose={closeCell}
                      />
                    </td>
                  </tr>
                ) : null,
              ];
            })}
          </tbody>
        </table>
      </div>

      <DocumentReachBlock reach={report.documentReach} sourceRoot={sourceRoot} t={t} />

      {/*
        Every counting rule this page depends on, behind one press. These four paragraphs used to
        stand at body size in the reading flow, where they read as the previous section's leftovers
        and made the most careful part of the screen the heaviest. The claim is unchanged; what
        changed is that it costs nothing until a reader asks for it.
      */}
      <Disclosure summary={t('coverageProvenance')} summaryTestId="harness-coverage-provenance">
        <div className="mt-2 grid gap-x-8 gap-y-2 lg:grid-cols-2">
          <p className="text-caption text-[color:var(--color-text-quaternary)]">
            {t('coverageRule')}
          </p>
          <p className="text-caption text-[color:var(--color-text-quaternary)]">{t('reachRule')}</p>
          {matrix.unreachedCapabilities.length > 0 ? (
            <p className="text-caption tabular-nums text-[color:var(--color-text-quaternary)]">
              {t('coverageUnreached', {
                count: matrix.unreachedCapabilities.length,
                paths: matrix.unreachedCapabilities.map((capability) => capability.path).join(' · '),
              })}
            </p>
          ) : null}
          {outsideFolders.length > 0 ? (
            <p className="text-caption tabular-nums text-[color:var(--color-text-quaternary)]">
              {t('coverageOutside', {
                count: matrix.outsideAreas.length,
                folders: outsideFolders.join(' · '),
              })}
            </p>
          ) : null}
          {pathlessCapabilities > 0 ? (
            <p className="text-caption tabular-nums text-[color:var(--color-text-quaternary)]">
              {t('coveragePathless', { count: pathlessCapabilities })}
            </p>
          ) : null}
        </div>
      </Disclosure>
    </section>
  );
}
