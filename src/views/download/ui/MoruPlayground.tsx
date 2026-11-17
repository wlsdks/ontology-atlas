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

import {
  BOUNCE,
  CELL,
  FEET,
  IDLE,
  ITEM,
  NEUTRAL_FRAME,
  SETTLE,
  TOYS,
  clipTimeline,
  emoteAt,
  emoteFor,
  missAt,
  newGame,
  popAt,
  poseAt,
  readBest,
  shadowScale,
  steer,
  stepGame,
  stillFrame,
  writeBest,
  type Emote,
  type Game,
  type Mover,
  type PlayClip,
  type Sheet,
  type Timeline,
} from '../lib/moru-play';

const SHEETS = {
  companion: { ...companionSheet, src: `/brand/moru-companion.png?v=${companionSheet.digest}` },
  reactions: { ...reactionSheet, src: `/brand/moru-reactions.png?v=${reactionSheet.digest}` },
} as const;
const EMOTES: readonly Emote[] = ['note', 'heart', 'spark'];
const TOY_LABEL = { sing: 'sing', hearts: 'hearts', 'magic-fish': 'fish', clap: 'clap' } as const;
/** Room for the floor band under Moru's feet. */
const FLOOR_BAND = 20;
const SLOTS = 12;
const VISIBLE_SHARE = 0.2;

/** The popup a visitor opens from the closing contact strip to play with Moru. */
export function MoruPlayground({ open, onClose }: { open: boolean; onClose: () => void }) {
  const titleId = useId();
  return (
    <Dialog
      open={open}
      onClose={onClose}
      labelledBy={titleId}
      testId="moru-playground"
      className="flex h-[min(30rem,calc(100dvh-2rem))] w-[min(45rem,calc(100vw-2rem))] flex-col overflow-hidden p-0 max-sm:h-[calc(100dvh-1rem)]"
    >
      {open ? <PlaygroundBody titleId={titleId} onClose={onClose} /> : null}
    </Dialog>
  );
}

interface Nodes {
  field: HTMLDivElement;
  actor: HTMLSpanElement;
  facing: HTMLSpanElement;
  emote: HTMLSpanElement;
  shadow: HTMLSpanElement | null;
  sheets: Record<Sheet, HTMLImageElement | null>;
  slots: Array<HTMLSpanElement | null>;
}

/**
 * One clock drives Moru, the drops and their pops, so a hidden tab or a page pause stops all of
 * it on the same frame and resumes from the same frame. Nothing here touches React state except
 * through `onScore`.
 */
function createPlayLoop(nodes: Nodes, onScore: (score: number) => void, best: number) {
  let clock = 0, last: number | null = null, frame: number | null = null;
  let width = 0, height = 0, visible = true, disposed = false;
  let mover: Mover = { x: 0, v: 0, facing: 1 };
  let target: number | undefined;
  let keys = { left: false, right: false };
  let motion: 'idle' | 'bounce' | 'settle' = 'idle', motionStart = 0;
  let clip: { line: Timeline; start: number; emote: Emote | null } | null = null;
  let pending: PlayClip | null = null;
  let game: Game | null = null, ending = false;
  const dpr = Math.max(1, Math.round(window.devicePixelRatio || 1));

  // Snap to whole device pixels: crisp cells, and half the stepping of whole CSS pixels on 2x screens.
  const snap = (value: number) => Math.round(value * dpr) / dpr;
  const draw = () => {
    let sheet: Sheet = 'companion';
    let pose = NEUTRAL_FRAME;
    let bubble = { opacity: 0, lift: 0 };
    if (clip) {
      const elapsed = clock - clip.start;
      sheet = clip.line.sheet;
      pose = poseAt(clip.line, elapsed).frame;
      if (clip.emote) bubble = emoteAt(elapsed / clip.line.total);
    } else if (motion === 'bounce') pose = poseAt(BOUNCE, (clock - motionStart) % BOUNCE.total).frame;
    else if (motion === 'settle') pose = poseAt(SETTLE, clock - motionStart).frame;
    else pose = poseAt(IDLE, (clock - motionStart) % IDLE.total).frame;
    for (const name of ['companion', 'reactions'] as const) {
      const image = nodes.sheets[name];
      if (!image) continue;
      image.hidden = name !== sheet;
      if (name === sheet) image.style.transform = moruFrame(pose, SHEETS[name]);
    }
    nodes.actor.style.transform = `translateX(${snap(mover.x - CELL / 2)}px)`;
    if (nodes.shadow) nodes.shadow.style.transform = `translateX(${snap(mover.x - CELL / 2)}px) scaleX(${shadowScale(sheet, pose)})`;
    nodes.facing.style.transform = `scaleX(${mover.facing})`;
    for (const image of Array.from(nodes.emote.children) as HTMLElement[]) image.hidden = image.dataset.glyph !== clip?.emote;
    nodes.emote.style.opacity = String(bubble.opacity);
    nodes.emote.style.transform = `translateY(${-Math.round(bubble.lift)}px)`;
    nodes.emote.style.left = mover.facing === 1 ? `${CELL - 24}px` : '0px';
    const items = game?.items ?? [];
    nodes.slots.forEach((slot, index) => {
      if (!slot) return;
      const item = items[index];
      if (!item) {
        slot.style.visibility = 'hidden';
        return;
      }
      slot.style.visibility = 'visible';
      slot.dataset.state = item.state;
      slot.style.transform = `translate(${snap(item.x - ITEM / 2)}px, ${snap(item.y - ITEM)}px)`;
      const [glyph, ring, plus] = Array.from(slot.children) as HTMLElement[];
      for (const image of Array.from(glyph.children) as HTMLElement[]) image.hidden = image.dataset.glyph !== item.kind;
      if (item.state === 'caught') {
        const pop = popAt(item.age);
        glyph.style.opacity = String(pop.opacity);
        glyph.style.transform = `translateY(${pop.drop}px) scale(${pop.scale})`;
        ring.style.opacity = String(pop.ringOpacity);
        ring.style.transform = `scale(${pop.ring})`;
        plus.style.opacity = String(pop.plusOpacity);
        plus.style.transform = `translateY(${-Math.round(pop.plus)}px)`;
      } else {
        glyph.style.opacity = String(item.state === 'missed' ? missAt(item.age) : 1);
        glyph.style.transform = 'scale(1)';
        ring.style.opacity = '0';
        plus.style.opacity = '0';
      }
    });
    nodes.field.dataset.moruMotion = clip ? 'clip' : motion;
  };

  const tick = (now: number) => {
    frame = null;
    const dt = last === null ? 0 : Math.min(50, now - last);
    last = now;
    clock += dt;
    const min = CELL / 2, max = Math.max(CELL / 2, width - CELL / 2);
    const busy = Boolean(clip || pending);
    const direction = ((keys.right ? 1 : 0) - (keys.left ? 1 : 0)) as -1 | 0 | 1;
    // A requested clip waits for Moru to brake and land, so nothing snaps into it.
    mover = steer(mover, dt, busy ? {} : direction !== 0 ? { direction } : { target }, min, max);
    if (busy) target = undefined;
    const moving = !clip && (Math.abs(mover.v) > 1 || (!busy && direction !== 0));
    if (clip) {
      if (clock - clip.start >= clip.line.total) {
        clip = null;
        delete nodes.field.dataset.moruClip;
        motion = 'idle';
        motionStart = clock;
      }
    } else if (moving) {
      if (motion !== 'bounce') {
        motion = 'bounce';
        motionStart = clock;
      }
    } else if (motion === 'bounce') {
      // Finish the bounce in the air, then land on the hop's own settle.
      const into = clock - motionStart;
      if (Math.floor(into / BOUNCE.total) > Math.floor((into - dt) / BOUNCE.total)) {
        motion = 'settle';
        motionStart = clock;
      }
    } else if (motion === 'settle' && clock - motionStart >= SETTLE.total) {
      motion = 'idle';
      motionStart = clock;
    }
    if (pending && !clip && motion === 'idle' && mover.v === 0) {
      clip = { line: clipTimeline(pending), start: clock, emote: emoteFor(pending) };
      nodes.field.dataset.moruClip = pending;
      pending = null;
    }
    if (game) {
      const step = stepGame(game, dt, { width, floor: height - FLOOR_BAND }, {
        x: mover.x,
        canCatch: !clip && !pending && !ending,
        hold: Boolean(clip || pending || ending),
      });
      game = step.game;
      if (step.caught) {
        best = Math.max(best, step.game.score);
        onScore(step.game.score);
      }
      if (step.milestone) pending = step.milestone;
      if (ending && step.game.items.length === 0) {
        game = null;
        ending = false;
      }
    }
    draw();
    run();
  };

  function run() {
    if (disposed || frame !== null || document.hidden || !visible) return;
    frame = requestAnimationFrame(tick);
  }
  const halt = () => {
    if (frame !== null) cancelAnimationFrame(frame);
    frame = null;
    // The next frame starts a fresh interval, so a pause never becomes a jump.
    last = null;
  };

  const measure = () => {
    const first = width === 0;
    width = nodes.field.clientWidth;
    height = nodes.field.clientHeight;
    const max = Math.max(CELL / 2, width - CELL / 2);
    mover = { ...mover, x: Math.min(Math.max(CELL / 2, first ? width / 2 : mover.x), max) };
    draw();
  };
  measure();
  const resize = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure);
  resize?.observe(nodes.field);
  const observer = typeof IntersectionObserver === 'undefined' ? null : new IntersectionObserver((entries) => {
    visible = entries[entries.length - 1].intersectionRatio >= VISIBLE_SHARE;
    if (visible) run();
    else halt();
  }, { threshold: [0, VISIBLE_SHARE] });
  observer?.observe(nodes.field);
  const visibility = () => {
    keys = { left: false, right: false };
    if (document.hidden) halt();
    else run();
  };
  const blur = () => {
    keys = { left: false, right: false };
  };
  document.addEventListener('visibilitychange', visibility);
  window.addEventListener('blur', blur);
  run();

  return {
    start(seed: number) {
      game = newGame(seed, best);
      ending = false;
      run();
    },
    stop() {
      if (!game) return;
      ending = true;
      game = { ...game, items: game.items.map((item) => (item.state === 'falling' ? { ...item, state: 'missed', age: 0 } : item)) };
    },
    ask(next: PlayClip) {
      if (clip || pending) return;
      pending = next;
      run();
    },
    point(x: number) {
      target = x;
    },
    press(side: 'left' | 'right', down: boolean) {
      keys = { ...keys, [side]: down };
      target = undefined;
    },
    destroy() {
      disposed = true;
      halt();
      resize?.disconnect();
      observer?.disconnect();
      document.removeEventListener('visibilitychange', visibility);
      window.removeEventListener('blur', blur);
    },
  };
}

function PlaygroundBody({ titleId, onClose }: { titleId: string; onClose: () => void }) {
  const t = useTranslations('download.playground');
  const reducedMotion = usePrefersReducedMotion();
  const pausedPage = useMotionPaused();
  const still = reducedMotion || pausedPage;
  const [phase, setPhase] = useState<'start' | 'playing'>('start');
  const [score, setScore] = useState(0);
  const [best, setBest] = useState(() => readBest(typeof localStorage === 'undefined' ? undefined : localStorage));
  const [stillPose, setStillPose] = useState<PlayClip | null>(null);

  const field = useRef<HTMLDivElement>(null);
  const actor = useRef<HTMLSpanElement>(null);
  const facing = useRef<HTMLSpanElement>(null);
  const sheets = useRef<Record<Sheet, HTMLImageElement | null>>({ companion: null, reactions: null });
  const emote = useRef<HTMLSpanElement>(null);
  const shadow = useRef<HTMLSpanElement>(null);
  const slots = useRef<Array<HTMLSpanElement | null>>([]);
  const startButton = useRef<HTMLButtonElement>(null);
  const stopButton = useRef<HTMLButtonElement>(null);
  const loop = useRef<ReturnType<typeof createPlayLoop> | null>(null);
  const bestRef = useRef(best);

  useEffect(() => {
    const nodes = { field: field.current, actor: actor.current, facing: facing.current, emote: emote.current };
    if (still || !nodes.field || !nodes.actor || !nodes.facing || !nodes.emote) return;
    const onScore = (next: number) => {
      setScore(next);
      if (next <= bestRef.current) return;
      bestRef.current = next;
      setBest(next);
      writeBest(typeof localStorage === 'undefined' ? undefined : localStorage, next);
    };
    const created = createPlayLoop(
      { field: nodes.field, actor: nodes.actor, facing: nodes.facing, emote: nodes.emote, shadow: shadow.current, sheets: sheets.current, slots: slots.current },
      onScore,
      bestRef.current,
    );
    loop.current = created;
    return () => {
      loop.current = null;
      created.destroy();
      setPhase('start');
    };
  }, [still]);

  useEffect(() => {
    if (phase === 'playing') stopButton.current?.focus({ preventScroll: true });
  }, [phase]);

  const start = () => {
    loop.current?.start(Math.floor(Math.random() * 2 ** 31));
    setScore(0);
    setPhase('playing');
  };

  const stop = () => {
    loop.current?.stop();
    setPhase('start');
    requestAnimationFrame(() => startButton.current?.focus({ preventScroll: true }));
  };

  const ask = (clip: PlayClip) => {
    if (still) setStillPose(clip);
    else loop.current?.ask(clip);
  };

  const point = (event: PointerEvent<HTMLDivElement>) => {
    // A hovering pen or finger is not a request to move; a mouse is followed without a press.
    if (still || (event.type === 'pointermove' && event.pointerType !== 'mouse' && event.buttons === 0)) return;
    const box = event.currentTarget.getBoundingClientRect();
    loop.current?.point(event.clientX - box.left);
  };

  const key = (event: KeyboardEvent<HTMLDivElement>, down: boolean) => {
    if (still || event.altKey || event.metaKey || event.ctrlKey) return;
    const k = event.key.toLowerCase();
    const side = k === 'arrowleft' || k === 'a' ? 'left' : k === 'arrowright' || k === 'd' ? 'right' : null;
    if (!side) return;
    event.preventDefault();
    loop.current?.press(side, down);
  };

  const pose = stillPose ? stillFrame(stillPose) : { sheet: 'companion' as Sheet, frame: NEUTRAL_FRAME };
  const stillEmote = stillPose ? (stillPose === 'magic-fish' ? null : emoteFor(stillPose)) : null;

  return (
    <div className="relative flex min-h-0 flex-1 flex-col" onKeyDown={(event) => key(event, true)} onKeyUp={(event) => key(event, false)}>
      <header className="flex shrink-0 items-center gap-4 py-4 pr-16 pl-5">
        <h2 id={titleId} className="text-title leading-title font-[var(--font-weight-signature)] text-[color:var(--color-text-primary)]">
          {t('title')}
        </h2>
        {still ? null : (
          <p data-testid="moru-playground-score" className="ml-auto flex gap-3 text-body leading-body tabular-nums text-[color:var(--color-text-secondary)]">
            <span>{t('score', { count: score })}</span>
            <span className="text-[color:var(--color-text-tertiary)]">{t('best', { count: best })}</span>
          </p>
        )}
      </header>
      <div
        ref={field}
        data-moru-play-field=""
        data-phase={still ? 'still' : phase}
        onPointerMove={point}
        onPointerDown={point}
        className="relative mx-5 min-h-0 flex-1 touch-none overflow-hidden rounded-panel border border-[color:var(--color-divider)] bg-[color:var(--color-overlay-1)] select-none"
      >
        <span aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 h-2/3 bg-[radial-gradient(ellipse_at_50%_100%,var(--color-indigo-a14),transparent_70%)]" />
        <span aria-hidden className="absolute inset-x-0 bottom-0 border-t border-[color:var(--color-border-soft)] bg-[color:var(--color-overlay-2)]" style={{ height: FLOOR_BAND }} />
        <span
          ref={shadow}
          aria-hidden
          className={cn('pointer-events-none absolute h-2 w-24 rounded-full bg-[color:var(--color-indigo-a22)]', still ? 'left-[calc(50%-3rem)]' : 'left-4')}
          style={{ bottom: FLOOR_BAND - 4 }}
        />
        {still ? null : Array.from({ length: SLOTS }, (_, index) => (
          <span
            key={index}
            ref={(node) => {
              slots.current[index] = node;
            }}
            aria-hidden
            data-moru-play-item=""
            className="pointer-events-none absolute top-0 left-0"
            style={{ width: ITEM, height: ITEM, visibility: 'hidden' }}
          >
            <span className="absolute inset-0 block">
              {EMOTES.map((glyph) => (
                // Wordless pixel drawings, decoration only.
                // eslint-disable-next-line @next/next/no-img-element
                <img key={glyph} data-glyph={glyph} src={withBasePath(`/brand/moru-emote-${glyph}.svg`)} width={ITEM} height={ITEM} alt="" draggable={false} className="absolute inset-0" style={{ imageRendering: 'pixelated' }} />
              ))}
            </span>
            <span className="absolute -inset-2 rounded-full border-2 border-[color:var(--color-indigo-accent)] opacity-0" />
            <span className="absolute inset-x-0 -top-6 text-center text-body-lg leading-body-lg font-[var(--font-weight-signature)] tabular-nums text-[color:var(--color-indigo-text-strong)] opacity-0">
              +1
            </span>
          </span>
        ))}
        <span
          ref={actor}
          aria-hidden
          data-moru-play-actor=""
          className={cn('pointer-events-none absolute block', still ? 'left-[calc(50%-4rem)]' : 'left-0')}
          // The feet stand on the floor line: the cell's bottom sits below it by the cell's foot room.
          style={{ width: CELL, height: CELL, bottom: FLOOR_BAND - (CELL - FEET) }}
        >
          <span ref={facing} className="absolute inset-0 block overflow-hidden">
            {(['companion', 'reactions'] as const).map((name) => {
              const sheet = SHEETS[name];
              const shown = still ? pose.sheet === name : name === 'companion';
              return (
                // Native 128px cells drawn one to one, so every drawn pixel stays square.
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  key={name}
                  ref={(node) => {
                    sheets.current[name] = node;
                  }}
                  data-moru-sheet={name}
                  src={withBasePath(sheet.src)}
                  alt=""
                  draggable={false}
                  hidden={!shown}
                  width={sheet.cell * sheet.columns}
                  height={sheet.cell * sheet.rows}
                  className="absolute top-0 left-0 max-w-none"
                  style={{
                    width: sheet.cell * sheet.columns,
                    height: sheet.cell * sheet.rows,
                    imageRendering: 'pixelated',
                    transform: still ? moruFrame(shown ? pose.frame : NEUTRAL_FRAME, sheet) : moruFrame(NEUTRAL_FRAME, sheet),
                  }}
                />
              );
            })}
          </span>
          <span ref={emote} data-moru-play-emote="" className="absolute top-0.5 block size-6" style={{ left: CELL - 24, opacity: still && stillEmote ? 1 : 0 }}>
            {EMOTES.map((glyph) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img key={glyph} data-glyph={glyph} src={withBasePath(`/brand/moru-emote-${glyph}.svg`)} width={24} height={24} alt="" draggable={false} hidden={glyph !== stillEmote} className="absolute inset-0" style={{ imageRendering: 'pixelated' }} />
            ))}
          </span>
        </span>
        {still ? (
          <p data-testid="moru-playground-still" className="absolute inset-x-0 top-0 mx-auto max-w-[32rem] px-6 pt-6 text-center text-body-lg leading-body-lg text-[color:var(--color-text-secondary)]">
            {t(reducedMotion ? 'reduced' : 'paused')}
          </p>
        ) : phase === 'start' ? (
          <div className="absolute inset-x-0 top-0 flex flex-col items-center gap-4 px-6 pt-6 text-center">
            <p className="max-w-[30rem] text-body-lg leading-body-lg text-[color:var(--color-text-secondary)]">{t('howTo')}</p>
            <Button ref={startButton} data-testid="moru-playground-start" onPointerDown={(event) => event.stopPropagation()} onClick={start}>
              {t('start')}
            </Button>
          </div>
        ) : (
          <Button ref={stopButton} variant="ghost" size="sm" className="absolute top-3 right-3" data-testid="moru-playground-stop" onPointerDown={(event) => event.stopPropagation()} onClick={stop}>
            {t('stop')}
          </Button>
        )}
      </div>
      <div role="group" aria-label={t('toys')} className="flex shrink-0 flex-wrap items-center gap-2 px-5 py-4">
        {TOYS.map((clip) => (
          <Button key={clip} variant="outline" size="sm" data-moru-toy={clip} onClick={() => ask(clip)}>
            {t(TOY_LABEL[clip])}
          </Button>
        ))}
      </div>
      <CloseButton label={t('close')} data-testid="moru-playground-close" className="absolute top-3 right-3" onClick={onClose} />
    </div>
  );
}
