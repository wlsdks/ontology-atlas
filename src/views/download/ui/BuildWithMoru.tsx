'use client';

import { useEffect, useReducer, useRef, useState } from 'react';
import { FileText, RotateCcw } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { Link } from '@/i18n/navigation';
import { GITHUB_REPO_URL } from '@/shared/config/social-links';
import { cn } from '@/shared/lib/cn';
import { PAGE_COLUMN, PAGE_GUTTER } from '@/shared/lib/public-pages/gateway-frame';
import { usePrefersReducedMotion } from '@/shared/lib/render-timing/use-prefers-reduced-motion';
import { Button, buttonVariants } from '@/shared/ui/controls/button';
import { GithubMark } from '@/shared/ui/marks/github-mark';
import { ICON_SIZE } from '@/shared/ui/tokens/icon-size';

import { buildReducer, INITIAL_BUILD, linkingRelation, namingIndex, stepOf, targetConcept, type BuildAction, type BuildPhase, type BuildState } from '../lib/build-play';
import { useInViewMotion } from '../lib/use-in-view-motion';
import { BUILD_CHANGE, BUILD_CONCEPTS, BUILD_FILES, BUILD_RELATIONS, BUILD_REPO, fileNameOf, filesOf, type BuildConceptId } from '../model/build-cast';
import { BuildMoru, preloadBuildRows, type BuildGesture, type BuildLoop } from './BuildMoru';
import { BuildStage, isFirstPress } from './BuildStage';
import { SectionIntro } from './SectionIntro';

const SECTION = cn(PAGE_GUTTER, 'mt-[var(--gateway-section-gap)]', 'w-full scroll-mt-24');
/** Long enough for the eight files to leave the folder and be read where they land. */
const READ_MS = 2200;
const STEPS = ['open', 'name', 'link', 'change', 'done'] as const;

const LOOP: Record<BuildPhase, BuildLoop> = {
  closed: 'tail-wag',
  reading: 'folder-open',
  naming: 'think',
  linking: 'follow-link',
  commit: 'pondering',
  impact: 'search',
  inspect: 'compare',
  done: 'flipper-groove',
};

/** What an action earns from Moru, read from the state before and after it. */
function gestureFor(before: BuildState, after: BuildState): BuildGesture | null {
  if (after.phase === 'done' && before.phase !== 'done') return 'success';
  if (after.links > before.links) return 'hop';
  if (after.names.filter((n) => n !== null).length > before.names.filter((n) => n !== null).length) return 'clap';
  return null;
}

/**
 * "Build a map with Moru": a guided sample of what Atlas does, played in the page alone: nothing
 * is read from the visitor's disk and nothing leaves the page.
 */
export function BuildWithMoru({ handheld }: { handheld: boolean }) {
  const t = useTranslations('download.build');
  const [state, dispatch] = useReducer(buildReducer, INITIAL_BUILD);
  const [gesture, setGesture] = useState<{ motion: BuildGesture; at: number } | null>(null);
  const [missed, setMissed] = useState(false);
  const [pressed, setPressed] = useState(false);
  const [watch, motion] = useInViewMotion();
  const reduced = usePrefersReducedMotion();
  const preloaded = useRef(false);
  const section = useRef<HTMLElement>(null);
  const followFocus = useRef(false);

  useEffect(() => {
    if (motion !== 'running' || preloaded.current) return;
    preloaded.current = true;
    preloadBuildRows();
  }, [motion]);

  useEffect(() => {
    if (state.phase !== 'reading') return;
    const timer = window.setTimeout(() => dispatch({ type: 'read' }), reduced ? 0 : READ_MS);
    return () => window.clearTimeout(timer);
  }, [state.phase, reduced]);

  // A pressed control that leaves (Open folder, a disabled concept, Got it) would drop focus to the
  // page; it moves to the concept to tap or the step's first choice instead.
  useEffect(() => {
    const root = section.current;
    if (!followFocus.current || !root) return;
    const held = document.activeElement;
    const kept = held instanceof HTMLElement && root.contains(held) && !held.matches(':disabled');
    const movedAway = held instanceof HTMLElement && held !== document.body && !root.contains(held);
    if (kept || movedAway) {
      followFocus.current = false;
      return;
    }
    const next = root.querySelector<HTMLElement>('[data-target]:not(:disabled), [data-testid="build-actions"] :is(button, a)');
    if (!next) return;
    followFocus.current = false;
    next.focus();
  }, [state]);

  const act = (action: BuildAction) => {
    followFocus.current = section.current?.contains(document.activeElement) ?? false;
    const after = buildReducer(state, action);
    const earned = gestureFor(state, after);
    if (earned) setGesture({ motion: earned, at: performance.now() });
    setMissed(after.misses > state.misses);
    setPressed(true);
    dispatch(action);
  };

  const nameOf = (concept: BuildConceptId) => {
    const order = BUILD_CONCEPTS.findIndex((item) => item.id === concept);
    const option = state.names[order] ?? 0;
    return option === 0 ? t(`names.${concept}`) : t('folderName', { folder: BUILD_CONCEPTS[order].folder });
  };

  const step = stepOf(state.phase);
  const naming = namingIndex(state);
  const relation = linkingRelation(state);
  const missedTarget = targetConcept(state);
  const line = missed && missedTarget ? t('moru.miss', { name: nameOf(missedTarget) }) : lineFor(state, naming, relation, nameOf, t);
  const play = motion === undefined ? (reduced ? 'still' : 'paused') : motion;

  return (
    <section ref={section} id="build" data-testid="gateway-build-section" data-build-pressed={pressed || undefined} className={SECTION}>
      <div className={cn(PAGE_COLUMN, '@container min-w-0')}>
        <SectionIntro eyebrow={t('eyebrow')} title={t('title')} sub={t('sub')} />

        <div
          ref={watch}
          data-build-motion={motion}
          className="build-frame mt-12 grid min-w-0 overflow-hidden rounded-panel @min-[60rem]:grid-cols-[minmax(0,1fr)_24rem]"
        >
          <div className="flex min-w-0 flex-col">
            <div className="build-bar @container flex h-11 items-center gap-2.5 px-4">
              <span aria-hidden className="size-1.5 shrink-0 rounded-full bg-[color:var(--map-indigo-bright)]" />
              <span className="shrink-0 whitespace-nowrap font-mono text-body leading-body text-[color:var(--color-text-primary)]">{BUILD_REPO}</span>
              <span className="min-w-0 truncate @max-[19rem]:hidden text-label leading-label text-[color:var(--color-text-tertiary)]">{t('repo')}</span>
              {state.phase !== 'closed' ? (
                <Button data-testid="build-restart" variant="ghost" size="sm" className="ml-auto shrink-0 gap-1.5" onClick={() => act({ type: 'restart' })}>
                  <RotateCcw size={ICON_SIZE.sm} aria-hidden />
                  {t('actions.restart')}
                </Button>
              ) : null}
            </div>
            <BuildStage
              state={state}
              nameOf={nameOf}
              onTap={(concept) => act({ type: 'tap', concept })}
            />
          </div>

          <div className="build-panel @container flex min-w-0 flex-col gap-5 p-5 @min-[60rem]:p-6">
            <ol aria-label={t('stepCount', { step: step + 1 })} className="grid grid-cols-5 gap-1.5">
              {STEPS.map((name, index) => (
                <li key={name} aria-current={index === step ? 'step' : undefined} data-step={index < step ? 'done' : index === step ? 'now' : 'next'} className="build-step min-w-0">
                  <span aria-hidden className="build-step-bar block h-1 rounded-full" />
                  <span className="mt-2 block truncate text-label leading-label">{t(`steps.${name}`)}</span>
                </li>
              ))}
            </ol>

            <div className="build-bubble relative rounded-card px-4 py-3.5">
              {/* The live region stays put; only the line inside it is replaced, so each one is announced. */}
              <div aria-live="polite">
                <p data-testid="build-line" key={`${line}:${state.misses}`} className="build-line text-body-lg leading-body-lg text-[color:var(--color-text-primary)]">
                  {line}
                </p>
              </div>
              {state.phase === 'naming' ? (
                <p className="mt-2 text-body leading-body text-[color:var(--color-text-tertiary)]">{t('moru.namingHint')}</p>
              ) : null}
              {state.phase === 'done' ? (
                <p className="mt-2 text-body leading-body text-[color:var(--color-text-secondary)]">
                  {t('doneSummary', { concepts: BUILD_CONCEPTS.length, relations: BUILD_RELATIONS.length })}
                </p>
              ) : null}
            </div>

            {/* A narrow panel gives the choices their own full-width row under Moru. */}
            <div className="flex min-w-0 flex-col gap-3 @min-[23rem]:flex-row @min-[23rem]:items-end">
              <span className="-mb-2 -ml-3 self-start">
                <BuildMoru loop={LOOP[state.phase]} gesture={gesture} play={play} />
              </span>
              <div data-testid="build-actions" className="flex min-w-0 flex-1 flex-col gap-2 pb-1">
                <Actions state={state} naming={naming} handheld={handheld} act={act} />
              </div>
            </div>

            {state.phase === 'inspect' || state.phase === 'done' ? (
              // Both cards share one cell, so confirming cross-fades the concept into its file.
              <div className="build-details grid [&>*]:[grid-area:1/1]">
                <div data-open={state.phase === 'inspect' || undefined} inert={state.phase !== 'inspect'} className="build-detail">
                  <InspectCard nameOf={nameOf} />
                </div>
                <div data-open={state.phase === 'done' || undefined} inert={state.phase !== 'done'} className="build-detail">
                  <FileCard nameOf={nameOf} />
                </div>
              </div>
            ) : null}
          </div>
        </div>

        <p className="mt-4 max-w-[48rem] text-body leading-body text-[color:var(--color-text-tertiary)]">{t('honesty')}</p>
      </div>
    </section>
  );
}

function Actions({ state, naming, handheld, act }: { state: BuildState; naming: number | null; handheld: boolean; act: (action: BuildAction) => void }) {
  const t = useTranslations('download.build');
  const tPage = useTranslations('download');
  switch (state.phase) {
    case 'closed':
      return (
        <Button data-testid="build-open" variant="outline" className="w-full" onClick={() => act({ type: 'open' })}>
          {t('actions.open')}
        </Button>
      );
    case 'naming': {
      if (naming === null) return null;
      const concept = BUILD_CONCEPTS[naming];
      return (
        <>
          <Button data-testid="build-name-0" variant="outline" className="w-full justify-between gap-2" onClick={(event) => isFirstPress(event) && act({ type: 'name', option: 0 })}>
            <span className="shrink-0">{t(`names.${concept.id}`)}</span>
            <span className="inline-flex min-w-0 items-center gap-1.5 text-label leading-label text-[color:var(--color-text-tertiary)]">
              <span aria-hidden className="size-1.5 shrink-0 rounded-full bg-[color:var(--map-indigo-bright)]" />
              <span className="truncate">{t('suggested')}</span>
            </span>
          </Button>
          <Button data-testid="build-name-1" variant="outline" className="w-full justify-start font-mono" onClick={(event) => isFirstPress(event) && act({ type: 'name', option: 1 })}>
            {t('folderName', { folder: concept.folder })}
          </Button>
        </>
      );
    }
    case 'commit':
      return (
        <Button data-testid="build-commit-apply" variant="outline" className="w-full" onClick={() => act({ type: 'commit' })}>
          {t('actions.commit')}
        </Button>
      );
    case 'inspect':
      return (
        <Button data-testid="build-confirm" variant="outline" className="w-full" onClick={() => act({ type: 'confirm' })}>
          {t('actions.confirm')}
        </Button>
      );
    case 'done':
      return (
        <>
          {handheld ? null : (
            <Link href="/topology" data-testid="build-try-browser" className={cn(buttonVariants({ variant: 'outline' }), 'w-full')}>
              {t('actions.tryBrowser')}
            </Link>
          )}
          <a
            href={GITHUB_REPO_URL}
            target="_blank"
            rel="noreferrer noopener"
            data-testid="build-github"
            className={cn(buttonVariants({ variant: 'outline' }), 'w-full gap-2')}
          >
            <GithubMark />
            {tPage('githubCta')}
          </a>
        </>
      );
    default:
      return null;
  }
}

function InspectCard({ nameOf }: { nameOf: (concept: BuildConceptId) => string }) {
  const t = useTranslations('download.build');
  const linked = BUILD_RELATIONS.filter((rel) => rel.from === BUILD_CHANGE.concept || rel.to === BUILD_CHANGE.concept).map((rel) =>
    nameOf(rel.from === BUILD_CHANGE.concept ? rel.to : rel.from),
  );
  return (
    <div data-testid="build-inspect" className="build-file-card rounded-card p-4">
      <p className="flex items-center gap-2 text-title leading-title font-[var(--font-weight-strong)] text-[color:var(--color-text-primary)]">
        <span aria-hidden className="size-2 shrink-0 rounded-full bg-[color:var(--map-recent-change)]" />
        {nameOf(BUILD_CHANGE.concept)}
        <span className="text-label leading-label font-normal text-[color:var(--color-text-tertiary)]">
          {t('files', { count: filesOf(BUILD_CHANGE.concept).length })}
        </span>
      </p>
      <dl className="mt-3 grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1.5 text-body leading-body">
        <dt className="text-[color:var(--color-text-tertiary)]">{t('inspect.changedFile')}</dt>
        <dd className="truncate font-mono text-[color:var(--map-recent-change)]">{fileNameOf(BUILD_CHANGE.file)}</dd>
        <dt className="text-[color:var(--color-text-tertiary)]">{t('inspect.linked')}</dt>
        <dd className="truncate text-[color:var(--color-text-primary)]">{linked.join(' · ')}</dd>
      </dl>
      <p className="mt-3 text-body leading-body text-[color:var(--color-text-secondary)]">{t('inspect.note')}</p>
    </div>
  );
}

/** The finished concept as the Markdown file it is: its first lines are the map's dot and lines. */
function FileCard({ nameOf }: { nameOf: (concept: BuildConceptId) => string }) {
  const depends = BUILD_RELATIONS.filter((rel) => rel.from === BUILD_CHANGE.concept).map((rel) => rel.to);
  const rows: [string | null, string][] = [
    [null, '---'],
    ['title', nameOf(BUILD_CHANGE.concept)],
    ['kind', 'capability'],
    ['path', BUILD_CONCEPTS.find((concept) => concept.id === BUILD_CHANGE.concept)!.folder],
    ['dependencies', ''],
    ...depends.map((slug): [string | null, string] => [null, `  - capabilities/${slug}`]),
    [null, '---'],
  ];
  return (
    <div data-testid="build-file" className="build-file-card rounded-card p-4">
      <p className="flex items-center gap-2 font-mono text-label leading-label text-[color:var(--color-text-tertiary)]">
        <FileText size={ICON_SIZE.sm} aria-hidden />
        docs/ontology/capabilities/{BUILD_CHANGE.concept}.md
      </p>
      <pre className="mt-2.5 overflow-hidden font-mono text-body leading-body text-[color:var(--color-text-primary)]">
        {rows.map(([key, value], index) => (
          <span key={index} className="block overflow-hidden text-ellipsis whitespace-pre">
            {key ? <span className="build-code-key">{key}:</span> : null}
            {key && value ? ` ${value}` : value}
          </span>
        ))}
      </pre>
    </div>
  );
}

type T = ReturnType<typeof useTranslations<'download.build'>>;

function lineFor(
  state: BuildState,
  naming: number | null,
  relation: ReturnType<typeof linkingRelation>,
  nameOf: (concept: BuildConceptId) => string,
  t: T,
): string {
  switch (state.phase) {
    case 'closed':
      return t('moru.closed');
    case 'reading':
      return t('moru.reading', { count: BUILD_FILES.length });
    case 'naming':
      return t('moru.naming', { count: naming === null ? 0 : filesOf(BUILD_CONCEPTS[naming].id).length });
    case 'linking':
      if (!relation) return '';
      return state.pick === null
        ? t('moru.linkStart', { from: nameOf(relation.from), to: nameOf(relation.to), reason: t(`relations.${relation.label}`) })
        : t('moru.linkEnd', { to: nameOf(relation.to) });
    case 'commit':
      return t('moru.commit');
    case 'impact':
      return t('moru.impact', { name: nameOf(BUILD_CHANGE.concept) });
    case 'inspect':
      return t('moru.inspect');
    case 'done':
      return t('moru.done');
  }
}
