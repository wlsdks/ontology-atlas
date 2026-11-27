import type { SettingsCatalogEntry } from './settings-catalog-entry';

export const MAP_CATALOG: readonly SettingsCatalogEntry[] = [
  { id: 'canvas-background', section: 'map', labelKey: 'nav.settingsMenu.canvasBgLabel' },
  { id: 'pan-speed', section: 'map', labelKey: 'nav.settingsMenu.mapDragSpeedLabel' },
  { id: 'zoom-speed', section: 'map', labelKey: 'nav.settingsMenu.mapZoomSpeedLabel' },
  { id: 'index-default', section: 'map', labelKey: 'nav.settingsMenu.indexDefaultLabel' },
  { id: 'frame-meter', section: 'map', labelKey: 'nav.settingsMenu.frameMeterLabel' },
];
