'use client';

import { useTranslations } from 'next-intl';
import { LocaleSwitch } from '@/features/locale-switch';
import { useGuideAutoStart, useGuideReplay, writeGuideAutoStart } from '@/features/guided-tour';
import { useAudiencePlain } from '@/shared/lib/audience-preference';
import { cn } from '@/shared/lib/cn';
import { isDesktopShell } from '@/shared/lib/desktop-shell';
import { TEXT_SIZES, useTextSize, writeTextSize } from '@/shared/lib/preferences/text-size';
import { usePrefersReducedMotion } from '@/shared/lib/use-prefers-reduced-motion';
import { Chip } from '@/shared/ui/controls';
import { SegmentedControl } from '@/shared/ui/segmented-control';
import { GlyphSetPicker } from '../AppearancePickers';
import {
  DETAIL_TOGGLE_CHIP,
  SegmentSwitch,
  SettingsGroup,
  SettingsRow,
} from '../settings-primitives';

export function ScreenPane({
  onClose,
  onLocaleSwitchStart,
}: {
  onClose: (returnFocus: boolean) => void;
  onLocaleSwitchStart: (locale: string) => void;
}) {
  const t = useTranslations('settingsScreen');
  const [audiencePlain, setAudiencePlain] = useAudiencePlain();
  const textSize = useTextSize();
  const reducedMotion = usePrefersReducedMotion();
  const replayGuide = useGuideReplay();
  const guideAutoStart = useGuideAutoStart();
  return (
    <SettingsGroup testId="app-settings-screen-group">
      <SettingsRow
        settingId="language"
        label={t('languageLabel')}
        control={<LocaleSwitch onSwitchStart={onLocaleSwitchStart} />}
      />
      <SettingsRow
        settingId="view-mode"
        label={t('viewModeLabel')}
        caption={t('viewModeCaption')}
        control={
          <SegmentSwitch
            ariaLabel={t('viewModeLabel')}
            testId="app-settings-view-mode"
            value={audiencePlain}
            onChange={setAudiencePlain}
            options={[
              { value: false, label: t('viewModeDev') },
              { value: true, label: t('viewModePlain') },
            ]}
          />
        }
      />
      <SettingsRow
        settingId="text-size"
        testId="app-settings-text-size"
        label={t('textSizeLabel')}
        caption={t('textSizeCaption')}
        control={
          <SegmentedControl
            ariaLabel={t('textSizeLabel')}
            testId="app-settings-text-size-switch"
            value={textSize}
            onChange={writeTextSize}
            options={TEXT_SIZES.map((size) => ({
              value: size,
              label: t(`textSize.${size}`),
              testId: `app-settings-text-size-${size}`,
            }))}
          />
        }
      />
      <GlyphSetPicker settingId="concept-icons" />
      <SettingsRow
        settingId="motion"
        testId="app-settings-motion"
        label={t('motionLabel')}
        caption={isDesktopShell() ? t('motionCaptionApp') : t('motionCaptionWeb')}
        control={
          <span className="text-body text-[color:var(--color-text-secondary)]">
            {reducedMotion ? t('motionReduced') : t('motionFull')}
          </span>
        }
      />
      <SettingsRow
        settingId="screen-guides"
        testId="app-settings-guide-auto-start"
        label={t('guidesLabel')}
        caption={t('guidesCaption')}
        control={
          <>
            <SegmentSwitch
              ariaLabel={t('guidesAutoLabel')}
              testId="app-settings-guide-auto-start-switch"
              value={guideAutoStart}
              onChange={writeGuideAutoStart}
              options={[
                { value: true, label: t('guidesOn') },
                { value: false, label: t('guidesOff') },
              ]}
            />
            {replayGuide ? (
              <Chip
                size="lg"
                tone="secondary"
                data-testid="app-settings-replay-guide-button"
                onClick={() => {
                  onClose(false);
                  replayGuide();
                }}
                className={cn(DETAIL_TOGGLE_CHIP, 'min-h-9')}
              >
                {t('guidesReplay')}
              </Chip>
            ) : null}
          </>
        }
      />
    </SettingsGroup>
  );
}
