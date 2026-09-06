export type {
  VaultBacklinkEntry,
  VaultDoc,
  VaultManifest,
  VaultSourceFile,
  VaultTreeNode,
} from './model/types';
export { default as vaultManifest } from './data/manifest.json';
// The empathetic sample vault: an example business a non-developer recognizes
// immediately (an online storefront). A separate source of truth from the dogfood
// manifest — `scripts/build-docs-vault.mjs` builds it from `samples/storefront/`.
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
  computeLocalVaultFingerprint,
  computeLocalVaultFingerprintWithStamps,
} from './lib/build-local-manifest';
export type {
  LocalVaultBuild,
  BuiltVaultEntry,
  VaultStampIndex,
} from './lib/build-local-manifest';
export { VAULT_SOURCES_DIR } from './lib/build-local-manifest';
export {
  buildLibraryModel,
  countSourceFormats,
  formatSourceBytes,
  isWikiPage,
  newestWikiPage,
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
export { deriveOntologyFromVault, slugifyName } from './lib/derive-ontology-from-vault';
export { daysBehind, SUMMARY_KINDS, summaryStalenessBySlug } from './lib/summary-freshness';
export type { NodeRevision, SummaryStaleness } from './lib/summary-freshness';
export { deriveProjectsFromVault } from './lib/derive-projects-from-vault';
export { deriveBundledProjects, bundledProjectSlugs } from './lib/bundled-projects';
export {
  findProjectVaultDoc,
  findProjectDocInList,
} from './lib/project-slug';
export { extractProjectBody } from './lib/resolve-project-body';
export type {
  VaultOntologyDerivation,
} from './lib/derive-ontology-from-vault';
export { findRelatedDocs } from './lib/related-docs';
export { buildDocsVaultHref } from './lib/href';
export { buildOntologyDeeplinkForDoc } from './lib/ontology-deeplink';
export { buildTopologyDeeplinkForDoc } from './lib/topology-deeplink';
export { applyFrontmatterUpdates } from './lib/frontmatter-updates';
export type { FrontmatterUpdateValue } from './lib/frontmatter-updates';
export {
  computeRenameRefContext,
  rewriteRenamedDocRefs,
} from './lib/rename-ref-rewrites';
export { fetchServerDocContent, buildDocsVaultAssetCandidates } from './lib/server-doc-content';
export { buildReviewQueue, reviewDigest } from './lib/review';
export type { ReviewQueueRow } from './lib/review';
