import type { SampleSource } from '@/shared/lib/sample-source';
import type { VaultHeading } from '../model/types';

/**
 * Lazily loads the bundled vault's headings, a `/docs`-only chunk kept out of every route's shared
 * bundle. Must come from the same sample as the manifest; local manifests carry headings inline.
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
