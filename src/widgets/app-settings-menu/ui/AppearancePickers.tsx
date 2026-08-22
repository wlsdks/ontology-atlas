'use client';

import { useTranslations } from 'next-intl';
import { cn } from '@/shared/lib/cn';
import { useRovingRadioGroup } from '@/shared/lib/use-roving-radio-group';
import {
  ACCENTS,
  ACCENT_ATTRIBUTE,
  CANVAS_BACKGROUNDS,
  DEFAULT_ACCENT,
  GLYPH_SETS,
  MAP_ARRANGEMENTS,
  useAccent,
  useCanvasBackground,
  useGlyphSet,
  useMapArrangement,
  writeAccent,
  writeCanvasBackground,
  writeGlyphSet,
  writeMapArrangement,
  type Accent,
  type CanvasBackground,
  type GlyphSet,
  type MapArrangement,
} from '@/shared/lib/appearance-preferences';
import { controlClass } from '@/shared/ui/control-class';
import { TopologyV2KindGlyph } from '@/shared/ui/topology-v2-kind-glyph';

/**
 * The **selection ink** for both pickers — this is a radio group, so it does not
 * use the value layer's `active`.
 *
 * `active` expresses **pressed**, so its border is a pale
 * `--color-indigo-pale-a28`. What is needed here is not pressed but **selected**,
 * and in a grid where you pick one of four a pale border weakens "which one is the
 * current value". No new value is minted; the present ink stays as it is — when
 * the value layer gains a «selected» axis, this is what gets deleted.
 */
const PICKER_TILE_INK = (active: boolean) =>
  active
    ? 'border-[color:var(--color-indigo-accent)] bg-[color:var(--color-indigo-line-a13)]'
    : 'border-[color:var(--color-border-soft)] hover:border-[color:var(--color-border-strong)]';

/** Grid-cell placement plus focus ring — the layer the value layer does not supply. */
const PICKER_TILE_FRAME =
  'w-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-indigo-focus-ring)]';

/*
 * **Why `size: 'md'` — a measurement caught it.**
 *
 * `sm` was chosen at first, as the closest match to the previous inset
 * (`p-1.5`/`p-2`). But measuring the build showed the tile's computed `font-size`
 * had dropped from 12.5 to **9.5px** — `tile/sm` carries `text-caption`.
 *
 * The text on screen does not change (the label `<span>` has its own `text-label`).
 * It was reverted anyway because **this file is the root sheet**:
 * `settings-sheet-type-dialect.contract.test.ts` forbids 9.5px here, and that gate
 * only sees a literal `text-caption` in the source. Bringing it in through the
 * value layer would **break the specification while passing the gate**. That is
 * evasion, not compliance.
 */

/**
 * Personalisation pickers (Phase 5 #20/#21,
 * `docs/plans/DESIGN-OVERHAUL-2026-07-25.md`) — the canvas background (3 options)
 * and node icon (2 options) rows in the settings sheet's [screen] group.
 *
 * The previews are live mini swatches, not screenshots: the background is a small
 * SVG drawn with the real `--canvas-bg-*` and grid tokens, and the icon set is a
 * mini glyph row rendering the real `TopologyV2KindGlyph` per set. The current
 * choice carries an indigo ring. Choosing writes to the app-wide store and the map
 * canvas and every DOM glyph swap immediately with it.
 */

const PREVIEW_KINDS = ['project', 'domain', 'capability', 'element'] as const;

/**
 * Background preview — a static miniature drawn with the real background ink tokens.
 *
 * **It does not move.** All three are moving backgrounds, but the swatch is a still
 * image: four particle loops running at once in the settings sheet means the
 * swatches, not the person choosing, take the attention. The preview says only
 * "what texture is this", and the movement is seen on the map after choosing.
 */
function CanvasBgSwatch({ variant }: { variant: CanvasBackground }) {
  const ink = 'rgba(var(--canvas-bg-particle-rgb), 0.5)';
  const inkFaint = 'rgba(var(--canvas-bg-particle-rgb), 0.24)';
  return (
    /*
     * The viewBox is **the card's real ratio** (240×56). Stretching a small viewBox
     * magnifies the pattern wholesale so it reads as fragments rather than texture
     * (measured: filling 256px of width from 48×30 is a 5.3× blow-up). Density is
     * set directly here to match the visible size.
     */
    <svg
      viewBox="0 0 240 56"
      preserveAspectRatio="xMidYMid slice"
      className="h-[56px] w-full rounded-chip"
      aria-hidden="true"
      data-canvas-bg-swatch={variant}
    >
      <rect x="0" y="0" width="240" height="56" fill="var(--topology-v2-canvas-bg-near)" />
      {variant === 'dot' ? (
        <g stroke="var(--topology-v2-grid-major)" strokeWidth="1">
          {[20, 40, 60, 80, 100, 120, 140, 160, 180, 200, 220].map((x) => (
            <line key={x} x1={x} y1="0" x2={x} y2="56" />
          ))}
          {[14, 28, 42].map((y) => (
            <line key={y} x1="0" y1={y} x2="240" y2={y} />
          ))}
        </g>
      ) : variant === 'web' ? (
        <g>
          {/* Without `fill="none"` an open polyline is **filled** with the default black and becomes a triangle. */}
          <g stroke={inkFaint} strokeWidth="0.8" fill="none">
            <path d="M18 16 L52 34 L88 12 L124 30 L160 14 L196 32 L228 18" />
            <path d="M52 34 L60 50 M124 30 L136 48 M196 32 L204 47" />
            <path d="M18 16 L88 12 M88 12 L160 14" />
          </g>
          <g fill={ink}>
            {[
              [18, 16], [52, 34], [88, 12], [124, 30], [160, 14], [196, 32], [228, 18],
              [60, 50], [136, 48], [204, 47],
            ].map(([cx, cy]) => (
              <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r="1.6" />
            ))}
          </g>
        </g>
      ) : (
        /* Depth dots — the same point in three layers. Size and brightness differ per
           layer so depth reads even in a still frame, and the layers offset against
           each other when the map moves. */
        <g fill={ink}>
          {[
            { r: 0.9, o: 0.5, step: 33, offset: 8 },
            { r: 1.2, o: 0.78, step: 21, offset: 5 },
            { r: 1.6, o: 1, step: 13, offset: 3 },
          ].map((layer, li) => (
            <g key={li} opacity={layer.o}>
              {Array.from({ length: Math.ceil(240 / layer.step) }).flatMap((_, xi) =>
                Array.from({ length: Math.ceil(56 / layer.step) }).map((__, yi) => (
                  <circle
                    key={`${xi}-${yi}`}
                    cx={layer.offset + xi * layer.step}
                    cy={layer.offset + yi * layer.step}
                    r={layer.r}
                  />
                )),
              )}
            </g>
          ))}
        </g>
      )}
    </svg>
  );
}

export function CanvasBackgroundPicker() {
  const t = useTranslations('nav.settingsMenu');
  const value = useCanvasBackground();
  /*
   * The container does not converge onto either of the primitive's two canonical
   * shapes (well, chip row) — it is a grid tile holding a preview swatch, and the
   * active ink is split across parent and child (see the gate comment below), so
   * `shape:'tile'` has to stay. So the container stays where it is and **only the
   * behaviour** comes from the hook (2026-08-15 (8)).
   */
  const group = useRovingRadioGroup({
    value,
    values: CANVAS_BACKGROUNDS,
    onChange: writeCanvasBackground,
  });
  return (
    /*
     * It has no margin of its own — this picker fills the LNB's 「지도 배경」 pane
     * entirely, so the pane owns the margin. If both had one, the left starting line
     * would differ per section (measured: 20px in other sections, 32px only here).
     */
    <div data-testid="app-settings-canvas-background">
      <p className="text-body text-[color:var(--color-text-secondary)]">{t('canvasBgLabel')}</p>
      <p className="mt-0.5 break-keep text-label text-[color:var(--color-text-quaternary)]">
        {t('canvasBgCaption')}
      </p>
      <div {...group.groupProps} aria-label={t('canvasBgLabel')} className="mt-3 grid grid-cols-2 gap-2.5">
        {CANVAS_BACKGROUNDS.map((variant, index) => {
          const active = variant === value;
          return (
            <button
              key={variant}
              {...group.itemProps(index)}
              type="button"
              data-testid={`app-settings-canvas-bg-${variant}`}
              className={controlClass({
                shape: 'tile',
                size: 'md',
                className: cn(PICKER_TILE_FRAME, PICKER_TILE_INK(active)),
              })}
            >
              <CanvasBgSwatch variant={variant} />
              <span
                className={cn(
                  'text-label',
                  /* The active tile's parent carries a line-a13 tint, and marker
                     indigo over that composite is 4.12:1 — below AA (measured with
                     the open-surface instrument). The ink that carries the tint is
                     soft. Ink and tint are split across parent and child, which the
                     same-tag inventory could not see, so this comment is the gate —
                     the runtime decision belongs to a11y-open-surfaces. */
                  active
                    ? 'text-[color:var(--color-indigo-text-soft)]'
                    : 'text-[color:var(--color-text-tertiary)]',
                )}
              >
                {t(`canvasBg.${variant}`)}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function GlyphSetPicker() {
  const t = useTranslations('nav.settingsMenu');
  const value = useGlyphSet();
  /* Container in place, behaviour in the hook, for the same reason as above. */
  const group = useRovingRadioGroup({ value, values: GLYPH_SETS, onChange: writeGlyphSet });
  return (
    <div className="px-3 py-2.5" data-testid="app-settings-glyph-set">
      <p className="text-body text-[color:var(--color-text-secondary)]">{t('glyphSetLabel')}</p>
      <p className="mt-0.5 break-keep text-label text-[color:var(--color-text-quaternary)]">
        {t('glyphSetCaption')}
      </p>
      <div {...group.groupProps} aria-label={t('glyphSetLabel')} className="mt-2 grid grid-cols-2 gap-2">
        {GLYPH_SETS.map((set: GlyphSet, index) => {
          const active = set === value;
          return (
            <button
              key={set}
              {...group.itemProps(index)}
              type="button"
              data-testid={`app-settings-glyph-set-${set}`}
              className={controlClass({
                shape: 'tile',
                size: 'md',
                className: cn(PICKER_TILE_FRAME, PICKER_TILE_INK(active)),
              })}
            >
              <span className="flex items-center gap-1.5">
                {PREVIEW_KINDS.map((kind) => (
                  <TopologyV2KindGlyph key={kind} kind={kind} glyphSet={set} size={15} />
                ))}
              </span>
              <span
                className={cn(
                  'text-label',
                  /* The active tile's parent carries a line-a13 tint, and marker
                     indigo over that composite is 4.12:1 — below AA (measured with
                     the open-surface instrument). The ink that carries the tint is
                     soft. Ink and tint are split across parent and child, which the
                     same-tag inventory could not see, so this comment is the gate —
                     the runtime decision belongs to a11y-open-surfaces. */
                  active
                    ? 'text-[color:var(--color-indigo-text-soft)]'
                    : 'text-[color:var(--color-text-tertiary)]',
                )}
              >
                {t(`glyphSet.${set}`)}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/**
 * Accent swatch — a still preview drawn with the real tokens.
 *
 * `data-accent` is set **on the swatch itself**, so the indigo tile is drawn with
 * indigo values (the real colour is visible without selecting it). The name matches
 * the app-wide attribute, so one CSS block feeds both places — no separate
 * preview-only colours are written.
 */
function AccentSwatch({ variant }: { variant: Accent }) {
  return (
    <span
      {...(variant === DEFAULT_ACCENT ? {} : { [ACCENT_ATTRIBUTE]: variant })}
      aria-hidden
      className="flex items-center gap-1"
    >
      <span className="h-4 w-4 rounded-full bg-[color:var(--color-indigo-brand)]" />
      <span className="h-4 w-4 rounded-full bg-[color:var(--color-indigo-accent)]" />
      <span className="h-4 w-4 rounded-full bg-[color:var(--color-indigo-a24)]" />
    </span>
  );
}

/**
 * Accent picker (2026-08-18) — choose the app's only colour between ember and
 * indigo.
 *
 * The values, and the explanation of **what this setting cannot change** (the baked
 * icon), live in the `Accent` comment in
 * `src/shared/lib/appearance-preferences.ts`. Here a one-line caption puts that
 * limit on screen too — without it, a Dock icon that does not change reads as a
 * defect.
 */
/**
 * Arrangement picker (2026-08-18) — what decides the 3D dome's **bearings**.
 *
 * That this picker's copy is **two questions** rather than 「스타일」 is the design.
 * Listing arrangements as styles turns them into N mediocre views on the spot, and
 * this repository already has a precedent for rejecting «mode proliferation». Each
 * option carries the question it answers, and a new option has to bring a new
 * question to get in.
 *
 * Geometry, determinism and the rejected families: the `DomeArrangement` doc-block
 * in `topology-map-v2/model/dome-view.ts`.
 */
export function MapArrangementPicker() {
  const t = useTranslations('nav.settingsMenu');
  const value = useMapArrangement();
  const group = useRovingRadioGroup({
    value,
    values: MAP_ARRANGEMENTS,
    onChange: writeMapArrangement,
  });
  return (
    <div className="px-3 py-2.5" data-testid="app-settings-arrangement">
      <p className="text-body text-[color:var(--color-text-secondary)]">{t('arrangementLabel')}</p>
      <p className="mt-0.5 break-keep text-label text-[color:var(--color-text-quaternary)]">
        {t('arrangementCaption')}
      </p>
      <div
        {...group.groupProps}
        aria-label={t('arrangementLabel')}
        className="mt-2 grid grid-cols-2 gap-2"
      >
        {MAP_ARRANGEMENTS.map((arrangement: MapArrangement, index) => {
          const active = arrangement === value;
          return (
            <button
              key={arrangement}
              {...group.itemProps(index)}
              type="button"
              data-testid={`app-settings-arrangement-${arrangement}`}
              className={controlClass({
                shape: 'tile',
                size: 'md',
                className: cn(PICKER_TILE_FRAME, PICKER_TILE_INK(active)),
              })}
            >
              <span
                className={cn(
                  'text-label',
                  active
                    ? 'text-[color:var(--color-indigo-text-soft)]'
                    : 'text-[color:var(--color-text-tertiary)]',
                )}
              >
                {t(`arrangement.${arrangement}`)}
              </span>
              {/* Each option carries the question it answers — this single line is
                  what separates «a style menu» from «two questions».
                  Why `text-label` (11px): the settings sheet's dialect is «pressable
                  text = text-body · description = text-label», and `text-caption`
                  (9.5px) is allowed only in the one uppercase-eyebrow position
                  (`settings-sheet-type-dialect` contract). */}
              <span className="break-keep text-label text-[color:var(--color-text-quaternary)]">
                {t(`arrangementHint.${arrangement}`)}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function AccentPicker() {
  const t = useTranslations('nav.settingsMenu');
  const value = useAccent();
  /* Container in place, behaviour in the hook, for the same reason as the two above. */
  const group = useRovingRadioGroup({ value, values: ACCENTS, onChange: writeAccent });
  return (
    <div className="px-3 py-2.5" data-testid="app-settings-accent">
      <p className="text-body text-[color:var(--color-text-secondary)]">{t('accentLabel')}</p>
      <p className="mt-0.5 break-keep text-label text-[color:var(--color-text-quaternary)]">
        {t('accentCaption')}
      </p>
      <div {...group.groupProps} aria-label={t('accentLabel')} className="mt-2 grid grid-cols-2 gap-2">
        {ACCENTS.map((accent: Accent, index) => {
          const active = accent === value;
          return (
            <button
              key={accent}
              {...group.itemProps(index)}
              type="button"
              data-testid={`app-settings-accent-${accent}`}
              className={controlClass({
                shape: 'tile',
                size: 'md',
                className: cn(PICKER_TILE_FRAME, PICKER_TILE_INK(active)),
              })}
            >
              <AccentSwatch variant={accent} />
              <span
                className={cn(
                  'text-label',
                  /* Same reason as the two pickers above — soft over the active tile's tint. */
                  active
                    ? 'text-[color:var(--color-indigo-text-soft)]'
                    : 'text-[color:var(--color-text-tertiary)]',
                )}
              >
                {t(`accent.${accent}`)}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
