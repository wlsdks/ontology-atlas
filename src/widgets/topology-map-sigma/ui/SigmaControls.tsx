'use client';

import { useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { ChevronDown, ChevronUp, Maximize2, Search, Sliders, SlidersHorizontal, X } from 'lucide-react';
import { Tooltip } from '@/shared/ui';
import type {
  SigmaControlsState,
  SigmaForces,
  SigmaOverlays,
} from '../model/controls-state';

interface SigmaControlsProps {
  value: SigmaControlsState;
  onChange: (next: SigmaControlsState) => void;
  /** "지도 전체 맞추기" 콜백. 설정되면 Controls 아이콘 위에 Fit 버튼이 같은
   *  pill 안에 합쳐져서 렌더된다. 없으면 Fit 버튼은 숨김. */
  onFitView?: () => void;
  /** 검색창 우측에 "N / TOTAL" live count badge 표시용. 필터가 동작 중인지
   *  한눈에 보여준다. undefined면 배지 숨김. */
  visibleCount?: number | null;
  totalCount?: number | null;
}

/**
 * Linear 베이스 톤 컨트롤 패널. 기본 접힘 상태는 32px 아이콘 버튼 하나만
 * 노출해 화면 겹침·시각 노이즈를 없애고, 필요한 순간에만 확장해서 쓴다.
 *
 * 키보드: `/` 검색 포커스, `1`–`6` depth 설정, `0` depth 전체, `?` 단축키
 * 도움말. 모두 사용자가 입력 폼에 포커스 중이 아닐 때만 반응.
 */
export function SigmaControls({
  value,
  onChange,
  onFitView,
  visibleCount,
  totalCount,
}: SigmaControlsProps) {
  const t = useTranslations('topologyWidgets.controls');
  const [expanded, setExpanded] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [forcesOpen, setForcesOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const isForm =
        target?.tagName === 'INPUT' ||
        target?.tagName === 'TEXTAREA' ||
        (target?.isContentEditable ?? false);
      if (isForm) return;
      if (event.key === '/') {
        event.preventDefault();
        setExpanded(true);
        queueMicrotask(() => {
          document.getElementById('sigma-search-input')?.focus();
        });
        return;
      }
      // `?` 키는 HomePage 의 글로벌 ShortcutSheet 가 단일 진입점.
      // 여기서 별도 HelpOverlay 를 같이 열면 dialog 두 개가 동시에 떠 사용자가
      // 어느 쪽이 진짜 help 인지 헷갈린다. button click (line 366) 은 유지.
      if (event.key === '0') {
        onChange({ ...value, depthLimit: null });
        return;
      }
      if (/^[1-6]$/.test(event.key)) {
        onChange({ ...value, depthLimit: Number(event.key) });
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onChange, value]);

  const updateForces = (key: keyof SigmaForces, next: number) => {
    onChange({ ...value, forces: { ...value.forces, [key]: next } });
  };
  const updateOverlay = (key: keyof SigmaOverlays, next: boolean) => {
    onChange({ ...value, overlays: { ...value.overlays, [key]: next } });
  };

  // 기본 접힘 상태 — Fit + Controls 아이콘을 한 pill에 수직 스택으로 합친다.
  // 우측 상단 두 번째 행 (account menu 아래, Hub Rail과 수평)
  if (!expanded) {
    return (
      <>
        <div className="pointer-events-auto absolute right-4 top-[140px] z-20 flex flex-col overflow-hidden rounded-md border border-[color:var(--color-divider)] bg-[color:var(--color-panel)] md:right-6 xl:right-8">
          {/* Fit · 도움말은 데스크톱에서만 노출 — 모바일은 pinch-zoom 으로
              fit 가능하고 키보드 단축키도 의미 없음. sliders 만 모바일에 남겨
              우측 floating 무게를 줄인다. */}
          {onFitView ? (
            <>
              <Tooltip content={t('fitViewTooltip')} side="left" withProvider={false}>
                <button
                  type="button"
                  onClick={onFitView}
                  aria-label={t('fitViewAriaLabel')}
                  className="hidden h-9 w-9 items-center justify-center text-[color:var(--color-text-tertiary)] transition-colors hover:text-[color:var(--color-text-primary)] active:bg-[color:rgba(94,106,210,0.18)] md:flex"
                >
                  <Maximize2 className="h-4 w-4" />
                </button>
              </Tooltip>
              <div className="hidden h-px bg-[color:var(--color-border-soft)] md:block" />
            </>
          ) : null}
          <Tooltip content={t('openTooltip')} side="left" withProvider={false}>
            <button
              type="button"
              onClick={() => setExpanded(true)}
              aria-label={t('openAriaLabel')}
              className="flex h-9 w-9 items-center justify-center text-[color:var(--color-text-tertiary)] transition-colors hover:text-[color:var(--color-text-primary)]"
            >
              <SlidersHorizontal className="h-4 w-4" />
            </button>
          </Tooltip>
        </div>
        {helpOpen ? <HelpOverlay onClose={() => setHelpOpen(false)} /> : null}
      </>
    );
  }

  const countBadge =
    typeof visibleCount === 'number' && typeof totalCount === 'number'
      ? `${visibleCount} / ${totalCount}`
      : null;
  const filtering =
    countBadge !== null &&
    typeof visibleCount === 'number' &&
    typeof totalCount === 'number' &&
    visibleCount < totalCount;

  return (
    <>
      {/* 펼친 상태에서도 Fit 버튼은 같은 우측 컬럼 top-[140px]에 남겨둔다.
          panel은 그 아래 top-[184px]부터. */}
      {onFitView ? (
        <Tooltip content={t('fitViewTooltip')} side="left" withProvider={false}>
          <button
            type="button"
            onClick={onFitView}
            aria-label={t('fitViewAriaLabel')}
            className="pointer-events-auto absolute right-4 top-[140px] z-20 flex h-9 w-9 items-center justify-center rounded-md border border-[color:var(--color-divider)] bg-[color:var(--color-panel)] text-[color:var(--color-text-tertiary)] transition-colors hover:text-[color:var(--color-text-primary)] active:bg-[color:rgba(94,106,210,0.18)] md:right-6 xl:right-8"
          >
            <Maximize2 className="h-4 w-4" />
          </button>
        </Tooltip>
      ) : null}
      <div className="pointer-events-none absolute right-4 top-[184px] z-20 flex max-h-[calc(100vh-260px)] w-[248px] flex-col gap-1.5 overflow-y-auto overscroll-contain md:right-6 xl:right-8">
        <div className="pointer-events-auto flex h-9 items-center gap-2 rounded-md border border-[color:var(--color-border-soft)] bg-[color:var(--color-panel)] px-2.5">
          <Search className="h-3.5 w-3.5 text-[color:var(--color-text-quaternary)]" />
          <input
            id="sigma-search-input"
            type="search"
            value={value.searchQuery}
            onChange={(e) =>
              onChange({ ...value, searchQuery: e.target.value })
            }
            placeholder={t('searchPlaceholder')}
            className="w-full border-0 bg-transparent text-[12px] text-[color:var(--color-text-primary)] outline-none placeholder:text-[color:var(--color-text-quaternary)]"
          />
          {countBadge ? (
            <span
              className={`font-mono text-[9px] tracking-[0.08em] ${
                filtering
                  ? 'text-[color:rgba(139,151,255,0.9)]'
                  : 'text-[color:var(--color-text-quaternary)]'
              }`}
              aria-label={t('searchCountAriaLabel', { visible: visibleCount as number, total: totalCount as number })}
            >
              {countBadge}
            </span>
          ) : null}
          {value.searchQuery ? (
            <button
              type="button"
              onClick={() => onChange({ ...value, searchQuery: '' })}
              className="font-mono text-[9px] uppercase tracking-[0.14em] text-[color:var(--color-text-quaternary)] transition-colors hover:text-[color:var(--color-text-primary)]"
              aria-label={t('clearSearchAriaLabel')}
            >
              Esc
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setExpanded(false)}
              className="text-[color:var(--color-text-quaternary)] transition-colors hover:text-[color:var(--color-text-primary)]"
              aria-label={t('closeAriaLabel')}
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        {/* 허브만 보기 — 500노드 한눈에 보기 부담 줄이는 토글. 허브 11개 +
            허브-허브 엣지만 렌더. 클릭 한 번으로 전환. */}
        <label className="pointer-events-auto flex cursor-pointer items-center justify-between rounded-md border border-[color:var(--color-border-soft)] bg-[color:var(--color-panel)] px-3 py-2 text-[11px] text-[color:var(--color-text-tertiary)] transition-colors hover:border-[color:rgba(139,151,255,0.28)]">
          <span className="font-mono text-[9px] uppercase tracking-[0.16em] text-[color:var(--color-text-quaternary)]">
            {t('hubsOnlyLabel')}
          </span>
          <input
            type="checkbox"
            checked={value.hubsOnly}
            onChange={(e) => onChange({ ...value, hubsOnly: e.target.checked })}
            className="h-3.5 w-3.5 accent-[color:var(--color-indigo-brand)]"
          />
        </label>

        {/* 지도 overlay — 공개 사용자가 바로 이해할 정보만 먼저 노출. */}
        <div className="pointer-events-auto rounded-md border border-[color:var(--color-border-soft)] bg-[color:var(--color-panel)] px-3 py-2.5">
          <span className="font-mono text-[9px] uppercase tracking-[0.16em] text-[color:var(--color-text-quaternary)]">
            {t('overlayHeader')}
          </span>
          <div className="mt-2 space-y-1.5">
            <OverlayToggle
              label={t('overlayRecentPulseLabel')}
              hint={t('overlayRecentPulseHint')}
              checked={value.overlays.recentPulse}
              onChange={(next) => updateOverlay('recentPulse', next)}
            />
            <OverlayToggle
              label={t('overlayBackrefLabel')}
              hint={t('overlayBackrefHint')}
              checked={value.overlays.backrefHighlight}
              onChange={(next) => updateOverlay('backrefHighlight', next)}
            />
          </div>
        </div>

        <div className="pointer-events-auto rounded-md border border-[color:var(--color-border-soft)] bg-[color:var(--color-panel)] px-3 py-2.5">
          <button
            type="button"
            onClick={() => setAdvancedOpen((v) => !v)}
            className="flex w-full items-center justify-between text-left transition-colors hover:text-[color:var(--color-text-primary)]"
            aria-expanded={advancedOpen}
          >
            <span className="flex items-center gap-2">
              <Sliders className="h-3 w-3 text-[color:var(--color-text-quaternary)]" />
              <span className="font-mono text-[9px] uppercase tracking-[0.16em] text-[color:var(--color-text-quaternary)]">
                {t('advancedHeader')}
              </span>
            </span>
            {advancedOpen ? (
              <ChevronUp className="h-3 w-3 text-[color:var(--color-text-tertiary)]" />
            ) : (
              <ChevronDown className="h-3 w-3 text-[color:var(--color-text-tertiary)]" />
            )}
          </button>

          {advancedOpen ? (
            <div className="mt-3 space-y-4 border-t border-[color:var(--color-overlay-2)] pt-3">
              <div className="space-y-1.5">
                <OverlayToggle
                  label={t('overlayOwnerLabel')}
                  hint={t('overlayOwnerHint')}
                  checked={value.overlays.ownerTint}
                  onChange={(next) => updateOverlay('ownerTint', next)}
                />
                <OverlayToggle
                  label={t('overlayAuditLabel')}
                  hint={t('overlayAuditHint')}
                  checked={value.overlays.auditHighlight}
                  onChange={(next) => updateOverlay('auditHighlight', next)}
                />
              </div>

              <div>
                <div className="flex items-center justify-between">
                  <span className="font-mono text-[9px] uppercase tracking-[0.16em] text-[color:var(--color-text-quaternary)]">
                    {t('depthLabel')}
                  </span>
                  <span className="font-mono text-[10px] tracking-[0.08em] text-[color:var(--color-text-secondary)]">
                    {value.depthLimit == null ? t('depthAll') : t('depthHop', { count: value.depthLimit })}
                  </span>
                </div>
                <input
                  type="range"
                  min={1}
                  max={7}
                  step={1}
                  value={value.depthLimit ?? 7}
                  onChange={(e) => {
                    const next = Number(e.target.value);
                    onChange({ ...value, depthLimit: next >= 7 ? null : next });
                  }}
                  className="sigma-range mt-2 w-full"
                />
              </div>

              <div className="rounded-md border border-[color:var(--color-border-soft)]">
                <button
                  type="button"
                  onClick={() => setForcesOpen((v) => !v)}
                  className="flex w-full items-center justify-between px-3 py-2.5 text-left transition-colors hover:bg-[color:var(--color-overlay-1)]"
                >
                  <span className="flex items-center gap-2">
                    <Sliders className="h-3 w-3 text-[color:var(--color-text-quaternary)]" />
                    <span className="font-mono text-[9px] uppercase tracking-[0.16em] text-[color:var(--color-text-quaternary)]">
                      {t('forcesHeader')}
                    </span>
                  </span>
                  {forcesOpen ? (
                    <ChevronUp className="h-3 w-3 text-[color:var(--color-text-tertiary)]" />
                  ) : (
                    <ChevronDown className="h-3 w-3 text-[color:var(--color-text-tertiary)]" />
                  )}
                </button>
                {forcesOpen ? (
                  <div className="space-y-2.5 border-t border-[color:var(--color-overlay-2)] px-3 py-3">
                    <SliderRow
                      label={t('forcesRepel')}
                      min={-800}
                      max={-50}
                      step={10}
                      value={value.forces.repel ?? -320}
                      display={(v) => `${v}`}
                      onChange={(v) => updateForces('repel', v)}
                    />
                    <SliderRow
                      label={t('forcesLink')}
                      min={30}
                      max={180}
                      step={5}
                      value={value.forces.linkDistance ?? 70}
                      display={(v) => `${v}px`}
                      onChange={(v) => updateForces('linkDistance', v)}
                    />
                    <SliderRow
                      label={t('forcesCollide')}
                      min={0.5}
                      max={2.2}
                      step={0.1}
                      value={value.forces.collideMultiplier ?? 1}
                      display={(v) => `×${v.toFixed(1)}`}
                      onChange={(v) => updateForces('collideMultiplier', v)}
                    />
                  </div>
                ) : null}
              </div>

              <button
                type="button"
                onClick={() => {
                  if (typeof window === 'undefined') return;
                  if (!window.confirm(t('resetLayoutConfirm'))) return;
                  try {
                    window.localStorage.removeItem('demo:sigma-node-positions:v1');
                  } catch {
                    /* skip */
                  }
                  window.location.reload();
                }}
                className="rounded-md border border-[color:var(--color-border-soft)] px-2 py-1 font-mono text-[9px] uppercase tracking-[0.14em] text-[color:var(--color-text-quaternary)] transition-colors hover:text-[color:var(--color-text-primary)]"
                aria-label={t('resetLayoutAriaLabel')}
              >
                {t('resetLayoutButton')}
              </button>
            </div>
          ) : null}
        </div>

        <div className="pointer-events-auto flex items-center justify-end">
          <button
            type="button"
            onClick={() => setHelpOpen(true)}
            className="rounded-md border border-[color:var(--color-border-soft)] bg-[color:var(--color-panel)] px-2 py-1 font-mono text-[9px] uppercase tracking-[0.14em] text-[color:var(--color-text-quaternary)] transition-colors hover:text-[color:var(--color-text-primary)]"
            aria-label={t('shortcutsAriaLabel')}
          >
            {t('shortcutsButton')}
          </button>
        </div>
      </div>

      {helpOpen ? <HelpOverlay onClose={() => setHelpOpen(false)} /> : null}

      <style jsx>{`
        .sigma-range {
          -webkit-appearance: none;
          appearance: none;
          height: 2px;
          background: var(--color-divider);
          border-radius: 2px;
          outline: none;
        }
        .sigma-range::-webkit-slider-thumb {
          -webkit-appearance: none;
          appearance: none;
          width: 12px;
          height: 12px;
          border-radius: 50%;
          background: var(--color-indigo-accent);
          border: 2px solid rgba(14, 16, 22, 1);
          cursor: pointer;
        }
        .sigma-range::-moz-range-thumb {
          width: 12px;
          height: 12px;
          border-radius: 50%;
          background: var(--color-indigo-accent);
          cursor: pointer;
          border: none;
        }
      `}</style>
    </>
  );
}

function OverlayToggle({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string;
  hint: string;
  checked: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-2 text-[11px] text-[color:var(--color-text-secondary)] transition-colors hover:text-[color:var(--color-text-primary)]">
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate">{label}</span>
        <span className="truncate font-mono text-[9px] uppercase tracking-[0.12em] text-[color:var(--color-text-quaternary)]">
          {hint}
        </span>
      </span>
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="h-3.5 w-3.5 shrink-0 accent-[color:var(--color-indigo-brand)]"
      />
    </label>
  );
}

function SliderRow({
  label,
  min,
  max,
  step,
  value,
  display,
  onChange,
}: {
  label: string;
  min: number;
  max: number;
  step: number;
  value: number;
  display: (v: number) => string;
  onChange: (v: number) => void;
}) {
  return (
    <div>
      <div className="flex items-center justify-between">
        <span className="font-mono text-[9px] uppercase tracking-[0.14em] text-[color:var(--color-text-quaternary)]">
          {label}
        </span>
        <span className="font-mono text-[10px] tracking-[0.06em] text-[color:var(--color-text-secondary)]">
          {display(value)}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="sigma-range mt-1.5 w-full"
      />
    </div>
  );
}

function HelpOverlay({ onClose }: { onClose: () => void }) {
  const t = useTranslations('topologyWidgets.controls');
  const SHORTCUTS: { key: string; label: string }[] = [
    { key: '/', label: t('shortcutFocusSearch') },
    { key: '1–6', label: t('shortcutDepthHop') },
    { key: '0', label: t('shortcutDepthAll') },
    { key: t('shortcutKeyDoubleClick'), label: t('shortcutDoubleClick') },
    { key: 'Esc', label: t('shortcutEsc') },
    { key: '?', label: t('shortcutHelp') },
  ];

  const previousFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    previousFocusRef.current = document.activeElement as HTMLElement | null;
    const handler = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => {
      window.removeEventListener('keydown', handler);
      // 닫힐 때 trigger ("?" 도움말 버튼) 로 focus 복원 — 다른 modal 과 동일.
      previousFocusRef.current?.focus?.();
    };
  }, [onClose]);

  return (
    <div
      className="pointer-events-auto fixed inset-0 z-40 flex items-center justify-center bg-[color:rgba(0,0,0,0.5)]"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={t('helpDialogAriaLabel')}
        onClick={(e) => e.stopPropagation()}
        className="w-[320px] rounded-lg border border-[color:var(--color-divider)] bg-[color:var(--color-panel)] p-5 shadow-[0_20px_48px_rgba(0,0,0,0.6)]"
      >
        <div className="flex items-center justify-between">
          <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-[color:var(--color-text-quaternary)]">
            Keyboard
          </span>
          <button
            type="button"
            onClick={onClose}
            className="text-[color:var(--color-text-quaternary)] transition-colors hover:text-[color:var(--color-text-primary)]"
            aria-label={t('helpCloseAriaLabel')}
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
        <ul className="mt-3 space-y-2">
          {SHORTCUTS.map((s) => (
            <li
              key={s.key}
              className="flex items-center justify-between gap-3 text-[12px]"
            >
              <span className="text-[color:var(--color-text-secondary)]">
                {s.label}
              </span>
              <kbd className="rounded border border-[color:var(--color-overlay-3)] bg-[color:var(--color-overlay-1)] px-1.5 py-0.5 font-mono text-[10px] tracking-[0.08em] text-[color:var(--color-text-primary)]">
                {s.key}
              </kbd>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
