export type {
  VaultBacklinkEntry,
  VaultDoc,
  VaultManifest,
  VaultSourceFile,
  VaultTreeNode,
} from './model/types';
export { default as vaultManifest } from './data/manifest.json';
// The storefront sample, built by `scripts/build-docs-vault.mjs` from `samples/storefront/`.
export {
  resolveStaticVaultSource,
  type StaticVaultSource,
} from './lib/static-vault-source';
export {
  loadStaticVaultHeadings,
  type StaticVaultHeadings,
} from './lib/static-headings';
export {
  pinnedDocsStorageKey,
  recentDocsStorageKey,
  vaultScopeKey,
  vaultIdentityScope,
  type VaultIdentityScope,
} from './lib/vault-scope-key';
export {
  buildLocalManifestWithEntries,
  rebuildLocalManifestIncremental,
  computeLocalVaultFingerprintWithStamps,
} from './lib/build-local-manifest';
export type {
  LocalVaultBuild,
  BuiltVaultEntry,
  VaultBuildObserver,
  VaultStampIndex,
} from './lib/build-local-manifest';
export { VAULT_SOURCES_DIR } from './lib/walk-vault';
export {
  buildLibraryModel,
  selectWikiPages,
  countWikiPages,
  countSourceFormats,
  formatSourceBytes,
  isWikiPage,
  newestWikiPage,
  sourceNeedsCompile,
} from './lib/vault-library';
export type {
  LibraryModel,
  LibraryOriginalLink,
  LibrarySourceRow,
  LibraryWikiPage,
  LibraryWriteUpLink,
} from './lib/vault-library';
export { candidateKey, discoverCandidatesInHandle } from './lib/source-discovery';
export type { SourceCandidate, SourceDiscoveryReport } from './lib/source-discovery';
export {
  buildProjectMarkdown,
  projectToFrontmatter,
  buildStarterDisplaySync,
  isStarterProjectDescription,
} from './lib/project-frontmatter';
export {
  buildVaultMarkdown,
  buildNewNodeDoc,
  generateNodeUid,
  vaultFolderForKind,
  VAULT_CREATED_BY_HUMAN,
  vaultAgentCreatedBy,
} from './lib/build-vault-markdown';
export {
  deriveArrivedOntology,
  deriveOntologyFromVault,
  slugifyName,
} from './lib/derive-ontology-from-vault';
export { createSummaryStalenessScan, daysBehind, SUMMARY_KINDS } from './lib/summary-freshness';
export type { SummaryStaleness } from './lib/summary-freshness';
export { deriveProjectsFromVault } from './lib/derive-projects-from-vault';
export { deriveBundledProjects, bundledProjectSlugs } from './lib/bundled-projects';
export {
  findProjectVaultDoc,
  findProjectDocInList,
  resolveSoleProjectSlug,
  hasSeveralProjectDocs,
} from './lib/project-slug';
export { extractProjectBody } from './lib/resolve-project-body';
export type {
  VaultOntologyDerivation,
} from './lib/derive-ontology-from-vault';
export { findRelatedDocs } from './lib/related-docs';
export { buildWikiRetrievalIndex, type WikiRetrievalResult } from './lib/wiki-retrieval';
export { buildDocsVaultHref } from './lib/href';
export { buildOntologyDeeplinkForDoc } from './lib/ontology-deeplink';
export { buildTopologyDeeplinkForDoc } from './lib/topology-deeplink';
export { applyFrontmatterUpdates } from './lib/frontmatter-updates';
export type { FrontmatterUpdateValue } from './lib/frontmatter-updates';
export {
  computeRenameRefContext,
  planKindChangeReferrers,
  planReferrerRewrite,
  rewriteMovedDocSelf,
} from './lib/rename-ref-rewrites';
export type {
  KindChangeReferrer,
  ReferrerListKept,
  ReferrerListMove,
} from './lib/rename-ref-rewrites';
export { fetchServerDocContent, buildDocsVaultAssetCandidates } from './lib/server-doc-content';
export { buildReviewQueue, reviewDigest } from './lib/review';
export type { ReviewQueueRow } from './lib/review';
