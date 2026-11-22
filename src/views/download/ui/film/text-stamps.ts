const STAMP_PAD = 6;

/**
 * Text drawn once into a small canvas and stamped: a stamp lands on fractional pixels as smoothly as
 * a mark does, and a fading or sunk name is the same stamp under `globalAlpha`. A halo is a rim of
 * the ground behind the text, so a line passing under it never cuts it.
 */
export class TextStamps {
  private stamps = new Map<string, { canvas: HTMLCanvasElement; w: number; h: number; tw: number }>();
  private readonly dpr: number;
  constructor(dpr: number) {
    this.dpr = dpr;
  }

  get size() {
    return this.stamps.size;
  }

  width(text: string, font: string): number {
    return this.stamp(text, font, '#fff', null)?.tw ?? 0;
  }

  private stamp(text: string, font: string, fill: string, halo: string | null) {
    const key = `${font}|${fill}|${halo ?? ''}|${text}`;
    let stamp = this.stamps.get(key);
    if (stamp) return stamp;
    const canvas = document.createElement('canvas');
    const c = canvas.getContext('2d');
    if (!c) return null;
    c.font = font;
    const tw = c.measureText(text).width;
    const size = Number(/(\d+(?:\.\d+)?)px/.exec(font)?.[1] ?? 15);
    const w = tw + STAMP_PAD * 2;
    const h = size * 1.5 + STAMP_PAD * 2;
    canvas.width = Math.max(1, Math.ceil(w * this.dpr));
    canvas.height = Math.max(1, Math.ceil(h * this.dpr));
    c.scale(this.dpr, this.dpr);
    c.font = font;
    c.textBaseline = 'middle';
    if (halo) {
      c.strokeStyle = halo;
      c.lineWidth = 5;
      c.lineJoin = 'round';
      c.strokeText(text, STAMP_PAD, h / 2);
    }
    c.fillStyle = fill;
    c.fillText(text, STAMP_PAD, h / 2);
    stamp = { canvas, w, h, tw };
    this.stamps.set(key, stamp);
    return stamp;
  }

  draw(
    ctx: CanvasRenderingContext2D,
    text: string,
    x: number,
    y: number,
    font: string,
    fill: string,
    { halo = null, align = 'left', scale = 1 }: { halo?: string | null; align?: 'left' | 'center' | 'right'; scale?: number } = {},
  ): number {
    const stamp = this.stamp(text, font, fill, halo);
    if (!stamp) return 0;
    const tw = stamp.tw * scale;
    const left = align === 'center' ? x - tw / 2 : align === 'right' ? x - tw : x;
    ctx.drawImage(stamp.canvas, left - STAMP_PAD * scale, y - (stamp.h * scale) / 2, stamp.w * scale, stamp.h * scale);
    return stamp.tw;
  }
}
