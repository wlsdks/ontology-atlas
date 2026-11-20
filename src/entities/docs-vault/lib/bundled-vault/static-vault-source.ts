import type { SampleSource } from '@/shared/lib/vault-folder/sample-source';
import sampleStorefrontContent from '../../data/sample-storefront.content.json';
import sampleStorefrontManifest from '../../data/sample-storefront.manifest.json';
import gatewayContent from '../../data/gateway-content.json';
import gatewayChangelog from '../../data/gateway-changelog.json';
import vaultManifest from '../../data/manifest.json';
import { bundledVaultManifest, type BundledVaultManifest } from './bundled-manifest';
import { DOGFOOD_AGENT_SLUG_PREFIX } from './dogfood-slug-prefix';

/** The bundled vault in static mode; manifest and content travel as one pair so they can never mix vaults. */
export interface StaticVaultSource {
  source: SampleSource;
  manifest: BundledVaultManifest;
  /** slug → markdown for the `guide/*` documents needed before first paint; the rest load from `public/docs-vault/`. */
  content: Record<string, string>;
  /**
   * Truncated synchronous previews for documents too large to bundle, cut on `## ` boundaries;
   * `omittedSections` counts the cut.
   */
  contentPreviews?: Record<string, { body: string; omittedSections: number }>;
  /** Manifest slug prefix absent from the agent's vault root (`ontology/` in the dogfood bundle); none locally. */
  agentSlugPrefix?: string;
}

// The build fixes the JSON's schema, so the adapter casts it once.
const DOGFOOD: StaticVaultSource = {
  source: 'dogfood',
  manifest: bundledVaultManifest(vaultManifest),
  content: gatewayContent as Record<string, string>,
  contentPreviews: {
    CHANGELOG: gatewayChangelog as { body: string; omittedSections: number },
  },
  agentSlugPrefix: DOGFOOD_AGENT_SLUG_PREFIX,
};

const STOREFRONT: StaticVaultSource = {
  source: 'storefront',
  manifest: bundledVaultManifest(sampleStorefrontManifest),
  content: sampleStorefrontContent as Record<string, string>,
};

export function resolveStaticVaultSource(source: SampleSource): StaticVaultSource {
  return source === 'storefront' ? STOREFRONT : DOGFOOD;
}
