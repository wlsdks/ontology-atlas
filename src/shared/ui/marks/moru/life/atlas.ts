/** Where a wardrobe piece is tied on a pose: the crown, the face, the chest or the back. */
export type Anchor = 'crown' | 'face' | 'chest' | 'back';
export type WearSlot = 'head' | 'body' | 'accessory';

/** One pose of a life clip, as `pnpm brand:life` measured it. */
export interface LifePose {
  /** A turned pose (the roll): its angle in degrees, the point it turned about, and how far it sank. */
  angle?: number;
  pv?: [number, number];
  sk?: number;
  sq: number;
  /** Ears fall on this pose. */
  droop: 0 | 1;
  /** Each anchor's shift from the neutral pose. */
  a: Record<Anchor, [number, number]>;
  px: number;
  flip: 0 | 1;
  /** The middle of the body fill in the cell. */
  cx: number;
  cy: number;
  air: 0 | 1;
  /** A real event may cut in on this pose: it is near the neutral. */
  exit: 0 | 1;
}

export interface LifeClip {
  /** The pose a still lobby shows. */
  still: number;
  n: number;
  ms: number[];
  /** The part of the 128px cell its poses use: x, y, w, h. */
  box: [number, number, number, number];
  travel: number[] | null;
  travelY: number[] | null;
  wear: { slot: WearSlot; off: [number, number][]; swapAt: number } | null;
  maxWaitMs: number;
  total: number;
  f: LifePose[];
  /** The sheet row its first line of poses starts at, and how many poses a line holds. */
  at: number;
  per: number;
}

export interface PiecePart {
  sx: number;
  w: number;
  h: number;
  x: number;
  y: number;
  anchor: Anchor;
  layer: 'behind' | 'skin' | 'front';
  tint: 0 | 1;
  soft: number;
  alts: Record<string, PiecePart> | null;
}

/** A lobby fixture on the props sheet: where it is, its size, and its foot, the point that stands on its place on the floor. */
export interface LobbyProp {
  sx: number;
  w: number;
  h: number;
  fx: number;
  fy: number;
}
export type LobbyPropName = 'bench' | 'crate' | 'mat' | 'plant' | 'door' | 'doorRight';

export interface LifeAtlas {
  cell: number;
  floor: number;
  limits: { ground: number; air: number };
  clips: Record<string, LifeClip>;
  pieces: Record<string, { slot: WearSlot; title: string; parts: PiecePart[] }>;
  /** Body and belly per palette, as hex without `#`. */
  palettes: Record<string, [string, string]>;
  tones: { body: string; belly: string };
  atlas: { w: number; h: number };
  props: Record<LobbyPropName, LobbyProp>;
}

/** The clip a Moru facing left plays: its own mirrored bubble where one is drawn. */
export const facingClip = (atlas: Pick<LifeAtlas, 'clips'>, clip: string, facing: 1 | -1) =>
  facing < 0 && atlas.clips[`${clip}~left`] ? `${clip}~left` : clip;
