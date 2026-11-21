import {
  BOUNCE,
  CELL,
  FEET,
  IDLE,
  ITEM,
  NEUTRAL_FRAME,
  POWER_MS,
  SETTLE,
  STEP_MS,
  clipTimeline,
  fitTimeline,
  headLine,
  leanFor,
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
import { BIG_GLYPHS, FLOOR_BAND } from './moru-play-art';
import { createHud, type HudNodes } from './moru-play-hud';
import {
  bubbleOpacity,
  bubbleRise,
  countdownDigit,
  countdownOpacity,
  countdownSize,
  scoreFloatOpacity,
  scoreFloatRise,
  scoreFloatSize,
  tierBadgeOpacity,
  tierBadgeRise,
  tierBadgeSize,
} from './moru-play-ramps';
import { SKY, TWINKLE, createSprites, readFieldColors, type SpriteSources } from './moru-play-sprites';

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

export interface GameNodes extends HudNodes {
  field: HTMLElement;
  canvas: HTMLCanvasElement;
}

export interface GameOptions extends SpriteSources {
  best: number;
  calm: boolean;
  scale: number;
  scoreLabel: (score: number) => string;
  onPhase: (phase: Phase) => void;
  onEnd: (result: Result) => void;
}

export const COUNTDOWN_MS = 3000;
const END_BEAT_MS = 700;
const HIT_MS = 300;
const SQUASH_MS = 180;

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

export function createGame(nodes: GameNodes, options: GameOptions) {
  const { field, canvas } = nodes;
  const ctx = canvas.getContext('2d');
  const dpr = Math.max(1, Math.min(3, Math.round(window.devicePixelRatio || 1)));
  const snap = (value: number) => Math.round(value * dpr) / dpr;
  const color = readFieldColors(field);

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
  let squashAt = -Infinity, hitAt = -Infinity, tierAt = -Infinity, tier = 1, bubbleAt = -Infinity;
  let powerWash = 0;
  const hud = createHud(field, nodes, options.scoreLabel);

  const { sheets, sprites, textSprite, countdown, paintSky } = createSprites(dpr, color, options);
  let sky: HTMLCanvasElement | null = null;

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
        hud.beatMultiplier(clock);
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
        hud.beatHeart(clock, event.lives);
        burst(event.x, event.y - ITEM / 2, 12, color.danger, 0.9);
        playClip('hurt', clipTimeline('hurt'), true);
        break;
      case 'power':
        hud.showToast(clock, event.kind);
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
      drawSprite(ctx, shown.sprite, shown.x, shown.y - scoreFloatRise(shown.age, calm), scoreFloatOpacity(shown.age), scoreFloatSize(shown.age, calm));
    }

    const tierAge = clock - tierAt;
    if (tierAge < 900 && tier > 1) {
      drawSprite(ctx, textSprite(`×${tier}`, tier === 4 ? color.gold : color.accent, 5, BIG_GLYPHS), x, headY() - 40 * s - tierBadgeRise(tierAge, calm), tierBadgeOpacity(tierAge), tierBadgeSize(tierAge, calm));
    }

    const bubbleAge = clock - bubbleAt;
    if (bubbleAge < 900) {
      drawSprite(ctx, sprites['spark-small'], x + (mover.facing === 1 ? 44 : -44) * s, headY() - 6 * s - bubbleRise(bubbleAge, calm), bubbleOpacity(bubbleAge));
    }

    if (round?.power) {
      const total = POWER_MS[round.power.kind];
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
      const digit = countdownDigit(into);
      const local = into % 1000;
      if (digit >= 1) drawSprite(ctx, countdown[String(digit)], width / 2, height * 0.42 + 54, countdownOpacity(local), countdownSize(local, calm));
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
    hud.write(round, clock, calm);
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
    sky = paintSky(width, height) ?? sky;
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
      hud.reset();
      tierAt = hitAt = bubbleAt = -Infinity;
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
