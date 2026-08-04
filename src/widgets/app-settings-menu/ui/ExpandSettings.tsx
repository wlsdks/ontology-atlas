'use client';

import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
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
 * 확장 설정 — 접힌 묶음을 **어떻게 펼치나**.
 *
 * ## 어디서 왔나
 *
 * 시안 `.qa-scratch/proto-expand.html` 의 좌측 패널을 그대로 옮긴 것이다. 시안은
 * 어포던스 3안·구조 3안·숫자 3개를 나란히 놓고 재려고 만든 **계측 도구**였고,
 * 그 컨트롤과 설명 문구를 여기 이식했다(문구는 새로 짓지 않고 시안의 말을 쓴다).
 * 시안에만 있던 「볼트 규모」(작음/실제/큼)는 **시험 부하**라 옮기지 않았다 —
 * 제품 설정이 아니라 시안이 자기를 재는 손잡이였다.
 *
 * ## 왜 셋을 다 내보내나 — 그리고 무엇이 기본인가
 *
 * 「고르라고 만든 것」을 그대로 설정으로 내보내면 «우리가 안 골랐다» 가 제품에
 * 남는다. 그래서 소유자가 **골랐다**: 기본 어포던스는 「머리 위 막대」다
 * (2026-08-01). 나머지 둘은 선택지로 남는다 — 밀도와 화면 크기에 따라 셋의
 * 우열이 실제로 갈리기 때문이고, 그 관측이 쌓이면 선택지를 줄인다.
 * 판단과 반증 조건은 `docs/DECISIONS.md`.
 *
 * ## 세 숫자는 새 값이 아니다
 *
 * 이미 코드 안에 상수로 있던 것들이다(`EGO_NEIGHBOR_LIMIT` 24 ·
 * `DISC_LABEL_TOP_K` 8 · `MAX_EXPANDED_PARENTS` 3). 시안이 그걸 슬라이더로 뽑아
 * 재 봤고, 이제 그 상수들이 이 설정의 기본값을 **가져다 쓴다** — 값이 두 곳에
 * 적히지 않게.
 */
export function ExpandSettings() {
  const t = useTranslations('nav.settingsMenu.expand');
  const pref = useExpand();
  const set = (patch: Partial<ExpandPreference>) => writeExpand({ ...pref, ...patch });
  /**
   * 세 숫자는 **접혀서 시작한다** (2026-08-02 디자인 감사).
   *
   * 여섯 항목이 같은 무게의 상자 셋으로 나란히 서면 이 절은 «고르는 자리» 가
   * 아니라 **목록**으로 읽힌다(실측: 형제 상자 셋, 보더·radius·간격 12px 전부
   * 동일 — 무엇이 먼저인지 화면이 말하지 않는다). 결정은 둘이다("무엇을 누르나"
   * ·"어떻게 놓이나"). 세 숫자는 이미 코드에 있던 상수라 대부분 손대지 않고,
   * 만지는 사람에게만 필요하다. 바로 아래 이웃인 「발자국」이 같은 문제를 이미
   * 같은 문법(프리셋 먼저 · 「직접 맞추기」 뒤)으로 풀었으므로 새 문법을
   * 만들지 않고 그것을 쓴다.
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
        {/* 지금 고른 것이 무엇을 하는지 한 줄로 — 시안의 힌트를 그대로. 셋이
            나란히 있으면 이름만으로는 갈리지 않는다(시안이 힌트를 둔 이유). */}
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
          size={14}
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
