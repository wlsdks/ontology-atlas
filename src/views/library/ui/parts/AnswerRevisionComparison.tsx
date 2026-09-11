"use client";

import type { useTranslations } from 'next-intl';
import { useTranslations as useViewerTranslations } from 'next-intl';
import { useMemo, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { answerObservation } from '@/features/library';
import { parseFrontmatter } from '@/shared/lib/parse-frontmatter';
import {
  normalizeOriginalPaths,
  resolveSourceCitation,
  rewriteWikilinks,
  WIKILINK_SENTINEL,
} from '@/shared/lib/source-citation';
import { WIKI_SECTION_ORDER } from '@/shared/lib/wiki-page-schema';
import { Button, controlClass, Dialog, Disclosure } from '@/shared/ui';
import { SegmentedControl } from '@/shared/ui/segmented-control';
import { LG_BREAKPOINT_PX, useViewportBelow } from '@/shared/lib/use-viewport-below';
import type { WikiTemplateProblem } from './WikiTemplateProblems';

/**
 * **Two capped columns and one gutter, centred** — the dialog's own measure.
 *
 * `text-body-lg` travels with it because `--measure-prose` is `ch`, and `ch` is the advance
 * of `0` in the element's *own* font: read at the 16px root the same token resolves to 572px
 * and at `text-body-lg` to 500px. Spending it at the size the prose is actually set in is what
 * the 2026-09-11 calibration is for (`app/globals.css`, `--measure-prose`) — the header, the
 * grid and the footer then start and end on the same two edges instead of three.
 */
const COMPARISON_SPAN =
  'mx-auto w-full max-w-[calc(2*var(--measure-prose)+var(--measure-doc-gutter))] text-body-lg';

const SHA256 = /^[a-f0-9]{64}$/i;
const EMPTY_PATHS: ReadonlySet<string> = new Set<string>();

interface SectionSlices {
  /** Body text before the first contract heading, verbatim. */
  lead: string;
  /** Section name → that section's text, verbatim, heading line excluded. */
  sections: ReadonlyMap<string, string>;
  /** Whether this body uses the contract's headings at all. */
  structured: boolean;
}

/**
 * **Slice one body at the five contract headings — bytes untouched.**
 *
 * The wiki contract fixes the sections and their order (`wiki/_template.md`,
 * `WIKI_SECTION_ORDER`, enforced by `validateWikiPage`), so the *structure* is shared
 * between any two revisions of one answer even when no line of text is. That is the only
 * thing this function uses to line the two versions up: it cuts at the headings and hands
 * the text through unchanged. It computes no diff and rewrites no sentence — the 2026-09-11
 * record "Local Compile approval exposes the exact previous and proposed text" refuses
 * "semantic summaries or selective diffs", and a comparison that reworded either side would
 * be exactly that.
 *
 * It is deliberately *not* `buildAnswerPage`'s parser: that one normalises citations and
 * prefixes bullets while filing a page, which is right for writing a file and wrong for
 * showing a person what the file says. Only `## <exact section name>` outside a fence
 * switches sections; any other heading stays part of the text it sits in, and a repeated
 * section appends rather than replacing, so no line is ever dropped on the floor.
 */
function sectionSlices(text: string): SectionSlices {
  const buffers = new Map<string, string[]>();
  const lead: string[] = [];
  let current: string[] | null = null;
  let inFence = false;
  let structured = false;
  for (const raw of parseFrontmatter(text).body.split('\n')) {
    const line = raw.trim();
    const fence = /^(```|~~~)/.test(line);
    if (!inFence && !fence) {
      const heading = /^##\s+(.+?)\s*$/.exec(line);
      const name = heading
        ? (WIKI_SECTION_ORDER as readonly string[]).find((section) => section === heading[1])
        : undefined;
      if (name) {
        structured = true;
        current = buffers.get(name) ?? [];
        buffers.set(name, current);
        continue;
      }
    }
    if (fence) inFence = !inFence;
    (current ?? lead).push(raw);
  }
  const sections = new Map<string, string>();
  for (const [name, lines] of buffers) {
    const body = lines.join('\n').replace(/^\s*\n+/, '').replace(/\n+\s*$/, '');
    if (body) sections.set(name, body);
  }
  return { lead: lead.join('\n').trim(), sections, structured };
}

/** Every recorded byte observation that is a hash, from one page's frontmatter. */
function recordedObservations(text: string): Map<string, string> {
  const raw = parseFrontmatter(text).frontmatter.answer_source_observations;
  const out = new Map<string, string>();
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    for (const [path, value] of Object.entries(raw as Record<string, unknown>)) {
      if (typeof value === 'string' && SHA256.test(value)) out.set(path, value.toLowerCase());
    }
  }
  return out;
}

function RevisionText({
  text,
  knownOriginalPaths,
  changedPaths,
  changedLabel,
  onOpenSource,
}: {
  text: string;
  knownOriginalPaths?: ReadonlySet<string>;
  /** Cited originals whose bytes moved since the previous answer recorded them. */
  changedPaths: ReadonlySet<string>;
  changedLabel: string;
  onOpenSource: (path: string, anchor?: string) => void;
}) {
  const sourceT = useViewerTranslations('vaultWidgets.viewer');
  const normalizedOriginalPaths = useMemo(
    () => normalizeOriginalPaths(knownOriginalPaths),
    [knownOriginalPaths],
  );

  return <ReactMarkdown remarkPlugins={[remarkGfm]} components={{
    h1: ({ children }) => <h3 className="mb-3 mt-6 text-title font-[var(--font-weight-strong)] text-[color:var(--color-text-primary)]">{children}</h3>,
    h2: ({ children }) => <h3 className="mb-3 mt-6 text-title font-[var(--font-weight-strong)] text-[color:var(--color-text-primary)] first:mt-0">{children}</h3>,
    h3: ({ children }) => <h4 className="mb-2 mt-4 text-body font-[var(--font-weight-strong)] text-[color:var(--color-text-primary)]">{children}</h4>,
    p: ({ children }) => <p className="my-3 break-words text-body-lg leading-prose text-[color:var(--color-text-secondary)]">{children}</p>,
    ul: ({ children }) => <ul className="my-3 list-disc pl-5 text-body-lg leading-prose text-[color:var(--color-text-secondary)]">{children}</ul>,
    ol: ({ children }) => <ol className="my-3 list-decimal pl-5 text-body-lg leading-prose text-[color:var(--color-text-secondary)]">{children}</ol>,
    li: ({ children }) => <li className="my-2 break-words">{children}</li>,
    a: ({ href, children, ...rest }) => {
      if (!href || !href.startsWith(WIKILINK_SENTINEL)) {
        return <span className="break-words underline decoration-dotted" {...rest}>{children}</span>;
      }

      const spec = href.slice(WIKILINK_SENTINEL.length);
      const [rawWikiSlug, rawAnchor] = spec.split('#');
      const citation = rawWikiSlug
        ? resolveSourceCitation(
            rawWikiSlug,
            rawAnchor,
            normalizedOriginalPaths,
            true,
          )
        : null;

      if (!citation) {
        return <span className="break-words underline decoration-dotted" {...rest}>{children}</span>;
      }

      const resolvedPath = citation.path;
      if (citation.status === 'known' && resolvedPath) {
        return (
          <>
            <button
              type="button"
              aria-label={sourceT('sourceCitationTitle', {
                path: resolvedPath,
                anchor: citation.anchor ? `#${citation.anchor}` : '',
              })}
              data-source-path={resolvedPath}
              data-source-anchor={citation.anchor}
              onClick={() => onOpenSource(resolvedPath, citation.anchor)}
              className={controlClass({
                shape: 'link',
                tone: 'accent',
                hoverInk: 'strong',
                className: 'inline align-baseline break-keep whitespace-normal',
              })}
            >
              {children}
            </button>
            {changedPaths.has(resolvedPath) ? <ChangedOriginalMark path={resolvedPath} label={changedLabel} /> : null}
          </>
        );
      }

      return (
        <span
          className="border-b border-dashed border-[color:var(--color-amber-source-a50)] text-[color:var(--color-amber-source-text-a85)]"
          title={sourceT(
            citation.status === 'missing'
              ? 'sourceCitationMissing'
              : 'sourceCitationUnavailable',
            { path: citation.rawPath },
          )}
          {...rest}
        >
          {children}
        </span>
      );
    },
    pre: ({ children }) => <pre className="my-3 overflow-x-auto whitespace-pre-wrap break-words text-body leading-body">{children}</pre>,
  }}>{rewriteWikilinks(parseFrontmatter(text).body)}</ReactMarkdown>;
}

/**
 * **One amber dot: this file's bytes moved. Never: this claim changed.**
 *
 * The mark sits beside the citation, not inside the citation's own `aria-label`, so the
 * control keeps the exact accessible name a reader and `AnswerRevisionComparison.test.tsx`
 * already know it by, and the observation arrives as its own labelled thing. It is the byte
 * observation the 2026-09-11 record allows ("byte observations may be recorded separately,
 * never as read provenance") and it makes no claim about the sentence in front of it.
 */
function ChangedOriginalMark({ path, label, decorative }: { path: string; label: string; decorative?: boolean }) {
  return (
    <span
      role={decorative ? undefined : 'img'}
      aria-hidden={decorative ? true : undefined}
      aria-label={decorative ? undefined : `${label}: ${path}`}
      title={decorative ? undefined : `${label}: ${path}`}
      data-source-changed={path}
      className="ml-1 inline-block size-1.5 rounded-full bg-[color:var(--color-amber-source-text-a85)] align-middle"
    />
  );
}

export function AnswerRevisionComparison({ open, question, before, after, problems, error, saving, onClose, onSave, onOpenSource, knownOriginalPaths, t }: {
  open: boolean;
  question: string;
  before: string;
  after: string;
  problems: ReadonlyArray<WikiTemplateProblem>;
  error: string | null;
  saving: boolean;
  onClose: () => void;
  onSave: () => void;
  /** Opens a known source at the cited anchor, when one is present. */
  onOpenSource: (path: string, anchor?: string) => void;
  /** Source paths the current Library surface can navigate to. */
  knownOriginalPaths?: ReadonlySet<string>;
  t: ReturnType<typeof useTranslations<'library'>>;
}) {
  const [mobileSide, setMobileSide] = useState<'before' | 'after'>('after');
  const narrow = useViewportBelow(LG_BREAKPOINT_PX);
  const originals = (raw: string) => {
    const sources = parseFrontmatter(raw).frontmatter.sources;
    return Array.isArray(sources) ? sources.filter((path): path is string => typeof path === 'string') : [];
  };
  const oldSources = originals(before), newSources = originals(after);
  const added = newSources.filter((path) => !oldSources.includes(path));
  const removed = oldSources.filter((path) => !newSources.includes(path));
  const newLines = new Set(parseFrontmatter(after).body.split('\n').map((line) => line.trim()));
  const removedLines = parseFrontmatter(before).body.split('\n').map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#') && !newLines.has(line));

  /*
   * **Which original moved, answered from the two pages themselves.**
   *
   * `prepareAnswerRefresh` measures every original in scope before the turn starts and
   * `buildAnswerRevision` writes those hashes into the proposal's
   * `answer_source_observations`, so the proposed page *is* the current observation. Read
   * against the previous page's recorded hashes it says, per cited path, what
   * `answerObservation` says on the answer page itself — the same function, so the dialog
   * and the page behind it cannot disagree. It needs no hash prop and no new measurement.
   */
  const observation = useMemo(
    () => answerObservation(parseFrontmatter(before).frontmatter, knownOriginalPaths ?? EMPTY_PATHS, recordedObservations(after)),
    [after, before, knownOriginalPaths],
  );
  const proposedObservation = useMemo(
    () => answerObservation(parseFrontmatter(after).frontmatter, knownOriginalPaths ?? EMPTY_PATHS, recordedObservations(after)),
    [after, knownOriginalPaths],
  );
  const changedPaths = useMemo(() => new Set(observation.changed), [observation]);
  const missingPaths = useMemo(
    () => new Set([...observation.missing, ...proposedObservation.missing]),
    [observation, proposedObservation],
  );
  const changedLabel = t('answers.paths.changed');

  const beforeSlices = useMemo(() => sectionSlices(before), [before]);
  const afterSlices = useMemo(() => sectionSlices(after), [after]);
  const structured = beforeSlices.structured || afterSlices.structured;
  const leadRow = Boolean(beforeSlices.lead) || Boolean(afterSlices.lead) || !structured;
  /*
   * **One row per contract section, and the row is never dropped.** A section only one side
   * carries still owns its row with `stage.none` in the empty cell: "nothing here" is itself
   * something a reader learns, which is the same reason `validateWikiPage` refuses a page
   * that deletes an empty section.
   */
  const rows: ReadonlyArray<{ id: string; section: string | null }> = [
    { id: 'head', section: null },
    ...(leadRow ? [{ id: 'lead', section: null }] : []),
    ...(structured ? WIKI_SECTION_ORDER.map((section) => ({ id: section, section })) : []),
    { id: 'foot', section: null },
  ];
  const panes = [
    { id: 'before', title: t('answers.before'), text: before, sources: oldSources, slices: beforeSlices },
    { id: 'after', title: t('answers.after'), text: after, sources: newSources, slices: afterSlices },
  ].filter((pane) => !narrow || mobileSide === pane.id);

  /*
   * The blocking sentence, in the reader's language when the validator gave one. The sibling
   * `describeWikiProblem` in `WikiTemplateProblems.tsx` answers the same question for the
   * page; `t.has` is the same guard, so a code the validator grows before the catalogue does
   * still degrades to the validator's English rather than a raw message path.
   */
  const describe = (problem: WikiTemplateProblem): string => {
    const key = problem.detail?.key;
    if (!key) return problem.message;
    const path = `wiki.problem.${key}` as 'wiki.problem.orphan-page';
    return t.has(path) ? t(path, problem.detail?.values ?? {}) : problem.message;
  };
  const blocking = problems[0];

  const sectionCell = (pane: (typeof panes)[number], row: (typeof rows)[number]) => {
    if (row.id === 'head') {
      return (
        <div key={row.id} className="min-w-0 border-t border-[color:var(--color-divider)] pt-4">
          <h3 data-comparison-heading="head" className="text-title font-[var(--font-weight-strong)] text-[color:var(--color-text-primary)]">{pane.title}</h3>
          <div className="my-3 flex flex-wrap gap-2">
            {pane.sources.map((path) => {
              const state = missingPaths.has(path) ? 'missing' : changedPaths.has(path) ? 'changed' : undefined;
              return (
                <Button
                  key={path}
                  size="sm"
                  variant="ghost"
                  onClick={() => onOpenSource(path)}
                  className={`atlas-touch-floor max-w-full${state === 'missing' ? ' border-dashed border-[color:var(--color-amber-source-a50)] text-[color:var(--color-amber-source-text-a85)]' : ''}`}
                  data-source-observation={state}
                  title={state === 'missing' ? t('wiki.originalMissing', { name: path }) : state === 'changed' ? changedLabel : path}
                >
                  <span className="truncate">{path}</span>
                  {/* The chip already says the path and its `title` says what changed, so the dot
                      is decoration here; a labelled mark would repeat the path inside the name. */}
                  {state === 'changed' ? <ChangedOriginalMark path={path} label={changedLabel} decorative /> : null}
                </Button>
              );
            })}
          </div>
        </div>
      );
    }
    if (row.id === 'foot') {
      return (
        <div key={row.id} className="min-w-0">
          <Disclosure summary={t('answers.rawText')}>
            <pre className="mt-2 overflow-x-auto whitespace-pre-wrap break-words text-caption leading-body text-[color:var(--color-text-secondary)]">{pane.text}</pre>
          </Disclosure>
        </div>
      );
    }
    const text = row.section ? pane.slices.sections.get(row.section) ?? '' : pane.slices.lead;
    return (
      <div key={row.id} className={`min-w-0${row.section ? ' border-t border-[color:var(--color-divider)] pt-4' : ''}`} data-comparison-row={row.id}>
        {row.section ? <h4 data-comparison-heading={row.section} className="text-body font-[var(--font-weight-strong)] text-[color:var(--color-text-primary)]">{row.section}</h4> : null}
        {text
          ? <RevisionText
              text={text}
              knownOriginalPaths={knownOriginalPaths}
              changedPaths={changedPaths}
              changedLabel={changedLabel}
              onOpenSource={onOpenSource}
            />
          : <p className="mt-2 text-body leading-body text-[color:var(--color-text-tertiary)]">{t('stage.none')}</p>}
      </div>
    );
  };

  return (
    <Dialog open={open} onClose={saving ? () => {} : onClose} size="viewport" initialFocus="container" labelledBy="answer-comparison-title" testId="answer-comparison" className="flex flex-col gap-4">
      <header className={`${COMPARISON_SPAN} flex-none [&_p]:max-w-[var(--measure-prose)] [&_p]:[word-break:keep-all]`}>
        <h2 id="answer-comparison-title" className="text-display font-[var(--font-weight-signature)] leading-title text-[color:var(--color-text-primary)]">{t('answers.compareTitle')}</h2>
        <p className="mt-2 break-words text-body-lg text-[color:var(--color-text-secondary)]">{question}</p>
        <p className="mt-2 text-body leading-body text-[color:var(--color-text-secondary)]">{t('answers.compareHint')}</p>
        {/*
          **The difference is stated before the two versions, not after them.** It used to be
          a disclosure under the left column: a reader had to finish the longer document to
          learn that four earlier sentences were gone. The numbers were already computed
          there; only their position was wrong.

          The path lines are `RetainedAnswerContext`'s own `label: paths` shape (same keys,
          same order), so the sentence a person read on the answer page is the sentence that
          greets them here.
        */}
        <div data-testid="answer-comparison-delta" className="mt-3 text-body leading-body text-[color:var(--color-text-secondary)]">
          <p>{added.length || removed.length ? t('answers.sourceDelta', { added: added.length, removed: removed.length }) : t('answers.sameSources')}</p>
          {(['changed', 'missing', 'added'] as const).map((kind) => observation[kind].length ? (
            <p key={kind} data-comparison-observation={kind} className="mt-1 break-words text-caption leading-body text-[color:var(--color-text-secondary)]">
              {t(`answers.paths.${kind}`)}: {observation[kind].join(' · ')}
            </p>
          ) : null)}
          {removedLines.length ? <Disclosure className="mt-2" summary={t('answers.removedLines', { count: removedLines.length })}>
            <ul className="mt-2 list-disc space-y-2 pl-5">{removedLines.map((line, index) => <li key={index} className="break-words">{line}</li>)}</ul>
          </Disclosure> : null}
          <p className="mt-2 text-caption leading-body text-[color:var(--color-text-secondary)]">{t('answers.provenance')}</p>
        </div>
        {narrow ? <div className="mt-3">
          <SegmentedControl ariaLabel={t('answers.comparisonVersion')} value={mobileSide} onChange={setMobileSide}
            options={[{ value: 'before', label: t('answers.before') }, { value: 'after', label: t('answers.after') }]} />
        </div> : null}
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto" data-testid="answer-comparison-scroll">
        {/*
          **`subgrid`, so "Facts" on the left and "Facts" on the right share one row.** Two
          independent documents side by side drift apart by the length of whatever is above:
          measured on the owner's 2026-09-11 capture of the installed app, the left Facts
          heading sat 61px above the right one and the person did the aligning. The columns
          stay two elements — each is still one scrollable, testable pane — while the row
          heights belong to the parent grid, so the longer cell stretches the row instead of
          pushing its own column out of step.
        */}
        <div
          className={`${COMPARISON_SPAN} grid justify-center gap-x-[var(--measure-doc-gutter)] gap-y-4 grid-cols-[minmax(0,var(--measure-prose))] lg:grid-cols-[repeat(2,minmax(0,var(--measure-prose)))]`}
          style={{ gridTemplateRows: `repeat(${rows.length}, auto)` }}
        >
          {panes.map((pane) => (
            <section
              key={pane.id}
              data-testid={`answer-comparison-${pane.id}`}
              className="grid min-w-0 grid-rows-subgrid [grid-row:1/-1]"
            >
              {rows.map((row) => sectionCell(pane, row))}
            </section>
          ))}
        </div>
      </div>
      <footer className={`${COMPARISON_SPAN} flex flex-none flex-wrap items-center justify-end gap-x-4 gap-y-2 border-t border-[color:var(--color-divider)] pt-3`}>
        {/*
          **The reason stands beside the control it disables.** `problems.length > 0` has
          always blocked the save; the sentence explaining it used to sit in a block above
          the footer, which at 390 is off screen while the greyed-out button is not.
        */}
        {error || blocking ? <div role="alert" data-testid="answer-comparison-blocked" className="min-w-0 flex-1 basis-full text-body leading-body text-[color:var(--color-text-primary)] [word-break:keep-all] sm:basis-0">
          {error ? <p className="max-w-[var(--measure-prose)]">{error}</p> : null}
          {blocking ? <p className="max-w-[var(--measure-prose)]">{describe(blocking)}</p> : null}
          {problems.length > 1 ? <p className="mt-1 font-mono text-caption text-[color:var(--color-text-tertiary)]">{problems.slice(1).map((problem) => problem.code).join(' · ')}</p> : null}
        </div> : null}
        <div className="flex flex-wrap justify-end gap-2">
          <Button className="atlas-touch-floor max-w-full" size="sm" variant="ghost" onClick={onClose} disabled={saving}>{t('answers.closeCompare')}</Button>
          <Button className="atlas-touch-floor max-w-full" size="sm" variant="primary" onClick={onSave} disabled={saving || problems.length > 0} data-testid="answer-revision-save">{t(saving ? 'answers.phase.saving' : 'answers.saveDraft')}</Button>
        </div>
      </footer>
    </Dialog>
  );
}
