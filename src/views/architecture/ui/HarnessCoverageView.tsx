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

import { Button, Disclosure, EmptyState } from '@/shared/ui';
import { PlacedInfoHint } from './PlacedInfoHint';
import {
  CensusBigNumber,
  CensusSubStat,
  CensusTile,
} from '@/shared/ui/census-tile';
import { ICON_SIZE } from '@/shared/ui/icon-size';
import { controlClass } from '@/shared/ui/control-class';
import { cn } from '@/shared/lib/cn';

/**
 * The coverage matrix: the repository's own areas on the rows, three questions (told, gated,
 * watched) on the columns. No score, grade, maturity level or percentage: files cannot say what an
 * area is for, so they cannot tell a missing guard from a rightly absent one. The vault's purpose
 * sentence is the row.
 *
 * Marks: a cell's square is filled when anything names the area for that question and an empty
 * amber outline when nothing does; the number beside it is the declaration count; a column card's
 * numeral counts that column's empty squares, so it can be checked by counting. Length is not
 * used: at 0 to 12 a number is exact and the carried distinction is binary. The card grammar is
 * `shared/ui/census-tile`. A name mirrored in `.claude/hooks/` and `.codex/hooks/` prints once
 * with the tools that read it. Always-loaded lanes open on their column card rather than filling
 * every row, and every entry carries the text that put it there; a wired gate says its script
 * exists, never that it ran. Counting rules live behind `coverageProvenance`.
 */

type TranslateFn = ReturnType<typeof useTranslations<'harness'>>;

const COLUMNS: readonly CoverageColumn[] = ['told', 'gated', 'watched'];

/** Message keys per column: its head, hint, empty-cell word and the noun its card numeral counts. */
const COLUMN_KEYS: Readonly<Record<CoverageColumn, { head: string; hint: string; empty: string; gapNoun: string }>> = {
  told: { head: 'coverageColumnTold', hint: 'coverageColumnToldHint', empty: 'coverageEmptyTold', gapNoun: 'coverageGapTold' },
  gated: { head: 'coverageColumnGated', hint: 'coverageColumnGatedHint', empty: 'coverageEmptyGated', gapNoun: 'coverageGapGated' },
  watched: { head: 'coverageColumnWatched', hint: 'coverageColumnWatchedHint', empty: 'coverageEmptyWatched', gapNoun: 'coverageGapWatched' },
};

/**
 * Which edge each column card's hint panel hangs from. The cards are three-up at every width, so a
 * card's position is a layout fact, and at 390 the eyebrow wraps the button to the content-left,
 * independent of translated text. The reach strip cannot use this map (see `DocumentReachBlock`).
 */
const HINT_ANCHOR: Readonly<Record<CoverageColumn, 'left' | 'center' | 'right'>> = {
  told: 'left',
  gated: 'center',
  watched: 'right',
};

/** What kind of file a declaration is, for the popover. */
const ORIGIN_LABEL: Readonly<Record<ScopeDeclaration['origin'], string>> = {
  'nested-agents': 'coverageKindNested',
  rule: 'coverageKindRule',
  hook: 'coverageKindHook',
  'git-hook': 'coverageKindGitHook',
  script: 'coverageKindScript',
  workflow: 'coverageKindWorkflow',
};

const ORIGIN_ORDER = Object.keys(ORIGIN_LABEL) as ReadonlyArray<ScopeDeclaration['origin']>;

/**
 * One name and every file that carries it, keyed by origin and label: `.githooks/fast-sensor` and
 * `.claude/hooks/fast-sensor.sh` differ in kind, while the `.claude` and `.codex` copies are one
 * mirrored guard. `entries` keeps the group checkable against the cell's file count.
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
 * A container square: filled when something is in it, an empty outline when nothing is. Hue and
 * the word beside it also carry the state. `aria-hidden`, because the wrapping button's
 * `coverageOpenNames` label says it in words.
 */
function CellMark({ count, t }: { count: number; t: TranslateFn }) {
  /*
   * `shrink-0` and `whitespace-nowrap` are load-bearing: in a 39px cell at 390 the flex row shrank
   * the mark and the word overran into the next column's hit area. Below `sm` the word steps aside;
   * the cell's `aria-label` still says it.
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
            : /* A definite edge in the mark's own hue: `--color-indigo-brand` gives the filled square a ≥3:1 ring without changing the state pair. */
              'border-[color:var(--color-indigo-brand)] bg-[color:var(--color-indigo-a60)]',
        )}
      />
      {empty ? (
        /* The slot is never blank: below `sm` it prints the zero, since an empty slot means "no data" and the fact is "known, zero". */
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

/** The tools that read a file, as words; silent for a Git hook or CI job, which belong to none. */
function ToolAttribution({ tools }: { tools: readonly AgentTool[] }) {
  if (tools.length === 0) return null;
  return (
    <span className="text-label text-[color:var(--color-text-tertiary)]">
      {tools.map((tool) => AGENT_TOOL_LABELS[tool] ?? tool).join(' · ')}
    </span>
  );
}

function DeclarationList({ entries, t }: { entries: readonly ScopeDeclaration[]; t: TranslateFn }) {
  return (
    <div className="flex flex-col gap-3">
      {groupByOrigin(entries).map(([origin, groups]) => (
        <div key={origin} className="flex flex-col gap-1">
          <p className="text-label uppercase tracking-[var(--tracking-caps-08)] text-[color:var(--color-text-quaternary)]">
            {t(ORIGIN_LABEL[origin])}
          </p>
          <ul className="flex flex-col gap-1.5">
            {groups.map((group) => (
              /* One row per name, however many files carry it. */
              <li key={group.key} className="flex flex-col gap-0.5">
                <span className="flex flex-wrap items-baseline gap-x-2">
                  <span className="break-all font-mono text-label text-[color:var(--color-text-primary)]">
                    {group.label}
                  </span>
                  <ToolAttribution tools={group.tools} />
                </span>
                {group.entries.map((entry) => (
                  <span key={entry.id} className="flex flex-col">
                    {entry.declaration ? (
                      <span className="break-all font-mono text-label text-[color:var(--color-text-tertiary)]">
                        {t('coverageDeclaredAs', { declaration: entry.declaration })}
                      </span>
                    ) : null}
                    {entry.namedBy ? (
                      <span className="break-all font-mono text-label text-[color:var(--color-text-quaternary)]">
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
 * The detail is a block in its own full-width row under the pressed row, so it pushes rows down
 * instead of covering them. At `lg` it starts under the pressed column as a fraction of the
 * `colgroup` widths (46 / 18 / 18 / 18), clamped so a 22rem card stays inside the table.
 */
const DETAIL_ANCHOR: Readonly<Record<CoverageColumn, string>> = {
  told: 'lg:ml-[min(46%,calc(100%-22rem))]',
  gated: 'lg:ml-[min(64%,calc(100%-22rem))]',
  watched: 'lg:ml-auto',
};

function cellDetailId(slug: string): string {
  return `harness-coverage-detail-${slug.replace(/[^a-zA-Z0-9_-]/g, '-')}`;
}

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
   * Scrolls the opened detail into view with `block: 'nearest'`, so a row already in view does not
   * move. An effect keyed on `revealKey`, not a ref callback: opening the always-loaded band moves
   * an already-open detail down, and a mount-only callback would not follow it.
   */
  const detailRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    detailRef.current?.scrollIntoView({ block: 'nearest' });
  }, [revealKey]);
  return (
    <div
      ref={detailRef}
      id={cellDetailId(area.slug)}
      data-harness-detail-reveal={revealKey}
      data-testid="harness-coverage-detail"
      className={cn(
        'w-full rounded-card border border-[color:var(--color-border-soft)] bg-[color:var(--color-elevated)] p-[var(--card-pad)] shadow-[var(--shadow-elevation-1)]',
        'lg:w-[22rem] lg:max-w-full',
        DETAIL_ANCHOR[column],
      )}
    >
      <div className="flex items-center justify-between gap-3">
        {/* The domain's own name: once the header scrolls away and at 390, where the row name truncates, this is the only full name. */}
        <p className="min-w-0 text-label uppercase tracking-[var(--tracking-caps-08)] text-[color:var(--color-text-quaternary)]">
          {t(COLUMN_KEYS[column].head)} · <span className="normal-case">{area.title}</span>
        </p>
        {/* A ghost `Button` sm close, the same way the Analysis guidance evidence closes. */}
        <Button variant="ghost" size="sm" className="atlas-touch-floor shrink-0" onClick={onClose}>
          {t('coverageCloseNames')}
        </Button>
      </div>
      {/* Focusable, so a keyboard can scroll a long declaration list. */}
      <div
        className="mt-2 max-h-[22rem] overflow-y-auto"
        tabIndex={0}
        role="group"
        aria-label={t(COLUMN_KEYS[column].head)}
      >
        <p className="mb-3 border-b border-[color:var(--color-border-soft)] pb-3 text-body leading-body text-[color:var(--color-text-secondary)]">
          {area.purpose}
        </p>
        {entries.length === 0 ? (
          <div className="flex flex-col gap-2">
            <p className="text-body font-[var(--font-weight-emphasis)] text-[color:var(--color-amber-source-a90)]">
              {t(COLUMN_KEYS[column].empty)}
            </p>
            {/* "No check names this domain" says nothing about whether a runner discovers tests there, so the discovered-test count stands beside it. */}
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
                  className="break-all font-mono text-label text-[color:var(--color-text-tertiary)]"
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
      <p className="mt-3 text-label text-[color:var(--color-text-quaternary)]">
        {t(COLUMN_KEYS[column].hint)}
      </p>
    </div>
  );
}

/** One list, so the heading hint's definitions and the strip's labels never diverge (`HarnessCoverageView.test.tsx`). */
const REACH_BUCKETS = [
  { key: 'guides', label: 'reachGuides', body: 'reachGuidesBody' },
  { key: 'named', label: 'reachNamed', body: 'reachNamedBody' },
  { key: 'unnamed', label: 'reachUnnamed', body: 'reachUnnamedBody' },
] as const;

/**
 * Three states an authored document can be in: read unasked (a guide), reached when needed (named by
 * path), or never opened (named by nothing), the silent failure. The counts keep the display step
 * but no card, so the strip does not compete with the column cards on surface. One hint on the
 * heading defines all three; per-tile hints overflowed at 390 (`harness-tab.spec.ts`). The folders
 * behind the third count stay one press away, since some documents are rightly unreferenced.
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
        {/* The heading and its hint are one group, so `justify-between` cannot separate them. */}
        <div className="flex min-w-0 items-center gap-1.5">
          <h2 className="min-w-0 break-keep text-body-lg font-[var(--font-weight-emphasis)] text-[color:var(--color-text-primary)]">
            {t('reachTitle')}
          </h2>
          {/* `center` clears both edges at 390 in both locales for a button after a translated heading; `InfoHint`'s doc-block says when a static anchor is sound. */}
          <PlacedInfoHint
            preferred="center"
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
          </PlacedInfoHint>
        </div>
        <p className="text-label tabular-nums text-[color:var(--color-text-quaternary)]">
          {t('reachTotal', { total: reach.total, excluded: reach.excluded.length })}
        </p>
      </div>
      {/* `surface="bare"`: the census grammar with no card, so the strip above the matrix stays the subject. */}
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
          {/* Amber, because this number's subject is an absence; on canvas `--map-numeral-shadow` cancels, so the relief stays with the carded strip. */}
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
              className="flex items-baseline justify-between gap-2 font-mono text-label tabular-nums text-[color:var(--color-text-tertiary)]"
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
        /* Not amber: amber means only "nothing is here", and a truncated walk is incompleteness; the sentence says "a floor" in words. */
        <p className="text-label text-[color:var(--color-text-secondary)]">
          {t('reachTruncated')}
        </p>
      ) : null}
      {sourceRoot ? (
        <p className="font-mono text-label text-[color:var(--color-text-quaternary)]">
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
  /* The detail is in another `<tr>`, so closing it would drop focus to `<body>`; every close goes through `closeCell`, which restores it. */
  const cellRefs = useRef(new Map<string, HTMLButtonElement>());
  const closeCell = useCallback(() => {
    setOpenCell((current) => {
      if (current) cellRefs.current.get(current)?.focus();
      return null;
    });
  }, []);
  /* The band's close lives in another subtree from its toggle, so it restores focus the same way. */
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
      /* Innermost first; two opened things take two presses, since the band is not a modal over the detail. */
      if (openCell) closeCell();
      else closeEverywhere();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [openCell, openEverywhere, closeCell, closeEverywhere]);

  if (matrix.areas.length === 0) {
    /* Agent files but no ontology: say so, rather than headers over nothing; the ontology-free half still answers. */
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

  /* The count of empty squares in each column, which a reader can verify by counting. */
  const emptySquareCount = Object.fromEntries(
    COLUMNS.map((column) => [column, matrix.areas.filter((area) => area[column].length === 0).length]),
  ) as Record<CoverageColumn, number>;

  return (
    <section data-testid="harness-coverage" className="flex flex-col gap-5">
      {/* Three cards, one per question, each with its gap count over a visible denominator. */}
      <div
        data-testid="harness-coverage-columns"
        /*
         * Three columns at every width in the table's order, but not on its tracks: the cards carry
         * the question and total, the `<th>` row the position. 3-up keeps the matrix visible on a
         * phone's first screen. Not `lg:grid-cols-[46fr_18fr_18fr_18fr]`: the grid's gaps would
         * miss the gapless table by a constant 7.6px, near-alignment claiming alignment.
         */
        className="grid grid-cols-3 gap-[var(--card-gap)]"
      >
        {COLUMNS.map((column) => {
          const everywhere = groupMirroredDeclarations(matrix.everywhere[column]);
          const gaps = emptySquareCount[column];
          return (
            <CensusTile
              key={column}
              testId="harness-coverage-column-card"
              rowKey={column}
              label={t(COLUMN_KEYS[column].head)}
              labelSuffix={
                <PlacedInfoHint preferred={HINT_ANCHOR[column]} label={t(COLUMN_KEYS[column].head)}>
                  {t(COLUMN_KEYS[column].hint)}
                </PlacedInfoHint>
              }
            >
              <div data-harness-column-gap={gaps}>
                <CensusBigNumber
                  scale="section"
                  /* Amber only while there is a gap; a coloured zero would give amber a second meaning. */
                  tone={gaps > 0 ? 'warning' : 'numeral'}
                  value={gaps}
                  unit={t('coverageOfAreas', { areas: matrix.areas.length })}
                  testId="harness-coverage-column-number"
                />
              </div>
              <p className="break-keep text-label text-[color:var(--color-text-tertiary)]">
                {t(COLUMN_KEYS[column].gapNoun)}
              </p>
              {everywhere.length > 0 ? (
                /* The always-loaded set, counted on its column's card, next to the empty cells it qualifies. */
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
                    /* `max-w-full`, so the row wraps rather than escaping the card at 200% text zoom. */
                    className: 'max-w-full self-start touch-hit-expand',
                  })}
                >
                  {/* The open state rides geometry: for `shape: 'link'` the only state channel is text colour, which the `CensusSubStat` child overrides. The chevron leads, so it is a fold marker, not a trailing arrow (`forbidden.md`). */}
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
            <h2 className="text-label uppercase tracking-[var(--tracking-caps-08)] text-[color:var(--color-text-quaternary)]">
              {t('coverageEverywhereTitle')} ·{' '}
              <span className="normal-case">{t(COLUMN_KEYS[openEverywhere].head)}</span>
            </h2>
            <Button variant="ghost" size="sm" className="atlas-touch-floor shrink-0" onClick={closeEverywhere}>
              {t('coverageCloseNames')}
            </Button>
          </div>
          <p className="mt-1 text-label text-[color:var(--color-text-quaternary)]">
            {t('coverageEverywhereBody', { areas: matrix.areas.length })}
          </p>
          <div className="mt-3">
            <DeclarationList entries={matrix.everywhere[openEverywhere]} t={t} />
          </div>
        </section>
      ) : null}

      {/* No horizontal scroller: the table fits at 390, and a scroll container would clip a positioned detail. */}
      <div>
        <table className="w-full table-fixed border-collapse text-left">
          <caption className="sr-only">{t('coverageTableCaption')}</caption>
          <colgroup>
            {/* From `lg` the domain takes 46% and the three answers share the rest, so answers sit a readable step apart. */}
            <col className="w-[55%] lg:w-[46%]" />
            <col className="w-[15%] lg:w-[18%]" />
            <col className="w-[15%] lg:w-[18%]" />
            <col className="w-[15%] lg:w-[18%]" />
          </colgroup>
          <thead>
            <tr>
              <th
                scope="col"
                className="px-3 pb-2 text-label uppercase tracking-[var(--tracking-caps-08)] text-[color:var(--color-text-quaternary)]"
              >
                {t('coverageColumnArea')}
              </th>
              {COLUMNS.map((column) => (
                <th
                  key={column}
                  scope="col"
                  /* No `InfoHint` here: `scope="col"` would make its paragraph every cell's header name, and three hit areas overlapped at 390. The hint lives on the column card. */
                  className="px-3 pb-2 text-label uppercase tracking-[var(--tracking-caps-08)] text-[color:var(--color-text-quaternary)]"
                >
                  {t(COLUMN_KEYS[column].head)}
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
                  <th scope="row" className="px-3 py-3 align-middle font-normal">
                    <span className="flex flex-wrap items-baseline gap-x-2">
                      <span className="min-w-0 truncate text-body font-[var(--font-weight-emphasis)] text-[color:var(--color-text-primary)]">
                        {area.title}
                      </span>
                      <span className="text-label tabular-nums text-[color:var(--color-text-tertiary)]">
                        {t('coveragePathCount', { count: area.capabilities.length })}
                      </span>
                    </span>
                    <span className="mt-1 line-clamp-1 text-body text-[color:var(--color-text-secondary)]" title={area.purpose}>
                      {area.purpose}
                    </span>
                    {/* The node behind the row, so a reader can refute the sentence the row rests on, not only its cells. */}
                    <span className="sr-only">
                      {area.slug}
                    </span>
                  </th>
                  {COLUMNS.map((column) => {
                    const entries = area[column];
                    const key = `${area.slug}:${column}`;
                    return (
                      /* `h-px` gives the button's `h-full` a definite height, so the whole cell is pressable. */
                      <td key={column} className="h-px p-0 align-middle">
                        <button
                          type="button"
                          ref={(node) => {
                            if (node) cellRefs.current.set(key, node);
                            else cellRefs.current.delete(key);
                          }}
                          onClick={() => setOpenCell((current) => (current === key ? null : key))}
                          aria-expanded={openCell === key}
                          aria-controls={openCell === key ? cellDetailId(area.slug) : undefined}
                          aria-label={t('coverageOpenNames', {
                            area: area.title,
                            column: t(COLUMN_KEYS[column].head),
                            count: entries.length,
                          })}
                          data-harness-cell={column}
                          data-harness-cell-empty={String(entries.length === 0)}
                          /* The open state rides the `active` axis: as a class it lost to the hover compound and dimmed the open cell. */
                          className={controlClass({
                            shape: 'row',
                            size: 'md',
                            hoverSurface: 'lift',
                            active: openCell === key,
                            className: 'h-full items-start justify-start gap-2 px-3 py-3',
                          })}
                        >
                          <CellMark count={entries.length} t={t} />
                          {/* Beside the value it opens, not at the cell's far edge. */}
                          <ChevronRight
                            size={ICON_SIZE.sm}
                            aria-hidden
                            className={cn(
                              'mt-0.5 shrink-0 text-[color:var(--color-text-quaternary)] transition-transform',
                              openCell === key && 'rotate-90',
                            )}
                          />
                        </button>
                      </td>
                    );
                  })}
                </tr>,
                openColumn ? (
                  <tr key={`${area.slug}-detail`}>
                    <td colSpan={4} className="px-0 pb-3">
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

      {/* Every counting rule this page depends on, behind one press. */}
      <Disclosure summary={t('coverageProvenance')} summaryTestId="harness-coverage-provenance">
        <div className="mt-2 grid gap-x-8 gap-y-2 lg:grid-cols-2">
          <p className="text-label text-[color:var(--color-text-quaternary)]">
            {t('coverageRule')}
          </p>
          <p className="text-label text-[color:var(--color-text-quaternary)]">{t('reachRule')}</p>
          {matrix.unreachedCapabilities.length > 0 ? (
            <p className="text-label tabular-nums text-[color:var(--color-text-quaternary)]">
              {t('coverageUnreached', {
                count: matrix.unreachedCapabilities.length,
                paths: matrix.unreachedCapabilities.map((capability) => capability.path).join(' · '),
              })}
            </p>
          ) : null}
          {outsideFolders.length > 0 ? (
            <p className="text-label tabular-nums text-[color:var(--color-text-quaternary)]">
              {t('coverageOutside', {
                count: matrix.outsideAreas.length,
                folders: outsideFolders.join(' · '),
              })}
            </p>
          ) : null}
          {pathlessCapabilities > 0 ? (
            <p className="text-label tabular-nums text-[color:var(--color-text-quaternary)]">
              {t('coveragePathless', { count: pathlessCapabilities })}
            </p>
          ) : null}
        </div>
      </Disclosure>
    </section>
  );
}
