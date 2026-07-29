'use client';

import { useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';

import { cn } from '@/shared/lib/cn';
import {
  DEFAULT_FOOTPRINT,
  FOOTPRINT_PRESETS,
  FOOTPRINT_RANGES,
  applyFootprintPreset,
  useFootprint,
  writeFootprint,
  type FootprintPreference,
  type FootprintPresetName,
} from '@/shared/lib/appearance-preferences';
import { drawEdgeFootprints, drawNodeFootprint } from '@/shared/lib/footprint-glyph';

/**
 * 발자국 설정 — 「지도」 서브뷰의 두 번째 세그먼트.
 *
 * ## 왜 첫 화면이 프리셋인가
 *
 * 값은 8개지만 **결정은 하나**다: "얼마나 세게 말할까". 슬라이더 8개를 첫 화면에
 * 쏟으면 고르려는 사람이 아니라 컨트롤이 주목을 가져간다. 프리셋 3개가 그 하나의
 * 결정을 먼저 받고, 세부는 「직접 맞추기」 뒤에 있다.
 *
 * ## 미리보기는 지도와 같은 렌더러다
 *
 * `@/shared/lib/footprint-glyph` 의 같은 함수를 부른다. 미리보기를 따로 구현하면
 * 둘이 조용히 갈라지고, 그 순간 미리보기가 미리보기가 아니게 된다.
 */

const PRESET_ORDER: readonly FootprintPresetName[] = ['subtle', 'default', 'bold'];

/** 미리보기 캔버스의 CSS 크기 — 노드 둘 + 그 사이 선 하나가 들어가는 최소 폭. */
const PREVIEW_W = 260;
const PREVIEW_H = 92;

function FootprintPreview({ pref }: { pref: FootprintPreference }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = PREVIEW_W * dpr;
    canvas.height = PREVIEW_H * dpr;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const root = getComputedStyle(document.documentElement);
    const read = (name: string, fallback: string) => {
      const raw = root.getPropertyValue(name).trim();
      return raw === '' ? fallback : raw;
    };
    const hex = read(pref.tone === 'indigo' ? '--color-indigo-accent' : '--color-footprint-trail', '#e8c47a');
    const parsed = /^#?([0-9a-f]{6})$/i.exec(hex);
    const n = parsed ? parseInt(parsed[1], 16) : 0xe8c47a;
    const ink = [(n >> 16) & 255, (n >> 8) & 255, n & 255] as const;

    ctx.fillStyle = read('--topology-v2-canvas-bg-near', '#0a0a0d');
    ctx.fillRect(0, 0, PREVIEW_W, PREVIEW_H);

    // 노드 둘 + 관계선 하나 — 지도에서 발자국이 앉는 두 자리를 다 보여준다.
    const a = { x: 46, y: PREVIEW_H / 2 };
    const b = { x: PREVIEW_W - 46, y: PREVIEW_H / 2 };
    const r = 13;
    ctx.strokeStyle = read('--topology-v2-edge-dim', 'rgba(255,255,255,0.11)');
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
    for (const p of [a, b]) {
      ctx.beginPath();
      ctx.roundRect(p.x - r, p.y - r, r * 2, r * 2, 4);
      ctx.fillStyle = '#191920';
      ctx.fill();
      ctx.strokeStyle = '#48484f';
      ctx.stroke();
    }

    const paint = { ctx, pref, ink: ink as unknown as readonly [number, number, number] };
    if (pref.onEdges) drawEdgeFootprints(paint, a.x, a.y, b.x, b.y, pref.opacity);
    drawNodeFootprint(paint, a.x, a.y, r, pref.opacity);
    drawNodeFootprint(paint, b.x, b.y, r, pref.opacity);
  }, [pref]);

  return (
    <canvas
      ref={canvasRef}
      data-testid="app-settings-footprint-preview"
      aria-hidden="true"
      style={{ width: PREVIEW_W, height: PREVIEW_H }}
      className="w-full rounded-lg border border-[color:var(--color-border-soft)]"
    />
  );
}

function Slider({
  label,
  value,
  range,
  format,
  onChange,
  testId,
}: {
  label: string;
  value: number;
  range: { min: number; max: number; step: number };
  format: (v: number) => string;
  onChange: (v: number) => void;
  testId: string;
}) {
  return (
    <label className="flex items-center gap-3 px-1 py-1.5">
      <span className="w-24 shrink-0 text-label text-[color:var(--color-text-secondary)]">{label}</span>
      <input
        type="range"
        data-testid={testId}
        min={range.min}
        max={range.max}
        step={range.step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="min-w-0 flex-1 accent-[color:var(--color-indigo-accent)]"
      />
      <span className="w-12 shrink-0 text-right font-mono text-caption text-[color:var(--color-text-tertiary)]">
        {format(value)}
      </span>
    </label>
  );
}

function Choice<T extends string | boolean>({
  label,
  value,
  options,
  onChange,
  testId,
}: {
  label: string;
  value: T;
  options: readonly { value: T; label: string }[];
  onChange: (v: T) => void;
  testId: string;
}) {
  return (
    <div className="flex items-center gap-3 px-1 py-1.5">
      <span className="w-24 shrink-0 text-label text-[color:var(--color-text-secondary)]">{label}</span>
      <div role="radiogroup" aria-label={label} data-testid={testId} className="flex gap-1.5">
        {options.map((option) => {
          const active = option.value === value;
          return (
            <button
              key={String(option.value)}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => onChange(option.value)}
              className={cn(
                'rounded-chip border px-2.5 py-1 text-caption transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-indigo-a46)]',
                active
                  ? 'border-[color:var(--color-indigo-accent)] bg-[color:var(--color-indigo-line-a13)] text-[color:var(--color-indigo-accent)]'
                  : 'border-[color:var(--color-border-soft)] text-[color:var(--color-text-tertiary)] hover:border-[color:var(--color-border-strong)]',
              )}
            >
              {option.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function FootprintSettings() {
  const t = useTranslations('nav.settingsMenu.footprint');
  const pref = useFootprint();
  const [detailOpen, setDetailOpen] = useState(false);
  const set = (patch: Partial<FootprintPreference>) => writeFootprint({ ...pref, ...patch });

  return (
    <div className="grid gap-3" data-testid="app-settings-footprint">
      <p className="break-keep text-caption leading-4 text-[color:var(--color-text-quaternary)]">
        {t('caption')}
      </p>
      <FootprintPreview pref={pref} />

      <div role="radiogroup" aria-label={t('presetLabel')} className="grid grid-cols-3 gap-2">
        {PRESET_ORDER.map((name) => {
          // "지금 이 프리셋인가" 는 프리셋이 정하는 값들만 비교한다 — 색·배치처럼
          // 프리셋이 건드리지 않는 값이 달라도 프리셋은 여전히 그 프리셋이다.
          const preset: Partial<FootprintPreference> = FOOTPRINT_PRESETS[name];
          const active = (Object.entries(preset) as [keyof FootprintPreference, unknown][]).every(
            ([key, want]) => pref[key] === want,
          );
          return (
            <button
              key={name}
              type="button"
              role="radio"
              aria-checked={active}
              data-testid={`app-settings-footprint-preset-${name}`}
              onClick={() => writeFootprint(applyFootprintPreset(pref, name))}
              className={cn(
                'rounded-lg border px-2 py-2 text-caption transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-indigo-a46)]',
                active
                  ? 'border-[color:var(--color-indigo-accent)] bg-[color:var(--color-indigo-line-a13)] text-[color:var(--color-indigo-accent)]'
                  : 'border-[color:var(--color-border-soft)] text-[color:var(--color-text-tertiary)] hover:border-[color:var(--color-border-strong)]',
              )}
            >
              {t(`preset.${name}`)}
            </button>
          );
        })}
      </div>

      <button
        type="button"
        data-testid="app-settings-footprint-detail-toggle"
        aria-expanded={detailOpen}
        onClick={() => setDetailOpen((open) => !open)}
        className="justify-self-start rounded-chip px-1 py-1 text-label text-[color:var(--color-text-tertiary)] transition-colors hover:text-[color:var(--color-text-primary)]"
      >
        {detailOpen ? t('detailHide') : t('detailShow')}
      </button>

      {detailOpen ? (
        <div className="grid gap-0.5 rounded-lg border border-[color:var(--color-border-soft)] p-2">
          <Slider
            label={t('size')}
            testId="app-settings-footprint-size"
            value={pref.size}
            range={FOOTPRINT_RANGES.size}
            format={(v) => `${v}px`}
            onChange={(size) => set({ size })}
          />
          <Choice
            label={t('fillLabel')}
            testId="app-settings-footprint-fill"
            value={pref.filled}
            options={[
              { value: true, label: t('fillSolid') },
              { value: false, label: t('fillOutline') },
            ]}
            onChange={(filled) => set({ filled })}
          />
          {/* 테두리 굵기는 **윤곽선일 때만** 보인다 — 채움 상태에서는 화면에
              아무 영향이 없어, 노출해 두면 "만져도 안 바뀌는 컨트롤"이 된다. */}
          {pref.filled ? null : (
            <Slider
              label={t('strokeWidth')}
              testId="app-settings-footprint-stroke"
              value={pref.strokeWidth}
              range={FOOTPRINT_RANGES.strokeWidth}
              format={(v) => `${v.toFixed(1)}px`}
              onChange={(strokeWidth) => set({ strokeWidth })}
            />
          )}
          <Slider
            label={t('opacity')}
            testId="app-settings-footprint-opacity"
            value={pref.opacity}
            range={FOOTPRINT_RANGES.opacity}
            format={(v) => `${Math.round(v * 100)}%`}
            onChange={(opacity) => set({ opacity })}
          />
          <Choice
            label={t('toneLabel')}
            testId="app-settings-footprint-tone"
            value={pref.tone}
            options={[
              { value: 'amber' as const, label: t('toneAmber') },
              { value: 'indigo' as const, label: t('toneIndigo') },
            ]}
            onChange={(tone) => set({ tone })}
          />
          <Slider
            label={t('bloom')}
            testId="app-settings-footprint-bloom"
            value={pref.bloom}
            range={FOOTPRINT_RANGES.bloom}
            format={(v) => (v === 0 ? t('bloomOff') : `${v}px`)}
            onChange={(bloom) => set({ bloom })}
          />
          <Slider
            label={t('gap')}
            testId="app-settings-footprint-gap"
            value={pref.gap}
            range={FOOTPRINT_RANGES.gap}
            format={(v) => `${v}px`}
            onChange={(gap) => set({ gap })}
          />
          <Choice
            label={t('onEdgesLabel')}
            testId="app-settings-footprint-on-edges"
            value={pref.onEdges}
            options={[
              { value: true, label: t('onEdgesYes') },
              { value: false, label: t('onEdgesNo') },
            ]}
            onChange={(onEdges) => set({ onEdges })}
          />
          {pref.onEdges ? (
            <>
              <Choice
                label={t('densityLabel')}
                testId="app-settings-footprint-density"
                value={pref.edgeDensity}
                options={[
                  { value: 'sparse' as const, label: t('densitySparse') },
                  { value: 'dense' as const, label: t('densityDense') },
                ]}
                onChange={(edgeDensity) => set({ edgeDensity })}
              />
              <Choice
                label={t('placementLabel')}
                testId="app-settings-footprint-placement"
                value={pref.placement}
                options={[
                  { value: 'right' as const, label: t('placementRight') },
                  { value: 'both' as const, label: t('placementBoth') },
                ]}
                onChange={(placement) => set({ placement })}
              />
            </>
          ) : null}
          <button
            type="button"
            data-testid="app-settings-footprint-reset"
            onClick={() => writeFootprint(DEFAULT_FOOTPRINT)}
            className="mt-1 justify-self-start rounded-chip px-1 py-1 text-label text-[color:var(--color-text-quaternary)] transition-colors hover:text-[color:var(--color-text-primary)]"
          >
            {t('reset')}
          </button>
        </div>
      ) : null}
    </div>
  );
}
