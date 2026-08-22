import type { SampleSource } from '@/shared/lib/sample-source';
import sampleStorefrontContent from '../data/sample-storefront.content.json';
import sampleStorefrontManifest from '../data/sample-storefront.manifest.json';
import gatewayContent from '../data/gateway-content.json';
import gatewayChangelog from '../data/gateway-changelog.json';
import vaultManifest from '../data/manifest.json';
import type { VaultManifest } from '../model/types';

/**
 * The one bundled vault that is the source of truth in static mode (no vault
 * chosen).
 *
 * **Why a resolver exists.** Measured defect, 2026-07-26: with
 * `demo:sample-source:v1 = storefront`, opening a project detail mixed **two
 * vaults on one screen** — title and body from the dogfood vault's
 * `ontology-atlas`, graph from storefront (31 nodes). Every hero metric read 0,
 * the composition tab was empty, and the header announced "31 CONCEPTS · 61
 * RELATIONS". To a user that reads as broken.
 *
 * The cause was simple: only two consumers (`useOntologyInsight`,
 * `useVaultHealth`) respected the sample choice while nine others **imported the
 * dogfood manifest directly**. Two answers to "which vault is this?" eventually
 * diverge — the single-source rule exists for exactly this.
 *
 * So the manifest and the content come back **as a pair**, making it impossible at
 * the type level to change one without the other. The old defect was precisely
 * "manifest storefront, content dogfood".
 *
 * In local mode (the user's vault is loaded) none of this is consumed — the user's
 * disk always wins.
 */
export interface StaticVaultSource {
  source: SampleSource;
  manifest: VaultManifest;
  /**
   * slug → raw markdown fallback. Holds only the `guide/*` documents the gateway
   * needs synchronously before first paint; everything else is read asynchronously
   * from the `public/docs-vault/{slug}.md` asset. Always from the same vault as the
   * manifest.
   */
  content: Record<string, string>;
  /**
   * slug → **a truncated synchronous preview**. For documents too large to bundle
   * in full but needed synchronously at the gateway's first paint (today only
   * CHANGELOG — its 634 KB full text pushed every route's shared chunk past the
   * performance budget). `body` is the leading part of the original, cut on `## `
   * section boundaries, and `omittedSections` counts what that cut folded away —
   * the screen cuts once more against its own limit and adds the two numbers to
   * state the true total. The full text stays at `public/docs-vault/{slug}.md`.
   * Always from the same vault as the manifest, same pairing rule as `content`.
   */
  contentPreviews?: Record<string, { body: string; omittedSections: number }>;
  /**
   * The prefix on this manifest's document slugs that **does not exist relative to
   * the agent's vault root**.
   *
   * The dogfood manifest is built over the whole `/docs` tree, so ontology
   * documents start with `ontology/…`, while the vault root this repository hands
   * an agent is `docs/ontology`. Not subtracting that difference from the MCP call
   * the screen offers to copy makes it fail the moment it is pasted (measured
   * 2026-07-26). A user who opens their own folder has that folder as the vault
   * root, so there is nothing to subtract — hence no value in local mode.
   */
  agentSlugPrefix?: string;
}

// A JSON import infers union fields as `string`. The schema is fixed at build
// time, so this casts rather than validating at runtime — consolidating the cast
// every consumer used to repeat.
const DOGFOOD: StaticVaultSource = {
  source: 'dogfood',
  manifest: vaultManifest as VaultManifest,
  content: gatewayContent as Record<string, string>,
  contentPreviews: {
    CHANGELOG: gatewayChangelog as { body: string; omittedSections: number },
  },
  agentSlugPrefix: 'ontology/',
};

const STOREFRONT: StaticVaultSource = {
  source: 'storefront',
  manifest: sampleStorefrontManifest as VaultManifest,
  content: sampleStorefrontContent as Record<string, string>,
};

export function resolveStaticVaultSource(source: SampleSource): StaticVaultSource {
  return source === 'storefront' ? STOREFRONT : DOGFOOD;
}
