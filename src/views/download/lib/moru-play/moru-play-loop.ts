import {
  BOUNCE,
  CELL,
  FEET,
  IDLE,
  ITEM,
  NEUTRAL_FRAME,
  ROUND_MS,
  SETTLE,
  STEP_MS,
  COMBO_STEP,
  backOut,
  clipTimeline,
  easeOut,
  fitTimeline,
  headLine,
  leanFor,
  multiplierFor,
  newRound,
  poseAt,
  shadowScale,
  smooth,
  steer,
  stepRound,
  stillFrame,
  topSpeed,
  type ItemKind,
  type Mover,
  type PlayClip,
  type Round,
  type RoundEvent,
  type Sheet,
  type Timeline,
} from './moru-play';
import { BIG_GLYPHS, BUG_ROWS, GOLD_ROWS, STAR_ROWS, pixelSprite, textRows } from './moru-play-art';

/**
 * The Play with Moru round on one canvas. One clock drives Moru, the drops and every effect: the
 * rules advance in fixed 120 Hz steps and each frame draws between the last two, so motion stays
 * even whatever the display's rate. Every sprite is painted once up front; a frame only copies.
 */

export type Phase = 'start' | 'countdown' | 'playing' | 'over';
export type EndReason = 'time' | 'lives' | 'stopped';

export interface Result {
  score: number;
  best: number;
  newBest: boolean;
  bestCombo: number;
  caught: number;
  reason: EndReason;
}

export interface SheetSource {
  src: string;
  cell: number;
  columns: number;
}

export interface GameNodes {
  field: HTMLElement;
  canvas: HTMLCanvasElement;
  score: HTMLElement | null;
  scoreLabel: HTMLElement | null;
  multiplier: HTMLElement | null;
  pips: Array<HTMLElement | null>;
  lives: Array<HTMLElement | null>;
  time: HTMLElement | null;
  timeBar: HTMLElement | null;
  toast: HTMLElement | null;
}

export interface GameOptions {
  best: number;
  calm: boolean;
  scale: number;
  sheets: Record<Sheet, SheetSource>;
  emote: (glyph: 'note' | 'heart' | 'spark') => string;
  fish: { frame: number; x: number; y: number; width: number; height: number };
  scoreLabel: (score: number) => string;
  onPhase: (phase: Phase) => void;
  onEnd: (result: Result) => void;
}

export const FLOOR_BAND = 28;
export const COUNTDOWN_MS = 3000;
const END_BEAT_MS = 700;
const TOAST_MS = 1400;
const HIT_MS = 300;
const SQUASH_MS = 180;

const SKY = [
  [6, 14, 2], [14, 30, 3], [22, 9, 2], [31, 22, 2], [39, 12, 3], [47, 34, 2], [55, 7, 2],
  [63, 26, 3], [71, 15, 2], [79, 31, 2], [87, 10, 3], [93, 24, 2], [10, 44, 2], [84, 46, 2],
] as const;
const TWINKLE = [1, 4, 7, 10, 12];

const TIER_CLIP: Record<number, PlayClip> = { 2: 'clap', 3: 'laugh', 4: 'hearts' };

interface Particle {
  on: boolean;
  x: number;
  y: number;
  vx: number;
  vy: number;
  age: number;
  life: number;
  size: number;
  color: string;
  sprite: HTMLCanvasElement | null;
  spin: number;
}

interface Effect {
  on: boolean;
  kind: ItemKind;
  x: number;
  y: number;
  age: number;
  sprite: HTMLCanvasElement | null;
}

function pool<T>(size: number, make: () => T): T[] {
  return Array.from({ length: size }, make);
}

/** A colour token's value; canvas cannot read `var()`, so each is resolved once from the field. */
function token(styles: CSSStyleDeclaration, name: string): string {
  return styles.getPropertyValue(name).trim();
}

function loadImage(src: string, onReady: () => void): HTMLImageElement {
  const image = new Image();
  image.decoding = 'async';
  image.onload = () => {
    // Decode before the first draw so the frame that first shows it is not the one that pays.
    void (image.decode?.() ?? Promise.resolve()).catch(() => undefined).then(onReady);
  };
  image.src = src;
  return image;
}

export function createGame(nodes: GameNodes, options: GameOptions) {
  const { field, canvas } = nodes;
  const ctx = canvas.getContext('2d');
  const dpr = Math.max(1, Math.min(3, Math.round(window.devicePixelRatio || 1)));
  const snap = (value: number) => Math.round(value * dpr) / dpr;
  const styles = getComputedStyle(field);
  const color = {
    panel: token(styles, '--color-panel'),
    canvas: token(styles, '--color-canvas'),
    shadow: token(styles, '--color-canvas-a70'),
    text: token(styles, '--color-text-primary'),
    muted: token(styles, '--color-text-tertiary'),
    accent: token(styles, '--color-indigo-accent'),
    accentHalf: token(styles, '--color-indigo-accent-a50'),
    accentWash: token(styles, '--color-indigo-accent-a12'),
    starBright: token(styles, '--color-indigo-line-a54'),
    starDim: token(styles, '--color-indigo-line-a35'),
    ground: token(styles, '--color-overlay-2'),
    gold: token(styles, '--color-amber-docs-a100'),
    goldDeep: token(styles, '--color-amber-signal-a60'),
    danger: token(styles, '--color-danger-text-strong'),
    dangerWash: token(styles, '--color-danger-a12'),
  };

  let calm = options.calm;
  let scale = options.scale;
  let best = options.best;
  let width = 0, height = 0, floor = 0;
  let clock = 0, last: number | null = null, frame: number | null = null, acc = 0;
  let visible = true, disposed = false;
  let phase: Phase = 'start', phaseAt = 0;
  let round: Round | null = null;
  let ending: { at: number; reason: EndReason } | null = null;
  let mover: Mover = { x: 0, v: 0, facing: 1 };
  let prevX = 0;
  let target: number | undefined;
  let keys = { left: false, right: false };
  let motion: 'idle' | 'bounce' | 'settle' = 'idle', motionStart = 0;
  let clip: { line: Timeline; start: number; kind: PlayClip } | null = null;
  let squashAt = -Infinity, hitAt = -Infinity, tierAt = -Infinity, tier = 1, bubbleAt = -Infinity, toastAt = -Infinity;
  let heartAt = -Infinity, heartIndex = -1, multAt = -Infinity;
  let powerWash = 0;
  const hud = { score: -1, mult: -1, pips: -1, lives: -1, time: -1, hurry: false, power: '' };

  const sheets: Record<Sheet, HTMLImageElement> = {
    companion: loadImage(options.sheets.companion.src, () => buildFish()),
    reactions: loadImage(options.sheets.reactions.src, () => buildFish()),
  };
  const sprites: Partial<Record<ItemKind | 'spark-small', HTMLCanvasElement>> = {};
  const paint = (size: { w: number; h: number }, draw: (c: CanvasRenderingContext2D) => void) => {
    const sprite = document.createElement('canvas');
    sprite.width = Math.round(size.w * dpr);
    sprite.height = Math.round(size.h * dpr);
    const c = sprite.getContext('2d');
    if (c) {
      c.imageSmoothingEnabled = false;
      c.scale(dpr, dpr);
      draw(c);
    }
    return sprite;
  };
  // Each sprite names what it shows, so a scripted player in a browser test can read the field.
  const keep = (kind: keyof typeof sprites, sprite: HTMLCanvasElement) => {
    sprite.dataset.sprite = kind;
    sprites[kind] = sprite;
  };
  keep('star', pixelSprite(STAR_ROWS, { f: color.text }, 4, dpr, color.canvas));
  keep('gold', pixelSprite(GOLD_ROWS, { f: color.gold, h: color.text, d: color.goldDeep }, 4, dpr, color.canvas));
  keep('bug', pixelSprite(BUG_ROWS, { r: color.danger, k: color.canvas, g: color.muted, l: color.muted }, 4, dpr, color.canvas));
  const emoteImages = {
    note: loadImage(options.emote('note'), () => {
      keep('note', paint({ w: ITEM, h: ITEM }, (c) => c.drawImage(emoteImages.note, 0, 0, ITEM, ITEM)));
    }),
    heart: loadImage(options.emote('heart'), () => {
      keep('heart', paint({ w: ITEM, h: ITEM }, (c) => c.drawImage(emoteImages.heart, 0, 0, ITEM, ITEM)));
    }),
    spark: loadImage(options.emote('spark'), () => {
      keep('slow', paint({ w: ITEM, h: ITEM }, (c) => c.drawImage(emoteImages.spark, 0, 0, ITEM, ITEM)));
      keep('spark-small', paint({ w: 24, h: 24 }, (c) => c.drawImage(emoteImages.spark, 0, 0, 24, 24)));
    }),
  };
  function buildFish() {
    const sheet = sheets.reactions;
    if (sprites.magnet || !sheet.complete || !sheet.naturalWidth) return;
    const { frame: cell, x, y, width: w, height: h } = options.fish;
    const source = options.sheets.reactions;
    const sx = (cell % source.columns) * source.cell + x;
    const sy = Math.floor(cell / source.columns) * source.cell + y;
    keep('magnet', paint({ w: w * 2, h: h * 2 }, (c) => c.drawImage(sheet, sx, sy, w, h, 0, 0, w * 2, h * 2)));
  }
  const floaters = new Map<string, HTMLCanvasElement>();
  const textSprite = (text: string, fill: string, unit: number, face?: typeof BIG_GLYPHS) => {
    const key = `${text}|${fill}|${unit}|${face ? 'big' : 'small'}`;
    let sprite = floaters.get(key);
    if (!sprite) {
      sprite = pixelSprite(textRows(text, face), { f: fill }, unit, dpr, color.canvas);
      floaters.set(key, sprite);
    }
    return sprite;
  };
  for (const base of [10, 50]) for (let m = 1; m <= 4; m += 1) for (const fill of [color.text, color.accent, color.gold]) textSprite(`+${base * m}`, fill, 3);
  for (let m = 2; m <= 4; m += 1) textSprite(`×${m}`, m === 4 ? color.gold : color.accent, 5, BIG_GLYPHS);
  const countdown = Object.fromEntries(Object.entries(BIG_GLYPHS).map(([digit, rows]) => [digit, pixelSprite(rows, { f: color.text }, 12, dpr, color.accentHalf)]));

  let sky: HTMLCanvasElement | null = null;
  function paintSky() {
    if (width <= 0 || height <= 0) return;
    sky = paint({ w: width, h: height }, (c) => {
      c.fillStyle = color.panel;
      c.fillRect(0, 0, width, height);
      const wash = c.createLinearGradient(0, 0, 0, height * 0.75);
      wash.addColorStop(0, color.accentWash);
      wash.addColorStop(1, 'transparent');
      c.fillStyle = wash;
      c.fillRect(0, 0, width, height);
      for (const [left, top, size] of SKY) {
        c.fillStyle = size === 3 ? color.starBright : color.starDim;
        c.fillRect(Math.round((left / 100) * width), Math.round((top / 100) * height), size, size);
      }
      c.fillStyle = color.ground;
      c.fillRect(0, height - FLOOR_BAND, width, FLOOR_BAND);
      for (let x = 0; x < width; x += 8) c.fillRect(x, height - FLOOR_BAND - 4, 4, 4);
    });
    sky.dataset.sprite = 'sky';
  }

  const particles = pool<Particle>(220, () => ({ on: false, x: 0, y: 0, vx: 0, vy: 0, age: 0, life: 0, size: 0, color: '', sprite: null, spin: 0 }));
  const pops = pool<Effect>(24, () => ({ on: false, kind: 'note', x: 0, y: 0, age: 0, sprite: null }));
  const misses = pool<Effect>(24, () => ({ on: false, kind: 'note', x: 0, y: 0, age: 0, sprite: null }));
  const scores = pool<Effect>(24, () => ({ on: false, kind: 'note', x: 0, y: 0, age: 0, sprite: null }));
  const take = <T extends { on: boolean }>(list: T[]) => list.find((item) => !item.on) ?? list[0];
  let rng = 0x9e3779b9;
  const jitter = () => {
    rng = (Math.imul(rng ^ (rng >>> 15), 0x2c1b3c6d) + 0x6d2b79f5) | 0;
    return ((rng >>> 0) % 10_000) / 10_000;
  };

  function burst(x: number, y: number, count: number, tint: string, speed = 1) {
    if (calm) return;
    for (let i = 0; i < count; i += 1) {
      const p = take(particles);
      const angle = -Math.PI / 2 + (jitter() - 0.5) * Math.PI * 1.4;
      const v = (140 + jitter() * 220) * speed;
      Object.assign(p, { on: true, x, y, vx: Math.cos(angle) * v, vy: Math.sin(angle) * v, age: 0, life: 380 + jitter() * 320, size: jitter() < 0.3 ? 4 : 2, color: tint, sprite: null, spin: 0 });
    }
  }

  function confetti() {
    if (calm) return;
    for (let i = 0; i < 46; i += 1) {
      const p = take(particles);
      const gold = i % 3 === 0;
      Object.assign(p, {
        on: true,
        x: jitter() * width,
        y: -20 - jitter() * height * 0.6,
        vx: (jitter() - 0.5) * 40,
        vy: 110 + jitter() * 120,
        age: 0,
        life: 3200 + jitter() * 1200,
        size: 0,
        color: '',
        sprite: (gold ? sprites.gold : sprites.star) ?? null,
        spin: jitter() * Math.PI * 2,
      });
    }
  }

  const half = () => (CELL * scale) / 2;
  const headY = () => headLine(floor, scale);

  function playClip(kind: PlayClip, line: Timeline, force = false) {
    if (clip && !force) return;
    clip = { line, start: clock, kind };
    field.dataset.moruClip = kind;
  }

  const stills = new Map<PlayClip, { sheet: Sheet; frame: number }>();
  const still = (kind: PlayClip) => {
    let shown = stills.get(kind);
    if (!shown) {
      shown = stillFrame(kind);
      stills.set(kind, shown);
    }
    return shown;
  };

  function pose(): { sheet: Sheet; frame: number } {
    if (clip) {
      if (calm) return still(clip.kind);
      return { sheet: clip.line.sheet, frame: poseAt(clip.line, clock - clip.start).frame };
    }
    if (calm) return { sheet: 'companion', frame: NEUTRAL_FRAME };
    if (motion === 'bounce') return { sheet: 'companion', frame: poseAt(BOUNCE, (clock - motionStart) % BOUNCE.total).frame };
    if (motion === 'settle') return { sheet: 'companion', frame: poseAt(SETTLE, clock - motionStart).frame };
    return { sheet: 'companion', frame: poseAt(IDLE, (clock - motionStart) % IDLE.total).frame };
  }

  function updateMotion(dt: number) {
    if (clip && clock - clip.start >= clip.line.total) {
      clip = null;
      delete field.dataset.moruClip;
      motion = 'idle';
      motionStart = clock;
    }
    if (clip) return;
    const moving = Math.abs(mover.v) > 1;
    if (moving) {
      if (motion !== 'bounce') {
        motion = 'bounce';
        motionStart = clock;
      } else {
        const into = clock - motionStart;
        if (Math.floor(into / BOUNCE.total) > Math.floor((into - dt) / BOUNCE.total)) squashAt = clock;
      }
    } else if (motion === 'bounce') {
      const into = clock - motionStart;
      if (Math.floor(into / BOUNCE.total) > Math.floor((into - dt) / BOUNCE.total)) {
        motion = 'settle';
        motionStart = clock;
        squashAt = clock;
      }
    } else if (motion === 'settle' && clock - motionStart >= SETTLE.total) {
      motion = 'idle';
      motionStart = clock;
    }
  }

  function apply(event: RoundEvent) {
    switch (event.type) {
      case 'catch': {
        const pop = take(pops);
        Object.assign(pop, { on: true, kind: event.kind, x: event.x, y: event.y, age: 0, sprite: sprites[event.kind] ?? null });
        const shown = take(scores);
        const fill = event.kind === 'gold' ? color.gold : event.multiplier > 1 ? color.accent : color.text;
        Object.assign(shown, { on: true, kind: event.kind, x: event.x, y: event.y - ITEM, age: 0, sprite: textSprite(`+${event.points}`, fill, 3) });
        const tint = event.kind === 'gold' ? color.gold : event.kind === 'heart' ? color.danger : event.kind === 'star' ? color.text : color.accent;
        burst(event.x, event.y - ITEM / 2, event.kind === 'gold' ? 22 : 9, tint, event.kind === 'gold' ? 1.3 : 1);
        if (event.kind === 'gold') bubbleAt = clock;
        break;
      }
      case 'tier':
        tier = event.multiplier;
        tierAt = clock;
        multAt = clock;
        if (TIER_CLIP[event.multiplier]) playClip(TIER_CLIP[event.multiplier], clipTimeline(TIER_CLIP[event.multiplier], 1.35));
        break;
      case 'miss':
      case 'dodge': {
        const miss = take(misses);
        const kind = event.type === 'dodge' ? 'bug' : event.kind;
        Object.assign(miss, { on: true, kind, x: event.x, y: floor, age: 0, sprite: sprites[kind] ?? null });
        break;
      }
      case 'hit':
        hitAt = clock;
        heartAt = clock;
        heartIndex = event.lives;
        burst(event.x, event.y - ITEM / 2, 12, color.danger, 0.9);
        playClip('hurt', clipTimeline('hurt'), true);
        break;
      case 'power':
        toastAt = clock;
        if (nodes.toast) nodes.toast.dataset.power = event.kind;
        burst(mover.x, headY(), 16, color.accent, 1.2);
        break;
      case 'power-end':
      case 'end':
        break;
    }
  }

  function finish(reason: EndReason) {
    if (!round || phase !== 'playing' || ending) return;
    ending = { at: clock, reason };
  }

  function settleEnd() {
    if (!round || !ending) return;
    const score = round.score;
    const newBest = score > best;
    best = Math.max(best, score);
    const result: Result = { score, best, newBest, bestCombo: round.bestCombo, caught: round.caught, reason: ending.reason };
    ending = null;
    round.items = [];
    setPhase('over');
    if (newBest) {
      playClip('success', clipTimeline('success'), true);
      confetti();
    } else playClip('bow', clipTimeline('bow'), true);
    options.onEnd(result);
  }

  function setPhase(next: Phase) {
    phase = next;
    phaseAt = clock;
    field.dataset.phase = next;
    options.onPhase(next);
  }

  function writeHud() {
    const r = round;
    const score = r?.score ?? 0;
    if (score !== hud.score) {
      hud.score = score;
      if (nodes.score) nodes.score.textContent = String(score);
      if (nodes.scoreLabel) nodes.scoreLabel.textContent = options.scoreLabel(score);
      field.dataset.score = String(score);
    }
    const combo = r?.combo ?? 0;
    const mult = multiplierFor(combo);
    if (mult !== hud.mult) {
      hud.mult = mult;
      if (nodes.multiplier) {
        nodes.multiplier.textContent = `×${mult}`;
        nodes.multiplier.dataset.level = String(mult);
      }
      field.dataset.multiplier = String(mult);
    }
    const pips = mult >= 4 ? COMBO_STEP : combo % COMBO_STEP;
    if (pips !== hud.pips) {
      hud.pips = pips;
      nodes.pips.forEach((pip, i) => pip?.toggleAttribute('data-on', i < pips));
      field.dataset.combo = String(combo);
    }
    const lives = r?.lives ?? 3;
    if (lives !== hud.lives) {
      hud.lives = lives;
      nodes.lives.forEach((heart, i) => heart?.toggleAttribute('data-lost', i >= lives));
      field.dataset.lives = String(lives);
    }
    const left = r ? Math.max(0, ROUND_MS - r.t) : ROUND_MS;
    const seconds = Math.ceil(left / 1000);
    if (seconds !== hud.time) {
      hud.time = seconds;
      if (nodes.time) nodes.time.textContent = String(seconds);
    }
    const hurry = Boolean(r) && seconds <= 10;
    if (hurry !== hud.hurry) {
      hud.hurry = hurry;
      field.toggleAttribute('data-hurry', hurry);
    }
    if (nodes.timeBar) nodes.timeBar.style.transform = `scaleX(${(left / ROUND_MS).toFixed(4)})`;
    const power = r?.power?.kind ?? '';
    if (power !== hud.power) {
      hud.power = power;
      if (power) field.dataset.power = power;
      else delete field.dataset.power;
    }
    nodes.lives.forEach((heart, i) => {
      if (!heart) return;
      const age = clock - heartAt;
      const beat = !calm && i === heartIndex && age < 420 ? 1 + 0.45 * Math.sin(Math.PI * easeOut(age / 420)) : 1;
      heart.style.transform = beat === 1 ? '' : `scale(${beat.toFixed(3)})`;
    });
    if (nodes.multiplier) {
      const age = clock - multAt;
      const beat = !calm && age < 360 ? 1 + 0.35 * Math.sin(Math.PI * easeOut(age / 360)) : 1;
      nodes.multiplier.style.transform = beat === 1 ? '' : `scale(${beat.toFixed(3)})`;
    }
    if (nodes.toast) {
      const age = clock - toastAt;
      nodes.toast.style.opacity = String(age < 0 || age > TOAST_MS ? 0 : age < 160 ? smooth(age / 160) : 1 - smooth((age - TOAST_MS + 300) / 300));
    }
  }

  function drawSprite(c: CanvasRenderingContext2D, sprite: HTMLCanvasElement | undefined | null, cx: number, bottom: number, alpha = 1, size = 1) {
    if (!sprite || alpha <= 0) return;
    const w = (sprite.width / dpr) * size;
    const h = (sprite.height / dpr) * size;
    c.globalAlpha = alpha;
    c.drawImage(sprite, snap(cx - w / 2), snap(bottom - h), w, h);
    c.globalAlpha = 1;
  }

  function drawItem(c: CanvasRenderingContext2D, kind: ItemKind, x: number, bottom: number, alpha: number, age: number) {
    if (kind === 'magnet' || kind === 'slow') {
      const pulse = calm ? 0.5 : 0.5 + 0.5 * Math.sin((age / 700) * Math.PI * 2);
      c.globalAlpha = alpha * (0.55 + 0.35 * pulse);
      c.strokeStyle = color.accent;
      c.lineWidth = 2;
      c.beginPath();
      c.arc(snap(x), snap(bottom - ITEM / 2), ITEM / 2 + 6 + pulse * 2, 0, Math.PI * 2);
      c.stroke();
      c.globalAlpha = 1;
      drawSprite(c, sprites[kind], x, kind === 'magnet' ? bottom - ITEM / 2 + 19 : bottom, alpha);
      return;
    }
    if (kind === 'gold' && !calm) {
      const glint = (age % 900) / 900;
      c.globalAlpha = alpha * Math.sin(Math.PI * glint);
      c.fillStyle = color.text;
      const gx = snap(x + 18), gy = snap(bottom - ITEM + 4);
      c.fillRect(gx - 1, gy - 5, 2, 10);
      c.fillRect(gx - 5, gy - 1, 10, 2);
      c.globalAlpha = 1;
    }
    drawSprite(c, sprites[kind], x, bottom, alpha);
  }

  function draw(alpha: number) {
    if (!ctx || width <= 0) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.imageSmoothingEnabled = false;
    if (sky) ctx.drawImage(sky, 0, 0, width, height);
    else {
      ctx.fillStyle = color.panel;
      ctx.fillRect(0, 0, width, height);
    }
    // A short nudge sideways when a bug lands; never under reduced motion.
    const hitAge = clock - hitAt;
    if (!calm && hitAge < HIT_MS) ctx.translate(snap(Math.sin(hitAge * 0.09) * 5 * (1 - hitAge / HIT_MS)), 0);

    if (!calm) {
      for (const index of TWINKLE) {
        const [left, top] = SKY[index];
        ctx.globalAlpha = 0.35 + 0.65 * (0.5 + 0.5 * Math.sin(clock / 900 + index * 1.7));
        ctx.fillStyle = color.text;
        ctx.fillRect(Math.round((left / 100) * width), Math.round((top / 100) * height), 2, 2);
      }
      ctx.globalAlpha = 1;
    }
    if (powerWash > 0.001) {
      ctx.globalAlpha = powerWash;
      ctx.fillStyle = color.accentWash;
      ctx.fillRect(0, 0, width, height - FLOOR_BAND);
      ctx.globalAlpha = 1;
    }

    for (const miss of misses) {
      if (!miss.on) continue;
      const fade = 1 - smooth(miss.age / 520);
      drawItem(ctx, miss.kind, miss.x, miss.y, fade, miss.age);
    }

    const endFade = ending ? 1 - smooth((clock - ending.at) / 400) : 1;
    const x = prevX + (mover.x - prevX) * alpha;
    if (round) {
      for (const item of round.items) {
        const ix = item.px + (item.x - item.px) * alpha;
        const iy = item.py + (item.y - item.py) * alpha;
        drawItem(ctx, item.kind, ix, iy, endFade, item.age);
      }
    }

    const shown = pose();
    const image = sheets[shown.sheet];
    const s = scale;
    const shadow = shadowScale(shown.sheet, shown.frame);
    ctx.fillStyle = color.shadow;
    ctx.beginPath();
    ctx.ellipse(snap(x), floor, 48 * s * shadow, 3 * s, 0, 0, Math.PI * 2);
    ctx.fill();
    if (round?.power?.kind === 'magnet') {
      const pulse = calm ? 0.5 : 0.5 + 0.5 * Math.sin(clock / 160);
      ctx.strokeStyle = color.accentHalf;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.ellipse(snap(x), floor - 2, 60 * s + pulse * 6, 9 * s + pulse * 2, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
    if (image.complete && image.naturalWidth) {
      const source = options.sheets[shown.sheet];
      const squashAge = clock - squashAt;
      const squash = !calm && squashAge < SQUASH_MS ? Math.sin(Math.PI * (squashAge / SQUASH_MS)) * 0.07 : 0;
      ctx.save();
      ctx.translate(snap(x), floor);
      if (!calm) ctx.rotate(leanFor(mover.v, topSpeed(width)));
      ctx.scale(mover.facing * (1 + squash), 1 - squash);
      ctx.drawImage(
        image,
        (shown.frame % source.columns) * source.cell,
        Math.floor(shown.frame / source.columns) * source.cell,
        source.cell,
        source.cell,
        (-CELL / 2) * s,
        -FEET * s,
        CELL * s,
        CELL * s,
      );
      ctx.restore();
    }

    for (const pop of pops) {
      if (!pop.on) continue;
      const gulp = smooth(pop.age / 220);
      drawSprite(ctx, pop.sprite, pop.x + (x - pop.x) * gulp, pop.y + 14 * gulp, 1 - gulp, 1 - 0.45 * gulp);
      const ring = smooth(pop.age / 380);
      if (ring < 1) {
        ctx.globalAlpha = 1 - ring;
        ctx.strokeStyle = pop.kind === 'gold' ? color.gold : color.accent;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(snap(pop.x), snap(pop.y - ITEM / 2), (ITEM / 2) * (0.7 + 0.9 * ring), 0, Math.PI * 2);
        ctx.stroke();
        ctx.globalAlpha = 1;
      }
    }

    for (const p of particles) {
      if (!p.on) continue;
      const fade = 1 - smooth((p.age - p.life * 0.55) / (p.life * 0.45));
      ctx.globalAlpha = fade;
      if (p.sprite) {
        const w = p.sprite.width / dpr / 2, h = p.sprite.height / dpr / 2;
        ctx.drawImage(p.sprite, snap(p.x - w / 2 + Math.sin(p.spin + p.age / 400) * 10), snap(p.y - h / 2), w, h);
      } else {
        ctx.fillStyle = p.color;
        ctx.fillRect(snap(p.x), snap(p.y), p.size, p.size);
      }
    }
    ctx.globalAlpha = 1;

    for (const shown of scores) {
      if (!shown.on) continue;
      const rise = calm ? 0 : 38 * easeOut(shown.age / 520);
      const opacity = shown.age < 80 ? shown.age / 80 : 1 - smooth((shown.age - 480) / 260);
      const size = calm ? 1 : 0.7 + 0.3 * backOut(shown.age / 260);
      drawSprite(ctx, shown.sprite, shown.x, shown.y - rise, opacity, size);
    }

    const tierAge = clock - tierAt;
    if (tierAge < 900 && tier > 1) {
      const opacity = tierAge < 120 ? tierAge / 120 : 1 - smooth((tierAge - 600) / 300);
      const size = calm ? 1 : 0.6 + 0.4 * backOut(tierAge / 320);
      drawSprite(ctx, textSprite(`×${tier}`, tier === 4 ? color.gold : color.accent, 5, BIG_GLYPHS), x, headY() - 40 * s - (calm ? 0 : 16 * easeOut(tierAge / 900)), opacity, size);
    }

    const bubbleAge = clock - bubbleAt;
    if (bubbleAge < 900) {
      const opacity = bubbleAge < 90 ? bubbleAge / 90 : 1 - smooth((bubbleAge - 650) / 250);
      drawSprite(ctx, sprites['spark-small'], x + (mover.facing === 1 ? 44 : -44) * s, headY() - 6 * s - (calm ? 0 : 6 * easeOut(bubbleAge / 200)), opacity);
    }

    if (round?.power) {
      const total = round.power.kind === 'magnet' ? 5000 : 4000;
      const share = Math.max(0, round.power.left / total);
      const side = x - mover.facing * (48 * s + 30);
      const cx = snap(Math.min(width - 24, Math.max(24, side))), cy = snap(headY() + 12 * s);
      ctx.fillStyle = color.canvas;
      ctx.globalAlpha = 0.72;
      ctx.beginPath();
      ctx.arc(cx, cy, 19, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.strokeStyle = color.accent;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(cx, cy, 19, -Math.PI / 2, -Math.PI / 2 + share * Math.PI * 2);
      ctx.stroke();
      const icon = round.power.kind === 'magnet' ? sprites.magnet : sprites['spark-small'];
      if (icon) {
        const w = icon.width / dpr / (round.power.kind === 'magnet' ? 2 : 1);
        const h = icon.height / dpr / (round.power.kind === 'magnet' ? 2 : 1);
        ctx.drawImage(icon, snap(cx - w / 2), snap(cy - h / 2), w, h);
      }
    }

    if (phase === 'countdown') {
      const into = clock - phaseAt;
      const digit = 3 - Math.floor(into / 1000);
      const local = into % 1000;
      if (digit >= 1) {
        const opacity = local < 80 ? local / 80 : local > 760 ? 1 - smooth((local - 760) / 240) : 1;
        const size = calm ? 1 : 1.45 - 0.45 * backOut(local / 320);
        drawSprite(ctx, countdown[String(digit)], width / 2, height * 0.42 + 54, opacity, size);
      }
    }

    if (!calm && hitAge < 240) {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.globalAlpha = 1 - hitAge / 240;
      ctx.fillStyle = color.dangerWash;
      ctx.fillRect(0, 0, width, height);
      ctx.globalAlpha = 1;
    }
  }

  function fixedStep() {
    const min = half(), max = Math.max(half(), width - half());
    const direction = ((keys.right ? 1 : 0) - (keys.left ? 1 : 0)) as -1 | 0 | 1;
    prevX = mover.x;
    mover = steer(mover, STEP_MS, direction !== 0 ? { direction } : { target }, min, max, topSpeed(width));
    if (phase === 'playing' && round && !ending) {
      for (const event of stepRound(round, STEP_MS, { width, floor, scale }, mover.x)) {
        apply(event);
        if (event.type === 'end') finish(event.reason);
      }
    }
  }

  function advanceEffects(dt: number) {
    for (const p of particles) {
      if (!p.on) continue;
      p.age += dt;
      if (p.age >= p.life || p.y > height + 40) {
        p.on = false;
        continue;
      }
      const s = dt / 1000;
      p.vy += (p.sprite ? 0 : 900) * s;
      p.x += p.vx * s;
      p.y += p.vy * s;
    }
    for (const list of [pops, misses, scores]) {
      for (const effect of list) {
        if (!effect.on) continue;
        effect.age += dt;
        if (effect.age > 760) effect.on = false;
      }
    }
    const washTarget = round?.power?.kind === 'slow' ? 0.9 : 0;
    powerWash += (washTarget - powerWash) * (1 - Math.exp(-dt / 110));
  }

  const tick = (now: number) => {
    frame = null;
    const dt = last === null ? 0 : Math.min(100, now - last);
    last = now;
    clock += dt;
    acc += dt;
    let steps = 0;
    while (acc >= STEP_MS && steps < 12) {
      fixedStep();
      acc -= STEP_MS;
      steps += 1;
    }
    if (steps === 12) acc = 0;
    updateMotion(dt);
    advanceEffects(dt);
    if (phase === 'countdown' && clock - phaseAt >= COUNTDOWN_MS) {
      setPhase('playing');
      acc = 0;
    }
    if (ending && clock - ending.at >= END_BEAT_MS) settleEnd();
    writeHud();
    draw(Math.min(1, acc / STEP_MS));
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
    width = field.clientWidth;
    height = field.clientHeight;
    floor = height - FLOOR_BAND;
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    const x = Math.min(Math.max(half(), first ? width / 2 : mover.x), Math.max(half(), width - half()));
    mover = { ...mover, x };
    prevX = x;
    paintSky();
    draw(1);
  };
  measure();
  const resize = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure);
  resize?.observe(field);
  const observer = typeof IntersectionObserver === 'undefined' ? null : new IntersectionObserver((entries) => {
    visible = entries[entries.length - 1].isIntersecting;
    if (visible) run();
    else halt();
  });
  observer?.observe(field);
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
  field.dataset.phase = phase;
  run();

  return {
    start(seed: number) {
      round = newRound(seed);
      ending = null;
      for (const list of [pops, misses, scores]) for (const effect of list) effect.on = false;
      for (const p of particles) p.on = false;
      hud.score = hud.mult = hud.pips = hud.lives = hud.time = -1;
      tierAt = hitAt = bubbleAt = toastAt = heartAt = multAt = -Infinity;
      setPhase('countdown');
      playClip('wave', fitTimeline(clipTimeline('wave'), COUNTDOWN_MS), true);
      run();
    },
    stop() {
      if (phase === 'countdown') {
        round = null;
        clip = null;
        delete field.dataset.moruClip;
        setPhase('start');
        return;
      }
      finish('stopped');
    },
    point(x: number) {
      target = x;
      run();
    },
    press(side: 'left' | 'right', down: boolean) {
      keys = { ...keys, [side]: down };
      target = undefined;
      run();
    },
    rescale(next: number) {
      if (next === scale) return;
      scale = next;
      measure();
    },
    setCalm(next: boolean) {
      calm = next;
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

export type GameHandle = ReturnType<typeof createGame>;
