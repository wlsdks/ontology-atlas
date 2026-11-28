export type {
  VaultDoc,
  VaultManifest,
  VaultSourceFile,
  VaultTreeNode,
} from './model/vault-manifest';
// The bundled samples are built by `scripts/docs-vault/build-docs-vault.mjs` from `docs/ontology/`
// and `samples/storefront/`. `/sample` reads the store through the loader; only build-time callers
// and the public pages take the synchronous resolver, whose static JSON imports a screen must not reach.
export { resolveStaticVaultSource } from './lib/bundled-vault/static-vault-source';
export { dogfoodManifest } from './lib/bundled-vault/dogfood-manifest';
export { DOGFOOD_AGENT_SLUG_PREFIX } from './lib/bundled-vault/dogfood-slug-prefix';
export { bundledSamples } from './lib/bundled-vault/load-static-vault-source';
export { loadGatewayChangelog } from './lib/bundled-vault/load-gateway-changelog';
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
export { buildLibraryModel, createLibraryModelBuilder, sourceNeedsCompile } from './lib/library/vault-library';
export type { LibraryModel, LibraryOriginalLink, LibrarySourceRow, LibraryWriteUpLink } from './lib/library/vault-library';
export { countWikiPages, isWikiPage, newestWikiPage, selectWikiPages } from './lib/library/wiki-page-facts';
export type { LibraryWikiPage } from './lib/library/wiki-page-facts';
export { countSourceFormats, formatSourceBytes } from './lib/library/source-list-summary';
export { deriveSourceProgress } from './lib/library/source-progress';
export type { SourceProgress, SourceProgressPoint } from './lib/library/source-progress';
export {
  candidateKey,
  withoutVaultOwnedMarkdown,
} from './lib/library/source-candidate';
export { sourceFolderOf } from './lib/library/source-folder';
export type {
  DiscoverySkipReason,
  SourceCandidate,
  SourceDiscoveryReport,
} from './lib/library/source-candidate';
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
export { buildReviewQueue, reviewCurrentness, reviewDigest } from './lib/review';
export type { ReviewQueueRow } from './lib/review';
