import type { VaultDoc, VaultHeading, VaultManifest } from '../../model/types';

export interface BundledVaultDoc extends VaultDoc {
  headings?: VaultHeading[];
  excerpt: string;
  wordCount: number;
}

export interface BundledVaultManifest extends Omit<VaultManifest, 'docs'> {
  docs: BundledVaultDoc[];
}

/** What `scripts/docs-vault/build-docs-vault.mjs` writes: backlinks with their passages. */
interface BundledVaultManifestJson extends Omit<BundledVaultManifest, 'backlinkSources'> {
  backlinksDetail: Record<string, ReadonlyArray<{ fromSlug: string }>>;
}

/** A sample's JSON as a manifest: each target's referring slugs replace the passages, in their order. */
export function bundledVaultManifest(json: unknown): BundledVaultManifest {
  const { backlinksDetail, ...manifest } = json as BundledVaultManifestJson;
  const backlinkSources: Record<string, string[]> = {};
  for (const [target, entries] of Object.entries(backlinksDetail)) {
    backlinkSources[target] = entries.map((entry) => entry.fromSlug);
  }
  return { ...manifest, backlinkSources };
}
