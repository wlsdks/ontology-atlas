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
import { controlClass } from '@/shared/ui/control-class';
import { TopologyV2KindGlyph } from '@/shared/ui/topology-v2-kind-glyph';

/**
 * 두 피커의 **선택 잉크** — 라디오 그룹이라 값 층의 `active` 를 쓰지 않는다.
 *
 * `active` 는 **눌림**(pressed)의 표현이라 테두리가 `--color-indigo-pale-a28`
 * 로 옅다. 여기 필요한 것은 눌림이 아니라 **선택**이고, 넷 중 하나를 고르는
 * 격자에서 옅은 테두리는 「어느 것이 지금 값인가」를 약하게 만든다. 값을 새로
 * 만들지 않고 지금 잉크를 그대로 둔다 — 값 층에 «선택» 축이 생기면 그때
 * 여기가 지워질 자리다.
 */
const PICKER_TILE_INK = (active: boolean) =>
  active
    ? 'border-[color:var(--color-indigo-accent)] bg-[color:var(--color-indigo-line-a13)]'
    : 'border-[color:var(--color-border-soft)] hover:border-[color:var(--color-border-strong)]';

/** 격자 칸을 채우는 자리잡기 + 포커스 링 — 값 층이 안 내는 층. */
const PICKER_TILE_FRAME =
  'w-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-indigo-a46)]';

/*
 * **`size: 'md'` 인 이유 — 실측이 잡았다.**
 *
 * 처음엔 `sm` 을 골랐다. 종전 인셋(`p-1.5`/`p-2`)에 가장 가까웠기 때문이다.
 * 그런데 빌드를 재 보니 타일의 계산된 `font-size` 가 12.5 → **9.5px** 로
 * 내려가 있었다 — `tile/sm` 이 `text-caption` 을 싣는다.
 *
 * 화면에 보이는 글자는 안 바뀐다(라벨 `<span>` 이 자기 `text-label` 을 갖는다).
 * 그래도 되돌린 이유는 **이 파일이 루트 시트**라서다:
 * `settings-sheet-type-dialect.contract.test.ts` 가 9.5px 을 여기서 금지하는데,
 * 그 게이트는 소스의 리터럴 `text-caption` 만 본다. 값 층을 통해 들여오면
 * **게이트를 통과하면서 규격을 어긴다.** 그건 준수가 아니라 우회다.
 */

/**
 * 개인화 피커 (Phase 5 #20/#21, `docs/plans/DESIGN-OVERHAUL-2026-07-25.md`) — 설정
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
  const ink = 'rgba(var(--canvas-bg-particle-rgb), 0.5)';
  const inkFaint = 'rgba(var(--canvas-bg-particle-rgb), 0.24)';
  return (
    /*
     * viewBox 가 **카드 실제 비율**(240×56)이다. 작은 뷰박스를 늘리면 무늬가 통째로
     * 확대돼 텍스처가 아니라 조각으로 읽힌다(실측: 48×30 을 256px 폭에 채우면 5.3배).
     * 밀도는 보이는 크기에 맞춰 여기서 직접 정한다.
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
          {/* `fill="none"` 없이는 열린 폴리라인이 기본 검정으로 **채워져** 삼각형이 된다. */}
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
        /* 깊이 도트 — 같은 점을 세 층으로. 층마다 크기·밝기가 달라 정지 화면에서도
           깊이가 읽히고, 지도를 움직이면 층이 서로 어긋난다. */
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
  return (
    /*
     * 자기 여백을 갖지 않는다 — 이 피커는 LNB 의 「지도 배경」 칸을 통째로 쓰므로
     * 여백은 칸이 소유한다. 둘 다 여백을 가지면 절마다 왼쪽 시작선이 달라진다
     * (실측: 다른 절 20px, 여기만 32px).
     */
    <div data-testid="app-settings-canvas-background">
      <p className="text-body text-[color:var(--color-text-secondary)]">{t('canvasBgLabel')}</p>
      <p className="mt-0.5 break-keep text-label text-[color:var(--color-text-quaternary)]">
        {t('canvasBgCaption')}
      </p>
      <div role="radiogroup" aria-label={t('canvasBgLabel')} className="mt-3 grid grid-cols-2 gap-2.5">
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
                  /* 활성 타일은 부모가 line-a13 틴트를 진다 — 그 합성 위 표식
                     인디고는 4.12:1 로 AA 미달(열린 표면 계기 실측). 틴트를
                     지는 잉크는 soft 다. 잉크·틴트가 부모/자식으로 갈라져
                     같은-태그 센서스가 못 보던 자리라 여기 주석이 게이트다 —
                     런타임 판정은 a11y-open-surfaces 가 맡는다. */
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
  return (
    <div className="px-3 py-2.5" data-testid="app-settings-glyph-set">
      <p className="text-body text-[color:var(--color-text-secondary)]">{t('glyphSetLabel')}</p>
      <p className="mt-0.5 break-keep text-label text-[color:var(--color-text-quaternary)]">
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
                  /* 활성 타일은 부모가 line-a13 틴트를 진다 — 그 합성 위 표식
                     인디고는 4.12:1 로 AA 미달(열린 표면 계기 실측). 틴트를
                     지는 잉크는 soft 다. 잉크·틴트가 부모/자식으로 갈라져
                     같은-태그 센서스가 못 보던 자리라 여기 주석이 게이트다 —
                     런타임 판정은 a11y-open-surfaces 가 맡는다. */
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
