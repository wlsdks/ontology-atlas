'use client';

import { useEffect, useRef, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { ICON_SIZE } from '@/shared/ui/icon-size';
import { useTranslations } from 'next-intl';

import { controlClass } from '@/shared/ui/control-class';
import { SegmentedControl } from '@/shared/ui/segmented-control';
import { Chip } from '@/shared/ui/controls';
import { Choice, DETAIL_TOGGLE_CHIP, RESET_LINK_INK, Slider } from './settings-primitives';
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
 * Footprint settings — the 「Map」 subview's second segment.
 *
 * ## Why the first screen is presets
 *
 * There are 8 values but **one decision**: "how loudly should it speak". Pouring 8
 * sliders onto the first screen lets the controls, not the person choosing, take
 * the attention. Three presets take that one decision first, and the details sit
 * behind 「Adjust Manually」 (adjust manually).
 *
 * ## The preview uses the same renderer as the map
 *
 * It calls the same functions from `@/shared/lib/footprint-glyph`. A separate
 * preview implementation would silently diverge, and at that moment the preview
 * stops being a preview.
 */

const PRESET_ORDER: readonly FootprintPresetName[] = ['subtle', 'default', 'bold'];

/**
 * Preview height in px — **fixed**. The width fills the pane.
 *
 * The width used to be fixed at 260px too, leaving a small box floating inside a
 * wide pane (owner: *"It's just ugly."* — that's just ugly). The preview is this
 * section's protagonist, so it must fill the pane, and the height must be fixed so
 * the window does not wobble when sections change.
 */
const PREVIEW_H = 176;

function FootprintPreview({ pref }: { pref: FootprintPreference }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    // The width is decided by layout, so the real width is measured at render time to size the backing store.
    const PREVIEW_W = Math.max(240, Math.round(canvas.getBoundingClientRect().width));
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
    const hex = read(pref.tone === 'indigo' ? '--color-footprint-trail-indigo' : '--color-footprint-trail', '#e8c47a');
    const parsed = /^#?([0-9a-f]{6})$/i.exec(hex);
    const n = parsed ? parseInt(parsed[1], 16) : 0xe8c47a;
    const ink = [(n >> 16) & 255, (n >> 8) & 255, n & 255] as const;

    ctx.fillStyle = read('--topology-v2-canvas-bg-near', '#0a0a0d');
    ctx.fillRect(0, 0, PREVIEW_W, PREVIEW_H);

    // Two nodes plus one relation line — both places a footprint sits on the map.
    const r = 15;
    const inset = 76;
    const a = { x: inset, y: PREVIEW_H / 2 };
    const b = { x: PREVIEW_W - inset, y: PREVIEW_H / 2 };
    ctx.strokeStyle = read('--topology-v2-edge-dim', 'rgba(255,255,255,0.11)');
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
    for (const p of [a, b]) {
      ctx.beginPath();
      ctx.roundRect(p.x - r, p.y - r, r * 2, r * 2, 5);
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
      style={{ height: PREVIEW_H }}
      className="w-full rounded-card border border-[color:var(--color-border-soft)] bg-[color:var(--topology-v2-canvas-bg-near)]"
    />
  );
}

export function FootprintSettings() {
  const t = useTranslations('nav.settingsMenu.footprint');
  const pref = useFootprint();
  const [detailOpen, setDetailOpen] = useState(false);
  const set = (patch: Partial<FootprintPreference>) => writeFootprint({ ...pref, ...patch });

  return (
    <div className="grid min-w-0 gap-3" data-testid="app-settings-footprint">
      <p className="break-keep text-label text-[color:var(--color-text-quaternary)]">
        {t('caption')}
      </p>
      <FootprintPreview pref={pref} />

      {/*
        The presets are **one segmented row**. They used to be large buttons splitting
        the pane into thirds, so all three dominated the panel — but this is a small
        decision, "pick one intensity". A control's visual weight should follow the
        weight of its decision.
      */}
      {/* "Is this the current preset" compares only the values the preset sets — a
          preset is still that preset even if colour or layout, which it does not
          touch, differ. Matching no preset leaves the value matching no option → zero
          checked (APG: the first item is the tab stop), and the primitive supports
          that state directly. */}
      <SegmentedControl
        ariaLabel={t('presetLabel')}
        className="justify-self-start"
        value={
          PRESET_ORDER.find((name) => {
            const preset: Partial<FootprintPreference> = FOOTPRINT_PRESETS[name];
            return (Object.entries(preset) as [keyof FootprintPreference, unknown][]).every(
              ([key, want]) => pref[key] === want,
            );
          }) ?? ''
        }
        onChange={(name) => {
          if (name) writeFootprint(applyFootprintPreset(pref, name as (typeof PRESET_ORDER)[number]));
        }}
        options={PRESET_ORDER.map((name) => ({
          value: name as string,
          label: t(`preset.${name}`),
          testId: `app-settings-footprint-preset-${name}`,
        }))}
      />

      <Chip
        size="lg"
        tone="secondary"
        data-testid="app-settings-footprint-detail-toggle"
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
          {/* Border width is visible **only in outline mode** — in the filled state it
              has no effect on screen, so leaving it exposed makes it "a control that
              does nothing when you touch it". */}
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
            className={controlClass({
              shape: 'link',
              size: 'md',
              tone: 'muted',
              className: `${RESET_LINK_INK} mt-1`,
            })}
          >
            {t('reset')}
          </button>
        </div>
      ) : null}
    </div>
  );
}
