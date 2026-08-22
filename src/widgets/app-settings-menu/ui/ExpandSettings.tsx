'use client';

import { useState } from 'react';
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
import { controlClass } from '@/shared/ui/control-class';
import { Chip } from '@/shared/ui/controls';
import { Choice, DETAIL_TOGGLE_CHIP, RESET_LINK_INK, Slider } from './settings-primitives';

/**
 * Expand settings — **how** a collapsed group opens.
 *
 * ## Where it came from
 *
 * It is the left panel of the mockup `.qa-scratch/proto-expand.html` ported over.
 * That mockup was an **instrument** built to measure 3 affordance options, 3
 * structure options and 3 numbers side by side, and its controls and explanatory
 * copy were transplanted here (the copy is the mockup's words, not newly written).
 * 「볼트 규모」 (small/real/large), which existed only in the mockup, was **a test
 * load** and was not brought over — it was the mockup's handle for measuring
 * itself, not a product setting.
 *
 * ## Why all three ship — and what the default is
 *
 * Shipping "the thing built for choosing between" as a setting leaves «we did not
 * choose» in the product. So the owner **chose**: the default affordance is
 * 「머리 위 막대」 (the bar above the head), 2026-08-01. The other two remain options,
 * because which of the three wins genuinely varies with density and screen size,
 * and the options shrink once those observations accumulate. The judgement and its
 * falsifier are in `docs/DECISIONS.md`.
 *
 * ## The three numbers are not new values
 *
 * They were already constants in the code (`EGO_NEIGHBOR_LIMIT` 24 ·
 * `DISC_LABEL_TOP_K` 8 · `MAX_EXPANDED_PARENTS` 3). The mockup pulled them out as
 * sliders to measure, and now those constants **take** this setting's defaults —
 * so the value is not written in two places.
 */
export function ExpandSettings() {
  const t = useTranslations('nav.settingsMenu.expand');
  const pref = useExpand();
  const set = (patch: Partial<ExpandPreference>) => writeExpand({ ...pref, ...patch });
  /**
   * The three numbers **start collapsed** (design audit, 2026-08-02).
   *
   * Six items standing as three equally weighted boxes make this section read as a
   * **list** rather than «a place to choose» (measured: three sibling boxes with
   * identical border, radius and 12px gap — the screen does not say what comes
   * first). There are two decisions ("what do I press", "how is it laid out"). The
   * three numbers are constants that were already in the code, so most people never
   * touch them and only tinkerers need them. The immediate neighbour 「발자국」 already
   * solved the same problem with the same grammar (presets first, 「직접 맞추기」
   * second), so that is used rather than inventing a new one.
   */
  const [detailOpen, setDetailOpen] = useState(false);

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
      <p className="break-keep text-label text-[color:var(--color-text-quaternary)]">
        {t('caption')}
      </p>

      <div className="grid min-w-0 gap-0.5 rounded-card border border-[color:var(--color-border-soft)] p-2">
        <Choice
          label={t('affordanceLabel')}
          testId="app-settings-expand-affordance"
          optionTestId={(value) => `app-settings-expand-affordance-${value}`}
          value={pref.affordance}
          options={AFFORDANCES}
          onChange={(affordance) => set({ affordance })}
        />
        {/* One line on what the current choice does — the mockup's hint, verbatim.
            With three side by side the names alone do not separate them (which is why
            the mockup had hints). */}
        <p
          data-testid="app-settings-expand-affordance-hint"
          className="px-1 pb-1 break-keep text-label text-[color:var(--color-text-quaternary)]"
        >
          {t(`affordanceHint.${pref.affordance}`)}
        </p>
      </div>

      <div className="grid min-w-0 gap-0.5 rounded-card border border-[color:var(--color-border-soft)] p-2">
        <Choice
          label={t('structureLabel')}
          testId="app-settings-expand-structure"
          optionTestId={(value) => `app-settings-expand-structure-${value}`}
          value={pref.structure}
          options={STRUCTURES}
          onChange={(structure) => set({ structure })}
        />
        <p
          data-testid="app-settings-expand-structure-hint"
          className="px-1 pb-1 break-keep text-label text-[color:var(--color-text-quaternary)]"
        >
          {t(`structureHint.${pref.structure}`)}
        </p>
      </div>

      <Chip
        size="lg"
        tone="secondary"
        data-testid="app-settings-expand-detail-toggle"
        aria-expanded={detailOpen}
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

      {detailOpen ? (
      <div className="grid min-w-0 gap-0.5 rounded-card border border-[color:var(--color-border-soft)] p-2">
        <Slider
          label={t('batchLabel')}
          testId="app-settings-expand-batch"
          value={pref.batchSize}
          range={EXPAND_RANGES.batchSize}
          format={(v) => String(v)}
          onChange={(batchSize) => set({ batchSize })}
        />
        <p className="px-1 pb-1 break-keep text-label text-[color:var(--color-text-quaternary)]">
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
        <p className="px-1 pb-1 break-keep text-label text-[color:var(--color-text-quaternary)]">
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
        <p className="px-1 pb-1 break-keep text-label text-[color:var(--color-text-quaternary)]">
          {t('maxOpenHint')}
        </p>
      </div>
      ) : null}

      <button
        type="button"
        data-testid="app-settings-expand-reset"
        onClick={() => writeExpand(DEFAULT_EXPAND)}
        className={controlClass({
          shape: 'link',
          size: 'md',
          tone: 'muted',
          className: `touch-hit-expand ${RESET_LINK_INK}`,
        })}
      >
        {t('reset')}
      </button>
    </div>
  );
}
