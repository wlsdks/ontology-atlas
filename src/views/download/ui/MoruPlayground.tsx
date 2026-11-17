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
  burstAt,
  clipTimeline,
  counterBounceAt,
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
/** The ground strip under Moru's feet. */
const FLOOR_BAND = 28;
const SLOTS = 12;
const BURST = 6;
const VISIBLE_SHARE = 0.2;
/** A field this roomy draws Moru at twice his native cell; anything smaller keeps 128px. */
const ROOMY = { width: 560, height: 380 };
const fits = (node: HTMLElement) => (node.clientWidth >= ROOMY.width && node.clientHeight >= ROOMY.height ? 2 : 1);

/* Set dressing ------------------------------------------------------------------------------ */

/** An 11-pixel star, outlined like the emotes so it reads at a glance against the night. */
const STAR_ROWS = ['.....#.....', '....###....', '....###....', '###########', '.#########.', '..#######..', '..#######..', '.####.####.', '.###...###.', '##.......##'];
function starPaths() {
  const fill = new Set<string>();
  STAR_ROWS.forEach((row, y) => [...row].forEach((c, x) => c === '#' && fill.add(`${x + 1},${y + 1}`)));
  const edge = new Set<string>();
  for (const key of fill) {
    const [x, y] = key.split(',').map(Number);
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const near = `${x + dx},${y + dy}`;
      if (!fill.has(near)) edge.add(near);
    }
  }
  const path = (cells: Set<string>) => [...cells].map((key) => {
    const [x, y] = key.split(',');
    return `M${x} ${y}h1v1h-1z`;
  }).join('');
  return { fill: path(fill), edge: path(edge) };
}
const STAR = starPaths();

function PixelStar({ size }: { size: number }) {
  return (
    <svg aria-hidden viewBox="0 0 13 12" width={size} height={(size * 12) / 13} shapeRendering="crispEdges" className="block">
      <path d={STAR.edge} className="fill-[color:var(--color-canvas)]" />
      <path d={STAR.fill} className="fill-[color:var(--color-text-primary)]" />
    </svg>
  );
}

/** Tiny static stars in the sky, placed by hand so the scene never shifts between visits. */
const SKY = [
  [6, 14, 2], [14, 30, 3], [22, 9, 2], [31, 22, 2], [39, 12, 3], [47, 34, 2], [55, 7, 2],
  [63, 26, 3], [71, 15, 2], [79, 31, 2], [87, 10, 3], [93, 24, 2], [10, 44, 2], [84, 46, 2],
] as const;

function Stage() {
  return (
    <>
      <span aria-hidden className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_bottom,var(--color-indigo-accent-a12),transparent_75%)]" />
      {SKY.map(([left, top, size], index) => (
        <span
          key={index}
          aria-hidden
          className={cn('pointer-events-none absolute', size === 3 ? 'bg-[color:var(--color-indigo-line-a54)]' : 'bg-[color:var(--color-indigo-line-a35)]')}
          style={{ left: `${left}%`, top: `${top}%`, width: size, height: size }}
        />
      ))}
      {/* The ground, with a stepped pixel edge. */}
      <span aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 bg-[color:var(--color-overlay-2)]" style={{ height: FLOOR_BAND }} />
      <span
        aria-hidden
        className="pointer-events-none absolute inset-x-0 h-1 bg-[linear-gradient(90deg,var(--color-overlay-2)_50%,transparent_50%)] bg-[length:8px_4px]"
        style={{ bottom: FLOOR_BAND }}
      />
    </>
  );
}

/** The fish from the magic-fish clip's own cell, cropped from the sheet rather than redrawn. */
const FISH = { frame: 408, x: 73, y: 8, width: 31, height: 19 };
function FishIcon() {
  const sheet = SHEETS.reactions;
  return (
    <span
      aria-hidden
      className="block shrink-0"
      style={{
        width: FISH.width,
        height: FISH.height,
        backgroundImage: `url(${withBasePath(sheet.src)})`,
        backgroundSize: `${sheet.cell * sheet.columns}px ${sheet.cell * sheet.rows}px`,
        backgroundPosition: `${-((FISH.frame % sheet.columns) * sheet.cell + FISH.x)}px ${-(Math.floor(FISH.frame / sheet.columns) * sheet.cell + FISH.y)}px`,
        imageRendering: 'pixelated',
      }}
    />
  );
}

function ToyIcon({ clip }: { clip: (typeof TOYS)[number] }) {
  if (clip === 'magic-fish') return <FishIcon />;
  if (clip === 'clap') return <PixelStar size={26} />;
  const glyph = clip === 'sing' ? 'note' : 'heart';
  // eslint-disable-next-line @next/next/no-img-element
  return <img aria-hidden src={withBasePath(`/brand/moru-emote-${glyph}.svg`)} width={24} height={24} alt="" draggable={false} style={{ imageRendering: 'pixelated' }} />;
}

/* The popup ---------------------------------------------------------------------------------- */

/** The popup a visitor opens from the closing contact strip to play with Moru. */
export function MoruPlayground({ open, onClose }: { open: boolean; onClose: () => void }) {
  const titleId = useId();
  return (
    <Dialog
      open={open}
      onClose={onClose}
      labelledBy={titleId}
      testId="moru-playground"
      className="flex h-[min(34rem,calc(100dvh-2rem))] w-[min(46rem,calc(100vw-2rem))] flex-col overflow-hidden p-0 max-sm:h-[calc(100dvh-1rem)]"
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
  burst: HTMLSpanElement | null;
  counter: () => HTMLElement | null;
  sheets: Record<Sheet, HTMLImageElement | null>;
  slots: Array<HTMLSpanElement | null>;
}

interface Listeners {
  onScore: (score: number) => void;
  /** A clip was asked for (`by` says who asked) or Moru has finished it (`null`). */
  onClip: (clip: PlayClip | null, by: 'toy' | 'game') => void;
}

/**
 * One clock drives Moru, the drops, their pops and the milestone beat, so a hidden tab or a page
 * pause stops all of it on the same frame and resumes from the same frame.
 */
function createPlayLoop(nodes: Nodes, listeners: Listeners, best: number, initialScale: number) {
  let clock = 0, last: number | null = null, frame: number | null = null;
  let width = 0, height = 0, visible = true, disposed = false, scale = initialScale;
  let mover: Mover = { x: 0, v: 0, facing: 1 };
  let target: number | undefined;
  let keys = { left: false, right: false };
  let motion: 'idle' | 'bounce' | 'settle' = 'idle', motionStart = 0;
  let clip: { line: Timeline; start: number; emote: Emote | null } | null = null;
  let pending: { clip: PlayClip; by: 'toy' | 'game' } | null = null;
  let game: Game | null = null, ending = false;
  let beat = -Infinity;
  const dpr = Math.max(1, Math.round(window.devicePixelRatio || 1));
  // Snap to whole device pixels: crisp cells, and half the stepping of whole CSS pixels on 2x screens.
  const snap = (value: number) => Math.round(value * dpr) / dpr;
  const half = () => (CELL * scale) / 2;

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
    const left = snap(mover.x - half());
    nodes.actor.style.transform = `translateX(${left}px)`;
    if (nodes.shadow) nodes.shadow.style.transform = `translateX(${left}px) scaleX(${shadowScale(sheet, pose)})`;
    nodes.facing.style.transform = `scaleX(${mover.facing})`;
    for (const image of Array.from(nodes.emote.children) as HTMLElement[]) image.hidden = image.dataset.glyph !== clip?.emote;
    nodes.emote.style.opacity = String(bubble.opacity);
    nodes.emote.style.transform = `translateY(${-Math.round(bubble.lift)}px)`;
    nodes.emote.style.left = mover.facing === 1 ? `${CELL - 24}px` : '0px';

    const floor = height - FLOOR_BAND;
    if (nodes.burst) {
      const shot = burstAt(clock - beat);
      nodes.burst.style.visibility = shot.opacity > 0 ? 'visible' : 'hidden';
      nodes.burst.style.transform = `translate(${snap(mover.x)}px, ${snap(floor - (FEET - 48) * scale)}px)`;
      Array.from(nodes.burst.children).forEach((child, index) => {
        const angle = -Math.PI / 2 + (index * 2 * Math.PI) / BURST;
        const reach = shot.distance * scale;
        (child as HTMLElement).style.opacity = String(shot.opacity);
        (child as HTMLElement).style.transform = `translate(${snap(Math.cos(angle) * reach - 13)}px, ${snap(Math.sin(angle) * reach - 12)}px) scale(${shot.scale})`;
      });
    }
    const counter = nodes.counter();
    if (counter) counter.style.transform = `scale(${counterBounceAt(clock - beat)})`;

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
      slot.dataset.kind = item.kind;
      slot.style.transform = `translate(${snap(item.x - ITEM / 2)}px, ${snap(item.y - ITEM)}px)`;
      const [glyph, ring, plus] = Array.from(slot.children) as HTMLElement[];
      for (const art of Array.from(glyph.children) as HTMLElement[]) art.style.display = art.dataset.glyph === item.kind ? '' : 'none';
      if (item.state === 'caught') {
        const pop = popAt(item.age);
        glyph.style.opacity = String(pop.opacity);
        glyph.style.transform = `translateY(${pop.drop}px) scale(${pop.scale})`;
        ring.style.opacity = String(pop.ringOpacity);
        ring.style.transform = `scale(${pop.ring})`;
        plus.style.opacity = String(pop.plusOpacity);
        plus.style.transform = `translateY(${-Math.round(pop.plus)}px) scale(${pop.plusScale})`;
      } else {
        glyph.style.opacity = String(item.state === 'missed' ? missAt(item.age) : 1);
        glyph.style.transform = 'none';
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
    const min = half(), max = Math.max(half(), width - half());
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
        listeners.onClip(null, 'game');
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
      clip = { line: clipTimeline(pending.clip), start: clock, emote: emoteFor(pending.clip) };
      nodes.field.dataset.moruClip = pending.clip;
      pending = null;
    }
    if (game) {
      const step = stepGame(game, dt, { width, floor: height - FLOOR_BAND, scale }, {
        x: mover.x,
        canCatch: !clip && !pending && !ending,
        hold: Boolean(clip || pending || ending),
      });
      game = step.game;
      if (step.caught) {
        best = Math.max(best, step.game.score);
        listeners.onScore(step.game.score);
      }
      if (step.milestone) {
        pending = { clip: step.milestone, by: 'game' };
        beat = clock;
        listeners.onClip(step.milestone, 'game');
      }
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
    mover = { ...mover, x: Math.min(Math.max(half(), first ? width / 2 : mover.x), Math.max(half(), width - half())) };
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
      pending = { clip: next, by: 'toy' };
      listeners.onClip(next, 'toy');
      run();
    },
    point(x: number) {
      target = x;
    },
    press(side: 'left' | 'right', down: boolean) {
      keys = { ...keys, [side]: down };
      target = undefined;
    },
    rescale(next: number) {
      if (next === scale) return;
      scale = next;
      measure();
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
  const [activeToy, setActiveToy] = useState<PlayClip | null>(null);
  const [scale, setScale] = useState(1);

  const field = useRef<HTMLDivElement>(null);
  const actor = useRef<HTMLSpanElement>(null);
  const facing = useRef<HTMLSpanElement>(null);
  const sheets = useRef<Record<Sheet, HTMLImageElement | null>>({ companion: null, reactions: null });
  const emote = useRef<HTMLSpanElement>(null);
  const shadow = useRef<HTMLSpanElement>(null);
  const burst = useRef<HTMLSpanElement>(null);
  const counter = useRef<HTMLSpanElement>(null);
  const slots = useRef<Array<HTMLSpanElement | null>>([]);
  const startButton = useRef<HTMLButtonElement>(null);
  const stopButton = useRef<HTMLButtonElement>(null);
  const loop = useRef<ReturnType<typeof createPlayLoop> | null>(null);
  const bestRef = useRef(best);

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
    loop.current?.rescale(scale);
  }, [scale]);

  useEffect(() => {
    const nodes = { field: field.current, actor: actor.current, facing: facing.current, emote: emote.current };
    if (still || !nodes.field || !nodes.actor || !nodes.facing || !nodes.emote) return;
    const created = createPlayLoop(
      {
        field: nodes.field,
        actor: nodes.actor,
        facing: nodes.facing,
        emote: nodes.emote,
        shadow: shadow.current,
        burst: burst.current,
        counter: () => counter.current,
        sheets: sheets.current,
        slots: slots.current,
      },
      {
        onScore: (next) => {
          setScore(next);
          if (next <= bestRef.current) return;
          bestRef.current = next;
          setBest(next);
          writeBest(typeof localStorage === 'undefined' ? undefined : localStorage, next);
        },
        onClip: (clip, by) => setActiveToy(by === 'toy' ? clip : null),
      },
      bestRef.current,
      fits(nodes.field),
    );
    loop.current = created;
    return () => {
      loop.current = null;
      created.destroy();
      setPhase('start');
      setActiveToy(null);
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

  const size = still ? 1 : scale;
  const pose = stillPose ? stillFrame(stillPose) : { sheet: 'companion' as Sheet, frame: NEUTRAL_FRAME };
  const stillEmote = stillPose ? (stillPose === 'magic-fish' ? null : emoteFor(stillPose)) : null;
  const pressed = still ? stillPose : activeToy;
  const keepPress = (event: PointerEvent) => event.stopPropagation();

  return (
    <div className="relative flex min-h-0 flex-1 flex-col" onKeyDown={(event) => key(event, true)} onKeyUp={(event) => key(event, false)}>
      <div
        ref={field}
        data-moru-play-field=""
        data-phase={still ? 'still' : phase}
        onPointerMove={point}
        onPointerDown={point}
        className="relative mx-3 mt-3 min-h-0 flex-1 touch-none overflow-hidden rounded-panel border border-[color:var(--color-divider)] bg-[color:var(--color-panel)] select-none"
      >
        <Stage />
        <span
          ref={shadow}
          aria-hidden
          className={cn('pointer-events-none absolute rounded-full bg-[color:var(--color-canvas-a70)]', still ? 'left-[calc(50%-3rem)]' : 'left-0')}
          style={{ bottom: FLOOR_BAND - 3 * size, width: 96 * size, height: 6 * size, marginLeft: still ? 0 : 16 * size }}
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
            <span className="absolute inset-0 flex items-center justify-center">
              {(['note', 'heart'] as const).map((glyph) => (
                // Moru's own wordless emotes, decoration only.
                // eslint-disable-next-line @next/next/no-img-element
                <img key={glyph} data-glyph={glyph} src={withBasePath(`/brand/moru-emote-${glyph}.svg`)} width={ITEM} height={ITEM} alt="" draggable={false} className="absolute inset-0" style={{ imageRendering: 'pixelated', display: 'none' }} />
              ))}
              <span data-glyph="star" className="block" style={{ display: 'none' }}>
                <PixelStar size={39} />
              </span>
            </span>
            <span className="absolute -inset-2 rounded-full border-2 border-[color:var(--color-indigo-accent)] opacity-0" />
            <span className="absolute -inset-x-4 -top-8 text-center font-mono text-hero leading-hero font-[var(--font-weight-signature)] tabular-nums text-[color:var(--color-indigo-accent)] opacity-0">
              +1
            </span>
          </span>
        ))}
        <span
          ref={actor}
          aria-hidden
          data-moru-play-actor=""
          data-moru-scale={size}
          className={cn('pointer-events-none absolute block', still ? 'left-[calc(50%-4rem)]' : 'left-0')}
          // The feet stand on the ground line: the cell's bottom sits below it by the cell's foot room.
          style={{ width: CELL * size, height: CELL * size, bottom: FLOOR_BAND - (CELL - FEET) * size }}
        >
          {/* A whole-number scale of the native cell keeps every drawn pixel square. */}
          <span className="absolute top-0 left-0 block origin-top-left" style={{ width: CELL, height: CELL, transform: size === 1 ? undefined : `scale(${size})` }}>
            <span ref={facing} className="absolute inset-0 block overflow-hidden">
              {(['companion', 'reactions'] as const).map((name) => {
                const sheet = SHEETS[name];
                const shown = still ? pose.sheet === name : name === 'companion';
                return (
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
                      transform: moruFrame(still && shown ? pose.frame : NEUTRAL_FRAME, sheet),
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
        </span>
        {still ? null : (
          <span ref={burst} aria-hidden data-moru-play-burst="" className="pointer-events-none absolute top-0 left-0 block" style={{ visibility: 'hidden' }}>
            {Array.from({ length: BURST }, (_, index) => (
              <span key={index} className="absolute top-0 left-0 block">
                <PixelStar size={26} />
              </span>
            ))}
          </span>
        )}

        {still || phase === 'start' ? (
          <div className="absolute inset-x-0 top-0 flex flex-col items-center gap-3 px-6 pt-8 text-center max-sm:pt-16">
            <h2 id={titleId} className="text-hero-lg leading-hero-lg font-[var(--font-weight-signature)] tracking-[var(--tracking-display)] text-[color:var(--color-text-primary)]">
              {t('title')}
            </h2>
            <p className="max-w-[30rem] text-body-lg leading-body-lg text-[color:var(--color-text-secondary)]">{t(still ? (reducedMotion ? 'reduced' : 'paused') : 'howTo')}</p>
            {still ? null : (
              <>
                <Button ref={startButton} size="lg" className="mt-2 min-w-32 rounded-full" data-testid="moru-playground-start" onPointerDown={keepPress} onClick={start}>
                  {t('start')}
                </Button>
                {best > 0 ? <p className="text-body leading-body tabular-nums text-[color:var(--color-text-tertiary)]">{t('bestRecord', { count: best })}</p> : null}
              </>
            )}
          </div>
        ) : (
          <>
            <h2 id={titleId} className="sr-only">
              {t('title')}
            </h2>
            <p data-testid="moru-playground-score" className="pointer-events-none absolute top-3 left-4 flex items-baseline gap-3">
              <span className="sr-only">{t('score', { count: score })}</span>
              <span ref={counter} aria-hidden className="inline-block origin-bottom-left font-mono text-hero-lg leading-hero-lg font-[var(--font-weight-signature)] tabular-nums text-[color:var(--color-text-primary)]">
                {score}
              </span>
              <span className="text-body leading-body tabular-nums text-[color:var(--color-text-tertiary)]">{t('best', { count: best })}</span>
            </p>
            <Button ref={stopButton} variant="ghost" size="sm" className="absolute top-3 right-14" data-testid="moru-playground-stop" onPointerDown={keepPress} onClick={stop}>
              {t('stop')}
            </Button>
          </>
        )}
      </div>
      <div role="group" aria-label={t('toys')} className="grid shrink-0 grid-cols-2 gap-2 px-3 py-3 sm:flex sm:justify-center">
        {TOYS.map((clip) => (
          <Button
            key={clip}
            variant="outline"
            size="lg"
            data-moru-toy={clip}
            data-active={pressed === clip ? '' : undefined}
            className="gap-2 rounded-full px-4 data-[active]:translate-y-px data-[active]:border-[color:var(--color-indigo-accent-a50)] data-[active]:bg-[color:var(--color-indigo-accent-a12)] data-[active]:shadow-[var(--shadow-control-press)]"
            onClick={() => ask(clip)}
          >
            <ToyIcon clip={clip} />
            {t(TOY_LABEL[clip])}
          </Button>
        ))}
      </div>
      <CloseButton label={t('close')} data-testid="moru-playground-close" className="absolute top-4 right-4" onClick={onClose} />
    </div>
  );
}
