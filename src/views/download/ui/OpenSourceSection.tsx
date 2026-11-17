'use client';

import { Star } from 'lucide-react';
import { useFormatter, useTranslations } from 'next-intl';

import { GITHUB_REPO_URL } from '@/shared/config/social-links';
import { cn } from '@/shared/lib/cn';
import { PAGE_COLUMN, PAGE_GUTTER } from '@/shared/lib/public-pages/gateway-frame';
import { cubicBezierAt } from '@/shared/motion/ease';
import { MOTION, MOTION_EASE } from '@/shared/motion/tokens';
import { buttonVariants } from '@/shared/ui';
import { controlClass } from '@/shared/ui/control-class';
import { ICON_SIZE } from '@/shared/ui/tokens/icon-size';

import { usePlayOnce } from '../lib/use-play-once';
import { REPO_FACTS } from '../model/repo-facts.generated';
import { SectionIntro } from './SectionIntro';

/** The top-level folders a reader meets first, each opening that folder on GitHub. */
const FOLDERS = [
  { key: 'app', path: 'src/' },
  { key: 'desktop', path: 'src-tauri/' },
  { key: 'mcp', path: 'mcp/' },
  { key: 'cli', path: 'cli/' },
  { key: 'vault', path: 'docs/ontology/' },
] as const;

const LINKS = [
  { key: 'contribute', href: `${GITHUB_REPO_URL}/blob/main/CONTRIBUTING.md` },
  { key: 'security', href: `${GITHUB_REPO_URL}/blob/main/SECURITY.md` },
  { key: 'issues', href: `${GITHUB_REPO_URL}/issues` },
  { key: 'releases', href: `${GITHUB_REPO_URL}/releases` },
] as const;

const EXTERNAL = controlClass({ shape: 'link', tone: 'secondary', hoverInk: 'strong' });

/*
 * The contribution drawing, on a 560×220 field: the main line, a fork that leaves it, carries two
 * commits and comes back, and the merge. The flat stretch of the fork runs from x 240 to 352.
 */
const GRAPH = { width: 560, height: 220 } as const;
const MAIN = 'M24 150 H536';
const FORK = 'M152 150 C196 150 196 70 240 70 H352 C396 70 396 150 440 150';
const FORK_FLAT = { from: 240, to: 352 } as const;
const MAIN_COMMITS = [64, 152] as const;
const FORK_COMMITS = [272, 320] as const;
const MERGE = { x: 440, y: 150 } as const;
/** Each label sits under or over the point it names, as a share of the field. */
const STEPS = [
  { key: 'fork', x: 152, y: 150, below: true },
  { key: 'change', x: 296, y: 70, below: false },
  { key: 'merge', x: 440, y: 150, below: true },
] as const;

const EASE = `cubic-bezier(${MOTION_EASE.join(', ')})`;
const MAIN_DRAW = { at: 0, ms: 700 } as const;
const FORK_DRAW = { at: 500, ms: 1000 } as const;
const LABEL_AT_MS = [600, 1100, 1700] as const;
const MERGE_AT_MS = 1500;
const POP_MS = MOTION.slow.duration * 1000;
const RISE_PX = 8;

/** When an eased draw reaches a share of its length, as a share of its time. */
function timeAtShare(share: number): number {
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 30; i += 1) {
    const mid = (lo + hi) / 2;
    if (cubicBezierAt(MOTION_EASE, mid) < share) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

/**
 * The drawing's one entrance: the main line, then the fork drawn out of it, each commit appearing
 * as the fork's tip passes it, the merge, and the three labels in the order they happen.
 */
function graphEntrance(figure: HTMLElement): Animation[] {
  const main = figure.querySelector<SVGPathElement>('[data-graph-main]');
  const fork = figure.querySelector<SVGPathElement>('[data-graph-fork]');
  if (!main || !fork) return [];
  const draw = [{ strokeDashoffset: 1 }, { strokeDashoffset: 0 }];
  const pop = [
    { opacity: 0, transform: 'scale(0.4)' },
    { opacity: 1, transform: 'scale(1)' },
  ];
  const rise = [
    { opacity: 0, transform: `translateY(${RISE_PX}px)` },
    { opacity: 1, transform: 'translateY(0)' },
  ];
  const once = (delay: number, duration: number) => ({ delay, duration, easing: EASE, fill: 'backwards' as const });
  const animations = [
    main.animate(draw, once(MAIN_DRAW.at, MAIN_DRAW.ms)),
    fork.animate(draw, once(FORK_DRAW.at, FORK_DRAW.ms)),
  ];

  // The fork is symmetric, so its first curve is half of what the flat stretch leaves.
  const length = typeof fork.getTotalLength === 'function' ? fork.getTotalLength() : 0;
  const flat = FORK_FLAT.to - FORK_FLAT.from;
  const rise1 = length > flat ? (length - flat) / 2 : 0;
  figure.querySelectorAll<SVGElement>('[data-graph-main-commit]').forEach((dot, index) => {
    const share = (MAIN_COMMITS[index] - 24) / (536 - 24);
    animations.push(dot.animate(pop, once(MAIN_DRAW.at + timeAtShare(share) * MAIN_DRAW.ms, POP_MS)));
  });
  figure.querySelectorAll<SVGElement>('[data-graph-fork-commit]').forEach((dot, index) => {
    const share = length > 0 ? (rise1 + FORK_COMMITS[index] - FORK_FLAT.from) / length : 0.5;
    animations.push(dot.animate(pop, once(FORK_DRAW.at + timeAtShare(share) * FORK_DRAW.ms, POP_MS)));
  });
  const merge = figure.querySelector<SVGElement>('[data-graph-merge]');
  if (merge) animations.push(merge.animate(pop, once(MERGE_AT_MS, POP_MS)));
  figure.querySelectorAll<HTMLElement>('[data-graph-label]').forEach((label, index) => {
    animations.push(label.animate(rise, once(LABEL_AT_MS[index], POP_MS)));
  });
  return animations;
}

/** The way a change gets in: fork the repository, change it, send a pull request. */
function ContributionGraph({ caption }: { caption: string }) {
  const t = useTranslations('download.source.graph');
  const figure = usePlayOnce<HTMLElement>(graphEntrance);
  const dot = { transformBox: 'fill-box', transformOrigin: 'center' } as const;
  return (
    <figure ref={figure} data-testid="gateway-source-graph" className="min-w-0">
      <div className="relative w-full" style={{ aspectRatio: `${GRAPH.width} / ${GRAPH.height}` }}>
        <svg
          aria-hidden
          viewBox={`0 0 ${GRAPH.width} ${GRAPH.height}`}
          className="absolute inset-0 h-full w-full overflow-visible"
          fill="none"
        >
          <path
            data-graph-main
            d={MAIN}
            pathLength={1}
            strokeDasharray="1 1"
            strokeWidth={1.5}
            strokeLinecap="round"
            className="stroke-[color:var(--color-text-tertiary)]"
          />
          <path
            data-graph-fork
            d={FORK}
            pathLength={1}
            strokeDasharray="1 1"
            strokeWidth={2}
            strokeLinecap="round"
            className="stroke-[color:var(--map-indigo-bright)]"
          />
          {MAIN_COMMITS.map((x) => (
            <circle
              key={x}
              data-graph-main-commit
              cx={x}
              cy={150}
              r={4.5}
              style={dot}
              className="fill-[color:var(--color-canvas)] stroke-[color:var(--color-text-tertiary)]"
              strokeWidth={1.5}
            />
          ))}
          {FORK_COMMITS.map((x) => (
            <circle
              key={x}
              data-graph-fork-commit
              cx={x}
              cy={70}
              r={5}
              style={dot}
              className="fill-[color:var(--map-indigo-bright)]"
            />
          ))}
          <circle
            data-graph-merge
            cx={MERGE.x}
            cy={MERGE.y}
            r={7}
            style={dot}
            className="fill-[color:var(--color-status-success)]"
          />
        </svg>
        {STEPS.map((step) => (
          <span
            key={step.key}
            data-graph-label
            className="absolute -translate-x-1/2 whitespace-nowrap text-body-lg leading-body-lg text-[color:var(--color-text-secondary)]"
            style={{
              left: `${(step.x / GRAPH.width) * 100}%`,
              ...(step.below
                ? { top: `calc(${(step.y / GRAPH.height) * 100}% + 1rem)` }
                : { bottom: `calc(${100 - (step.y / GRAPH.height) * 100}% + 1rem)` }),
            }}
          >
            {t(step.key)}
          </span>
        ))}
      </div>
      <figcaption className="mt-2 max-w-[34rem] text-body-lg leading-body-lg text-[color:var(--color-text-tertiary)]">
        {caption}
      </figcaption>
    </figure>
  );
}

/**
 * What being open source gives the person installing: the license and counts, how a change gets
 * in, and where each part lives. The star and fork counts come from a committed file with the day
 * they were read; the page asks GitHub nothing.
 */
export function OpenSourceSection() {
  const t = useTranslations('download.source');
  const format = useFormatter();
  const readOn = format.dateTime(new Date(`${REPO_FACTS.readOn}T00:00:00Z`), {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
  const stats = [
    { key: 'stars', label: t('stars'), value: format.number(REPO_FACTS.stars) },
    { key: 'forks', label: t('forks'), value: format.number(REPO_FACTS.forks) },
    { key: 'license', label: t('license'), value: t('licenseValue') },
  ];

  return (
    <section
      id="source"
      data-testid="gateway-source-section"
      className={cn(PAGE_GUTTER, 'mt-[var(--gateway-section-gap)]', 'w-full scroll-mt-24')}
    >
      {/* The column decides the row, as in the loop section above. */}
      <div className={cn(PAGE_COLUMN, '@container min-w-0')}>
        <div className="grid min-w-0 gap-x-16 gap-y-12 @min-[52rem]:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
          <div className="flex min-w-0 flex-col">
            <SectionIntro eyebrow={t('eyebrow')} title={t('title')} sub={t('sub')} />

            <dl className="mt-10 grid min-w-0 grid-cols-3 gap-x-6">
              {stats.map((stat) => (
                <div key={stat.key} className="flex min-w-0 flex-col-reverse">
                  <dt className="mt-1 text-body-lg leading-body-lg text-[color:var(--color-text-secondary)]">
                    {stat.label}
                  </dt>
                  <dd
                    data-testid={`gateway-source-${stat.key}`}
                    className="text-hero-lg leading-hero-lg font-[var(--font-weight-signature)] tabular-nums tracking-[var(--tracking-display)] text-[color:var(--color-text-primary)]"
                  >
                    {stat.value}
                  </dd>
                </div>
              ))}
            </dl>
            <p className="mt-3 text-body leading-body text-[color:var(--color-text-tertiary)]">
              {t('readOn', { date: readOn })}
            </p>

            <a
              href={GITHUB_REPO_URL}
              target="_blank"
              rel="noreferrer noopener"
              data-testid="gateway-source-star"
              className={cn(buttonVariants({ variant: 'outline', size: 'lg' }), 'mt-8 w-fit shrink-0')}
            >
              <Star size={ICON_SIZE.md} aria-hidden />
              {t('star')}
            </a>

            <ul data-testid="gateway-source-links" className="mt-8 flex min-w-0 flex-wrap gap-x-6 gap-y-3">
              {LINKS.map((link) => (
                <li key={link.key}>
                  <a
                    href={link.href}
                    target="_blank"
                    rel="noreferrer noopener"
                    className={cn(EXTERNAL, 'touch-hit-expand gap-1.5 text-body-lg leading-body-lg')}
                  >
                    <span aria-hidden data-external-link-marker>
                      ↗
                    </span>
                    {t(link.key)}
                  </a>
                </li>
              ))}
            </ul>
          </div>

          <div data-testid="gateway-source-repository" className="flex min-w-0 flex-col justify-end">
            <ContributionGraph caption={t('caption')} />

            <ul className="mt-10 flex min-w-0 flex-col border-t border-[color:var(--color-divider)]">
              {FOLDERS.map((folder) => (
                <li
                  key={folder.key}
                  className="grid min-w-0 grid-cols-[minmax(0,10rem)_minmax(0,1fr)] items-baseline gap-x-6 border-b border-[color:var(--color-divider)] py-3 text-body-lg leading-body-lg"
                >
                  <a
                    href={`${GITHUB_REPO_URL}/tree/main/${folder.path}`}
                    target="_blank"
                    rel="noreferrer noopener"
                    className={cn(EXTERNAL, 'touch-hit-expand min-w-0 gap-1.5 font-mono text-body-lg leading-body-lg')}
                  >
                    <span aria-hidden data-external-link-marker>
                      ↗
                    </span>
                    {folder.path}
                  </a>
                  <span className="min-w-0 text-[color:var(--color-text-secondary)]">{t(`dir.${folder.key}`)}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </section>
  );
}
