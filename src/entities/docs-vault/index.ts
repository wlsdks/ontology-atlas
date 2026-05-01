export type {
  VaultBacklinkEntry,
  VaultDoc,
  VaultHeading,
  VaultManifest,
  VaultMode,
  VaultTreeNode,
} from './model/types';
export type { RelationshipRadarSuggestion } from './model/relationship-radar';
export { findRelationshipRadarSuggestions } from './model/relationship-radar';
export { default as vaultManifest } from './data/manifest.json';
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
export { buildTopologyFromVault } from './lib/build-topology-from-vault';
export type {
  FolderTopologyBuild,
  FolderTopologyCategory,
  FolderTopologyStatus,
} from './lib/build-topology-from-vault';
