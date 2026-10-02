'use client';

import { Fragment } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { cn } from '@/shared/lib/cn';
import { controlClass } from '@/shared/ui/control-class';
import { EVIDENCE_SPECIMEN } from '../model/evidence-specimen.generated';
import { CountUp } from './CountUp';

/**
 * One real vault file beside what an agent reads out of it: the frontmatter is the graph, and the
 * link lets anyone check. Every value is generated (`scripts/generate-evidence-specimen.mjs`),
 * since a hand-typed copy goes silently false when the file changes.
 */
/** `null` between demo runs. */
export type EvidenceDemoKey = 'title' | 'domain' | 'dependencies' | null;

/** `title` also lights the display-name lines. */
const DEMO_LINE_PREFIXES: Record<Exclude<EvidenceDemoKey, null>, readonly string[]> = {
  title: ['title:', 'display_'],
  domain: ['domain:'],
  dependencies: ['dependencies:'],
};

export function EvidenceSpecimen({ demoKey = null }: { demoKey?: EvidenceDemoKey } = {}) {
  const t = useTranslations('download');
  const tKind = useTranslations('kinds');
  const locale = useLocale();
  const spec = EVIDENCE_SPECIMEN;
  /* The other locale's display line is left out and counted (`tests/e2e/locale-purity.spec.ts`). */
  const frontmatter = spec.frontmatter[locale] ?? spec.frontmatter.en;
  const omitted = spec.omittedLines[locale] ?? spec.omittedLines.en;
  /* The vault's names, not the catalogue's: an untranslated node shows its English name, not a blank. */
  const name = (pair: { en: string; [locale: string]: string }) => pair[locale] ?? pair.en;

  const facts: { key: EvidenceDemoKey; label: string; value: string; mono?: boolean }[] = [
    { key: 'title', label: t('specimenFactName'), value: name(spec.facts.name) },
    { key: null, label: t('specimenFactKind'), value: tKind(spec.facts.kind) },
    { key: 'domain', label: t('specimenFactDomain'), value: name(spec.facts.domain) },
    { key: 'dependencies', label: t('specimenFactDependsOn'), value: name(spec.facts.dependency) },
    { key: null, label: t('specimenFactPath'), value: spec.facts.implPath, mono: true },
  ];
  const lineLit = (line: string): boolean =>
    demoKey !== null && DEMO_LINE_PREFIXES[demoKey].some((prefix) => line.startsWith(prefix));

  return (
    <div data-testid="evidence-specimen" className="flex min-w-0 flex-col gap-5">
      <div className="min-w-0">
        <h3 className="text-caption font-[var(--font-weight-emphasis)] leading-caption text-[color:var(--color-text-secondary)]">
          {t('specimenFileHeading')}
        </h3>
        <div className="mt-3 min-w-0 overflow-hidden rounded-panel border border-[color:var(--color-border-soft)] bg-[color:var(--color-panel)]">
          <p className="truncate border-b border-[color:var(--color-border-soft)] px-4 py-2.5 font-mono text-caption leading-caption text-[color:var(--color-text-tertiary)]">
            {spec.file}
          </p>
          {/* Scrolls inside its box so the page never scrolls sideways. */}
          <div className="min-w-0 overflow-x-auto px-4 py-3">
            {/* Line numbers stand outside each line's span, so a span's text is exactly the file line the demo lights. */}
            <pre className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 font-mono text-caption leading-body text-[color:var(--color-text-secondary)]">
              {frontmatter.map((line, i) => {
                const colon = line.indexOf(':');
                const key = colon > 0 ? line.slice(0, colon + 1) : '';
                const value = colon > 0 ? line.slice(colon + 1) : line;
                const lit = lineLit(line);
                return (
                  <Fragment key={line}>
                    <span aria-hidden className="select-none text-right text-[color:var(--color-text-quaternary)]">
                      {i + 1}
                    </span>
                    <span
                      className={cn(
                        '-mx-1.5 block px-1.5 transition-colors',
                        lit && 'bg-[color:var(--color-overlay-2)] text-[color:var(--color-text-primary)]',
                      )}
                    >
                      {key ? (
                        <span className={lit ? 'text-[color:var(--color-indigo-text-soft)]' : 'text-[color:var(--color-text-tertiary)]'}>
                          {key}
                        </span>
                      ) : null}
                      {value}
                    </span>
                  </Fragment>
                );
              })}
            </pre>
          </div>
        </div>
        {/* The omitted-line count is required: a subset must never pass as the whole file. */}
        <p className="mt-2 text-caption leading-caption text-[color:var(--color-text-tertiary)]">
          {omitted > 0
            ? t('specimenElided', { shown: frontmatter.length, count: omitted })
            : t('specimenComplete', { shown: frontmatter.length })}
        </p>
      </div>

      <div className="min-w-0 border-t border-[color:var(--color-border-soft)] pt-5">
        <h3 className="break-keep text-caption font-[var(--font-weight-emphasis)] leading-caption text-[color:var(--color-text-secondary)]">
          {t('specimenFactsHeading')}
        </h3>
        <dl className="mt-3 grid gap-2">
          {facts.map((fact) => (
            <div
              key={fact.label}
              className={cn(
                'flex min-w-0 items-baseline gap-4 transition-colors',
                demoKey !== null && fact.key === demoKey &&
                  '-mx-1.5 bg-[color:var(--color-overlay-2)] px-1.5',
              )}
            >
              <dt className="w-[6.5rem] shrink-0 break-keep text-body leading-body text-[color:var(--color-text-tertiary)]">
                {fact.label}
              </dt>
              <dd
                className={cn(
                  'min-w-0 break-keep text-body leading-body text-[color:var(--color-text-primary)]',
                  fact.mono && 'truncate font-mono text-caption leading-body text-[color:var(--color-text-secondary)]',
                )}
              >
                {fact.value}
              </dd>
            </div>
          ))}
        </dl>
      </div>

      <div className="min-w-0 border-t border-[color:var(--color-border-soft)] pt-5">
        <p className="min-w-0 break-keep text-body leading-body text-[color:var(--color-text-tertiary)]">
          {t.rich('specimenFooter', {
            count: spec.vaultNodeCount,
            n: () => <CountUp value={spec.vaultNodeCount} />,
          })}
        </p>
        {/* On its own line: inline it fails the coarse-pointer gate, and inline-flex stops wrapping at 320px. */}
        <a
          href={spec.url}
          target="_blank"
          rel="noreferrer"
          className={controlClass({
            shape: 'link',
            hoverInk: 'strong',
            className: 'touch-hit-expand mt-2 text-[color:var(--color-text-secondary)] underline underline-offset-2',
          })}
        >
          {/* The leading ↗ warns that the link leaves the app. */}
          <span aria-hidden data-external-link-marker>
            ↗
          </span>
          {t('specimenOpenFile')}
        </a>
      </div>
    </div>
  );
}
