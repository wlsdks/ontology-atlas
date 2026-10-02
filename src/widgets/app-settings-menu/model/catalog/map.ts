import type { SettingsCatalogEntry } from './types';

export const MAP_CATALOG: readonly SettingsCatalogEntry[] = [
  { id: 'canvas-background', section: 'map', labelKey: 'nav.settingsMenu.canvasBgLabel', surface: 'both' },
  { id: 'pan-speed', section: 'map', labelKey: 'nav.settingsMenu.mapDragSpeedLabel', surface: 'both' },
  { id: 'zoom-speed', section: 'map', labelKey: 'nav.settingsMenu.mapZoomSpeedLabel', surface: 'both' },
  { id: 'index-default', section: 'map', labelKey: 'nav.settingsMenu.indexDefaultLabel', surface: 'both' },
  { id: 'frame-meter', section: 'map', labelKey: 'nav.settingsMenu.frameMeterLabel', surface: 'both' },
];
