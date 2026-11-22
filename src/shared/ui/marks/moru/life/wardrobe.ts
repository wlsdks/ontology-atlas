/**
 * The wardrobe at run time: which palette and pieces a Moru wears, and where each piece sits on a pose. The
 * pieces themselves are drawn by `scripts/brand/moru-cast/life/wardrobe.mjs` into the shipped wardrobe sheet;
 * the rules here are ported from the life prototype's host (`life/page.js`). Pure.
 */
import type { Anchor, LifeAtlas, LifeClip, LifePose, PiecePart, WearSlot } from './atlas';
import type { Moru, Random, Wear } from './behaviour';

/** The palettes the lobby dresses its crew in. */
export const PALETTES = ['original', 'horn', 'unicorn', 'dragon', 'rabbit', 'builder', 'scholar'] as const;
export const SLOTS: readonly WearSlot[] = ['body', 'accessory', 'head'];

/** The head, body and accessory pieces of each slot. */
export const PIECES: Record<WearSlot, readonly string[]> = {
  head: ['horns', 'unicorn-horn', 'dragon-horns', 'ears', 'hard-hat', 'beanie', 'straw-hat', 'party-hat', 'bow', 'flower-crown'],
  body: ['vest', 'scarf', 'cape', 'apron', 'neckerchief', 'wing', 'back-plates'],
  accessory: ['glasses', 'satchel', 'badge', 'bell', 'backpack'],
};

export interface Look { palette: string; wear: Wear }

const any = <T,>(rand: Random, list: readonly T[]) => list[Math.floor(rand() * list.length)];

/**
 * A random mix for a Moru joining the floor: a palette and a head piece nobody on the floor wears, a body piece
 * more often than not and an accessory now and then. Neighbours never look alike.
 */
export function pickLook(rand: Random, present: readonly Pick<Moru, 'palette' | 'wear'>[]): Look {
  const palettes = PALETTES.filter(p => !present.some(m => m.palette === p));
  const heads = PIECES.head.filter(h => !present.some(m => m.wear.head === h));
  return {
    palette: any(rand, palettes.length ? palettes : PALETTES),
    wear: {
      head: any(rand, heads.length ? heads : PIECES.head),
      body: rand() < 0.6 ? any(rand, PIECES.body) : null,
      accessory: rand() < 0.4 ? any(rand, PIECES.accessory) : null,
    },
  };
}

/** What a drawn Moru remembers between poses, so soft pieces trail and ears and wing move one picture at a time. */
export interface Worn {
  was: Record<Anchor, [number, number]> | null;
  lastX: number;
  pose: string;
  /** Ears and wing, by slot: how far toward their wanted picture they have come. */
  levels: Partial<Record<string, number>>;
  /** Ears or wing are still on their way: the next tick draws again although the pose has not changed. */
  settling: boolean;
}

export const freshWorn = (x: number): Worn => ({ was: null, lastX: x, pose: '', levels: {}, settling: false });

export interface Placed { part: PiecePart; x: number; y: number }

const within = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/**
 * Every piece a Moru wears on this pose, in cell coordinates: those on the skin (laid into the body's picture),
 * and those behind or in front of it, with soft pieces trailing their anchor's last move.
 */
export function placeWear(atlas: Pick<LifeAtlas, 'pieces'>, clip: LifeClip, id: string, frame: number, m: Pick<Moru, 'wear' | 'x' | 'facing'>, worn: Worn) {
  const f: LifePose = clip.f[frame];
  const off = clip.wear ? clip.wear.off[frame] : null;
  const was = worn.was ?? f.a;
  const trail = Math.sign(m.x - worn.lastX) * m.facing > 0 ? 1 : 0;
  worn.lastX = m.x;
  worn.was = f.a;
  const pose = `${id}:${frame}`, fresh = pose !== worn.pose || worn.settling;
  worn.pose = pose;
  worn.settling = false;
  const skin: Placed[] = [], layered: Placed[] = [];
  for (const slot of SLOTS) {
    const piece = m.wear[slot] ? atlas.pieces[m.wear[slot]!] : undefined;
    if (!piece) continue;
    for (const base of piece.parts) {
      let p = base;
      // Ears and wing never jump between pictures: each new pose moves them one picture toward the one it wants.
      if (base.alts) {
        const alts = base.alts, droops = Boolean(alts.droop);
        const want = droops ? (f.droop ? 2 : 0) : f.air ? ((frame >> 2) & 1 ? 2 : -2) : f.sq >= 3 ? -2 : f.sq <= -2 ? 2 : 0;
        const key = slot + (droops ? 'e' : 'w'), had = worn.levels[key] ?? 0, now = fresh ? had + Math.sign(want - had) : had;
        worn.levels[key] = now;
        if (now !== want) worn.settling = true;
        p = f.angle && alts.turned ? alts.turned
          : droops ? (now === 2 ? alts.droop : now === 1 ? alts.bent : base)
          : now === 2 ? alts.up : now === 1 ? alts.halfUp : now === -1 ? alts.halfDown : now === -2 ? alts.down : base;
        p = p ?? base;
      }
      const a = f.a[base.anchor], b = was[base.anchor], k = base.layer === 'skin' ? 0 : base.soft, head = slot === 'head';
      const lagX = k ? within(Math.round(((b[0] - a[0]) * k) / 2), -k, k) - (k > 1 ? trail * (k - 1) : 0) : 0;
      const lagY = k ? within(Math.round(((b[1] - a[1]) * k) / 2), -1, k) : 0;
      const x = p.x + a[0] + lagX + (head && off ? off[0] : 0), y = p.y + a[1] + lagY + (head && off ? off[1] : 0);
      (base.layer === 'skin' ? skin : layered).push({ part: p, x, y });
    }
  }
  return { skin, layered };
}
