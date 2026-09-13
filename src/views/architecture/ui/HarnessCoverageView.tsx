'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';

import {
  buildCoverageMatrix,
  type CoverageAreaInput,
  type CoverageAreaRow,
  type CoverageColumn,
  type DocumentReach,
  type HarnessReport,
  type ScopeDeclaration,
} from '@/entities/agent-files';
import { ChevronRight } from 'lucide-react';

import { Disclosure, EmptyState } from '@/shared/ui';
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
 * **The vault's purpose sentence is the row, not decoration.** The first build put the recorded
 * path count on the row's second line and left the purpose out, and the owner read the result
 * correctly: a file-name table, which is the thing every competitor already ships. A row whose
 * Watched column is empty has to be able to say *this area does X and nothing watches it*; without
 * the sentence it can only say *a file is absent*. So the sentence takes the second line and the
 * count shrinks to a figure beside it.
 *
 * **The cell is a state, not a list.** Three of four columns were undifferentiated monospace runs
 * — a rule, a nested guide and a hook at one weight, one size, one colour — and nothing was
 * comparable down a column without reading every token. A cell now carries a count and a mark, the
 * names open in a compact popover beside the cell (never a full-screen or full-bleed detail:
 * `forbidden.md` owns that), and inside that popover the declarations are grouped by what kind of
 * file they are, which is the distinction the flat run destroyed.
 *
 * **The gap wins its row.** Five of this repository's eight areas have no check naming them, and in
 * the first build that finding was the quietest thing on screen. An empty cell now takes the amber
 * signal this surface already uses for an unresolved state, as a filled mark rather than as text,
 * so "five of eight" is a shape down the column before anyone reads a word.
 *
 * Two shapes keep the reading honest:
 *
 * 1. **An always-loaded rule is not eight findings.** `forbidden`, `git` and `local-first` declare
 *    no path and reach everything; so do `lint`, `test` and every unfiltered CI workflow. They sit
 *    in a strip of their own, deliberately outside the row rhythm — the first build made them the
 *    first row of the table, where the heaviest and least actionable line won the eye. The reader
 *    still needs both halves: nothing names this area, *and* these lanes run over everything.
 * 2. **Every entry carries the text that put it there**, so an attribution is checkable rather than
 *    trusted — the same contract the guides table's per-tool citation already keeps. A wired gate
 *    says its script exists, never that it ran.
 *
 * ⚠️ **An honesty rule is structure, not a paragraph.** The first build discharged every caveat as
 * prose, and the most carefully reasoned parts of the screen became the heaviest to read — three
 * counting rules stacked at body size above a heading, reading as the previous section's leftovers.
 * A marker with a hint, a disclosure, a count beside its denominator: each carries the same claim
 * and costs a reader nothing until they ask for it. Only the sentence a first-time reader must see
 * to avoid being misled stays in the flow; everything else moved behind `coverageProvenance`.
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

function groupByOrigin(
  entries: readonly ScopeDeclaration[],
): Array<[ScopeDeclaration['origin'], ScopeDeclaration[]]> {
  const grouped = new Map<ScopeDeclaration['origin'], ScopeDeclaration[]>();
  for (const entry of entries) {
    const list = grouped.get(entry.origin) ?? [];
    list.push(entry);
    grouped.set(entry.origin, list);
  }
  return ORIGIN_ORDER.filter((origin) => grouped.has(origin)).map((origin) => [
    origin,
    grouped.get(origin)!,
  ]);
}

/**
 * The mark inside a cell: a count when something names this area, an amber slab when nothing does.
 *
 * The slab is deliberately the loudest thing in the table. It is the one statement a file-only
 * scanner cannot make, and it was previously set at body size in the fourth column where a row with
 * a gap carried exactly as much weight as a row without one.
 */
function CellMark({ count, t }: { count: number; t: TranslateFn }) {
  /*
   * `shrink-0` and `whitespace-nowrap` are load-bearing, not tidiness. At 390 the cell's content box
   * is 39px: an empty span's automatic minimum size is 0, so the flex row ate the slab first —
   * measured 18.3px against its neighbour's 24 — and the gap mark came out *narrower* than the
   * non-gap mark, in the one column it exists to shout in. Korean broke 「없음」 across two lines at
   * the same width; English overran the cell by 11.5px and stole the next column's hit area, so a
   * press on the left edge of Watched opened Gated (design-responsive, 2026-09-13). Below `sm` the
   * word steps aside and the slab carries the state alone; the cell's `aria-label` already says it
   * in words.
   */
  if (count === 0) {
    return (
      <span className="flex items-center gap-2">
        <span
          aria-hidden
          className="h-5 w-6 shrink-0 rounded-micro bg-[color:var(--color-amber-source-a35)]"
        />
        <span className="hidden whitespace-nowrap text-body font-[var(--font-weight-emphasis)] text-[color:var(--color-amber-source-a90)] sm:inline">
          {t('coverageNone')}
        </span>
      </span>
    );
  }
  return (
    <span className="flex items-center gap-2">
      <span
        aria-hidden
        className="h-5 w-6 shrink-0 rounded-micro border border-[color:var(--color-border-soft)] bg-[color:var(--color-overlay-2)]"
      />
      <span className="text-body tabular-nums text-[color:var(--color-text-primary)]">{count}</span>
    </span>
  );
}

function DeclarationList({ entries, t }: { entries: readonly ScopeDeclaration[]; t: TranslateFn }) {
  return (
    <div className="flex flex-col gap-3">
      {groupByOrigin(entries).map(([origin, group]) => (
        <div key={origin} className="flex flex-col gap-1">
          <p className="text-caption uppercase tracking-[var(--tracking-caps-08)] text-[color:var(--color-text-quaternary)]">
            {t(ORIGIN_LABEL[origin])}
          </p>
          <ul className="flex flex-col gap-1.5">
            {group.map((entry) => (
              <li key={`${entry.id}:${entry.column}`} className="flex flex-col gap-0.5">
                <span className="break-all font-mono text-caption text-[color:var(--color-text-primary)]">
                  {entry.id}
                </span>
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
 */
/**
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
  t,
  onClose,
}: {
  area: CoverageAreaRow;
  column: CoverageColumn;
  t: TranslateFn;
  onClose: () => void;
}) {
  const entries = area[column];
  return (
    <div
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
 * **Three states one authored document can be in, and the one that is a silent failure.**
 *
 * A guide is read without being asked. A document a guide names by path is read when it is needed.
 * A document nothing names will not be opened, however carefully it was written — which is what a
 * team experiences as "the agent ignores our documentation" while every file on disk looks correct.
 *
 * The folders are printed beside the third count because some of those documents *should* be
 * unreferenced. A sample vault, an archive, a benchmark corpus and an agent brief addressed by name
 * rather than by path all land there for different and mostly fine reasons. Filtering them out
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
  const rows = [
    { key: 'guides', count: reach.guides, label: t('reachGuides'), note: t('reachGuidesBody') },
    { key: 'named', count: reach.named, label: t('reachNamed'), note: t('reachNamedBody') },
    { key: 'unnamed', count: reach.unnamed, label: t('reachUnnamed'), note: t('reachUnnamedBody') },
  ] as const;
  return (
    <section data-testid="harness-reach" className="flex flex-col gap-2">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 className="text-body-lg font-[var(--font-weight-emphasis)] text-[color:var(--color-text-primary)]">
          {t('reachTitle')}
        </h2>
        <p className="text-caption tabular-nums text-[color:var(--color-text-quaternary)]">
          {t('reachTotal', { total: reach.total, excluded: reach.excluded.length })}
        </p>
      </div>
      <ul className="flex flex-col">
        {rows.map((row) => (
          <li
            key={row.key}
            data-harness-reach-row={row.key}
            className="border-t border-[color:var(--color-border-soft)] py-2"
          >
            {/*
              Number, label, note — three sizes, one rhythm. The first build ran the explanation
              inline at the label's own size, so a row read as one long sentence rather than as a
              measurement with a name.
            */}
            <div className="flex items-baseline gap-3">
              <span
                className={cn(
                  'w-16 shrink-0 text-title tabular-nums',
                  row.key === 'unnamed'
                    ? 'text-[color:var(--color-amber-source-a90)]'
                    : 'text-[color:var(--color-text-primary)]',
                )}
              >
                {row.count}
              </span>
              <span className="min-w-0 flex-1 text-body text-[color:var(--color-text-primary)]">
                {row.label}
                {row.key === 'guides' && reach.mirroredGuides > 0 ? (
                  <span className="ml-2 text-caption tabular-nums text-[color:var(--color-text-quaternary)]">
                    {t('reachMirrored', { count: reach.mirroredGuides })}
                  </span>
                ) : null}
                {row.key === 'named' && reach.hops > 1 ? (
                  <span className="ml-2 text-caption tabular-nums text-[color:var(--color-text-quaternary)]">
                    {t('reachNamedDirect', { count: reach.namedDirect, hops: reach.hops - 1 })}
                  </span>
                ) : null}
              </span>
              {row.key === 'unnamed' && reach.unnamedByFolder.length > 0 ? (
                /* The breakdown opens on a press. Permanently spilled, it made the most important
                   number on the screen the one followed by the most text on the screen. */
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
                    className: 'shrink-0 touch-hit-expand',
                  })}
                >
                  {t('reachBreakdownOpen')}
                </button>
              ) : null}
            </div>
            <p className="ml-[4.75rem] text-caption text-[color:var(--color-text-quaternary)]">
              {row.note}
            </p>
            {row.key === 'unnamed' && openBreakdown ? (
              <ul
                data-testid="harness-reach-breakdown"
                className="ml-[4.75rem] mt-2 grid gap-x-6 gap-y-0.5 sm:grid-cols-2 lg:grid-cols-3"
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
          </li>
        ))}
      </ul>
      {reach.truncated ? (
        <p className="text-caption text-[color:var(--color-amber-source-a90)]">
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
  useEffect(() => {
    if (!openCell) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeCell();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [openCell, closeCell]);

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

  return (
    <section data-testid="harness-coverage" className="flex flex-col gap-5">
      <p
        data-testid="harness-coverage-headline"
        className="max-w-prose break-keep text-title font-[var(--font-weight-emphasis)] tabular-nums text-[color:var(--color-text-primary)]"
      >
        {t('coverageHeadline', {
          unwatched: matrix.unwatchedAreas.length,
          areas: matrix.areas.length,
        })}
      </p>

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
                    third icon left the 390 viewport entirely. The detail already prints the same
                    hint at its foot, so the head was a duplicate with a cost (design-lead and
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
                        t={t}
                        onClose={() => setOpenCell(null)}
                      />
                    </td>
                  </tr>
                ) : null,
              ];
            })}
          </tbody>
        </table>
      </div>

      {/*
        Outside the row rhythm on purpose. This is the always-loaded set — it reaches everything, it
        carries the largest list on the screen, and as the table's first row it was the heaviest and
        least actionable line winning the eye. It still has to be here: an empty cell above only
        reads correctly next to it.
      */}
      <section
        data-testid="harness-coverage-everywhere"
        className="border-t border-[color:var(--color-border-soft)] pt-3"
      >
        <h2 className="text-caption uppercase tracking-[var(--tracking-caps-08)] text-[color:var(--color-text-quaternary)]">
          {t('coverageEverywhereTitle')}
        </h2>
        <p className="mt-1 text-caption text-[color:var(--color-text-quaternary)]">
          {t('coverageEverywhereBody', { areas: matrix.areas.length })}
        </p>
        <dl className="mt-3 grid gap-3 sm:grid-cols-3">
          {COLUMNS.map((column) => (
            <div key={column} className="min-w-0">
              <dt className="text-caption uppercase tracking-[var(--tracking-caps-08)] text-[color:var(--color-text-quaternary)]">
                {t(COLUMN_HEAD[column])}
              </dt>
              <dd className="mt-1 flex flex-wrap gap-x-2 gap-y-0.5">
                {matrix.everywhere[column].map((entry) => (
                  <span
                    key={entry.id}
                    className="font-mono text-caption text-[color:var(--color-text-tertiary)]"
                  >
                    {entry.label}
                  </span>
                ))}
              </dd>
            </div>
          ))}
        </dl>
      </section>

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
