export { DocsVaultTree } from './ui/DocsVaultTree';
export { VaultToolsMenu } from './ui/VaultToolsMenu';
export { DocsVaultViewer } from './ui/DocsVaultViewer';
export { DocsVaultEditor } from './ui/DocsVaultEditor';
export { DocsVaultUnifiedPalette } from './ui/DocsVaultUnifiedPalette';
export type { VaultCommand } from './model/command';
export { DocsVaultBacklinks } from './ui/DocsVaultBacklinks';
export { DocsVaultFolderTopology } from './ui/DocsVaultFolderTopology';
export { DocsVaultProjectDepsBar } from './ui/DocsVaultProjectDepsBar';
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
  PINNED_DOCS_STORAGE_PREFIX,
} from './lib/pinned-docs';
