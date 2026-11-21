import { ITEM, type ItemKind, type Sheet } from './moru-play';
import { BIG_GLYPHS, BUG_ROWS, FLOOR_BAND, GOLD_ROWS, STAR_ROWS, pixelSprite, textRows } from './moru-play-art';

export interface SheetSource {
  src: string;
  cell: number;
  columns: number;
}

export interface SpriteSources {
  sheets: Record<Sheet, SheetSource>;
  emote: (glyph: 'note' | 'heart' | 'spark') => string;
  fish: { frame: number; x: number; y: number; width: number; height: number };
}

/** The sky's stars as `[left %, top %, size px]`. */
export const SKY = [
  [6, 14, 2], [14, 30, 3], [22, 9, 2], [31, 22, 2], [39, 12, 3], [47, 34, 2], [55, 7, 2],
  [63, 26, 3], [71, 15, 2], [79, 31, 2], [87, 10, 3], [93, 24, 2], [10, 44, 2], [84, 46, 2],
] as const;
/** The `SKY` stars that twinkle. */
export const TWINKLE = [1, 4, 7, 10, 12];

/** A colour token's value; canvas cannot read `var()`, so each is resolved once from the field. */
function token(styles: CSSStyleDeclaration, name: string): string {
  return styles.getPropertyValue(name).trim();
}

export function readFieldColors(field: HTMLElement) {
  const styles = getComputedStyle(field);
  return {
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
}

export type FieldColors = ReturnType<typeof readFieldColors>;

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

/**
 * Every picture the round draws, painted once up front: a frame only copies them. Sheets and
 * emotes arrive as images; their sprites appear in `sprites` once decoded.
 */
export function createSprites(dpr: number, color: FieldColors, sources: SpriteSources) {
  const sheets: Record<Sheet, HTMLImageElement> = {
    companion: loadImage(sources.sheets.companion.src, () => buildFish()),
    reactions: loadImage(sources.sheets.reactions.src, () => buildFish()),
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
    note: loadImage(sources.emote('note'), () => {
      keep('note', paint({ w: ITEM, h: ITEM }, (c) => c.drawImage(emoteImages.note, 0, 0, ITEM, ITEM)));
    }),
    heart: loadImage(sources.emote('heart'), () => {
      keep('heart', paint({ w: ITEM, h: ITEM }, (c) => c.drawImage(emoteImages.heart, 0, 0, ITEM, ITEM)));
    }),
    spark: loadImage(sources.emote('spark'), () => {
      keep('slow', paint({ w: ITEM, h: ITEM }, (c) => c.drawImage(emoteImages.spark, 0, 0, ITEM, ITEM)));
      keep('spark-small', paint({ w: 24, h: 24 }, (c) => c.drawImage(emoteImages.spark, 0, 0, 24, 24)));
    }),
  };
  function buildFish() {
    const sheet = sheets.reactions;
    if (sprites.magnet || !sheet.complete || !sheet.naturalWidth) return;
    const { frame: cell, x, y, width: w, height: h } = sources.fish;
    const source = sources.sheets.reactions;
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

  /** The sky and floor for a field `width` by `height`, or null while the field has no size. */
  function paintSky(width: number, height: number): HTMLCanvasElement | null {
    if (width <= 0 || height <= 0) return null;
    const sky = paint({ w: width, h: height }, (c) => {
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
    return sky;
  }

  return { sheets, sprites, textSprite, countdown, paintSky };
}
