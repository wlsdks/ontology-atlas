'use client';

import { useTranslations } from 'next-intl';
import {
  MAP_SPEEDS,
  useMapDragSpeed,
  useMapZoomSpeed,
  writeMapDragSpeed,
  writeMapZoomSpeed,
  type MapSpeed,
} from '@/shared/lib/appearance-preferences';
import { SegmentedControl } from '@/shared/ui/segmented-control';
import { SettingsGroup, SettingsRow } from './settings-primitives';

function SpeedChoice({
  label,
  value,
  onChange,
  testId,
}: {
  label: string;
  value: MapSpeed;
  onChange: (next: MapSpeed) => void;
  testId: string;
}) {
  const t = useTranslations('nav.settingsMenu');
  return (
    <SegmentedControl
      ariaLabel={label}
      value={value}
      onChange={onChange}
      testId={testId}
      options={MAP_SPEEDS.map((speed) => ({
        value: speed,
        label: t('mapSpeedOption', { speed }),
        ariaLabel: t('mapSpeedOptionAria', { speed }),
        testId: `${testId}-${speed}`,
      }))}
    />
  );
}

export function MapSpeedSettings() {
  const t = useTranslations('nav.settingsMenu');
  const drag = useMapDragSpeed();
  const zoom = useMapZoomSpeed();
  return (
    <SettingsGroup testId="app-settings-map-speed">
      <SettingsRow
        testId="app-settings-map-drag-speed-row"
        label={t('mapDragSpeedLabel')}
        caption={t('mapDragSpeedCaption')}
        control={
          <SpeedChoice
            label={t('mapDragSpeedLabel')}
            value={drag}
            onChange={writeMapDragSpeed}
            testId="app-settings-map-drag-speed"
          />
        }
      />
      <SettingsRow
        testId="app-settings-map-zoom-speed-row"
        label={t('mapZoomSpeedLabel')}
        caption={t('mapZoomSpeedCaption')}
        control={
          <SpeedChoice
            label={t('mapZoomSpeedLabel')}
            value={zoom}
            onChange={writeMapZoomSpeed}
            testId="app-settings-map-zoom-speed"
          />
        }
      />
    </SettingsGroup>
  );
}
