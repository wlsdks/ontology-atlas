export type {
  DeveloperActivityEvent,
  DeveloperActivityInput,
  DeveloperActivityKind,
  DeveloperActivitySource,
} from './model/activity';
export {
  getDeveloperActivityTargetSlugs,
  normalizeDeveloperActivityEvent,
} from './model/activity';
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
export { findRelatedDocs } from './lib/related-docs';
export type { RelatedDocMatch } from './lib/related-docs';
export { buildDocsVaultHref } from './lib/href';
export { buildTopologyFromVault } from './lib/build-topology-from-vault';
export type {
  FolderTopologyBuild,
  FolderTopologyCategory,
  FolderTopologyStatus,
} from './lib/build-topology-from-vault';
