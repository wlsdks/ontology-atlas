'use client';

import { useEffect, useId, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import { useTranslations } from 'next-intl';

import { cn } from '@/shared/lib/cn';
import { withBasePath } from '@/shared/lib/public-pages/base-path';
import { usePrefersReducedMotion } from '@/shared/lib/render-timing/use-prefers-reduced-motion';
import { useMotionPaused } from '@/shared/motion/motion-pause';
import { Button } from '@/shared/ui/controls/button';
import { CloseButton } from '@/shared/ui/controls/close-button';
import { moruFrame } from '@/shared/ui/marks/moru-frame';
import companionSheet from '@/shared/ui/marks/moru-companion.json';
import reactionSheet from '@/shared/ui/marks/moru-reactions.json';
import { Dialog } from '@/shared/ui/surfaces/dialog';

import { CELL, COMBO_STEP, FEET, LIVES, NEUTRAL_FRAME, POWER_MS, ROUND_MS, readBest, writeBest } from '../lib/moru-play';
import { BUG_ROWS, GOLD_ROWS, HEART_ROWS, STAR_ROWS, pixelCells, pixelPath } from '../lib/moru-play-art';
import { FLOOR_BAND, createGame, type GameHandle, type Phase, type Result } from '../lib/moru-play-loop';

const SHEETS = {
  companion: { ...companionSheet, src: withBasePath(`/brand/moru-companion.png?v=${companionSheet.digest}`) },
  reactions: { ...reactionSheet, src: withBasePath(`/brand/moru-reactions.png?v=${reactionSheet.digest}`) },
} as const;
const emoteSrc = (glyph: 'note' | 'heart' | 'spark') => withBasePath(`/brand/moru-emote-${glyph}.svg`);
/** The fish from the magic-fish clip's own cell, cropped from the sheet rather than redrawn. */
const FISH = { frame: 408, x: 73, y: 8, width: 31, height: 19 };
/** A field this roomy draws Moru at twice his native cell; anything smaller keeps 128px. */
const ROOMY = { width: 560, height: 380 };
const fits = (node: HTMLElement) => (node.clientWidth >= ROOMY.width && node.clientHeight >= ROOMY.height ? 2 : 1);
const storage = () => (typeof localStorage === 'undefined' ? undefined : localStorage);

/* Marks ---------------------------------------------------------------------------------------- */

/** One of the round's own pixel shapes as crisp SVG, outlined in the canvas colour. */
function PixelMark({ rows, fills, unit }: { rows: readonly string[]; fills: Record<string, string>; unit: number }) {
  const { width, height } = pixelCells(rows);
  return (
    <svg aria-hidden viewBox={`0 0 ${width} ${height}`} width={width * unit} height={height * unit} shapeRendering="crispEdges" className="block shrink-0">
      <path d={pixelPath(rows, 'edge')} className="fill-[color:var(--color-canvas)]" />
      {Object.entries(fills).map(([letter, className]) => (
        <path key={letter} d={pixelPath(rows, letter)} className={className} />
      ))}
    </svg>
  );
}

const STAR_FILL = { f: 'fill-[color:var(--color-text-primary)]' };
const GOLD_FILL = { f: 'fill-[color:var(--color-amber-docs-a100)]', h: 'fill-[color:var(--color-text-primary)]', d: 'fill-[color:var(--color-amber-signal-a60)]' };
const BUG_FILL = { r: 'fill-[color:var(--color-danger-text-strong)]', k: 'fill-[color:var(--color-canvas)]', g: 'fill-[color:var(--color-text-tertiary)]', l: 'fill-[color:var(--color-text-tertiary)]' };

function EmoteIcon({ glyph, size = 24 }: { glyph: 'note' | 'heart' | 'spark'; size?: number }) {
  // Moru's own wordless emotes, decoration only.
  // eslint-disable-next-line @next/next/no-img-element
  return <img aria-hidden src={emoteSrc(glyph)} width={size} height={size} alt="" draggable={false} className="block shrink-0" style={{ imageRendering: 'pixelated' }} />;
}

function FishIcon() {
  const sheet = SHEETS.reactions;
  return (
    <span
      aria-hidden
      className="block shrink-0"
      style={{
        width: FISH.width,
        height: FISH.height,
        backgroundImage: `url(${sheet.src})`,
        backgroundSize: `${sheet.cell * sheet.columns}px ${sheet.cell * sheet.rows}px`,
        backgroundPosition: `${-((FISH.frame % sheet.columns) * sheet.cell + FISH.x)}px ${-(Math.floor(FISH.frame / sheet.columns) * sheet.cell + FISH.y)}px`,
        imageRendering: 'pixelated',
      }}
    />
  );
}

/* The popup ---------------------------------------------------------------------------------- */

/** The popup a visitor opens from the hero to play a one-minute round with Moru. */
export function MoruPlayground({ open, onClose }: { open: boolean; onClose: () => void }) {
  const titleId = useId();
  return (
    <Dialog
      open={open}
      onClose={onClose}
      labelledBy={titleId}
      testId="moru-playground"
      initialFocus="none"
      className="flex h-[min(38rem,calc(100dvh-2rem))] w-[min(52rem,calc(100vw-2rem))] flex-col overflow-hidden p-0 max-sm:h-[calc(100dvh-1rem)]"
    >
      {open ? <PlaygroundBody titleId={titleId} onClose={onClose} /> : null}
    </Dialog>
  );
}

function PlaygroundBody({ titleId, onClose }: { titleId: string; onClose: () => void }) {
  const t = useTranslations('download.playground');
  const reducedMotion = usePrefersReducedMotion();
  const paused = useMotionPaused();
  const [phase, setPhase] = useState<Phase>('start');
  const [result, setResult] = useState<Result | null>(null);
  const [best, setBest] = useState(() => readBest(storage()));
  const [scale, setScale] = useState(1);

  const field = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const score = useRef<HTMLSpanElement>(null);
  const scoreLabel = useRef<HTMLSpanElement>(null);
  const multiplier = useRef<HTMLSpanElement>(null);
  const pips = useRef<Array<HTMLSpanElement | null>>([]);
  const lives = useRef<Array<HTMLSpanElement | null>>([]);
  const time = useRef<HTMLSpanElement>(null);
  const timeBar = useRef<HTMLSpanElement>(null);
  const toast = useRef<HTMLParagraphElement>(null);
  const startButton = useRef<HTMLButtonElement>(null);
  const stopButton = useRef<HTMLButtonElement>(null);
  const againButton = useRef<HTMLButtonElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const game = useRef<GameHandle | null>(null);
  const bestRef = useRef(best);
  const label = useRef((count: number) => t('score', { count }));
  useEffect(() => {
    label.current = (count: number) => t('score', { count });
  }, [t]);

  useEffect(() => {
    const node = field.current;
    if (!node) return;
    const fit = () => setScale(fits(node));
    fit();
    const resize = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(fit);
    resize?.observe(node);
    return () => resize?.disconnect();
  }, []);

  useEffect(() => {
    game.current?.rescale(scale);
  }, [scale]);

  useEffect(() => {
    game.current?.setCalm(reducedMotion);
  }, [reducedMotion]);

  useEffect(() => {
    const host = field.current;
    const surface = canvas.current;
    if (paused || !host || !surface) return;
    const created = createGame(
      {
        field: host,
        canvas: surface,
        score: score.current,
        scoreLabel: scoreLabel.current,
        multiplier: multiplier.current,
        pips: pips.current,
        lives: lives.current,
        time: time.current,
        timeBar: timeBar.current,
        toast: toast.current,
      },
      {
        best: bestRef.current,
        calm: reducedMotion,
        scale: fits(host),
        sheets: SHEETS,
        emote: emoteSrc,
        fish: FISH,
        scoreLabel: (count) => label.current(count),
        onPhase: setPhase,
        onEnd: (next) => {
          setResult(next);
          if (next.newBest) {
            bestRef.current = next.best;
            setBest(next.best);
            writeBest(storage(), next.best);
          }
        },
      },
    );
    game.current = created;
    return () => {
      game.current = null;
      created.destroy();
      setPhase('start');
    };
    // The calm flag and scale reach a running game through their own effects.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paused]);

  // Focus follows the round: Start on open, Stop while playing, Play again at the end.
  useEffect(() => {
    const next = phase === 'start' ? startButton : phase === 'over' ? againButton : stopButton;
    const id = requestAnimationFrame(() => (next.current ?? closeButton.current)?.focus({ preventScroll: true }));
    return () => cancelAnimationFrame(id);
  }, [phase, paused]);

  const start = () => {
    setResult(null);
    game.current?.start(Math.floor(Math.random() * 2 ** 31));
  };

  const point = (event: PointerEvent<HTMLDivElement>) => {
    // A hovering pen or finger is not a request to move; a mouse is followed without a press.
    if (event.type === 'pointermove' && event.pointerType !== 'mouse' && event.buttons === 0) return;
    const box = event.currentTarget.getBoundingClientRect();
    game.current?.point(event.clientX - box.left);
  };

  const key = (event: KeyboardEvent<HTMLDivElement>, down: boolean) => {
    if (event.altKey || event.metaKey || event.ctrlKey) return;
    const k = event.key.toLowerCase();
    const side = k === 'arrowleft' || k === 'a' ? 'left' : k === 'arrowright' || k === 'd' ? 'right' : null;
    if (!side) return;
    event.preventDefault();
    game.current?.press(side, down);
  };

  const inRound = phase === 'countdown' || phase === 'playing';
  const keepPress = (event: PointerEvent) => event.stopPropagation();

  return (
    <div className="relative flex min-h-0 flex-1 flex-col" onKeyDown={(event) => key(event, true)} onKeyUp={(event) => key(event, false)}>
      <div className="flex h-14 shrink-0 items-center gap-3 pr-14 pl-5">
        <h2 id={titleId} className="min-w-0 flex-1 truncate text-title font-[var(--font-weight-signature)] text-[color:var(--color-text-primary)]">
          {t('title')}
        </h2>
        {inRound ? (
          <Button ref={stopButton} variant="ghost" size="sm" data-testid="moru-playground-stop" onClick={() => game.current?.stop()}>
            {t('stop')}
          </Button>
        ) : null}
      </div>

      <div
        ref={field}
        data-moru-play-field=""
        data-phase={paused ? 'still' : undefined}
        onPointerMove={paused ? undefined : point}
        onPointerDown={paused ? undefined : point}
        className="group/field relative mx-3 mb-3 min-h-0 flex-1 touch-none overflow-hidden rounded-panel border border-[color:var(--color-divider)] bg-[color:var(--color-panel)] select-none"
      >
        {paused ? (
          <PausedScene />
        ) : (
          <canvas ref={canvas} aria-hidden data-moru-play-canvas="" className="pointer-events-none absolute inset-0 block" />
        )}

        {/* The round's numbers, written by the game loop, not by React, so a catch never re-renders. */}
        <div aria-hidden={!inRound} className={cn('pointer-events-none absolute inset-x-0 top-0 transition-opacity', inRound ? 'opacity-100' : 'opacity-0')}>
          <div className="h-1 w-full bg-[color:var(--color-overlay-2)]">
            <span ref={timeBar} className="block h-full origin-left bg-[color:var(--color-indigo-accent)] group-data-[hurry]/field:bg-[color:var(--color-danger-text-strong)]" />
          </div>
          <div className="flex items-start justify-between gap-3 px-4 pt-2.5">
            <p data-testid="moru-playground-score" className="flex flex-col gap-1">
              <span ref={scoreLabel} className="sr-only">
                {t('score', { count: 0 })}
              </span>
              <span ref={score} aria-hidden className="font-mono text-hero-lg leading-hero-lg font-[var(--font-weight-signature)] tabular-nums text-[color:var(--color-text-primary)]">
                0
              </span>
              <span aria-hidden className="flex items-center gap-2">
                <span ref={multiplier} className="inline-block min-w-7 origin-left font-mono text-body-lg leading-body-lg font-[var(--font-weight-signature)] tabular-nums text-[color:var(--color-text-tertiary)] data-[level=2]:text-[color:var(--color-indigo-accent)] data-[level=3]:text-[color:var(--color-indigo-accent)] data-[level=4]:text-[color:var(--color-amber-docs-a100)]">
                  ×1
                </span>
                <span className="flex gap-1">
                  {Array.from({ length: COMBO_STEP }, (_, i) => (
                    <span
                      key={i}
                      ref={(node) => {
                        pips.current[i] = node;
                      }}
                      className="block size-2 bg-[color:var(--color-overlay-2)] transition-colors data-[on]:bg-[color:var(--color-indigo-accent)]"
                    />
                  ))}
                </span>
              </span>
            </p>
            <div className="flex flex-col items-end gap-1.5">
              <span className="flex gap-1.5" aria-hidden>
                {Array.from({ length: LIVES }, (_, i) => (
                  <span
                    key={i}
                    ref={(node) => {
                      lives.current[i] = node;
                    }}
                    className="block opacity-100 transition-opacity data-[lost]:opacity-25"
                  >
                    <PixelMark rows={HEART_ROWS} unit={3} fills={{ f: 'fill-[color:var(--color-danger-text-strong)]' }} />
                  </span>
                ))}
              </span>
              <span className="font-mono text-body-lg leading-body-lg tabular-nums text-[color:var(--color-text-secondary)] group-data-[hurry]/field:text-[color:var(--color-danger-text-strong)]">
                <span ref={time}>{ROUND_MS / 1000}</span>
                <span className="text-[color:var(--color-text-tertiary)]">{t('secondsUnit')}</span>
              </span>
            </div>
          </div>
          <p ref={toast} data-power="" className="group/toast absolute inset-x-0 top-16 text-center text-body-lg leading-body-lg font-[var(--font-weight-signature)] text-[color:var(--color-indigo-accent)] opacity-0">
            <span className="hidden group-data-[power=magnet]/toast:inline">{t('magnetOn', { seconds: POWER_MS.magnet / 1000 })}</span>
            <span className="hidden group-data-[power=slow]/toast:inline">{t('slowOn', { seconds: POWER_MS.slow / 1000 })}</span>
          </p>
        </div>

        {phase === 'start' ? (
          <div className="absolute inset-x-0 top-0 flex flex-col items-center gap-4 px-5 pt-7 text-center max-sm:pt-10">
            <p className="max-w-[34rem] text-body-lg leading-body-lg text-[color:var(--color-text-secondary)]">{t(paused ? 'paused' : 'howTo')}</p>
            {paused ? null : (
              <>
                <Legend />
                {reducedMotion ? <p className="max-w-[30rem] text-body leading-body text-[color:var(--color-text-tertiary)]">{t('reduced')}</p> : null}
                <Button ref={startButton} size="lg" className="min-w-32 rounded-full" data-testid="moru-playground-start" onPointerDown={keepPress} onClick={start}>
                  {t('start')}
                </Button>
                {best > 0 ? <p className="text-body leading-body tabular-nums text-[color:var(--color-text-tertiary)]">{t('bestRecord', { count: best })}</p> : null}
              </>
            )}
          </div>
        ) : null}

        {phase === 'over' && result ? (
          <div role="status" data-testid="moru-playground-result" className="absolute inset-x-0 top-0 flex justify-center px-4 pt-6 max-sm:pt-8">
            <div className="flex w-full max-w-[24rem] flex-col items-center gap-2 rounded-panel bg-[color:var(--color-canvas-a70)] px-6 pt-5 pb-6 text-center">
              <p className="text-body-lg leading-body-lg text-[color:var(--color-text-secondary)]">{t(result.reason === 'lives' ? 'endLives' : result.reason === 'stopped' ? 'endStopped' : 'endTime')}</p>
              <p className="font-mono text-display leading-display font-[var(--font-weight-signature)] tabular-nums text-[color:var(--color-text-primary)]">{result.score}</p>
              {result.newBest ? (
                <p data-testid="moru-playground-new-best" className="rounded-full bg-[color:var(--color-amber-signal-a16)] px-3 py-1 text-body leading-body font-[var(--font-weight-signature)] text-[color:var(--color-amber-docs-a100)]">
                  {t('newBest')}
                </p>
              ) : (
                <p className="text-body leading-body tabular-nums text-[color:var(--color-text-tertiary)]">{t('bestRecord', { count: result.best })}</p>
              )}
              <p className="text-body leading-body tabular-nums text-[color:var(--color-text-tertiary)]">
                {t('summary', { combo: result.bestCombo, caught: result.caught })}
              </p>
              <Button ref={againButton} size="lg" className="mt-2 min-w-32 rounded-full" data-testid="moru-playground-again" onPointerDown={keepPress} onClick={start}>
                {t('again')}
              </Button>
            </div>
          </div>
        ) : null}
      </div>
      {/* Last in order, so Tab reaches the round's own button first. */}
      <CloseButton ref={closeButton} label={t('close')} data-testid="moru-playground-close" className="absolute top-2.5 right-3" onClick={onClose} />
    </div>
  );
}

/** What falls and what it does, so the first round is not spent guessing. */
function Legend() {
  const t = useTranslations('download.playground');
  const row = 'flex items-center gap-2 text-body leading-body text-[color:var(--color-text-secondary)]';
  return (
    <ul className="grid grid-cols-2 gap-x-6 gap-y-2.5 text-left max-sm:grid-cols-1" aria-label={t('legend')}>
      <li className={row}>
        <span className="flex items-center gap-1">
          <EmoteIcon glyph="note" />
          <EmoteIcon glyph="heart" />
          <PixelMark rows={STAR_ROWS} unit={2} fills={STAR_FILL} />
        </span>
        {t('legendCatch', { points: 10 })}
      </li>
      <li className={row}>
        <PixelMark rows={GOLD_ROWS} unit={2} fills={GOLD_FILL} />
        {t('legendGold', { points: 50 })}
      </li>
      <li className={row}>
        <PixelMark rows={BUG_ROWS} unit={2} fills={BUG_FILL} />
        {t('legendBug')}
      </li>
      <li className={row}>
        <span className="flex items-center gap-1.5">
          <FishIcon />
          <EmoteIcon glyph="spark" />
        </span>
        {t('legendPower', { magnet: POWER_MS.magnet / 1000, slow: POWER_MS.slow / 1000 })}
      </li>
    </ul>
  );
}

/** With the page's motion paused the round rests; Moru stands on the neutral pose. */
function PausedScene() {
  const sheet = SHEETS.companion;
  return (
    <>
      <span aria-hidden className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_bottom,var(--color-indigo-accent-a12),transparent_75%)]" />
      <span aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 bg-[color:var(--color-overlay-2)]" style={{ height: FLOOR_BAND }} />
      <span aria-hidden className="pointer-events-none absolute left-[calc(50%-4rem)] block overflow-hidden" style={{ width: CELL, height: CELL, bottom: FLOOR_BAND - (CELL - FEET) }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          data-moru-sheet="companion"
          src={sheet.src}
          alt=""
          draggable={false}
          width={sheet.cell * sheet.columns}
          height={sheet.cell * sheet.rows}
          className="absolute top-0 left-0 max-w-none"
          style={{ width: sheet.cell * sheet.columns, height: sheet.cell * sheet.rows, imageRendering: 'pixelated', transform: moruFrame(NEUTRAL_FRAME, sheet) }}
        />
      </span>
    </>
  );
}
