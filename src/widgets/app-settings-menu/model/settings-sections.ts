import {
  SETTINGS_SECTION_SCOPE,
  type SettingsScope,
  type SettingsSectionId,
} from './catalog/types';

export const SETTINGS_SECTIONS: readonly SettingsSectionId[] = [
  'screen',
  'map',
  'expand',
  'footprint',
  'notify',
  'agents',
  'privacy',
  'workspace',
  'about',
];

export const SETTINGS_SCOPES: readonly SettingsScope[] = ['computer', 'folder', 'app'];

export const SETTINGS_NAV_GROUPS: readonly { scope: SettingsScope; sections: readonly SettingsSectionId[] }[] =
  SETTINGS_SCOPES.map((scope) => ({
    scope,
    sections: SETTINGS_SECTIONS.filter((section) => SETTINGS_SECTION_SCOPE[section] === scope),
  }));

const RETIRED_SECTION: Readonly<Record<string, SettingsSectionId>> = {
  background: 'map',
  update: 'about',
};

export function resolveSettingsSection(value: unknown): SettingsSectionId | null {
  if (typeof value !== 'string') return null;
  if ((SETTINGS_SECTIONS as readonly string[]).includes(value)) return value as SettingsSectionId;
  return RETIRED_SECTION[value] ?? null;
}
