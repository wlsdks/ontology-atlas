export type {
  VaultBacklinkEntry,
  VaultDoc,
  VaultHeading,
  VaultManifest,
  VaultTreeNode,
} from './model/types';
export { default as vaultManifest } from './data/manifest.json';
export { default as vaultContent } from './data/content.json';
// P0 공감형 샘플 vault (2026-07) — 비개발자가 즉시 알아볼 수 있는 예시
// 비즈니스("온라인 쇼핑몰"). dogfood(vaultManifest/vaultContent)와 별도
// 진실원 — `scripts/build-docs-vault.mjs` 가 `samples/storefront/` 에서
// 빌드한다.
export { default as sampleStorefrontManifest } from './data/sample-storefront.manifest.json';
export {
  resolveStaticVaultSource,
  type StaticVaultSource,
} from './lib/static-vault-source';
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
