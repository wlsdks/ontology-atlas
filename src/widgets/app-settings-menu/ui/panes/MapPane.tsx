'use client';

import { useTranslations } from 'next-intl';
import { useFrameMeter, writeFrameMeter } from '@/shared/lib/appearance-preferences';
import { CanvasBackgroundPicker } from '../AppearancePickers';
import { MapSpeedSettings } from '../MapSpeedSettings';
import { SegmentSwitch, SettingsGroup, SettingsRow } from '../settings-primitives';

export interface MapPaneScreenControls {
  indexCollapsed: boolean;
  onIndexCollapsedChange: (collapsed: boolean) => void;
}

export function MapPane({ screenControls }: { screenControls?: MapPaneScreenControls }) {
  const t = useTranslations('nav.settingsMenu');
  const frameMeter = useFrameMeter();
  return (
    <SettingsGroup testId="app-settings-map-group">
      <CanvasBackgroundPicker settingId="canvas-background" />
      <MapSpeedSettings />
      {screenControls ? (
        <SettingsRow
          settingId="index-default"
          testId="app-settings-index-default-row"
          label={t('indexDefaultLabel')}
          control={
            <SegmentSwitch
              ariaLabel={t('indexDefaultLabel')}
              testId="app-settings-index-default"
              value={screenControls.indexCollapsed}
              onChange={screenControls.onIndexCollapsedChange}
              options={[
                { value: false, label: t('indexDefaultExpanded') },
                { value: true, label: t('indexDefaultCollapsed') },
              ]}
            />
          }
        />
      ) : null}
      <SettingsRow
        settingId="frame-meter"
        testId="app-settings-frame-meter"
        label={t('frameMeterLabel')}
        caption={t('frameMeterCaption')}
        control={
          <SegmentSwitch
            ariaLabel={t('frameMeterLabel')}
            testId="app-settings-frame-meter-switch"
            value={frameMeter}
            onChange={writeFrameMeter}
            options={[
              { value: true, label: t('frameMeterOn') },
              { value: false, label: t('frameMeterOff') },
            ]}
          />
        }
      />
    </SettingsGroup>
  );
}
