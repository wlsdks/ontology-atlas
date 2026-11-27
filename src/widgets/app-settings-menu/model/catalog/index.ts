import { ABOUT_CATALOG } from './about';
import { AGENTS_CATALOG } from './agents';
import { EXPAND_CATALOG } from './expand';
import { FOOTPRINT_CATALOG } from './footprint';
import { MAP_CATALOG } from './map';
import { NOTIFY_CATALOG } from './notify';
import { PRIVACY_CATALOG } from './privacy';
import { SCREEN_CATALOG } from './screen';
import type { SettingsCatalogEntry } from './settings-catalog-entry';
import { WORKSPACE_CATALOG } from './workspace';

export const SETTINGS_CATALOG: readonly SettingsCatalogEntry[] = [
  ...SCREEN_CATALOG,
  ...MAP_CATALOG,
  ...EXPAND_CATALOG,
  ...FOOTPRINT_CATALOG,
  ...NOTIFY_CATALOG,
  ...AGENTS_CATALOG,
  ...PRIVACY_CATALOG,
  ...WORKSPACE_CATALOG,
  ...ABOUT_CATALOG,
];

/**
 * Every message the settings search index reads. The rail builds that index while it is hidden on
 * the gateway, so `/` carries these before the rest of the catalog arrives.
 */
export const SETTINGS_SEARCH_MESSAGE_PATHS: readonly string[] = SETTINGS_CATALOG.flatMap((entry) =>
  entry.keywordsKey ? [entry.labelKey, entry.keywordsKey] : [entry.labelKey],
);
