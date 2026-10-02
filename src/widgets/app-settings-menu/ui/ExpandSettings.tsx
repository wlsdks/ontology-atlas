'use client';

import { useId, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { ICON_SIZE } from '@/shared/ui/icon-size';
import { useTranslations } from 'next-intl';

import {
  DEFAULT_EXPAND,
  EXPAND_RANGES,
  useExpand,
  writeExpand,
  type ExpandAffordance,
  type ExpandPreference,
  type ExpandStructure,
} from '@/shared/lib/appearance-preferences';
import { Chip } from '@/shared/ui/controls';
import { RowDisclosure } from '@/shared/ui/row-disclosure';
import { Choice, DETAIL_TOGGLE_CHIP, Slider } from './settings-primitives';

export function ExpandSettings() {
  const t = useTranslations('nav.settingsMenu.expand');
  const pref = useExpand();
  const set = (patch: Partial<ExpandPreference>) => writeExpand({ ...pref, ...patch });
  const [detailOpen, setDetailOpen] = useState(false);
  const detailId = useId();

  const AFFORDANCES: readonly { value: ExpandAffordance; label: string }[] = [
    { value: 'pill', label: t('affordancePill') },
    { value: 'bar', label: t('affordanceBar') },
    { value: 'badge', label: t('affordanceBadge') },
  ];
  const STRUCTURES: readonly { value: ExpandStructure; label: string }[] = [
    { value: 'disc', label: t('structureDisc') },
    { value: 'fan', label: t('structureFan') },
    { value: 'ring', label: t('structureRing') },
    { value: 'column', label: t('structureColumn') },
  ];

  return (
    <div className="grid min-w-0 gap-3" data-testid="app-settings-expand">
      <div className="grid min-w-0 gap-0.5 rounded-card border border-[color:var(--color-border-soft)] bg-[color:var(--color-overlay-1)] p-2">
        <Choice
          settingId="expand-affordance"
          label={t('affordanceLabel')}
          testId="app-settings-expand-affordance"
          optionTestId={(value) => `app-settings-expand-affordance-${value}`}
          value={pref.affordance}
          options={AFFORDANCES}
          onChange={(affordance) => set({ affordance })}
        />
        <p
          data-testid="app-settings-expand-affordance-hint"
          className="px-1 pb-1 text-label text-[color:var(--color-text-tertiary)]"
        >
          {t(`affordanceHint.${pref.affordance}`)}
        </p>
      </div>

      <div className="grid min-w-0 gap-0.5 rounded-card border border-[color:var(--color-border-soft)] bg-[color:var(--color-overlay-1)] p-2">
        <Choice
          settingId="expand-structure"
          label={t('structureLabel')}
          testId="app-settings-expand-structure"
          optionTestId={(value) => `app-settings-expand-structure-${value}`}
          value={pref.structure}
          options={STRUCTURES}
          onChange={(structure) => set({ structure })}
        />
        <p
          data-testid="app-settings-expand-structure-hint"
          className="px-1 pb-1 text-label text-[color:var(--color-text-tertiary)]"
        >
          {t(`structureHint.${pref.structure}`)}
        </p>
      </div>

      <div className="min-w-0" data-setting-id="expand-counts">
      <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
      <Chip
        size="lg"
        tone="secondary"
        data-testid="app-settings-expand-detail-toggle"
        aria-expanded={detailOpen}
        aria-controls={detailId}
        onClick={() => setDetailOpen((open) => !open)}
        className={DETAIL_TOGGLE_CHIP}
      >
        <ChevronDown
          size={ICON_SIZE.md}
          aria-hidden
          className={detailOpen ? 'rotate-180 transition-transform' : 'transition-transform'}
        />
        {detailOpen ? t('detailHide') : t('detailShow')}
      </Chip>
      <Chip
        size="lg"
        data-testid="app-settings-expand-reset"
        onClick={() => writeExpand(DEFAULT_EXPAND)}
        hoverInk="strong"
        hoverSurface="lift"
        className="justify-self-start border-transparent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-indigo-focus-ring)]"
      >
        {t('reset')}
      </Chip>
      </div>

      <RowDisclosure open={detailOpen} id={detailId} className="pt-3">
      <div className="grid min-w-0 gap-0.5 rounded-card border border-[color:var(--color-border-soft)] bg-[color:var(--color-overlay-1)] p-2">
        <Slider
          label={t('batchLabel')}
          testId="app-settings-expand-batch"
          value={pref.batchSize}
          range={EXPAND_RANGES.batchSize}
          format={(v) => String(v)}
          onChange={(batchSize) => set({ batchSize })}
        />
        <p className="px-1 pb-1 text-label text-[color:var(--color-text-tertiary)]">
          {t('batchHint')}
        </p>
        <Slider
          label={t('labelAttemptsLabel')}
          testId="app-settings-expand-label-attempts"
          value={pref.labelAttempts}
          range={EXPAND_RANGES.labelAttempts}
          format={(v) => String(v)}
          onChange={(labelAttempts) => set({ labelAttempts })}
        />
        <p className="px-1 pb-1 text-label text-[color:var(--color-text-tertiary)]">
          {t('labelAttemptsHint')}
        </p>
        <Slider
          label={t('maxOpenLabel')}
          testId="app-settings-expand-max-open"
          value={pref.maxOpenParents}
          range={EXPAND_RANGES.maxOpenParents}
          format={(v) => String(v)}
          onChange={(maxOpenParents) => set({ maxOpenParents })}
        />
        <p className="px-1 pb-1 text-label text-[color:var(--color-text-tertiary)]">
          {t('maxOpenHint')}
        </p>
      </div>
      </RowDisclosure>
      </div>
    </div>
  );
}
