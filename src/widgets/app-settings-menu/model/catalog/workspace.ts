import { DESTINATION_HREF, MCP_CONNECTORS_HREF } from '@/shared/config/destinations';
import type { SettingsCatalogEntry } from './settings-catalog-entry';

export const WORKSPACE_CATALOG: readonly SettingsCatalogEntry[] = [
  {
    id: 'folder',
    section: 'workspace',
    labelKey: 'settingsFolder.folderLabel',
    keywordsKey: 'settingsFolder.keywords.folder',
  },
  {
    id: 'folder-path',
    section: 'workspace',
    labelKey: 'settingsFolder.pathLabel',
    keywordsKey: 'settingsFolder.keywords.path',
  },
  {
    id: 'folder-shape',
    section: 'workspace',
    labelKey: 'settings.workspaceShapeLabel',
    keywordsKey: 'settingsFolder.keywords.shape',
  },
  {
    id: 'folder-reset',
    section: 'workspace',
    labelKey: 'settings.workspaceReset.label',
    keywordsKey: 'settingsFolder.keywords.reset',
  },
  {
    id: 'folder-documents',
    section: 'workspace',
    labelKey: 'settingsFolder.documentsTitle',
    keywordsKey: 'settingsFolder.keywords.documents',
  },
  {
    id: 'folder-import',
    section: 'workspace',
    labelKey: 'ontologyBlocks.importAction',
    keywordsKey: 'settingsFolder.keywords.import',
  },
  {
    id: 'folder-connectors',
    section: 'workspace',
    labelKey: 'settingsFolder.kept.connectors',
    keywordsKey: 'settingsFolder.keywords.connectors',
    href: MCP_CONNECTORS_HREF,
  },
  {
    id: 'folder-schedules',
    section: 'workspace',
    labelKey: 'settingsFolder.kept.schedules',
    keywordsKey: 'settingsFolder.keywords.schedules',
    href: DESTINATION_HREF.automations,
  },
  {
    id: 'folder-git',
    section: 'workspace',
    labelKey: 'settingsFolder.kept.git',
    keywordsKey: 'settingsFolder.keywords.git',
    href: DESTINATION_HREF.git,
  },
  {
    id: 'folder-project-sources',
    section: 'workspace',
    labelKey: 'settingsFolder.kept.projectSources',
    keywordsKey: 'settingsFolder.keywords.projectSources',
    href: DESTINATION_HREF.projects,
  },
];
