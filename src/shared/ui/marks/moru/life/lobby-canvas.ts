/**
 * The lobby's host: one Canvas 2D canvas stepped on the page's pixel beat (every beat while a Moru walks, every
 * other one otherwise, slower while nothing changes), and a capped store of composed poses. Ported from the life prototype's host (`scripts/brand/moru-cast/life/page.js`).
 * The floor is drawn at a room's scale (`unit`, whole or half steps); its fixtures are drawn once a size into a
 * picture the changed rectangles are restored from, so the page holds one canvas.
 *
 * A pose's body is composed once from the indexed sheet with the Moru's palette and the pieces worn on its skin,
 * and kept as an `ImageBitmap`; flippers and props are kept once for everybody. The store is capped
 * (`CACHE_BYTES`), least recently shown out first, never a picture on screen. Showing a pose again is a few
 * `drawImage` calls into the rectangles that changed. The canvas holds the floor's own pixels and the page scales
 * it up unsmoothed, so a changed rectangle is a quarter of the device pixels on a Retina screen.
 */
import { PIXEL_BEAT_MS, onPixelBeat } from '@/shared/motion/pixel-beat';
import { pixelStage, type PixelStage } from '@/shared/motion/pixel-stage';
import { facingClip, type LifeAtlas, type LifeClip, type LifePose, type PiecePart } from './atlas';
import { centre, createWorld, fidget, standing, tick, type Moru, type World } from './behaviour';
import { crewSize, nearestGap, openLobby, setCrew, tend, type Presence } from './presence';
import { NAPPING_REACH, STANDING_REACH, drawFixtures, lobbyClearance, lobbySpots } from './lobby-props';
import { freshWorn, placeWear, type Placed, type Worn } from './wardrobe';

export const LIFE_SHEETS = {
  atlas: '/brand/moru-life.json',
  base: '/brand/moru-life-base.png',
  over: '/brand/moru-life-over.png',
  wardrobe: '/brand/moru-life-wardrobe.png',
  props: '/brand/moru-life-props.png',
};
/** How many ticks' time it sleeps at most while nothing changes. */
const SLOWEST = 2;
/** How many poses ahead of each Moru the idle page composes. */
const AHEAD = 4;
/** Clips of a Moru only standing: its idle poses advance every `STANDING_BEATS` beats. */
/** Only standing still slows the tick; a blink plays at the beat, so it is over in a moment. */
const STANDING = new Set(['rest']);
const STANDING_BEATS = 4;
/** The most beats a resting floor waits before it looks in again. */
const CALM_BEATS = 8;
/**
 * The time to the lobby's next tick: every pixel beat while a Moru walks or plays a clip, every fourth
 * (600 ms) while every Moru only stands or blinks. A clip keeps its own time across a longer tick.
 */
export const lobbyTickMs = (world: Pick<World, 'morus' | 'atlas'>) =>
  (world.morus.some(m => m.door || !STANDING.has(m.clip) || m.plan.length) ? 1 : STANDING_BEATS) * PIXEL_BEAT_MS;
/** The composed-pose store's cap: under the spec's 24 MB, for a floor of five. */
export const CACHE_BYTES = 8 * 1048576;
/** Lanes are this far apart; the back lane's feet stand `BACK_FEET` px from the canvas top. */
export const LANE_DY = 26;
export const BACK_FEET = 102;
/** The canvas's height: three lanes of 128px Moru and the front lane's shadow. */
export const LOBBY_H = BACK_FEET + 2 * LANE_DY + 4;
/** Moru keep a body and a half between them in the lobby. */
export const LOBBY_SEP = 150;
/** One or two Moru move at once while the screen is lively; one, or a pair playing together, in the lobby's turn. */
const LOBBY_BUSY = 2;
/** The lobby's name on the page's stage (`pixel-stage.ts`). */
const ACTOR = 'lobby';
/** Somebody comes in or goes out at least this often: the lobby's turn brings a doorway walk when one is due. */
const DOOR_EVERY_MS = 36_000;
/** The small things a resting floor does to break a long stillness, one Moru at a time in turn. */
const FIDGETS = ['blink', 'look-ahead', 'blink', 'look-back', 'sway'];

/** The pad a layer is composed on: the 128px cell with room round it for pieces that reach outside. */
const OX = 40, OY = 24, CW = 208, CH = 152;

interface Sheet { data: Uint8Array; w: number; h: number }
interface Kept { bmp: ImageBitmap | null; x: number; y: number; bytes: number; shown: number }
interface Rect { x: number; y: number; w: number; h: number }
interface Drawn {
  m: Moru;
  worn: Worn;
  body: Kept | null;
  over: Kept | null;
  layered: Placed[];
  f: LifePose | null;
  X: number;
  Y: number;
  left: boolean;
  rect: Rect | null;
  reach: number;
  cx: number;
  lut: Uint32Array;
}

const hex32 = (hex: string) => {
  const n = parseInt(hex.replace('#', ''), 16);
  return (0xff000000 | ((n & 0xff) << 16) | (n & 0xff00) | (n >> 16)) >>> 0;
};
const hits = (a: Rect, b: Rect) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

export interface LobbyStats {
  running: boolean;
  /** Moru whose body is inside the floor. */
  visible: number;
  /** The nearest two middles on the floor, px. */
  gap: number;
  keptBytes: number;
  peakKeptBytes: number;
  composed: number;
  /** Poses composed on the beat because none was ready; the rest were composed ahead while the page was idle. */
  composedOnBeat: number;
  found: number;
  /** Ticks that drew something: the lobby's share of the page's updates. */
  painted: number;
}

export interface Lobby {
  /** A new width or scale; Moru the narrower floor left outside walk back in. */
  resize(width: number, unit?: number): void;
  setCrew(resting: number): void;
  /** Runs the clock while allowed (on screen, in a visible window, motion allowed); a still lobby otherwise. */
  sync(allowed: boolean): void;
  stats(): LobbyStats;
  destroy(): void;
}

/** Loads the sheets and returns a lobby drawing into `canvas`, or null when the page went away meanwhile. */
export async function createLobby(canvas: HTMLCanvasElement, { width, unit = 1, resting, rand, basePath = '', stage = pixelStage }: {
  width: number; unit?: number; resting: number; rand: () => number; basePath?: string; stage?: PixelStage;
}): Promise<Lobby | null> {
  const colours = [0];
  const colourIndex = new Map<number, number>([[0, 0]]);
  /** A sheet as one byte per pixel: a quarter of the decoded size, and the palette swap becomes a table lookup. */
  const indexed = async (src: string): Promise<Sheet> => {
    const blob = await (await fetch(basePath + src)).blob();
    const bitmap = await createImageBitmap(blob);
    const pad = new OffscreenCanvas(bitmap.width, bitmap.height);
    const g = pad.getContext('2d', { willReadFrequently: true })!;
    g.drawImage(bitmap, 0, 0);
    bitmap.close();
    const d = new Uint32Array(g.getImageData(0, 0, pad.width, pad.height).data.buffer), out = new Uint8Array(d.length);
    let lastV = 0, lastI = 0;
    for (let i = 0; i < d.length; i++) {
      const v = d[i];
      if (v !== lastV) {
        lastV = v;
        if (v >>> 24 === 0) lastI = 0;
        else {
          let k = colourIndex.get(v);
          if (k === undefined) { k = colours.length; colours.push(v); colourIndex.set(v, k); }
          lastI = k;
        }
      }
      out[i] = lastI;
    }
    const sheet = { data: out, w: pad.width, h: pad.height };
    pad.width = pad.height = 0;
    return sheet;
  };
  const atlas = (await (await fetch(basePath + LIFE_SHEETS.atlas)).json()) as LifeAtlas;
  const BASE = await indexed(LIFE_SHEETS.base), OVER = await indexed(LIFE_SHEETS.over), CLOTHES = await indexed(LIFE_SHEETS.wardrobe);
  const PROPS = await createImageBitmap(await (await fetch(basePath + LIFE_SHEETS.props)).blob());
  if (!canvas.isConnected) { PROPS.close(); return null; }
  const clips = atlas.clips;
  const STONE = colourIndex.get(hex32(atlas.tones.body))!, IVORY = colourIndex.get(hex32(atlas.tones.belly))!;
  const plain = Uint32Array.from(colours);
  /** The outline ink, the darkest colour on the sheet, as CSS. */
  const darkest = colours.slice(1).reduce((a, b) => ((a & 0xff) + ((a >> 8) & 0xff) + ((a >> 16) & 0xff) <= (b & 0xff) + ((b >> 8) & 0xff) + ((b >> 16) & 0xff) ? a : b));
  const shadowInk = `#${[darkest & 0xff, (darkest >> 8) & 0xff, (darkest >> 16) & 0xff].map(v => v.toString(16).padStart(2, '0')).join('')}`;
  const luts = new Map<string, Uint32Array>();
  const lutOf = (name: string) => {
    let lut = luts.get(name);
    if (lut) return lut;
    lut = Uint32Array.from(colours);
    const [bodyHex, bellyHex] = atlas.palettes[name] ?? atlas.palettes.original;
    lut[STONE] = hex32(bodyHex);
    lut[IVORY] = hex32(bellyHex);
    luts.set(name, lut);
    return lut;
  };
  // The wardrobe sheet as pictures: plain, and one per palette for the pieces that take the body's colours.
  const clothes = new Map<Uint32Array, OffscreenCanvas>();
  const clothesOf = (lut: Uint32Array) => {
    let el = clothes.get(lut);
    if (el) return el;
    el = new OffscreenCanvas(CLOTHES.w, CLOTHES.h);
    const g = el.getContext('2d')!, img = g.createImageData(CLOTHES.w, CLOTHES.h), d = new Uint32Array(img.data.buffer);
    for (let i = 0; i < d.length; i++) d[i] = CLOTHES.data[i] ? lut[CLOTHES.data[i]] : 0;
    g.putImageData(img, 0, 0);
    clothes.set(lut, el);
    return el;
  };
  // For every pose: the part of its clip's box it really fills.
  const filled = new Map<LifePose, [number, number, number, number]>();
  const cellAt = (c: LifeClip, fr: number) => [(fr % c.per) * c.box[2], c.at + Math.floor(fr / c.per) * c.box[3]] as const;
  for (const c of Object.values(clips)) {
    const [, , bw, bh] = c.box;
    c.f.forEach((f, fr) => {
      const [sx, sy] = cellAt(c, fr);
      let x0 = bw, x1 = -1, y0 = bh, y1 = -1;
      for (let y = 0; y < bh; y++) {
        const row = (sy + y) * BASE.w + sx;
        for (let x = 0; x < bw; x++) if (BASE.data[row + x] || OVER.data[row + x]) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; y1 = y; }
      }
      filled.set(f, x1 < 0 ? [0, 0, 0, 0] : [x0, y0, x1 + 1, y1 + 1]);
    });
  }

  let width_ = Math.max(320, Math.floor(width)), unit_ = unit;
  /** Canvas pixels per floor pixel: whole, so a pose lands on whole pixels; the page scales the canvas up. */
  let k = Math.ceil(unit_), floorW = Math.floor(width_ / unit_);
  const ctx = canvas.getContext('2d')!;
  const fixtures = new OffscreenCanvas(1, 1), fixturesCtx = fixtures.getContext('2d')!;
  const fit = () => {
    k = Math.ceil(unit_);
    floorW = Math.floor(width_ / unit_);
    canvas.width = fixtures.width = Math.round(floorW * k);
    canvas.height = fixtures.height = Math.round(LOBBY_H * k);
    canvas.style.width = `${width_}px`;
    canvas.style.height = `${LOBBY_H * unit_}px`;
    ctx.imageSmoothingEnabled = false;
    fixturesCtx.setTransform(k, 0, 0, k, 0, 0);
    drawFixtures(fixturesCtx, floorW, BACK_FEET, BACK_FEET + 2 * LANE_DY, PROPS, atlas.props);
  };
  fit();
  /** Where a Moru on a floor this wide may stand or nap, clear of the fixtures. */
  const clearanceFor = (w: number): World['standsClear'] => {
    const clear = lobbyClearance(w, BACK_FEET, LANE_DY, BACK_FEET + 2 * LANE_DY, atlas.props);
    return (at, depth, napping) => clear(at, depth, napping ? NAPPING_REACH : STANDING_REACH);
  };

  const world: World = createWorld({ atlas, width: floorW, lanes: 3, rand, busyMax: LOBBY_BUSY, sep: LOBBY_SEP, extra: 1, spots: lobbySpots(floorW), standsClear: clearanceFor(floorW) });
  const presence: Presence = openLobby(world, crewSize(resting));

  // The kept pictures, least recently shown first. A picture on screen is never given up.
  const kept = new Map<string, Kept>();
  const shot = new ImageData(CW, CH), px = new Uint32Array(shot.data.buffer), fill = new Uint8Array(CW * CH);
  const pad = new OffscreenCanvas(8, 8), padCtx = pad.getContext('2d', { willReadFrequently: true })!;
  let keptBytes = 0, peakBytes = 0, found = 0, composed = 0, onBeat = 0;
  const bodyKey = (palette: string, id: string, fr: number, skin: Placed[]) =>
    `${palette}|${id}|${fr}|${skin.map(({ part }) => `${part.sx},${part.x},${part.y}`).join()}`;
  const keep = (key: string, make: () => Kept) => {
    let e = kept.get(key);
    if (e) { kept.delete(key); kept.set(key, e); found++; return e; }
    e = make();
    kept.set(key, e);
    keptBytes += e.bytes;
    composed++;
    peakBytes = Math.max(peakBytes, keptBytes);
    if (keptBytes > CACHE_BYTES) for (const [k, old] of kept) {
      if (old.shown || old === e) continue;
      kept.delete(k);
      keptBytes -= old.bytes;
      old.bmp?.close();
      if (keptBytes <= CACHE_BYTES) break;
    }
    return e;
  };
  /** Cuts what was drawn into `px` out as a picture, in cell coordinates. */
  const cut = (c0: number, c1: number, r0: number, r1: number): Kept => {
    if (c1 < c0) return { bmp: null, x: 0, y: 0, bytes: 64, shown: 0 };
    const w = c1 - c0 + 1, h = r1 - r0 + 1;
    pad.width = w;
    pad.height = h;
    padCtx.putImageData(shot, -c0, -r0, c0, r0, w, h);
    return { bmp: pad.transferToImageBitmap(), x: c0 - OX, y: r0 - OY, bytes: w * h * 4, shown: 0 };
  };
  /** One sheet layer of one pose, with the pieces worn on the skin laid onto the body fill. */
  const layer = (sheet: Sheet, c: LifeClip, fr: number, f: LifePose, lut: Uint32Array, skin: Placed[]) => {
    const [bx, by] = c.box, t = filled.get(f)!, [sx, sy] = cellAt(c, fr);
    px.fill(0);
    for (let y = t[1]; y < t[3]; y++) {
      const row = (sy + y) * sheet.w + sx, to = (OY + by + y) * CW + OX + bx;
      for (let x = t[0]; x < t[2]; x++) { const k = sheet.data[row + x]; if (k) px[to + x] = lut[k]; }
    }
    let c0 = CW, c1 = -1, r0 = CH, r1 = -1;
    for (let y = OY + by + t[1]; y < OY + by + t[3]; y++) for (let x = OX + bx + t[0]; x < OX + bx + t[2]; x++) if (px[y * CW + x]) {
      if (x < c0) c0 = x; if (x > c1) c1 = x; if (y < r0) r0 = y; r1 = y;
    }
    const stone = lut[STONE], ivory = lut[IVORY];
    for (const { part: p, x: X, y: Y } of skin) {
      const table = p.tint ? lut : plain, x0 = (f.flip ? 136 - (X + p.w - 1) : X) + f.px;
      for (let r = 0; r < p.h; r++) for (let q = 0; q < p.w; q++) {
        const v = CLOTHES.data[r * CLOTHES.w + p.sx + (f.flip ? p.w - 1 - q : q)];
        if (!v) continue;
        const x = OX + x0 + q, y = OY + Y + r;
        if (x < 0 || y < 0 || x >= CW || y >= CH) continue;
        const at = y * CW + x;
        if (px[at] === stone || px[at] === ivory || fill[at] === 1) { px[at] = table[v]; fill[at] = 1; }
      }
    }
    if (skin.length) fill.fill(0);
    return cut(c0, c1, r0, r1);
  };

  const drawn = new Map<Moru, Drawn>();
  const dirty: Rect[] = [];
  const add = (r: Rect) => {
    if (r.w <= 0 || r.h <= 0) return;
    for (let i = 0; i < dirty.length; i++) {
      const d = dirty[i];
      if (!hits(d, r)) continue;
      const x = Math.min(d.x, r.x), y = Math.min(d.y, r.y);
      dirty.splice(i, 1);
      add({ x, y, w: Math.max(d.x + d.w, r.x + r.w) - x, h: Math.max(d.y + d.h, r.y + r.h) - y });
      return;
    }
    dirty.push(r);
  };
  let still = false;

  /** Picks the pictures for the Moru's pose now (composing what is new) and marks what has to be redrawn. */
  const compose = (s: Drawn) => {
    const m = s.m, id = facingClip(atlas, m.clip, m.facing), c = clips[id];
    const fr = still && m.clip !== 'rest' ? c.still : m.frame, f = c.f[fr], box = c.box, t = filled.get(f)!;
    const { skin, layered } = placeWear(atlas, c, id, fr, m, s.worn);
    s.lut = lutOf(m.palette);
    let c0 = box[0] + t[0], c1 = box[0] + t[2], r0 = box[1] + t[1];
    const cx = Math.round(f.cx), reach = f.air || m.height ? 20 : 30, turned = !!f.angle;
    for (const { part: p, x: X, y: Y } of layered) {
      const x0 = (f.flip ? 136 - (X + p.w - 1) : X) + f.px;
      // A turned piece may reach anywhere within its own diagonal of where it sits.
      const far = turned ? Math.ceil(Math.hypot(p.w, p.h)) + 40 : 0;
      c0 = Math.min(c0, x0 - far); c1 = Math.max(c1, x0 + p.w + far); r0 = Math.min(r0, Y - far);
    }
    const before = composed;
    const body = keep(bodyKey(m.palette, id, fr, skin), () => layer(BASE, c, fr, f, s.lut, skin));
    const over = keep(`over|${id}|${fr}`, () => layer(OVER, c, fr, f, plain, []));
    onBeat += composed - before;
    const X = Math.round(m.x), Y = Math.round(BACK_FEET + m.depth * LANE_DY - m.height) - 100, left = m.facing < 0;
    c0 = Math.min(c0, cx - reach); c1 = Math.max(c1, cx + reach);
    if (s.body) s.body.shown--;
    if (s.over) s.over.shown--;
    s.body = body; s.over = over; body.shown++; over.shown++;
    s.layered = layered.map(placed => ({ ...placed, x: (f.flip ? 136 - (placed.x + placed.part.w - 1) : placed.x) + f.px }));
    Object.assign(s, { X, Y, left, f, reach, cx });
    const x = Math.max(0, left ? X + 137 - c1 : X + c0), y = Math.max(0, Y + r0);
    const whole = { x, y, w: Math.min(floorW, (left ? X + 137 - c0 : X + c1)) - x, h: Math.min(LOBBY_H, Y + 102) - y };
    if (s.rect) add(s.rect);
    add(whole);
    s.rect = whole;
  };
  /** Draws one Moru, back to front, in its own cell's coordinates (mirrored for one that faces left). */
  const stamp = (s: Drawn) => {
    const f = s.f!, sheet = clothesOf(s.lut), plainClothes = clothesOf(plain);
    ctx.setTransform(s.left ? -k : k, 0, 0, k, (s.left ? s.X + 137 : s.X) * k, s.Y * k);
    // The contact shadow is Moru's own outline ink from the sheet, at the sprites' shadow strength.
    ctx.fillStyle = shadowInk;
    ctx.globalAlpha = 0.2745;
    ctx.fillRect(s.cx - s.reach + 1, 100, 2 * s.reach - 1, 1);
    ctx.fillRect(s.cx - s.reach + 7, 101, 2 * s.reach - 13, 1);
    ctx.globalAlpha = 1;
    const wear = (at: PiecePart['layer']) => {
      for (const { part: p, x: x0, y: y0 } of s.layered) {
        if (p.layer !== at) continue;
        const from = p.tint ? sheet : plainClothes;
        if (!f.angle && !f.flip) { ctx.drawImage(from, p.sx, 0, p.w, p.h, x0, y0, p.w, p.h); continue; }
        // A mirrored or turned pose: the piece is mirrored in place, and turned about the point the body turned about;
        // a small piece is seated three pixels into the body on a turned pose.
        let ix = 0, iy = 0;
        if (f.angle && f.pv && p.w * p.h < 700) {
          const dx = f.pv[0] - (x0 + p.w / 2), dy = f.pv[1] - (y0 + p.h / 2), d = Math.hypot(dx, dy) || 1;
          ix = Math.round((3 * dx) / d); iy = Math.round((3 * dy) / d);
        }
        ctx.save();
        if (f.angle && f.pv) { ctx.translate(f.pv[0], f.pv[1] - (f.sk ?? 0)); ctx.rotate((f.angle * Math.PI) / 180); ctx.translate(-f.pv[0], -f.pv[1]); }
        if (f.flip) { ctx.translate(x0 + p.w + ix, y0 + iy); ctx.scale(-1, 1); ctx.drawImage(from, p.sx, 0, p.w, p.h, 0, 0, p.w, p.h); }
        else ctx.drawImage(from, p.sx, 0, p.w, p.h, x0 + ix, y0 + iy, p.w, p.h);
        ctx.restore();
      }
    };
    wear('behind');
    if (s.body?.bmp) ctx.drawImage(s.body.bmp, s.body.x, s.body.y);
    wear('front');
    if (s.over?.bmp) ctx.drawImage(s.over.bmp, s.over.x, s.over.y);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
  };

  let moved = false;
  const paint = () => {
    dirty.length = 0;
    // Moru that left the floor are cleared where they were last drawn.
    for (const [m, s] of drawn) if (!world.morus.includes(m)) { if (s.rect) add(s.rect); if (s.body) s.body.shown--; if (s.over) s.over.shown--; drawn.delete(m); }
    for (const m of world.morus) {
      let s = drawn.get(m);
      if (!s) {
        s = { m, worn: freshWorn(m.x), body: null, over: null, layered: [], f: null, X: 0, Y: 0, left: false, rect: null, reach: 30, cx: 74, lut: plain };
        drawn.set(m, s);
      }
      if (!m.changed && !s.worn.settling && s.rect) continue;
      compose(s);
      m.changed = false;
    }
    moved = dirty.length > 0;
    if (!moved) return;
    // Back to front.
    const order = [...drawn.values()].sort((a, b) => a.m.depth - b.m.depth);
    for (const r of dirty) {
      // The rectangle in whole device pixels, restored from the fixtures, then the Moru in it back to front.
      const x0 = Math.floor(r.x * k), y0 = Math.floor(r.y * k), w = Math.ceil((r.x + r.w) * k) - x0, h = Math.ceil((r.y + r.h) * k) - y0;
      ctx.save();
      ctx.beginPath();
      ctx.rect(x0, y0, w, h);
      ctx.clip();
      ctx.clearRect(x0, y0, w, h);
      ctx.drawImage(fixtures, x0, y0, w, h, x0, y0, w, h);
      for (const s of order) if (s.rect && hits(s.rect, r)) stamp(s);
      ctx.restore();
    }
  };

  /**
   * Composes the next poses of every Moru on the floor while the page is idle, so the beat only copies kept
   * pictures. A pose the guess missed is still composed on the beat.
   */
  let aheadQueued = false;
  const whenIdle: (run: (deadline: { timeRemaining(): number }) => void) => void =
    typeof window.requestIdleCallback === 'function'
      ? run => window.requestIdleCallback(run, { timeout: 2 * PIXEL_BEAT_MS })
      : run => window.setTimeout(() => run({ timeRemaining: () => 8 }), 0);
  const ahead = () => {
    if (aheadQueued) return;
    aheadQueued = true;
    whenIdle(deadline => {
      aheadQueued = false;
      for (const s of drawn.values()) {
        const m = s.m, id = facingClip(atlas, m.clip, m.facing), c = clips[id];
        if (!c) continue;
        const worn = { ...s.worn, levels: { ...s.worn.levels } }, lut = lutOf(m.palette);
        for (let k = 1; k <= AHEAD; k++) {
          if (deadline.timeRemaining() < 2) return;
          const fr = (m.frame + k) % c.f.length, f = c.f[fr];
          const { skin } = placeWear(atlas, c, id, fr, m, worn);
          keep(bodyKey(m.palette, id, fr, skin), () => layer(BASE, c, fr, f, lut, skin));
          keep(`over|${id}|${fr}`, () => layer(OVER, c, fr, f, plain, []));
        }
      }
    });
  };

  let leave: (() => void) | null = null, slow = 0, running = false, painted = 0, onStage = false, turnTicks = 0;
  /** When the last doorway walk began, by the floor's clock, and how many there had been then. */
  let doorAt = 0, doors = 0, fidgets = 0, lastFidget = '';
  const doorWalks = () => world.stats.entered + world.stats.left;
  /** The next Moru in turn, standing free, does one small thing, never the same thing twice running. */
  const fidgetNext = () => {
    const free = world.morus.filter(m => m.clip === 'rest' && !m.door && !m.plan.length);
    if (!free.length) return;
    const m = free[fidgets++ % free.length], choices = FIDGETS.filter(clip => clip !== lastFidget);
    const clip = choices[Math.floor(world.rand() * choices.length)];
    if (fidget(world, m, clip)) lastFidget = clip;
  };
  /** Every Moru standing on the floor, none on a doorway walk: the lobby is at rest. */
  const settled = () => world.morus.every(m => standing(m) && !m.door);
  /**
   * One tick on the beat over the time since the last; returns the beats until the next. The lobby is one
   * actor on the page's stage: lively, it plays as it always has; in its turn one Moru, or a pair, does one
   * thing; otherwise its floor rests.
   */
  const beat = (now: number, elapsedMs: number) => {
    if (!onStage) { onStage = true; stage.join(ACTOR, now); }
    const lively = stage.lively(now), may = stage.may(ACTOR, now);
    world.calm = !may;
    world.busyMax = lively ? LOBBY_BUSY : may ? 1 : 0;
    world.extra = lively ? 1 : 0;
    tick(world, elapsedMs || PIXEL_BEAT_MS);
    // Moru come and go while the screen is lively; a turn is one short thing on the floor, or a doorway walk when one is due.
    if (lively) tend(world, presence);
    else if (stage.holds(ACTOR) && turnTicks === 0 && world.now - doorAt >= DOOR_EVERY_MS) tend(world, presence, true);
    if (doorWalks() !== doors) { doors = doorWalks(); doorAt = world.now; }
    paint();
    if (moved) painted++;
    // Composes, while the page is idle, the poses the Moru on the floor will show next.
    ahead();
    if (moved) stage.moved(now);
    let granted = false;
    if (stage.holds(ACTOR) && !lively) {
      // The turn is over once the floor stands again, or when nobody took it up within a few ticks.
      turnTicks++;
      if (settled() && (turnTicks > 3 || moved)) { stage.release(ACTOR, now); turnTicks = 0; }
    } else if (!lively && settled()) {
      granted = stage.ask(ACTOR, now);
      // Still too long: the next Moru in turn does one small thing.
      if (!granted && stage.breathe(ACTOR, now)) fidgetNext();
    }
    slow = moved ? 0 : Math.min(slow + 1, SLOWEST);
    const beats = Math.round(lobbyTickMs(world) / PIXEL_BEAT_MS) * (1 + slow);
    // A resting floor still looks in every 1.2 s, to ask for its turn or blink a long rest awake.
    return granted ? 1 : world.calm ? Math.min(beats, CALM_BEATS) : beats;
  };
  const offStage = () => {
    if (!onStage) return;
    onStage = false;
    turnTicks = 0;
    stage.leave(ACTOR, performance.now());
  };
  const redrawAll = () => {
    for (const s of drawn.values()) { s.rect = null; s.m.changed = true; }
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(fixtures, 0, 0);
    paint();
  };
  redrawAll();

  return {
    resize(nextWidth, nextUnit = unit_) {
      const w = Math.max(320, Math.floor(nextWidth));
      if (w === width_ && nextUnit === unit_) return;
      width_ = w;
      unit_ = nextUnit;
      fit();
      world.width = floorW;
      world.spots = lobbySpots(floorW);
      world.standsClear = clearanceFor(floorW);
      // A Moru the narrower floor left outside walks back in as a newcomer would; none is moved.
      redrawAll();
    },
    setCrew(restingNow) { setCrew(presence, crewSize(restingNow)); },
    sync(allowed) {
      const wasStill = still;
      still = !allowed;
      if (allowed && !running) { running = true; leave = onPixelBeat(beat); }
      if (!allowed && running) { running = false; leave?.(); leave = null; offStage(); }
      if (wasStill !== still) redrawAll();
      canvas.dataset.lobbyRunning = String(running);
    },
    stats: () => ({
      running,
      visible: world.morus.filter(m => centre(m) - 48 > 0 && centre(m) + 48 < world.width).length,
      gap: nearestGap(world),
      keptBytes, peakKeptBytes: peakBytes, composed, found, composedOnBeat: onBeat, painted,
    }),
    destroy() {
      leave?.();
      leave = null;
      offStage();
      running = false;
      for (const e of kept.values()) e.bmp?.close();
      kept.clear();
      PROPS.close();
    },
  };
}
