import { circleIntoRect, grow, inside, overlaps, type Pt, type Rect } from '../film-geometry';

export type Measure = (text: string, font: string) => number;
export type InkRole = 'primary' | 'secondary' | 'tertiary' | 'name' | 'strong' | 'arc' | 'reach' | 'agent';
export type LabelRole = 'domain' | 'units' | 'project' | 'cap' | 'pick' | 'reach' | 'end' | 'agent' | 'tool';

export interface LabelSegment {
  text: string;
  ink: InkRole;
}

export interface FilmLabel {
  key: string;
  /** The concept it names; null for the agent's tag. */
  id: string | null;
  role: LabelRole;
  segments: LabelSegment[];
  font: string;
  size: number;
  /** The anchor: `x` by `align`, `y` the text's middle. */
  x: number;
  y: number;
  align: 'left' | 'center' | 'right';
  box: Rect;
}

export const LABEL_PAD = 4;

export const fontOf = (weight: number, size: number, family: string) => `${weight} ${size}px ${family}`;

export function buildLabel(
  measure: Measure,
  key: string,
  id: string | null,
  role: LabelRole,
  segments: LabelSegment[],
  font: string,
  size: number,
  x: number,
  y: number,
  align: FilmLabel['align'],
): FilmLabel {
  const w = segments.reduce((sum, seg) => sum + measure(seg.text, font), 0);
  const l = align === 'left' ? x : align === 'right' ? x - w : x - w / 2;
  return { key, id, role, segments, font, size, x, y, align, box: { l, t: y - size * 0.62, r: l + w, b: y + size * 0.62 } };
}

export class LabelField {
  readonly boxes: Rect[] = [];
  readonly marks: { x: number; y: number; r: number }[] = [];
  samples: Pt[] = [];
  readonly bounds: Rect;
  readonly forbidden: Rect[];
  constructor(bounds: Rect, forbidden: Rect[]) {
    this.bounds = bounds;
    this.forbidden = forbidden;
  }

  free(box: Rect): boolean {
    const padded = grow(box, LABEL_PAD);
    if (padded.l < this.bounds.l || padded.r > this.bounds.r || padded.t < this.bounds.t || padded.b > this.bounds.b) return false;
    if (this.forbidden.some((rect) => overlaps(padded, rect))) return false;
    if (this.boxes.some((rect) => overlaps(padded, rect))) return false;
    if (this.marks.some((m) => circleIntoRect(m, m.r, padded) > 0)) return false;
    return !this.samples.some((p) => inside(p, padded));
  }

  take(box: Rect) {
    this.boxes.push(grow(box, LABEL_PAD));
  }
}
