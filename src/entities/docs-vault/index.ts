export type {
  VaultBacklinkEntry,
  VaultDoc,
  VaultHeading,
  VaultManifest,
  VaultTreeNode,
} from './model/types';
export { default as vaultManifest } from './data/manifest.json';
export { default as vaultContent } from './data/content.json';
export {
  buildLocalManifest,
  computeLocalVaultFingerprint,
} from './lib/build-local-manifest';
export type { LocalVaultBuild } from './lib/build-local-manifest';
export {
  buildProjectMarkdown,
  projectToFrontmatter,
} from './lib/project-frontmatter';
export { deriveOntologyFromVault } from './lib/derive-ontology-from-vault';
export { deriveProjectsFromVault } from './lib/derive-projects-from-vault';
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
export { buildTopologyFromVault } from './lib/build-topology-from-vault';
export type {
  FolderTopologyBuild,
  FolderTopologyCategory,
  FolderTopologyStatus,
} from './lib/build-topology-from-vault';
