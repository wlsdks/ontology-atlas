'use client';

import { useEffect, useReducer, useRef, useState, type CSSProperties } from 'react';
import { Check, FileText, RotateCcw, Star, Timer } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { Link } from '@/i18n/navigation';
import { GITHUB_REPO_URL } from '@/shared/config/social-links';
import { cn } from '@/shared/lib/cn';
import { PAGE_COLUMN, PAGE_GUTTER } from '@/shared/lib/public-pages/gateway-frame';
import { usePrefersReducedMotion } from '@/shared/lib/render-timing/use-prefers-reduced-motion';
import { Button, buttonVariants } from '@/shared/ui/controls/button';
import { GithubMark } from '@/shared/ui/marks/service-marks/github-mark';
import { ICON_SIZE } from '@/shared/ui/tokens/icon-size';

import {
  AGENT_BEATS,
  BUILD_STEPS,
  buildReducer,
  codeNamedLeft,
  INITIAL_BUILD,
  isWritten,
  partnerOf,
  relationsLeft,
  stepOf,
  targetConcepts,
  type BuildAction,
  type BuildPhase,
  type BuildState,
} from '../../lib/build-play';
import { useInViewMotion } from '../../lib/page-motion/use-in-view-motion';
import {
  BUILD_CHANGE,
  BUILD_CONCEPTS,
  BUILD_FILE_COUNT,
  BUILD_RELATIONS,
  BUILD_REPO,
  CODE_NAMED,
  conceptOf,
  fileNameOf,
  loneEndOf,
  LONE_CONCEPTS,
  PERSON_RELATIONS,
  dependsOnChange,
  touchesChange,
  type BuildConceptId,
} from '../../model/build-cast';
import { BuildMoru, preloadBuildRows, type BuildGesture, type BuildLoop } from './BuildMoru';
import { Burst, BuildStage, isFirstPress } from './BuildStage';
import { SectionIntro } from '../SectionIntro';
import { TypedLetters } from './TypedLetters';

const SECTION = cn(PAGE_GUTTER, 'mt-[var(--gateway-section-gap)]', 'w-full scroll-mt-24');
const BEAT_MS = [500, 1400, 900, 1100, 1100, 1100, 1000, 1100, 1900] as const;
/** The third star: a first visit that reads every line lands near a minute and a half; a brisk one inside this. */
const STAR_SECONDS = 60;

const LOOP: Record<BuildPhase, BuildLoop> = {
  closed: 'tail-wag',
  building: 'read',
  rename: 'search',
  renaming: 'think',
  linking: 'follow-link',
  commit: 'pondering',
  impact: 'search',
  inspect: 'compare',
  done: 'flipper-groove',
};

function gestureFor(before: BuildState, after: BuildState): BuildGesture | null {
  if (after.phase === 'done' && before.phase !== 'done') return 'success';
  if (after.misses > before.misses) return 'uncertain';
  if (after.links.length > before.links.length) return 'hop';
  if (Object.keys(after.renamed).length > Object.keys(before.renamed).length) return 'clap';
  return null;
}

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
  const [startedAt, setStartedAt] = useState(0);
  const [result, setResult] = useState<{ seconds: number; misses: number } | null>(null);

  useEffect(() => {
    if (motion !== 'running' || preloaded.current) return;
    preloaded.current = true;
    preloadBuildRows();
  }, [motion]);

  useEffect(() => {
    if (state.phase !== 'building') return;
    const timer = window.setTimeout(() => dispatch({ type: 'beat' }), reduced ? 0 : BEAT_MS[state.built]);
    return () => window.clearTimeout(timer);
  }, [state.phase, state.built, reduced]);

  // A pressed control that leaves (Start, a disabled concept, Got it) would drop focus to the
  // page; it moves to the concept to tap or the step's first choice instead.
  useEffect(() => {
    const root = section.current;
    if (!followFocus.current || !root) return;
    const held = document.activeElement;
    const kept = held instanceof HTMLElement && root.contains(held) && !held.matches(':disabled') && !held.closest('[inert]');
    const movedAway = held instanceof HTMLElement && held !== document.body && !root.contains(held);
    if (kept || movedAway) {
      followFocus.current = false;
      return;
    }
    const next = root.querySelector<HTMLElement>('[data-target]:not(:disabled), [data-testid="build-actions"] :is(button, a), [data-shown] > * > [data-testid="build-open"]');
    if (!next) return;
    followFocus.current = false;
    // The agent's build takes seconds; a visitor who scrolled on meanwhile is not pulled back.
    next.focus({ preventScroll: true });
  }, [state]);

  const act = (action: BuildAction) => {
    followFocus.current = section.current?.contains(document.activeElement) ?? false;
    const after = buildReducer(state, action);
    const earned = gestureFor(state, after);
    if (earned) setGesture({ motion: earned, at: performance.now() });
    setMissed(after.misses > state.misses);
    if (action.type === 'open' && state.phase === 'closed') setStartedAt(performance.now());
    if (action.type === 'restart') setResult(null);
    if (after.phase === 'done' && state.phase !== 'done') {
      setResult({ seconds: Math.max(1, Math.round((performance.now() - startedAt) / 1000)), misses: after.misses });
    }
    setPressed(true);
    dispatch(action);
  };

  const nameOf = (concept: BuildConceptId) => {
    const code = CODE_NAMED.find((entry) => entry.concept === concept);
    const option = code ? state.renamed[code.concept] : 0;
    if (code && option === undefined) return code.title;
    return option === 1 && code ? t(`altNames.${code.concept}`) : t(`names.${concept}`);
  };

  const step = stepOf(state.phase);
  const listed = state.phase !== 'inspect' && state.phase !== 'done';
  const missedTarget = targetConcepts(state)[0];
  const line = missed && missedTarget ? t('moru.miss', { name: nameOf(missedTarget) }) : lineFor(state, nameOf, t);
  const play = motion === undefined ? (reduced ? 'still' : 'paused') : motion;

  return (
    <section ref={section} id="build" data-testid="gateway-build-section" data-build-pressed={pressed || undefined} className={SECTION}>
      <div className={cn(PAGE_COLUMN, '@container min-w-0')}>
        <SectionIntro eyebrow={t('eyebrow')} title={t('title')} sub={t('sub')} />

        <div
          ref={watch}
          data-build-motion={motion}
          className="build-frame @container/build mt-12 grid min-w-0 overflow-hidden rounded-panel @min-[60rem]:grid-cols-[minmax(0,1fr)_24rem]"
        >
          <div className="flex min-w-0 flex-col">
            <div className="build-bar @container flex h-11 items-center gap-2.5 px-4">
              <span aria-hidden className="size-1.5 shrink-0 rounded-full bg-[color:var(--map-indigo-bright)]" />
              <span className="shrink-0 whitespace-nowrap font-mono text-body leading-body text-[color:var(--color-text-primary)]">{BUILD_REPO}</span>
              <span className="min-w-0 truncate @max-[19rem]:hidden text-label leading-label text-[color:var(--color-text-tertiary)]">{t('repo')}</span>
              {state.phase !== 'closed' ? <Clock startedAt={startedAt} stoppedAt={result?.seconds ?? null} /> : null}
              {state.phase !== 'closed' ? (
                <Button data-testid="build-restart" variant="ghost" size="sm" className="atlas-touch-floor shrink-0 gap-1.5" onClick={() => act({ type: 'restart' })}>
                  <RotateCcw size={ICON_SIZE.sm} aria-hidden />
                  {t('actions.restart')}
                </Button>
              ) : null}
            </div>
            <BuildStage
              state={state}
              nameOf={nameOf}
              onTap={(concept) => act({ type: 'tap', concept })}
              onStart={() => act({ type: 'open' })}
            />
          </div>

          <div className="build-panel @container flex min-w-0 flex-col gap-5 p-5 @min-[60rem]:p-6">
            {listed ? <Quests state={state} step={step} /> : null}
            <ol aria-label={t('stepCount', { step: step + 1 })} className={cn('grid grid-cols-6 gap-1.5', state.phase !== 'inspect' && '@min-[60rem]/build:hidden')}>
              {BUILD_STEPS.map((name, index) => (
                <li key={name} aria-current={index === step ? 'step' : undefined} data-step={index < step ? 'done' : index === step ? 'now' : 'next'} className="build-step min-w-0">
                  <span aria-hidden className="build-step-bar block h-1 rounded-full" />
                  <span className="mt-2 block truncate text-label leading-label">{t(`steps.${name}`)}</span>
                </li>
              ))}
            </ol>

            <div className="build-bubble relative rounded-card px-4 py-3.5">
              {/* The live region stays put; only the line inside it is replaced, so each one is announced. */}
              <div aria-live="polite">
                <p key={`${line}:${state.misses}`} className="build-line text-body-lg leading-body-lg text-[color:var(--color-text-primary)]">
                  <TypedLine text={line} />
                </p>
                {state.phase === 'done' && result ? (
                  <span className="sr-only">
                    {t('stars.count', { count: starsOf(result).filter((star) => star.earned).length })} · {t('result', result)}
                  </span>
                ) : null}
              </div>
              {state.phase === 'renaming' ? (
                <p className="mt-2 text-body leading-body text-[color:var(--color-text-tertiary)]">{t('moru.renameHint')}</p>
              ) : null}
              {state.phase === 'building' ? <AgentLog built={state.built} /> : null}
              {state.phase === 'done' && result ? <Stars result={result} onRetry={() => act({ type: 'restart' })} /> : null}
            </div>

            <div className="flex min-w-0 flex-col gap-3 @min-[20rem]:flex-row @min-[20rem]:items-end">
              <span className="-mb-2 -ml-3 self-start">
                <BuildMoru loop={LOOP[state.phase]} gesture={gesture} play={play} />
              </span>
              <div data-testid="build-actions" className="flex min-w-0 flex-1 flex-col gap-2 pb-1">
                <Actions state={state} handheld={handheld} act={act} />
              </div>
            </div>

            {state.phase === 'inspect' || state.phase === 'done' ? (
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

function Clock({ startedAt, stoppedAt }: { startedAt: number; stoppedAt: number | null }) {
  const [now, setNow] = useState(() => performance.now());
  useEffect(() => {
    if (stoppedAt !== null) return;
    const timer = window.setInterval(() => setNow(performance.now()), 250);
    return () => window.clearInterval(timer);
  }, [stoppedAt]);
  const seconds = stoppedAt ?? Math.max(0, Math.floor((now - startedAt) / 1000));
  return (
    <span aria-hidden data-testid="build-clock" data-stopped={stoppedAt !== null || undefined} className="build-clock ml-auto inline-flex shrink-0 items-center gap-1.5 font-mono text-label leading-label tabular-nums">
      <Timer size={ICON_SIZE.sm} />
      {Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2, '0')}
    </span>
  );
}

function Quests({ state, step }: { state: BuildState; step: number }) {
  const t = useTranslations('download.build');
  const counts: Partial<Record<(typeof BUILD_STEPS)[number], string>> = {
    build: `${BUILD_CONCEPTS.filter((concept) => isWritten(state, concept)).length}/${BUILD_CONCEPTS.length}`,
    rename: `${CODE_NAMED.length - codeNamedLeft(state).length}/${CODE_NAMED.length}`,
    link: `${state.links.length}/${PERSON_RELATIONS.length}`,
  };
  return (
    <ol aria-label={t('stepCount', { step: step + 1 })} className="hidden flex-col gap-1 @min-[60rem]/build:flex">
      {BUILD_STEPS.map((name, index) => {
        const status = index < step || state.phase === 'done' ? 'done' : index === step ? 'now' : 'next';
        return (
          <li key={name} aria-current={status === 'now' ? 'step' : undefined} data-quest={status} className="build-quest flex items-center gap-3 rounded-chip px-3 py-2">
            <span aria-hidden className="build-quest-mark grid size-5 shrink-0 place-items-center rounded-full">
              {status === 'done' ? <Check size={ICON_SIZE.sm} strokeWidth={3} /> : null}
            </span>
            <span className="min-w-0 flex-1 truncate text-body leading-body">{t(`quests.${name}`)}</span>
            {counts[name] ? <span className="shrink-0 font-mono text-label leading-label tabular-nums">{counts[name]}</span> : null}
          </li>
        );
      })}
    </ol>
  );
}

const starsOf = (result: { seconds: number; misses: number }) =>
  [
    { key: 'built', earned: true },
    { key: 'flawless', earned: result.misses === 0 },
    { key: 'brisk', earned: result.seconds <= STAR_SECONDS },
  ] as const;

function Stars({ result, onRetry }: { result: { seconds: number; misses: number }; onRetry: () => void }) {
  const t = useTranslations('download.build');
  const stars = starsOf(result);
  return (
    <div data-testid="build-result" data-stars={stars.filter((star) => star.earned).length} className="build-clear mt-3 rounded-card px-3 pb-3 pt-3.5">
      <ul className="grid grid-cols-3 gap-2">
        {stars.map((star, index) => (
          <li key={star.key} data-earned={star.earned || undefined} className="build-star flex min-w-0 flex-col items-center gap-1.5 text-center" style={{ '--order': index } as CSSProperties}>
            <span className="build-star-mark relative grid size-8 place-items-center">
              <Star size={ICON_SIZE.lg} aria-hidden fill={star.earned ? 'currentColor' : 'none'} />
              {star.earned ? <Burst delay={`calc(var(--motion-slow) + var(--motion-stagger) * 6 * ${index})`} /> : null}
            </span>
            <span className="w-full truncate text-label leading-label">
              <span className="sr-only">{star.earned ? t('stars.earned') : t('stars.missed')}</span>
              {t(`stars.${star.key}`, { seconds: STAR_SECONDS })}
            </span>
          </li>
        ))}
      </ul>
      <p className="mt-2.5 text-center font-mono text-label leading-label text-[color:var(--color-text-tertiary)]">{t('result', result)}</p>
      {stars.some((star) => !star.earned) ? (
        <Button data-testid="build-retry" variant="ghost" size="sm" className="atlas-touch-floor mx-auto mt-2 flex gap-1.5" onClick={onRetry}>
          <RotateCcw size={ICON_SIZE.sm} aria-hidden />
          {t('actions.retry')}
        </Button>
      ) : null}
    </div>
  );
}

function AgentLog({ built }: { built: number }) {
  const t = useTranslations('download.build');
  const nameOf = (id: BuildConceptId) => t(`names.${id}`);
  const cluster = (id: BuildConceptId) => BUILD_CONCEPTS.filter((concept) => concept.beat === conceptOf(id).beat);
  const rows: [string, string][] = [
    ['analyze_repo_structure', t('log.read', { count: BUILD_FILE_COUNT })],
    ['add_concepts', nameOf('shop')],
    ...(['shopping', 'orders', 'members'] as const).map((id): [string, string] => ['add_concepts', t('log.cluster', { name: nameOf(id), count: cluster(id).length - 1 })]),
    ['add_concepts', LONE_CONCEPTS.map(nameOf).join(', ')],
    ['add_relations', t('log.relations', { count: BUILD_RELATIONS.filter((rel) => rel.by === 'agent').length })],
    ['Atlas', t('found', { names: CODE_NAMED.length, lone: LONE_CONCEPTS.length })],
  ];
  const shown = rows.slice(0, Math.min(built, AGENT_BEATS)).slice(-4);
  return (
    <ol aria-hidden data-testid="build-log" className="build-log mt-3 flex flex-col gap-1">
      {shown.map(([tool, detail], index) => (
        <li key={`${tool}:${detail}`} data-atlas={tool === 'Atlas' || undefined} data-latest={index === shown.length - 1 || undefined} className="build-log-row flex min-w-0 items-center gap-2 font-mono text-label leading-label">
          <span className="build-log-tool shrink-0">{tool}</span>
          <span className="min-w-0 truncate">{detail}</span>
        </li>
      ))}
    </ol>
  );
}

function TypedLine({ text }: { text: string }) {
  return (
    <>
      <span data-testid="build-line" className="sr-only">
        {text}
      </span>
      <TypedLetters text={text} />
    </>
  );
}

function Actions({ state, handheld, act }: { state: BuildState; handheld: boolean; act: (action: BuildAction) => void }) {
  const t = useTranslations('download.build');
  const tPage = useTranslations('download');
  switch (state.phase) {
    case 'renaming':
      if (state.renaming === null) return null;
      return (
        <>
          <Button data-testid="build-name-0" variant="outline" className="atlas-touch-floor w-full justify-between gap-2" onClick={(event) => isFirstPress(event) && act({ type: 'rename', option: 0 })}>
            <span className="shrink-0">{t(`names.${state.renaming}`)}</span>
            <span className="inline-flex min-w-0 items-center gap-1.5 text-label leading-label text-[color:var(--color-text-tertiary)]">
              <span aria-hidden className="size-1.5 shrink-0 rounded-full bg-[color:var(--map-indigo-bright)]" />
              <span className="truncate">{t('suggested')}</span>
            </span>
          </Button>
          <Button data-testid="build-name-1" variant="outline" className="atlas-touch-floor w-full justify-start" onClick={(event) => isFirstPress(event) && act({ type: 'rename', option: 1 })}>
            {t(`altNames.${state.renaming}`)}
          </Button>
        </>
      );
    case 'commit':
      return (
        <Button data-testid="build-commit-apply" variant="outline" className="atlas-touch-floor w-full" onClick={() => act({ type: 'commit' })}>
          {t('actions.commit')}
        </Button>
      );
    case 'inspect':
      return (
        <Button data-testid="build-confirm" variant="outline" className="atlas-touch-floor w-full" onClick={() => act({ type: 'confirm' })}>
          {t('actions.confirm')}
        </Button>
      );
    case 'done':
      return (
        <>
          {handheld ? null : (
            <Link href="/topology" data-testid="build-try-browser" className={cn(buttonVariants({ variant: 'outline' }), 'atlas-touch-floor w-full')}>
              {t('actions.tryBrowser')}
            </Link>
          )}
          <a
            href={GITHUB_REPO_URL}
            target="_blank"
            rel="noreferrer noopener"
            data-testid="build-github"
            className={cn(buttonVariants({ variant: 'outline' }), 'atlas-touch-floor w-full gap-2')}
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
  const linked = BUILD_RELATIONS.filter(touchesChange).map((rel) => nameOf(rel.from === BUILD_CHANGE.concept ? rel.to : rel.from));
  return (
    <div data-testid="build-inspect" className="build-file-card rounded-card p-4">
      <p className="flex items-center gap-2 text-title leading-title font-[var(--font-weight-strong)] text-[color:var(--color-text-primary)]">
        <span aria-hidden className="size-2 shrink-0 rounded-full bg-[color:var(--map-recent-change)]" />
        {nameOf(BUILD_CHANGE.concept)}
        <span className="text-label leading-label font-normal text-[color:var(--color-text-tertiary)]">
          {t('files', { count: conceptOf(BUILD_CHANGE.concept).files })}
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

function FileCard({ nameOf }: { nameOf: (concept: BuildConceptId) => string }) {
  const depends = BUILD_RELATIONS.filter((rel) => rel.from === BUILD_CHANGE.concept).map((rel) => rel.to);
  const rows: [string | null, string][] = [
    [null, '---'],
    ['title', nameOf(BUILD_CHANGE.concept)],
    ['kind', 'capability'],
    ['domain', 'domains/orders'],
    ['path', BUILD_CHANGE.file.slice(0, BUILD_CHANGE.file.lastIndexOf('/'))],
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

function lineFor(state: BuildState, nameOf: (concept: BuildConceptId) => string, t: T): string {
  switch (state.phase) {
    case 'closed':
      return t('moru.closed');
    case 'building':
      return t('moru.building', { count: BUILD_FILE_COUNT });
    case 'rename': {
      const left = codeNamedLeft(state);
      return left.length === CODE_NAMED.length
        ? t('moru.rename', { first: left[0].title, second: left[1].title })
        : t('moru.renameLast', { name: left[0].title });
    }
    case 'renaming':
      return t('moru.renaming', { name: CODE_NAMED.find((entry) => entry.concept === state.renaming)?.title ?? '' });
    case 'linking': {
      const partner = partnerOf(state);
      if (partner && state.pick) {
        const rel = relationsLeft(state).find((left) => left.from === state.pick || left.to === state.pick)!;
        return t('moru.linkEnd', { to: nameOf(partner), from: nameOf(rel.from), reason: t(`relations.${rel.label}`) });
      }
      const left = relationsLeft(state);
      return left.length === PERSON_RELATIONS.length
        ? t('moru.linkStart', { first: nameOf(loneEndOf(left[0])), second: nameOf(loneEndOf(left[1])) })
        : t('moru.linkLast', { name: nameOf(loneEndOf(left[0])) });
    }
    case 'commit':
      return t('moru.commit');
    case 'impact':
      return t('moru.impact', { name: nameOf(BUILD_CHANGE.concept), linked: nameOf(BUILD_RELATIONS.find(dependsOnChange)!.from) });
    case 'inspect':
      return t('moru.inspect');
    case 'done':
      return t('moru.done');
  }
}
