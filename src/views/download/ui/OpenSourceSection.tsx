'use client';

import { Star } from 'lucide-react';
import { useFormatter, useTranslations } from 'next-intl';

import { GITHUB_REPO_URL } from '@/shared/config/social-links';
import { cn } from '@/shared/lib/cn';
import { PAGE_COLUMN, PAGE_GUTTER } from '@/shared/lib/public-pages/gateway-frame';
import { buttonVariants } from '@/shared/ui';
import { controlClass } from '@/shared/ui/control-class';
import { GithubMark } from '@/shared/ui/marks/github-mark';
import { ICON_SIZE } from '@/shared/ui/tokens/icon-size';

import { REPO_FACTS } from '../model/repo-facts.generated';
import { SectionIntro } from './SectionIntro';

const REPOSITORY = GITHUB_REPO_URL.slice('https://github.com/'.length);

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

const POINTS = ['free', 'local', 'files', 'together'] as const;

const LABEL =
  'font-mono text-caption uppercase leading-caption tracking-[var(--tracking-caps-14)] text-[color:var(--color-text-tertiary)]';
const EXTERNAL = controlClass({ shape: 'link', tone: 'secondary', hoverInk: 'strong' });

/**
 * What being open source gives the person installing, beside the repository itself. The star and
 * fork counts come from a committed file with the day they were read; the page asks GitHub nothing.
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
        <SectionIntro eyebrow={t('eyebrow')} title={t('title')} sub={t('sub')} />

        <div className="mt-9 grid min-w-0 gap-x-12 gap-y-8 @min-[52rem]:grid-cols-[minmax(0,1fr)_minmax(0,min(34rem,55%))]">
          {/* Four equal rows, so the last one ends where the repository panel does. */}
          <dl data-testid="gateway-source-points" className="flex min-w-0 flex-col">
            {POINTS.map((point, index) => (
              <div
                key={point}
                className={cn(
                  'min-w-0 flex-1 py-5',
                  index === 0 ? 'pt-0' : 'border-t border-[color:var(--color-border-soft)]',
                  index === POINTS.length - 1 && 'pb-0',
                )}
              >
                <dt className="text-title font-[var(--font-weight-signature)] leading-title text-[color:var(--color-text-primary)]">
                  {t(`${point}.title`)}
                </dt>
                <dd className="mt-2 max-w-[40rem] text-body leading-body text-[color:var(--color-text-tertiary)]">
                  {t(`${point}.body`)}
                  {point === 'together' ? (
                    <span
                      data-testid="gateway-source-links"
                      className="mt-3 flex min-w-0 flex-wrap gap-x-5 gap-y-5"
                    >
                      {LINKS.map((link) => (
                        <a
                          key={link.key}
                          href={link.href}
                          target="_blank"
                          rel="noreferrer noopener"
                          className={cn(EXTERNAL, 'touch-hit-expand gap-1.5')}
                        >
                          <span aria-hidden data-external-link-marker>
                            ↗
                          </span>
                          {t(link.key)}
                        </a>
                      ))}
                    </span>
                  ) : null}
                </dd>
              </div>
            ))}
          </dl>

          <div
            data-testid="gateway-source-repository"
            className="flex min-w-0 flex-col overflow-hidden rounded-panel border border-[color:var(--color-border-soft)] bg-[color:var(--color-panel)]"
          >
            <div className="gateway-loop-drawing min-w-0 border-b border-[color:var(--color-border-soft)] px-6 py-5">
              <p className="flex min-w-0 items-center gap-2.5 font-mono text-body leading-body text-[color:var(--color-text-primary)]">
                <GithubMark size={ICON_SIZE.lg} className="shrink-0" />
                <span className="min-w-0 [overflow-wrap:anywhere]">{REPOSITORY}</span>
              </p>
              <dl className="mt-5 grid min-w-0 grid-cols-3 gap-x-4">
                {stats.map((stat) => (
                  <div key={stat.key} className="min-w-0">
                    <dt className={LABEL}>{stat.label}</dt>
                    <dd
                      data-testid={`gateway-source-${stat.key}`}
                      className="mt-1 text-display font-[var(--font-weight-signature)] tabular-nums tracking-[var(--tracking-display)] text-[color:var(--color-text-primary)]"
                    >
                      {stat.value}
                    </dd>
                  </div>
                ))}
              </dl>
              <p className="mt-3 text-label leading-label text-[color:var(--color-text-tertiary)]">
                {t('readOn', { date: readOn })}
              </p>
            </div>

            <div className="min-w-0 px-6 py-5">
              <p className={LABEL}>{t('contents')}</p>
              <ul className="mt-3 flex min-w-0 flex-col gap-2.5">
                {FOLDERS.map((folder) => (
                  <li
                    key={folder.key}
                    className="grid min-w-0 grid-cols-[8.5rem_minmax(0,1fr)] items-baseline gap-x-3 text-body leading-body"
                  >
                    <a
                      href={`${GITHUB_REPO_URL}/tree/main/${folder.path}`}
                      target="_blank"
                      rel="noreferrer noopener"
                      className={cn(EXTERNAL, 'touch-hit-expand min-w-0 gap-1.5 font-mono')}
                    >
                      <span aria-hidden data-external-link-marker>
                        ↗
                      </span>
                      {folder.path}
                    </a>
                    <span className="min-w-0 text-[color:var(--color-text-tertiary)]">{t(`dir.${folder.key}`)}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="mt-auto flex min-w-0 flex-wrap items-center gap-x-4 gap-y-3 border-t border-[color:var(--color-border-soft)] px-6 py-4">
              <a
                href={GITHUB_REPO_URL}
                target="_blank"
                rel="noreferrer noopener"
                data-testid="gateway-source-star"
                className={cn(buttonVariants({ variant: 'outline', size: 'md' }), 'shrink-0')}
              >
                <Star size={ICON_SIZE.md} aria-hidden />
                {t('star')}
              </a>
              <p className="min-w-0 flex-1 basis-48 text-label leading-label text-[color:var(--color-text-tertiary)]">
                {t('invite')}
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
