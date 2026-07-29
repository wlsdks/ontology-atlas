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

/**
 * 배경 미리보기 — 실제 배경 잉크 토큰으로 그린 정적 미니어처.
 *
 * **움직이지 않는다.** 셋은 움직이는 배경이지만 스와치는 정지 그림이다:
 * 설정 시트에 네 개의 파티클 루프가 동시에 돌면 고르려는 사람이 아니라
 * 스와치가 주목을 가져간다. 미리보기는 "어떤 결인지"만 말하고, 움직임은
 * 고른 다음 지도에서 본다.
 */
function CanvasBgSwatch({ variant }: { variant: CanvasBackground }) {
  const ink = 'rgba(var(--canvas-bg-particle-rgb), 0.55)';
  const inkFaint = 'rgba(var(--canvas-bg-particle-rgb), 0.28)';
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
      ) : variant === 'flow' ? (
        <g stroke={ink} strokeWidth="1" fill="none" strokeLinecap="round">
          <path d="M2 7 Q14 3 26 8 T46 6" />
          <path d="M2 15 Q14 11 26 16 T46 14" />
          <path d="M2 23 Q14 19 26 24 T46 22" />
          <path d="M6 11 Q18 7 30 12" stroke={inkFaint} />
          <path d="M6 19 Q18 15 30 20" stroke={inkFaint} />
        </g>
      ) : variant === 'web' ? (
        <g>
          <g stroke={inkFaint} strokeWidth="0.8">
            <line x1="9" y1="8" x2="22" y2="19" />
            <line x1="22" y1="19" x2="33" y2="8" />
            <line x1="33" y1="8" x2="40" y2="21" />
            <line x1="9" y1="8" x2="17" y2="14" />
            <line x1="17" y1="14" x2="28" y2="11" />
          </g>
          <g fill={ink}>
            <circle cx="9" cy="8" r="1.4" />
            <circle cx="22" cy="19" r="1.1" />
            <circle cx="33" cy="8" r="1.1" />
            <circle cx="40" cy="21" r="1.4" />
            <circle cx="17" cy="14" r="1" />
            <circle cx="28" cy="11" r="1.2" />
          </g>
        </g>
      ) : (
        <g fill="none" strokeLinecap="round">
          <g stroke={ink} strokeWidth="1">
            <path d="M8 22 A14 14 0 0 1 24 6" />
            <path d="M40 9 A14 14 0 0 1 27 24" />
          </g>
          <g stroke={inkFaint} strokeWidth="0.8">
            <path d="M4 15 A20 20 0 0 1 24 2" />
            <path d="M44 16 A20 20 0 0 1 25 28" />
          </g>
          <circle cx="24" cy="15" r="1.6" fill={ink} stroke="none" />
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
      <div role="radiogroup" aria-label={t('canvasBgLabel')} className="mt-2 grid grid-cols-2 gap-2">
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
