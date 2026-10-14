"use client";

import type { useTranslations } from 'next-intl';
import { useTranslations as useViewerTranslations } from 'next-intl';
import { useMemo, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { answerObservation, sourceCitationWords } from '@/features/library';
import { parseFrontmatter } from '@/shared/lib/vault-document/parse-frontmatter';
import type { FailureCopy } from '@/shared/lib/failures/use-failure-sentence';
import {
  normalizeOriginalPaths,
  parseWikilinkHref,
  resolveSourceCitation,
  rewriteWikilinks,
} from '@/shared/lib/library/source-citation';
import { WIKI_SECTION_ORDER } from '@/shared/lib/library/wiki-page-schema';
import { Button, controlClass, Dialog, Disclosure } from '@/shared/ui';
import { SegmentedControl } from '@/shared/ui/fields/segmented-control';
import { LG_BREAKPOINT_PX, useViewportBelow } from '@/shared/lib/use-viewport-below';
import { describeWikiProblem, type WikiTemplateProblem } from '@/features/library';
import { sectionSlices } from '../../lib/section-slices';

/**
 * `text-reading` travels with it because `--measure-prose` is `ch`, which resolves in the element's
 * own font; spend it at the size the prose is set in so header, grid and footer share two edges.
 */
const COMPARISON_SPAN =
  'mx-auto w-full max-w-[calc(2*var(--measure-prose)+var(--measure-doc-gutter))] text-reading';

const SHA256 = /^[a-f0-9]{64}$/i;
const EMPTY_PATHS: ReadonlySet<string> = new Set<string>();

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
  namedSourcePath,
  changedPaths,
  changedLabel,
  onOpenSource,
}: {
  text: string;
  knownOriginalPaths?: ReadonlySet<string>;
  /** The one original this column's head already names; its citations say only where. */
  namedSourcePath?: string;
  /** Cited originals whose bytes moved since the previous answer recorded them. */
  changedPaths: ReadonlySet<string>;
  changedLabel: string;
  onOpenSource: (path: string, anchor?: string) => void;
}) {
  const sourceT = useViewerTranslations('vaultWidgets.viewer');
  const libraryT = useViewerTranslations('library');
  const normalizedOriginalPaths = useMemo(
    () => normalizeOriginalPaths(knownOriginalPaths),
    [knownOriginalPaths],
  );
  const namedSource = namedSourcePath?.normalize('NFC');

  return <ReactMarkdown remarkPlugins={[remarkGfm]} components={{
    h1: ({ children }) => <h3 className="mb-3 mt-6 text-title font-[var(--font-weight-strong)] text-[color:var(--color-text-primary)]">{children}</h3>,
    h2: ({ children }) => <h3 className="mb-3 mt-6 text-title font-[var(--font-weight-strong)] text-[color:var(--color-text-primary)] first:mt-0">{children}</h3>,
    h3: ({ children }) => <h4 className="mb-2 mt-4 text-body font-[var(--font-weight-strong)] text-[color:var(--color-text-primary)]">{children}</h4>,
    p: ({ children }) => <p className="my-3 break-words text-reading leading-prose text-[color:var(--color-text-secondary)]">{children}</p>,
    ul: ({ children }) => <ul className="my-3 list-disc pl-5 text-reading leading-prose text-[color:var(--color-text-secondary)]">{children}</ul>,
    ol: ({ children }) => <ol className="my-3 list-decimal pl-5 text-reading leading-prose text-[color:var(--color-text-secondary)]">{children}</ol>,
    li: ({ children }) => <li className="my-2 break-words">{children}</li>,
    a: ({ href, children, ...rest }) => {
      const wikilink = href ? parseWikilinkHref(href) : null;
      if (!wikilink) {
        return <span className="break-words underline decoration-dotted" {...rest}>{children}</span>;
      }

      const { rawSlug: rawWikiSlug, rawAnchor, labelled } = wikilink;
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

      /* The same words the page itself shows for an unlabelled citation (`DocsVaultViewer`). */
      const words = sourceCitationWords(
        { path: citation.path ?? citation.rawPath, anchor: citation.anchor },
        { nameFile: citation.rawPath !== namedSource },
        libraryT,
      );
      const shown = labelled ? children : words.text;
      const resolvedPath = citation.path;
      if (citation.status === 'known' && resolvedPath) {
        return (
          <>
            <button
              type="button"
              aria-label={
                words.place
                  ? sourceT('sourceCitationTitleAt', { path: resolvedPath, place: words.place })
                  : sourceT('sourceCitationTitle', { path: resolvedPath })
              }
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
              {shown}
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
          {shown}
        </span>
      );
    },
    pre: ({ children }) => <pre className="my-3 overflow-x-auto whitespace-pre-wrap break-words text-body leading-body">{children}</pre>,
  }}>{rewriteWikilinks(parseFrontmatter(text).body)}</ReactMarkdown>;
}

/**
 * The mark sits beside the citation, not in its `aria-label`, so the control keeps its accessible
 * name. It records that the file's bytes moved and makes no claim about the sentence.
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
  /** Typed copy, not a raw string — see `RetainedAnswerContext` and the B2 note in `failure-code.ts`. */
  error: FailureCopy | null;
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

  const blockingWords = problems[0] ? describeWikiProblem(problems[0], t) : null;

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
              namedSourcePath={pane.sources.length === 1 ? pane.sources[0] : undefined}
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
        <p className="mt-2 break-words text-reading text-[color:var(--color-text-secondary)]">{question}</p>
        <p className="mt-2 text-body leading-body text-[color:var(--color-text-secondary)]">{t('answers.compareHint')}</p>
        {/* The path lines use `RetainedAnswerContext`'s `label: paths` shape, same keys and order, so the
           wording matches the answer page. */}
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
        {/* `subgrid` makes the row heights belong to the parent grid so matching headings align across both
           columns; each column stays its own scrollable pane. */}
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
        {/* The reason stands beside the disabled control: a block above the footer can be off screen at 390
           while the button is not. */}
        {error || blockingWords ? <div role="alert" data-testid="answer-comparison-blocked" className="min-w-0 flex-1 basis-full text-body leading-body text-[color:var(--color-text-primary)] [word-break:keep-all] sm:basis-0">
          {error ? <p data-testid="answer-comparison-error" data-failure-detail={error.detail ?? undefined} className="max-w-[var(--measure-prose)]">{error.sentence}</p> : null}
          {blockingWords ? <p className="max-w-[var(--measure-prose)]">{blockingWords.sentence}{blockingWords.action ? ` ${blockingWords.action}` : ''}</p> : null}
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
