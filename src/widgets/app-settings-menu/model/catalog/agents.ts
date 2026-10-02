import { AGENTS_MODELS_HREF, DESTINATION_HREF } from '@/shared/config/destinations';
import type { SettingsCatalogEntry } from './types';

export const AGENTS_CATALOG: readonly SettingsCatalogEntry[] = [
  {
    id: 'wiki-write-mode',
    section: 'agents',
    labelKey: 'settings.wikiWriteModeLabel',
    keywordsKey: 'settingsAgents.wikiWriteModeKeywords',
    surface: 'desktop',
  },
  {
    id: 'door-coding-tools',
    section: 'agents',
    labelKey: 'settingsAgents.codingToolsLabel',
    keywordsKey: 'settingsAgents.codingToolsKeywords',
    surface: 'both',
    href: DESTINATION_HREF.agents,
  },
  {
    id: 'door-models',
    section: 'agents',
    labelKey: 'settingsAgents.modelsLabel',
    keywordsKey: 'settingsAgents.modelsKeywords',
    surface: 'both',
    href: AGENTS_MODELS_HREF,
  },
  {
    id: 'door-mcp',
    section: 'agents',
    labelKey: 'settingsAgents.mcpLabel',
    keywordsKey: 'settingsAgents.mcpKeywords',
    surface: 'both',
    href: DESTINATION_HREF.mcp,
  },
];
