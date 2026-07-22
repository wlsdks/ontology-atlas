export { DocsVaultTree } from './ui/DocsVaultTree';
export { DocsVaultViewer } from './ui/DocsVaultViewer';
export { DocsVaultEditor } from './ui/DocsVaultEditor';
export { DocsVaultUnifiedPalette } from './ui/DocsVaultUnifiedPalette';
export type { VaultCommand } from './model/command';
export { DocsVaultBacklinks } from './ui/DocsVaultBacklinks';
export { searchDocs } from './lib/search';
export type { DocsSearchMatch } from './lib/search';
export {
  resolveDocLink,
  githubBlobUrl,
  ONTOLOGY_ATLAS_REPO_BLOB_BASE,
  DOCS_VAULT_REPO_ROOT,
} from './lib/resolve-doc-link';
export type { ResolvedDocLink } from './lib/resolve-doc-link';
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
