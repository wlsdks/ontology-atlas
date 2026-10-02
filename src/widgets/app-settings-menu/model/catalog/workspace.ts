import { DESTINATION_HREF, MCP_CONNECTORS_HREF } from '@/shared/config/destinations';
import type { SettingsCatalogEntry } from './types';

export const WORKSPACE_CATALOG: readonly SettingsCatalogEntry[] = [
  {
    id: 'folder',
    section: 'workspace',
    labelKey: 'settingsFolder.folderLabel',
    keywordsKey: 'settingsFolder.keywords.folder',
    surface: 'both',
  },
  {
    id: 'folder-path',
    section: 'workspace',
    labelKey: 'settingsFolder.pathLabel',
    keywordsKey: 'settingsFolder.keywords.path',
    surface: 'desktop',
  },
  {
    id: 'folder-shape',
    section: 'workspace',
    labelKey: 'settings.workspaceShapeLabel',
    keywordsKey: 'settingsFolder.keywords.shape',
    surface: 'both',
  },
  {
    id: 'folder-documents',
    section: 'workspace',
    labelKey: 'settingsFolder.documentsTitle',
    keywordsKey: 'settingsFolder.keywords.documents',
    surface: 'both',
  },
  {
    id: 'folder-import',
    section: 'workspace',
    labelKey: 'ontologyBlocks.importAction',
    keywordsKey: 'settingsFolder.keywords.import',
    surface: 'both',
  },
  {
    id: 'folder-connectors',
    section: 'workspace',
    labelKey: 'settingsFolder.kept.connectors',
    keywordsKey: 'settingsFolder.keywords.connectors',
    surface: 'both',
    href: MCP_CONNECTORS_HREF,
  },
  {
    id: 'folder-schedules',
    section: 'workspace',
    labelKey: 'settingsFolder.kept.schedules',
    keywordsKey: 'settingsFolder.keywords.schedules',
    surface: 'desktop',
    href: DESTINATION_HREF.automations,
  },
  {
    id: 'folder-git',
    section: 'workspace',
    labelKey: 'settingsFolder.kept.git',
    keywordsKey: 'settingsFolder.keywords.git',
    surface: 'desktop',
    href: DESTINATION_HREF.git,
  },
  {
    id: 'folder-project-sources',
    section: 'workspace',
    labelKey: 'settingsFolder.kept.projectSources',
    keywordsKey: 'settingsFolder.keywords.projectSources',
    surface: 'both',
    href: DESTINATION_HREF.projects,
  },
];
