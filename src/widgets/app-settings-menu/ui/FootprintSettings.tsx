'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { ICON_SIZE } from '@/shared/ui/icon-size';
import { useTranslations } from 'next-intl';

import { controlClass } from '@/shared/ui/control-class';
import { SegmentedControl } from '@/shared/ui/segmented-control';
import { Chip } from '@/shared/ui/controls';
import { RowDisclosure } from '@/shared/ui/row-disclosure';
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
  FOOTPRINT_TONE_FALLBACK,
  FOOTPRINT_TONE_TOKEN,
} from '@/shared/lib/appearance-preferences';
import { drawFootprintSteps } from '@/shared/lib/footprint-glyph';
import { drawStarEmission } from '@/shared/lib/star-emission';

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
    /*
     * ⚠️ **The same map the canvas reads.** This branched two ways after a third tone landed,
     * so picking starlight painted the preview amber while the map painted white — and this
     * module's own header says a preview that drifts stops being a preview. There is one
     * table now (`FOOTPRINT_TONE_TOKEN`), and its fallback carries the same three values.
     */
    const fallback = FOOTPRINT_TONE_FALLBACK[pref.tone];
    const hex = read(FOOTPRINT_TONE_TOKEN[pref.tone], '');
    const parsed = /^#?([0-9a-f]{6})$/i.exec(hex);
    const ink = parsed
      ? ([
          (parseInt(parsed[1], 16) >> 16) & 255,
          (parseInt(parsed[1], 16) >> 8) & 255,
          parseInt(parsed[1], 16) & 255,
        ] as const)
      : fallback;

    ctx.fillStyle = read('--map-canvas-bg-near', '#0a0a0d');
    ctx.fillRect(0, 0, PREVIEW_W, PREVIEW_H);

    /*
     * ⚠️ **This preview used to draw a different mark from the map**, and the caption three
     * lines above it described the map. It stamped the star *glyph* — a sparkle beside each
     * node and a row of them along the relation — while the topology canvas lit the node
     * itself, so the panel's words and its picture disagreed and the picture showed the
     * notation the owner had already turned down (design-infoviz, 2026-09-10). It now paints
     * two walked stops: the same emission the map paints (`shared/lib/star-emission.ts`), the
     * same walked line, the same ordinals, the same chevron.
     */
    const r = 15;
    const inset = 76;
    const a = { x: inset, y: PREVIEW_H / 2 };
    const b = { x: PREVIEW_W - inset, y: PREVIEW_H / 2 };
    const inkHex = parsed ? `#${parsed[1]}` : `#${fallback.map((c) => c.toString(16).padStart(2, '0')).join('')}`;
    const bodyPathAt = (at: { x: number; y: number }, radius: number) => {
      const path = new Path2D();
      path.roundRect(at.x - radius, at.y - radius, radius * 2, radius * 2, 5);
      return path;
    };

    // The node bodies first, so the light lands on them rather than under them.
    for (const p of [a, b]) {
      ctx.beginPath();
      ctx.roundRect(p.x - r, p.y - r, r * 2, r * 2, 5);
      ctx.fillStyle = '#191920';
      ctx.fill();
      ctx.strokeStyle = '#48484f';
      ctx.stroke();
    }

    // The walked relation: a halo under the ink, in the same star ink, and the direction
    // chevron past its midpoint — the one mark that says which way the walk went in a still
    // frame and for a reader who has asked for reduced motion.
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineCap = 'round';
    ctx.globalAlpha = pref.opacity * 0.3;
    ctx.strokeStyle = inkHex;
    ctx.lineWidth = 1 + 3.2 * 2;
    // From silhouette to silhouette, the way the map draws a relation — a line run to the node
    // centres would show through the bloom's hole and read as a notch in the node.
    ctx.beginPath();
    ctx.moveTo(a.x + r, a.y);
    ctx.lineTo(b.x - r, b.y);
    ctx.stroke();
    ctx.globalAlpha = pref.opacity;
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(a.x + r, a.y);
    ctx.lineTo(b.x - r, b.y);
    ctx.stroke();
    const headX = a.x + (b.x - a.x) * 0.62;
    const arm = 5;
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(headX - arm, a.y - arm * 0.86);
    ctx.lineTo(headX + arm * 0.4, a.y);
    ctx.lineTo(headX - arm, a.y + arm * 0.86);
    ctx.stroke();
    ctx.restore();

    // The two stops.
    for (const p of [a, b]) {
      drawStarEmission(ctx, {
        x: p.x,
        y: p.y,
        radius: r,
        ink: inkHex,
        lit: pref.opacity,
        bodyPath: (radius) => bodyPathAt(p, radius),
      });
    }

    // The ordinals — the channel that actually carries the walk's order.
    const paint = { ctx, pref, ink: ink as unknown as readonly [number, number, number] };
    drawFootprintSteps(paint, a.x, a.y, r, pref.opacity, [1], inkHex);
    drawFootprintSteps(paint, b.x, b.y, r, pref.opacity, [2], inkHex);
  }, [pref]);

  return (
    <canvas
      ref={canvasRef}
      data-testid="app-settings-footprint-preview"
      aria-hidden="true"
      style={{ height: PREVIEW_H }}
      className="w-full rounded-card border border-[color:var(--color-border-soft)] bg-[color:var(--map-canvas-bg-near)]"
    />
  );
}

export function FootprintSettings() {
  const t = useTranslations('nav.settingsMenu.footprint');
  const pref = useFootprint();
  const [detailOpen, setDetailOpen] = useState(false);
  const detailId = useId();
  const set = (patch: Partial<FootprintPreference>) => writeFootprint({ ...pref, ...patch });

  return (
    <div className="grid min-w-0 gap-3" data-testid="app-settings-footprint">
      <p className="break-keep text-label text-[color:var(--color-text-tertiary)]">
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

      <div className="min-w-0">
      <Chip
        size="lg"
        tone="secondary"
        data-testid="app-settings-footprint-detail-toggle"
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

      <RowDisclosure open={detailOpen} id={detailId} className="pt-3">
        <div className="grid min-w-0 gap-0.5 rounded-card border border-[color:var(--color-border-soft)] p-2">
          <Slider
            label={t('size')}
            testId="app-settings-footprint-size"
            value={pref.size}
            range={FOOTPRINT_RANGES.size}
            format={(v) => `${v}px`}
            onChange={(size) => set({ size })}
          />
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
              { value: 'star' as const, label: t('toneStar') },
              { value: 'amber' as const, label: t('toneAmber') },
              { value: 'indigo' as const, label: t('toneIndigo') },
            ]}
            onChange={(tone) => set({ tone })}
          />
          <Slider
            label={t('gap')}
            testId="app-settings-footprint-gap"
            value={pref.gap}
            range={FOOTPRINT_RANGES.gap}
            format={(v) => `${v}px`}
            onChange={(gap) => set({ gap })}
          />
          {/*
            ⚠️ Six controls stood here until 2026-09-10: fill, outline weight, bloom, whether
            the mark repeated along the relation, how densely, and on which side. Every one of
            them shaped a *glyph* the map no longer draws — the owner asked for the footprint to
            go and for the node itself to light — so each was a control a person could spend
            attention on and get nothing back from. `FootprintPreference` records what happens
            to a preference saved while they existed.
          */}
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
      </RowDisclosure>
      </div>
    </div>
  );
}
