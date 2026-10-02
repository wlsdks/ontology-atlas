import { ABOUT_CATALOG } from './about';
import { AGENTS_CATALOG } from './agents';
import { EXPAND_CATALOG } from './expand';
import { FOOTPRINT_CATALOG } from './footprint';
import { MAP_CATALOG } from './map';
import { NOTIFY_CATALOG } from './notify';
import { PRIVACY_CATALOG } from './privacy';
import { SCREEN_CATALOG } from './screen';
import type { SettingsCatalogEntry } from './types';
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

export function settingsCatalogFor(desktop: boolean): readonly SettingsCatalogEntry[] {
  return desktop ? SETTINGS_CATALOG : SETTINGS_CATALOG.filter((entry) => entry.surface === 'both');
}
