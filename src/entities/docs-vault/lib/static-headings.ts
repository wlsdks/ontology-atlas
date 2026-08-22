import type { SampleSource } from '@/shared/lib/sample-source';
import type { VaultHeading } from '../model/types';

/**
 * Loads the bundled vault's slug → headings map **on demand**.
 *
 * Measured 2026-08-19: headings are used only by `/docs` (the outline rail and TOC
 * insertion), but being inline in the bundled manifest put 263 KB (dogfood) into the
 * shared chunk of **every route** — one of the reasons the desktop performance budget
 * (1.5 MiB max chunk) was exceeded. So `scripts/build-docs-vault.mjs` empties
 * `headings: []` in the bundled manifest and emits the map as separate JSON, and the
 * dynamic import here makes that JSON a `/docs`-only async chunk.
 *
 * **Pairing rule**: the headings must come from the **same vault** as the chosen
 * manifest (the same rule as the 2026-07-26 "two vaults on one screen" defect), so
 * this loader branches on `SampleSource` and the caller passes
 * `StaticVaultSource.source` through.
 *
 * Local mode does not need this: a user vault's manifest is built from disk
 * (`build-local-manifest`) with headings inline.
 */
export type StaticVaultHeadings = Record<string, VaultHeading[]>;

export async function loadStaticVaultHeadings(
  source: SampleSource,
): Promise<StaticVaultHeadings> {
  const mod =
    source === 'storefront'
      ? await import('../data/sample-storefront.headings.json')
      : await import('../data/manifest.headings.json');
  return mod.default as StaticVaultHeadings;
}
