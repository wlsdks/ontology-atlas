export { DocsVaultTree } from './ui/DocsVaultTree';
export { DocsVaultViewer } from './ui/DocsVaultViewer';
export { DocsVaultEditor } from './ui/DocsVaultEditor';
export { DocsVaultUnifiedPalette } from './ui/DocsVaultUnifiedPalette';
export type { VaultCommand } from './model/command';
export { DocsVaultBacklinks } from './ui/DocsVaultBacklinks';
export { DocsVaultActivityPanel } from './ui/DocsVaultActivityPanel';
export { DocsVaultAudienceMismatchNotice } from './ui/DocsVaultAudienceMismatchNotice';
export { DocsVaultGraph } from './ui/DocsVaultGraph';
export { DocsVaultFolderTopology } from './ui/DocsVaultFolderTopology';
export { DocsVaultProjectDepsBar } from './ui/DocsVaultProjectDepsBar';
export { DocsVaultRelationshipRadar } from './ui/DocsVaultRelationshipRadar';
export { DocsVaultStats } from './ui/DocsVaultStats';
export { DocsVaultTags } from './ui/DocsVaultTags';
export { searchDocs } from './lib/search';
export type { DocsSearchMatch } from './lib/search';
export {
  readRecentDocs,
  pushRecentDoc,
  migrateLegacyRecentDocs,
  RECENT_DOCS_STORAGE_PREFIX,
} from './lib/recent-docs';
export type { VaultRecentKey } from './lib/recent-docs';
export {
  readPinnedDocs,
  togglePinnedDoc,
  isPinned,
  PINNED_DOCS_STORAGE_PREFIX,
} from './lib/pinned-docs';
export {
  clearDismissedRadarReviewState,
  makeRadarReviewKey,
  readRadarReviewState,
  updateRadarReviewState,
  writeRadarReviewState,
  RADAR_REVIEW_STORAGE_PREFIX,
} from './lib/radar-review-state';
export type { RadarReviewState } from './lib/radar-review-state';
