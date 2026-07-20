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
} from './lib/project-frontmatter';
export {
  buildVaultMarkdown,
  buildNewNodeDoc,
  vaultFolderForKind,
} from './lib/build-vault-markdown';
export { deriveOntologyFromVault, slugifyName } from './lib/derive-ontology-from-vault';
export { deriveProjectsFromVault } from './lib/derive-projects-from-vault';
export {
  computeProjectSlug,
  isProjectVaultDoc,
  findProjectVaultDoc,
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
