'use client';

import { useTranslations } from 'next-intl';
import { cn } from '@/shared/lib/cn';
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
import { TopologyV2KindGlyph } from '@/shared/ui/topology-v2-kind-glyph';

/**
 * 개인화 피커 (Phase 5 #20/#21, `docs/DESIGN-OVERHAUL-2026-07-25.md`) — 설정
 * 시트 [화면] 그룹의 캔버스 배경(3택)·노드 아이콘(2택) 선택 행.
 *
 * 미리보기는 스크린샷이 아니라 실시간 미니 스와치다: 배경은 실제 `--canvas-bg-*`/
 * grid 토큰으로 그린 작은 SVG, 아이콘 세트는 실제 `TopologyV2KindGlyph` 를
 * 세트별로 렌더한 미니 글리프 행. 현재 선택은 인디고 링. 선택하면 앱 전역
 * 스토어에 쓰고 지도 캔버스·모든 DOM 글리프가 함께 즉시 스왑된다.
 */

const PREVIEW_KINDS = ['project', 'domain', 'capability', 'element'] as const;

/** 배경 미리보기 — 실제 배경 색 토큰을 쓴 정적 미니어처(도트=grid 라인, 성좌=별점, 등고선=곡선). */
function CanvasBgSwatch({ variant }: { variant: CanvasBackground }) {
  return (
    <svg
      viewBox="0 0 48 30"
      className="h-[30px] w-full rounded-chip"
      aria-hidden="true"
      data-canvas-bg-swatch={variant}
    >
      <rect x="0" y="0" width="48" height="30" fill="var(--topology-v2-canvas-bg-near)" />
      {variant === 'dot' ? (
        <g stroke="var(--topology-v2-grid-major)" strokeWidth="1">
          <line x1="12" y1="0" x2="12" y2="30" />
          <line x1="24" y1="0" x2="24" y2="30" />
          <line x1="36" y1="0" x2="36" y2="30" />
          <line x1="0" y1="10" x2="48" y2="10" />
          <line x1="0" y1="20" x2="48" y2="20" />
        </g>
      ) : variant === 'constellation' ? (
        <g>
          <circle cx="9" cy="8" r="1.3" fill="var(--canvas-bg-constellation-bright)" />
          <circle cx="22" cy="20" r="0.9" fill="var(--canvas-bg-constellation-dim)" />
          <circle cx="33" cy="7" r="0.9" fill="var(--canvas-bg-constellation-dim)" />
          <circle cx="40" cy="22" r="1.3" fill="var(--canvas-bg-constellation-bright)" />
          <circle cx="16" cy="14" r="0.9" fill="var(--canvas-bg-constellation-dim)" />
          <circle cx="28" cy="11" r="1.3" fill="var(--canvas-bg-constellation-bright)" />
        </g>
      ) : (
        <g stroke="var(--canvas-bg-contour)" strokeWidth="1" fill="none">
          <path d="M0 8 Q12 3 24 8 T48 8" />
          <path d="M0 16 Q12 11 24 16 T48 16" />
          <path d="M0 24 Q12 19 24 24 T48 24" />
        </g>
      )}
    </svg>
  );
}

export function CanvasBackgroundPicker() {
  const t = useTranslations('nav.settingsMenu');
  const value = useCanvasBackground();
  return (
    <div className="px-3 py-2.5" data-testid="app-settings-canvas-background">
      <p className="text-label text-[color:var(--color-text-secondary)]">{t('canvasBgLabel')}</p>
      <p className="mt-0.5 break-keep text-caption leading-4 text-[color:var(--color-text-quaternary)]">
        {t('canvasBgCaption')}
      </p>
      <div role="radiogroup" aria-label={t('canvasBgLabel')} className="mt-2 grid grid-cols-3 gap-2">
        {CANVAS_BACKGROUNDS.map((variant) => {
          const active = variant === value;
          return (
            <button
              key={variant}
              type="button"
              role="radio"
              aria-checked={active}
              data-testid={`app-settings-canvas-bg-${variant}`}
              onClick={() => writeCanvasBackground(variant)}
              className={cn(
                'flex flex-col items-stretch gap-1 rounded-lg border p-1.5 text-center transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-indigo-a46)]',
                active
                  ? 'border-[color:var(--color-indigo-accent)] bg-[color:var(--color-indigo-line-a13)]'
                  : 'border-[color:var(--color-border-soft)] hover:border-[color:var(--color-border-strong)]',
              )}
            >
              <CanvasBgSwatch variant={variant} />
              <span
                className={cn(
                  'text-caption',
                  active
                    ? 'text-[color:var(--color-indigo-accent)]'
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
  return (
    <div className="px-3 py-2.5" data-testid="app-settings-glyph-set">
      <p className="text-label text-[color:var(--color-text-secondary)]">{t('glyphSetLabel')}</p>
      <p className="mt-0.5 break-keep text-caption leading-4 text-[color:var(--color-text-quaternary)]">
        {t('glyphSetCaption')}
      </p>
      <div role="radiogroup" aria-label={t('glyphSetLabel')} className="mt-2 grid grid-cols-2 gap-2">
        {GLYPH_SETS.map((set: GlyphSet) => {
          const active = set === value;
          return (
            <button
              key={set}
              type="button"
              role="radio"
              aria-checked={active}
              data-testid={`app-settings-glyph-set-${set}`}
              onClick={() => writeGlyphSet(set)}
              className={cn(
                'flex flex-col items-center gap-1.5 rounded-lg border p-2 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-indigo-a46)]',
                active
                  ? 'border-[color:var(--color-indigo-accent)] bg-[color:var(--color-indigo-line-a13)]'
                  : 'border-[color:var(--color-border-soft)] hover:border-[color:var(--color-border-strong)]',
              )}
            >
              <span className="flex items-center gap-1.5">
                {PREVIEW_KINDS.map((kind) => (
                  <TopologyV2KindGlyph key={kind} kind={kind} glyphSet={set} size={15} />
                ))}
              </span>
              <span
                className={cn(
                  'text-caption',
                  active
                    ? 'text-[color:var(--color-indigo-accent)]'
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
