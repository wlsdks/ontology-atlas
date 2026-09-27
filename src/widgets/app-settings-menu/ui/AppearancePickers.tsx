'use client';

import { useTranslations } from 'next-intl';
import { cn } from '@/shared/lib/cn';
import { useRovingRadioGroup } from '@/shared/lib/use-roving-radio-group';
import {
  ACCENTS,
  CANVAS_BACKGROUNDS,
  GLYPH_SETS,
  useAccent,
  useCanvasBackground,
  useGlyphSet,
  writeAccent,
  writeCanvasBackground,
  writeGlyphSet,
  type Accent,
  type CanvasBackground,
  type GlyphSet,
} from '@/shared/lib/appearance-preferences';
import { controlClass } from '@/shared/ui/control-class';
import { OntologyMapKindGlyph } from '@/shared/ui/map-kind-glyph';

/**
 * The selection ink for both radio-group pickers. The value layer's `active` means pressed,
 * with a pale border too weak to mark the selected tile; delete this when the value layer
 * gains a selected axis.
 */
const PICKER_TILE_INK = (active: boolean) =>
  active
    ? 'border-[color:var(--color-indigo-accent)] bg-[color:var(--color-indigo-line-a13)]'
    : 'border-[color:var(--color-border-soft)] hover:border-[color:var(--color-border-strong)]';

/** Grid-cell placement plus focus ring — the layer the value layer does not supply. */
const PICKER_TILE_FRAME =
  'w-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-indigo-focus-ring)]';

/*
 * Size `md`, not `sm`: `tile/sm` carries `text-caption` (9.5px), which the gate in
 * settings-sheet-type-dialect.contract.test.ts forbids here but only sees as a literal, so the
 * smaller size would break the rule while passing the gate.
 */

/**
 * Personalisation pickers (`docs/plans/DESIGN-OVERHAUL-2026-07-25.md`): canvas background and
 * node icon set. Previews render the real `--canvas-bg-*` tokens and `OntologyMapKindGlyph`,
 * and a choice writes the app-wide store, which the map and every glyph follow at once.
 */

const PREVIEW_KINDS = ['project', 'domain', 'capability', 'element'] as const;

/**
 * Background preview, a still miniature in the real background ink tokens; animated
 * swatches would pull attention from the choice.
 */
function CanvasBgSwatch({ variant }: { variant: CanvasBackground }) {
  const ink = 'rgba(var(--canvas-bg-particle-rgb), 0.5)';
  const inkFaint = 'rgba(var(--canvas-bg-particle-rgb), 0.24)';
  return (
    // The viewBox is the card's real ratio (240×56); a small stretched viewBox magnifies the
    // pattern into fragments, so density is set for the visible size.
    <svg
      viewBox="0 0 240 56"
      preserveAspectRatio="xMidYMid slice"
      className="h-[56px] w-full rounded-chip"
      aria-hidden="true"
      data-canvas-bg-swatch={variant}
    >
      <rect x="0" y="0" width="240" height="56" fill="var(--map-canvas-bg-near)" />
      {variant === 'dot' ? (
        <g stroke="var(--map-grid-major)" strokeWidth="1">
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
        /* Three dot layers differing in size and brightness, so depth reads in a still frame. */
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
  // A grid tile with its active ink split across parent and child (see the gate comment
  // below) fits neither canonical radio shape, so only the behaviour comes from the hook.
  const group = useRovingRadioGroup({
    value,
    values: CANVAS_BACKGROUNDS,
    onChange: writeCanvasBackground,
  });
  return (
    // No margin of its own: the pane owns it, or this section's start line would differ.
    <div data-testid="app-settings-canvas-background">
      <p className="text-body text-[color:var(--color-text-primary)]">{t('canvasBgLabel')}</p>
      <p className="mt-0.5 break-keep text-label text-[color:var(--color-text-tertiary)]">
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
      <p className="text-body text-[color:var(--color-text-primary)]">{t('glyphSetLabel')}</p>
      <p className="mt-0.5 break-keep text-label text-[color:var(--color-text-tertiary)]">
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
                  <OntologyMapKindGlyph key={kind} kind={kind} glyphSet={set} size={15} />
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
 * Accent swatch. `data-accent` on the swatch itself shows each accent's real colour
 * unselected, from the same CSS block as the app-wide attribute.
 */
function AccentSwatch({ variant }: { variant: Accent }) {
  return (
    <span
      data-accent-preview={variant}
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
 * Accent picker: ember or indigo. What it cannot change (the baked icon) is explained on
 * the `Accent` type in src/shared/lib/appearance-preferences.ts, and a caption says so on screen.
 */
export function AccentPicker() {
  const t = useTranslations('nav.settingsMenu');
  const value = useAccent();
  /* Container in place, behaviour in the hook, for the same reason as the two above. */
  const group = useRovingRadioGroup({ value, values: ACCENTS, onChange: writeAccent });
  return (
    <div className="px-3 py-2.5" data-testid="app-settings-accent">
      <p className="text-body text-[color:var(--color-text-primary)]">{t('accentLabel')}</p>
      <p className="mt-0.5 break-keep text-label text-[color:var(--color-text-tertiary)]">
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
