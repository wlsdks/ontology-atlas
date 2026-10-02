'use client';

import { useTranslations } from 'next-intl';
import { cn } from '@/shared/lib/cn';
import { useRovingRadioGroup } from '@/shared/lib/use-roving-radio-group';
import {
  CANVAS_BACKGROUNDS,
  GLYPH_SETS,
  useCanvasBackground,
  useGlyphSet,
  writeCanvasBackground,
  writeGlyphSet,
  type CanvasBackground,
  type GlyphSet,
} from '@/shared/lib/appearance-preferences';
import { controlClass } from '@/shared/ui/control-class';
import { OntologyMapKindGlyph } from '@/shared/ui/map-kind-glyph';
import type { SettingId } from '../model/catalog/types';

const PICKER_TILE_INK = (active: boolean) =>
  active
    ? 'border-[color:var(--color-indigo-accent)] bg-[color:var(--color-indigo-line-a13)]'
    : 'border-[color:var(--color-border-soft)] hover:border-[color:var(--color-border-strong)]';

const PICKER_LABEL_INK = (active: boolean) =>
  active ? 'text-[color:var(--color-indigo-text-soft)]' : 'text-[color:var(--color-text-tertiary)]';

const PICKER_TILE_FRAME =
  'w-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-indigo-focus-ring)]';



const PREVIEW_KINDS = ['project', 'domain', 'capability', 'element'] as const;

function CanvasBgSwatch({ variant }: { variant: CanvasBackground }) {
  const ink = 'rgba(var(--canvas-bg-particle-rgb), 0.5)';
  const inkFaint = 'rgba(var(--canvas-bg-particle-rgb), 0.24)';
  return (
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

export function CanvasBackgroundPicker({ settingId }: { settingId?: SettingId } = {}) {
  const t = useTranslations('nav.settingsMenu');
  const value = useCanvasBackground();
  const group = useRovingRadioGroup({
    value,
    values: CANVAS_BACKGROUNDS,
    onChange: writeCanvasBackground,
  });
  return (
    <div className="border-x border-transparent px-3 py-2.5" data-testid="app-settings-canvas-background" data-setting-id={settingId}>
      <p className="text-body text-[color:var(--color-text-primary)]">{t('canvasBgLabel')}</p>
      <p className="mt-0.5 break-keep text-label text-[color:var(--color-text-tertiary)]">
        {t('canvasBgCaption')}
      </p>
      <div {...group.groupProps} aria-label={t('canvasBgLabel')} className="mt-2 grid grid-cols-3 gap-2">
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
                className={cn('text-label', PICKER_LABEL_INK(active))}
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

export function GlyphSetPicker({ settingId }: { settingId?: SettingId } = {}) {
  const t = useTranslations('nav.settingsMenu');
  const value = useGlyphSet();
  const group = useRovingRadioGroup({ value, values: GLYPH_SETS, onChange: writeGlyphSet });
  return (
    <div className="px-3 py-2.5" data-testid="app-settings-glyph-set" data-setting-id={settingId}>
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
                className={cn('text-label', PICKER_LABEL_INK(active))}
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
