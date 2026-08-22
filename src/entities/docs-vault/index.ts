export type {
  VaultBacklinkEntry,
  VaultDoc,
  VaultHeading,
  VaultManifest,
  VaultTreeNode,
} from './model/types';
export { default as vaultManifest } from './data/manifest.json';
export { default as vaultContent } from './data/content.json';
// The empathetic sample vault: an example business a non-developer recognizes
// immediately (an online storefront). A separate source of truth from the dogfood
// manifest — `scripts/build-docs-vault.mjs` builds it from `samples/storefront/`.
export { default as sampleStorefrontManifest } from './data/sample-storefront.manifest.json';
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
  type VaultScopeKey,
  type VaultIdentityScope,
} from './lib/vault-scope-key';
export {
  buildLocalManifest,
  buildLocalManifestWithEntries,
  rebuildLocalManifestIncremental,
  computeLocalVaultFingerprint,
  computeLocalVaultFingerprintWithStamps,
} from './lib/build-local-manifest';
export type {
  LocalVaultBuild,
  BuiltVaultEntry,
} from './lib/build-local-manifest';
export {
  buildProjectMarkdown,
  projectToFrontmatter,
  buildStarterDisplaySync,
  isStarterProjectDescription,
  STARTER_PROJECT_DESCRIPTION_MARKERS,
  STARTER_PROJECT_DISPLAY_VALUES,
} from './lib/project-frontmatter';
export {
  buildVaultMarkdown,
  buildNewNodeDoc,
  generateNodeUid,
  vaultFolderForKind,
  VAULT_CREATED_BY_KEY,
  VAULT_CREATED_BY_HUMAN,
  VAULT_CREATED_BY_AGENT_UNKNOWN,
  vaultAgentCreatedBy,
} from './lib/build-vault-markdown';
export { deriveOntologyFromVault, slugifyName } from './lib/derive-ontology-from-vault';
export { deriveProjectsFromVault } from './lib/derive-projects-from-vault';
export { deriveBundledProjects, bundledProjectSlugs } from './lib/bundled-projects';
export {
  computeProjectSlug,
  isProjectVaultDoc,
  findProjectVaultDoc,
  findProjectDocInList,
} from './lib/project-slug';
export { extractProjectBody } from './lib/resolve-project-body';
export type {
  OntologyStubEdge,
  OntologyStubNode,
  VaultOntologyDerivation,
} from './lib/derive-ontology-from-vault';
export { findRelatedDocs } from './lib/related-docs';
export type { RelatedDocMatch } from './lib/related-docs';
export { buildDocsVaultHref } from './lib/href';
export { buildOntologyDeeplinkForDoc } from './lib/ontology-deeplink';
export { buildTopologyDeeplinkForDoc } from './lib/topology-deeplink';
