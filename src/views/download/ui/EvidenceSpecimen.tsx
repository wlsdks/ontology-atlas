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
  const tag: 'ko' | 'en' = locale === 'ko' ? 'ko' : 'en';
  /*
   * The panel shows the file as it pertains to its reader: the other locale's `display_*` line is
   * left out and counted. `/en/download/` is locked by `tests/e2e/locale-purity.spec.ts` as a route
   * that draws no vault text, and a `display_ko:` line rendered there is Korean on an English
   * screen — CI caught exactly that (2026-08-23).
   */
  const frontmatter = spec.frontmatter[tag];
  const omitted = spec.omittedLines[tag];
  /* Node names are the vault's, not the message catalogue's — a node named only in English shows
     its English name rather than a blank, which is the honest state for a vault that has not been
     given a Korean name for it yet. */
  const name = (pair: { ko: string; en: string }) => pair[tag];

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
              {frontmatter.join('\n')}
            </pre>
          </div>
        </div>
        {/*
         * One line doing two jobs: it names the payoff (these lines *are* a node and an edge) and
         * it states how many were left out. The second half is not optional — showing a subset as
         * if it were the whole file is the same untruth this section exists to disprove.
         */}
        <p className="mt-2 break-keep text-caption leading-caption text-[color:var(--color-text-quaternary)]">
          {omitted > 0
            ? t('specimenElided', { shown: frontmatter.length, count: omitted })
            : t('specimenComplete', { shown: frontmatter.length })}
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
      <div className="min-w-0 border-t border-[color:var(--color-border-soft)] pt-6">
        <p className="min-w-0 break-keep text-body leading-body text-[color:var(--color-text-tertiary)]">
          {t('specimenFooter', { count: spec.vaultNodeCount })}
        </p>
        {/*
         * The link stands on its own line rather than trailing the sentence.
         *
         * Both alternatives were measured and rejected. Inside the sentence it has to be
         * `display: inline` (`.prose-link`), and `/download`'s coarse-pointer gate has no
         * in-sentence exemption — it came back 338x35 and red. Making it a value-layer control
         * *inside* the sentence gives `inline-flex`, which the value layer's own notes record as
         * killing wrapping at 320px. Out of the sentence both problems disappear: the shape is
         * correct, and `touch-hit-expand` gives the 44px finger target without moving a pixel of
         * layout (`app/globals.css`, coarse-pointer block).
         */}
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
          {/* `↗` leads the label and is declared — it warns that the link leaves the app. */}
          <span aria-hidden data-external-link-marker>
            ↗
          </span>
          {t('specimenOpenFile')}
        </a>
      </div>
    </div>
  );
}
