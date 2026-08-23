'use client';

import { useLocale, useTranslations } from 'next-intl';
import { cn } from '@/shared/lib/cn';
import { controlClass } from '@/shared/ui/control-class';
import { EVIDENCE_SPECIMEN } from '../model/evidence-specimen.generated';

/**
 * The evidence section's right half — **one real file, and what an agent reads out of it.**
 *
 * ## What this replaced, and why
 *
 * The previous version was an *inventory*: four kind counts, three sample relations, and one
 * impact number. The owner rejected it (2026-08-23) — *"오픈소스 설명에 넣기엔 좀 별로"*. Looking
 * at what it actually rendered, they were right, and the cause was the selection rule rather than
 * the styling. It picked "the three most common relation types, and from each the alphabetically
 * first edge by slug", which optimises for *representing the vault* and not at all for *being
 * legible to a stranger*. What reached the screen was this repository's own internals, in two
 * languages at once, joined by raw `--contains-->` syntax.
 *
 * A survey of how other products carry the same burden (2026-08-23: Biome, Linear, Raycast,
 * Cursor, Logseq, Ghostty, Tauri, Cap, AppFlowy) found one thing in common among the ones that
 * work: **they show a single concrete moment, never an inventory.** Biome puts messy code beside
 * the formatted result with one measured number and the conditions it was measured under. Raycast
 * gives four short claims with at most one number each. Logseq — famous for its graph — leads with
 * the notes you actually write, not the graph. Cursor gives one idea per block.
 *
 * So this section stopped counting and started showing a transformation, which is the product's
 * actual claim: **the frontmatter is the graph.** The left panel is a file that exists in this
 * repository; the right is the same file as the agent reads it; the caption links to the file so
 * the claim can be checked in one click.
 *
 * ## Nothing here is hand-typed
 *
 * Every value comes from `evidence-specimen.generated.ts`, produced by
 * `scripts/generate-evidence-specimen.mjs` from the vault itself and diffed in CI. A hand-written
 * copy of a file's contents stops being true the moment the file changes and says nothing when it
 * does — which is precisely the failure this page hit twice in two days with the demo section's
 * prose. The generator's doc block carries the rest.
 */
export function EvidenceSpecimen() {
  const t = useTranslations('download');
  const tKind = useTranslations('kinds');
  const locale = useLocale();
  const spec = EVIDENCE_SPECIMEN;
  /* Node names are the vault's, not the message catalogue's — a node named only in English shows
     its English name rather than a blank, which is the honest state for a vault that has not been
     given a Korean name for it yet. */
  const name = (pair: { ko: string; en: string }) => (locale === 'ko' ? pair.ko : pair.en);

  const facts: { label: string; value: string; mono?: boolean }[] = [
    { label: t('specimenFactName'), value: name(spec.facts.name) },
    { label: t('specimenFactKind'), value: tKind(spec.facts.kind) },
    { label: t('specimenFactDomain'), value: name(spec.facts.domain) },
    { label: t('specimenFactDependsOn'), value: name(spec.facts.dependency) },
    { label: t('specimenFactPath'), value: spec.facts.implPath, mono: true },
  ];

  return (
    <div data-testid="evidence-specimen" className="flex min-w-0 flex-col gap-6">
      {/* ── The file, verbatim ─────────────────────────────────────────────── */}
      <div className="min-w-0">
        <h3 className="font-mono text-label uppercase leading-label tracking-[var(--tracking-caps-14)] text-[color:var(--color-text-quaternary)]">
          {t('specimenFileHeading')}
        </h3>
        <div className="mt-3 min-w-0 overflow-hidden rounded-panel border border-[color:var(--color-border-soft)] bg-[color:var(--color-panel)]">
          <p className="truncate border-b border-[color:var(--color-border-soft)] px-4 py-2.5 font-mono text-caption leading-caption text-[color:var(--color-text-tertiary)]">
            {spec.file}
          </p>
          {/* Wide content scrolls inside its own box — the page body must never scroll sideways. */}
          <div className="min-w-0 overflow-x-auto px-4 py-3">
            <pre className="font-mono text-caption leading-body text-[color:var(--color-text-secondary)]">
              {spec.frontmatter.join('\n')}
            </pre>
          </div>
        </div>
        {/* The elided lines are stated rather than hidden — showing a subset as if it were the
            whole file is the same kind of untruth this section exists to disprove. */}
        <p className="mt-2 break-keep text-caption leading-caption text-[color:var(--color-text-quaternary)]">
          {spec.omittedLines > 0
            ? t('specimenElided', { count: spec.omittedLines })
            : t('specimenComplete')}
        </p>
      </div>

      {/* ── The same file, as the agent reads it ───────────────────────────── */}
      <div className="min-w-0 border-t border-[color:var(--color-border-soft)] pt-6">
        <h3 className="font-mono text-label uppercase leading-label tracking-[var(--tracking-caps-14)] text-[color:var(--color-text-quaternary)]">
          {t('specimenFactsHeading')}
        </h3>
        <dl className="mt-4 grid gap-2.5">
          {facts.map((fact) => (
            <div key={fact.label} className="flex min-w-0 items-baseline gap-4">
              <dt className="w-[6.5rem] shrink-0 break-keep text-body leading-body text-[color:var(--color-text-quaternary)]">
                {fact.label}
              </dt>
              <dd
                className={cn(
                  'min-w-0 break-keep text-body-lg leading-body-lg text-[color:var(--color-text-secondary)]',
                  fact.mono && 'truncate font-mono text-body leading-body',
                )}
              >
                {fact.value}
              </dd>
            </div>
          ))}
        </dl>
      </div>

      {/* ── Go and check ───────────────────────────────────────────────────── */}
      <p className="min-w-0 break-keep border-t border-[color:var(--color-border-soft)] pt-6 text-body leading-body text-[color:var(--color-text-tertiary)]">
        {t('specimenFooter', { count: spec.vaultNodeCount })}{' '}
        <a
          href={spec.url}
          target="_blank"
          rel="noreferrer"
          // The value layer owns pressable geometry — a hand-written anchor here is debt the
          // adoption ratchet counts, and it was right to: the base's transparent border wins by
          // source order on a raw variant.
          className={controlClass({
            shape: 'link',
            hoverInk: 'strong',
            className: 'text-[color:var(--color-text-secondary)] underline underline-offset-2',
          })}
        >
          {/* `↗` leads the label and is declared — it warns that the link leaves the app before
              it is pressed, which is the one use this repository allows for it. */}
          <span aria-hidden data-external-link-marker>
            ↗{' '}
          </span>
          {t('specimenOpenFile')}
        </a>
      </p>
    </div>
  );
}
