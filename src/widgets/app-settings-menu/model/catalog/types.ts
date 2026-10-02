export type SettingsScope = 'computer' | 'folder' | 'app';

export type SettingsSectionId =
  | 'screen'
  | 'map'
  | 'expand'
  | 'footprint'
  | 'notify'
  | 'agents'
  | 'privacy'
  | 'workspace'
  | 'about';

export const SETTINGS_SECTION_SCOPE: Readonly<Record<SettingsSectionId, SettingsScope>> = {
  screen: 'computer',
  map: 'computer',
  expand: 'computer',
  footprint: 'computer',
  notify: 'computer',
  agents: 'computer',
  privacy: 'computer',
  workspace: 'folder',
  about: 'app',
};

export type SettingsSurface = 'both' | 'desktop';

export type SettingId = string;

export interface SettingsCatalogEntry {
  id: SettingId;
  section: SettingsSectionId;
  labelKey: string;
  keywordsKey?: string;
  surface: SettingsSurface;
  href?: string;
}
