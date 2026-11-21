export type {
  VaultDoc,
  VaultManifest,
  VaultSourceFile,
  VaultTreeNode,
} from './model/types';
// The bundled samples are built by `scripts/docs-vault/build-docs-vault.mjs` from `docs/ontology/`
// and `samples/storefront/`. The browser reads them through the loader; only build-time callers
// and `/download` take the synchronous resolver, whose static JSON imports a screen must not reach.
export {
  resolveStaticVaultSource,
  type StaticVaultSource,
} from './lib/bundled-vault/static-vault-source';
export { dogfoodManifest } from './lib/bundled-vault/dogfood-manifest';
export { DOGFOOD_AGENT_SLUG_PREFIX } from './lib/bundled-vault/dogfood-slug-prefix';
export { bundledSamples } from './lib/bundled-vault/load-static-vault-source';
export {
  loadStaticVaultHeadings,
  type StaticVaultHeadings,
} from './lib/bundled-vault/static-headings';
export { deriveDocumentDetail, type DocumentRef, type VaultDocDetail } from './store/document-detail';
export { createDocumentStore, type DocumentStore } from './store/document-store';
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
} from './lib/local-manifest/build-local-manifest';
export { applyVaultChanges } from './lib/local-manifest/apply-vault-changes';
export type { LocalVaultSnapshot } from './lib/local-manifest/apply-vault-changes';
export type {
  LocalVaultBuild,
  VaultBuildObserver,
  VaultStampIndex,
} from './lib/local-manifest/build-local-manifest';
export type { BuiltVaultEntry } from './lib/local-manifest/md-entry';
export { VAULT_SOURCES_DIR } from './lib/local-manifest/walk-vault';
export { createSourceCopyBatch } from './lib/library/source-copy-publication';
export {
  buildLibraryModel,
  createLibraryModelBuilder,
  selectWikiPages,
  countWikiPages,
  countSourceFormats,
  formatSourceBytes,
  isWikiPage,
  newestWikiPage,
  sourceNeedsCompile,
} from './lib/library/vault-library';
export type {
  LibraryModel,
  LibraryOriginalLink,
  LibrarySourceRow,
  LibraryWikiPage,
  LibraryWriteUpLink,
} from './lib/library/vault-library';
export { deriveSourceProgress, recordedLocalDay } from './lib/library/source-progress';
export type { SourceProgress, SourceProgressPoint } from './lib/library/source-progress';
export { candidateKey, discoverCandidatesInHandle } from './lib/library/source-discovery';
export type { SourceCandidate, SourceDiscoveryReport } from './lib/library/source-discovery';
export {
  buildProjectMarkdown,
  projectToFrontmatter,
  buildStarterDisplaySync,
  isStarterProjectDescription,
} from './lib/projects/project-frontmatter';
export {
  buildVaultMarkdown,
  buildNewNodeDoc,
  generateNodeUid,
  vaultFolderForKind,
  VAULT_CREATED_BY_HUMAN,
  vaultAgentCreatedBy,
} from './lib/authoring/build-vault-markdown';
export {
  deriveArrivedOntology,
  deriveOntologyFromVault,
  slugifyName,
} from './lib/derive-ontology-from-vault';
export { createSummaryStalenessScan, daysBehind, SUMMARY_KINDS } from './lib/summary-freshness';
export type { SummaryStaleness } from './lib/summary-freshness';
export { deriveProjectsFromVault } from './lib/projects/derive-projects-from-vault';
export { deriveBundledProjects, deriveIndexedProjects, bundledProjectSlugs } from './lib/bundled-vault/bundled-projects';
export {
  findProjectVaultDoc,
  findProjectDocInList,
  resolveSoleProjectSlug,
} from './lib/projects/project-slug';
export { extractProjectBody } from './lib/projects/resolve-project-body';
export type {
  VaultOntologyDerivation,
} from './lib/derive-ontology-from-vault';
export { findRelatedDocs } from './lib/doc-navigation/related-docs';
export { buildWikiRetrievalIndex, createWikiTermIntern, wikiRetrievalPage, type WikiRetrievalPage, type WikiRetrievalResult, type WikiTermIntern } from './lib/library/wiki-retrieval';
export { buildDocsVaultHref } from './lib/doc-navigation/href';
export { buildOntologyDeeplinkForDoc } from './lib/doc-navigation/ontology-deeplink';
export { buildTopologyDeeplinkForDoc } from './lib/doc-navigation/topology-deeplink';
export { applyFrontmatterUpdates } from './lib/authoring/frontmatter-updates';
export type { FrontmatterUpdateValue } from './lib/authoring/frontmatter-updates';
export {
  computeRenameRefContext,
  planKindChangeReferrers,
  planReferrerRewrite,
  rewriteMovedDocSelf,
} from './lib/authoring/rename-ref-rewrites';
export type {
  KindChangeReferrer,
  ReferrerListKept,
  ReferrerListMove,
} from './lib/authoring/rename-ref-rewrites';
export { fetchServerDocContent, buildDocsVaultAssetCandidates } from './lib/bundled-vault/server-doc-content';
export { buildReviewQueue, reviewCurrentness, reviewDigest } from './lib/review';
export type { ReviewQueueRow } from './lib/review';
